import { useCallback, useMemo, useState } from "react";
import type { AdbConnectionInfo } from "../device/adbTransport";
import type { InstallControllerCommands, InstallControllerState } from "./state";

type PendingAction = "primary" | "rollback" | "uninstall";

type ConfirmationRequirementKind =
  | "risk"
  | "unsupported-device"
  | "rollback"
  | "uninstall"
  | "newer-than-target";

export interface InstallConfirmationRequirement {
  readonly kind: ConfirmationRequirementKind;
  readonly title: string;
  readonly description: string;
}

export interface InstallConfirmationDialog {
  readonly action: PendingAction;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly requirements: readonly InstallConfirmationRequirement[];
}

export interface InstallActionConfirmation {
  readonly dialog: InstallConfirmationDialog | null;
  requestPrimaryAction(): Promise<void>;
  requestRollback(): Promise<void>;
  requestUninstall(): Promise<void>;
  dismissDialog(): void;
  confirmDialog(): Promise<void>;
}

function buildConnectionSessionKey(connection: AdbConnectionInfo | null): string | null {
  if (!connection) {
    return null;
  }

  return `${connection.serial}:${connection.name}`;
}

function getPrimaryActionLabel(state: InstallControllerState): string {
  return state.inspection?.actionState.action ?? "Install";
}

function createRiskRequirement(): InstallConfirmationRequirement {
  return {
    kind: "risk",
    title: "Risk Acknowledgement",
    description:
      "This action will modify system packages on the connected device. Continue only if you want the installer to change device state.",
  };
}

function createUnsupportedDeviceRequirement(): InstallConfirmationRequirement {
  return {
    kind: "unsupported-device",
    title: "Unsupported Device",
    description:
      "This device does not match the recognized Humane Ai Pin identity check. You can still continue, but install results are not guaranteed.",
  };
}

function createRollbackRequirement(): InstallConfirmationRequirement {
  return {
    kind: "rollback",
    title: "Confirm Rollback",
    description:
      "Rollback removes the managed PenumbraOS packages and re-enables the configured stock/system packages when possible.",
  };
}

function createUninstallRequirement(): InstallConfirmationRequirement {
  return {
    kind: "uninstall",
    title: "Confirm Uninstall",
    description:
      "Uninstall removes the managed PenumbraOS packages and re-enables the configured stock/system packages when possible.",
  };
}

function createNewerThanTargetRequirement(): InstallConfirmationRequirement {
  return {
    kind: "newer-than-target",
    title: "Installed Packages Are Newer Than Target",
    description:
      "One or more managed packages are newer than the currently resolved release target. Continuing will reinstall the device to the selected target versions.",
  };
}

function createDialogForAction(options: {
  action: PendingAction;
  state: InstallControllerState;
  riskAcknowledged: boolean;
  unsupportedDeviceConfirmedForSession: boolean;
}): InstallConfirmationDialog | null {
  const requirements: InstallConfirmationRequirement[] = [];
  const primaryActionLabel = getPrimaryActionLabel(options.state);
  const unsupportedDevice =
    options.state.inspection !== null && !options.state.inspection.device.recognizedAiPin;

  if (!options.riskAcknowledged) {
    requirements.push(createRiskRequirement());
  }

  if (unsupportedDevice && !options.unsupportedDeviceConfirmedForSession) {
    requirements.push(createUnsupportedDeviceRequirement());
  }

  if (options.action === "rollback") {
    requirements.push(createRollbackRequirement());
  }

  if (options.action === "uninstall") {
    requirements.push(createUninstallRequirement());
  }

  if (options.action === "primary" && options.state.inspection?.actionState.warnings.newerThanTarget) {
    requirements.push(createNewerThanTargetRequirement());
  }

  if (requirements.length === 0) {
    return null;
  }

  return {
    action: options.action,
    title:
      requirements.length === 1 && requirements[0].kind === "uninstall"
        ? options.action === "rollback"
          ? "Confirm Rollback"
          : "Confirm Uninstall"
        : "Review Before Continuing",
    body:
      options.action === "primary"
        ? `Review the following before continuing with ${primaryActionLabel}.`
        : options.action === "rollback"
          ? "Review the following before continuing with rollback."
          : "Review the following before continuing with uninstall.",
    confirmLabel:
      options.action === "primary"
        ? `Continue with ${primaryActionLabel}`
        : options.action === "rollback"
          ? "Continue with Rollback"
          : "Continue with Uninstall",
    requirements,
  };
}

export function useInstallActionConfirmation(options: {
  state: InstallControllerState;
  commands: InstallControllerCommands;
  runPrimaryAction: () => Promise<void>;
  runRollback: () => Promise<void>;
  runUninstall: () => Promise<void>;
}): InstallActionConfirmation {
  const { state, commands, runPrimaryAction, runRollback, runUninstall } = options;
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [confirmedUnsupportedSessionKey, setConfirmedUnsupportedSessionKey] = useState<string | null>(null);
  const [dialog, setDialog] = useState<InstallConfirmationDialog | null>(null);

  const currentSessionKey = useMemo(() => buildConnectionSessionKey(state.connection), [state.connection]);
  const unsupportedDeviceConfirmedForSession =
    currentSessionKey !== null && confirmedUnsupportedSessionKey === currentSessionKey;

  const effectiveDialog = useMemo(() => {
    if (!dialog) {
      return null;
    }

    if (dialog.action === "primary" && (!commands.primaryAction.visible || commands.primaryAction.disabled)) {
      return null;
    }

    if (dialog.action === "rollback" && (!commands.rollback.visible || commands.rollback.disabled)) {
      return null;
    }

    if (dialog.action === "uninstall" && (!commands.uninstall.visible || commands.uninstall.disabled)) {
      return null;
    }

    return dialog;
  }, [commands.primaryAction.disabled, commands.primaryAction.visible, commands.rollback.disabled, commands.rollback.visible, commands.uninstall.disabled, commands.uninstall.visible, dialog]);

  const executeAction = useCallback(
    async (action: PendingAction) => {
      if (action === "primary") {
        if (!commands.primaryAction.visible || commands.primaryAction.disabled) {
          return;
        }

        await runPrimaryAction();
        return;
      }

      if (action === "rollback") {
        if (!commands.rollback.visible || commands.rollback.disabled) {
          return;
        }

        await runRollback();
        return;
      }

      if (!commands.uninstall.visible || commands.uninstall.disabled) {
        return;
      }

      await runUninstall();
    },
    [commands.primaryAction.disabled, commands.primaryAction.visible, commands.rollback.disabled, commands.rollback.visible, commands.uninstall.disabled, commands.uninstall.visible, runPrimaryAction, runRollback, runUninstall],
  );

  const requestPrimaryAction = useCallback(async () => {
    if (!commands.primaryAction.visible || commands.primaryAction.disabled) {
      return;
    }

    const nextDialog = createDialogForAction({
      action: "primary",
      state,
      riskAcknowledged,
      unsupportedDeviceConfirmedForSession,
    });

    if (nextDialog) {
      setDialog(nextDialog);
      return;
    }

    await executeAction("primary");
  }, [
    commands.primaryAction.disabled,
    commands.primaryAction.visible,
    executeAction,
    riskAcknowledged,
    state,
    unsupportedDeviceConfirmedForSession,
  ]);

  const requestRollback = useCallback(async () => {
    if (!commands.rollback.visible || commands.rollback.disabled) {
      return;
    }

    const nextDialog = createDialogForAction({
      action: "rollback",
      state,
      riskAcknowledged,
      unsupportedDeviceConfirmedForSession,
    });

    if (nextDialog) {
      setDialog(nextDialog);
      return;
    }

    await executeAction("rollback");
  }, [
    commands.rollback.disabled,
    commands.rollback.visible,
    executeAction,
    riskAcknowledged,
    state,
    unsupportedDeviceConfirmedForSession,
  ]);

  const requestUninstall = useCallback(async () => {
    if (!commands.uninstall.visible || commands.uninstall.disabled) {
      return;
    }

    const nextDialog = createDialogForAction({
      action: "uninstall",
      state,
      riskAcknowledged,
      unsupportedDeviceConfirmedForSession,
    });

    if (nextDialog) {
      setDialog(nextDialog);
      return;
    }

    await executeAction("uninstall");
  }, [
    commands.uninstall.disabled,
    commands.uninstall.visible,
    executeAction,
    riskAcknowledged,
    state,
    unsupportedDeviceConfirmedForSession,
  ]);

  const dismissDialog = useCallback(() => {
    setDialog(null);
  }, []);

  const confirmDialog = useCallback(async () => {
    if (!effectiveDialog) {
      return;
    }

    const activeDialog = effectiveDialog;
    setDialog(null);

    if (activeDialog.requirements.some((requirement) => requirement.kind === "risk")) {
      setRiskAcknowledged(true);
    }

    if (
      activeDialog.requirements.some((requirement) => requirement.kind === "unsupported-device") &&
      currentSessionKey
    ) {
      setConfirmedUnsupportedSessionKey(currentSessionKey);
    }

    await executeAction(activeDialog.action);
  }, [currentSessionKey, effectiveDialog, executeAction]);

  return {
    dialog: effectiveDialog,
    requestPrimaryAction,
    requestRollback,
    requestUninstall,
    dismissDialog,
    confirmDialog,
  };
}

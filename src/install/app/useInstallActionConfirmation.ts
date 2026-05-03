import { useCallback, useMemo, useState } from "react";
import { formatDetectedPackageConflicts } from "../domain/knownPackageConflicts";
import type { AdbConnectionInfo } from "../device/adbTransport";
import type {
  InstallControllerCommands,
  InstallControllerState,
} from "./state";

type PendingAction = "primary" | "rollback" | "uninstall" | "remove-conflicts";
export type InstallConfirmationChoiceAction =
  | PendingAction
  | "fix-conflicts-and-install";

type ConfirmationRequirementKind =
  | "risk"
  | "unsupported-device"
  | "rollback"
  | "uninstall"
  | "newer-than-target"
  | "known-conflicts"
  | "remove-conflicts";

export interface InstallConfirmationRequirement {
  readonly kind: ConfirmationRequirementKind;
  readonly title: string;
  readonly description: string;
}

export interface InstallConfirmationChoice {
  readonly action: InstallConfirmationChoiceAction;
  readonly label: string;
  readonly tone: "primary" | "secondary";
  readonly recommended?: boolean;
}

export interface InstallConfirmationDialog {
  readonly action: PendingAction;
  readonly title: string;
  readonly body: string;
  readonly choices: readonly InstallConfirmationChoice[];
  readonly requirements: readonly InstallConfirmationRequirement[];
}

export interface InstallActionConfirmation {
  readonly dialog: InstallConfirmationDialog | null;
  requestPrimaryAction(): Promise<void>;
  requestRollback(): Promise<void>;
  requestUninstall(): Promise<void>;
  requestRemoveConflicts(): Promise<void>;
  dismissDialog(): void;
  confirmDialog(action: InstallConfirmationChoiceAction): Promise<void>;
}

function buildConnectionSessionKey(
  connection: AdbConnectionInfo | null,
): string | null {
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
    title: "Danger",
    description:
      "This action will modify key system components on the connected device and may have unintended consequences.",
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

function createKnownConflictsRequirement(
  state: InstallControllerState,
): InstallConfirmationRequirement {
  const formattedConflicts = formatDetectedPackageConflicts(
    state.inspection?.detectedConflicts ?? [],
  );

  return {
    kind: "known-conflicts",
    title: "Installation Conflicts",
    description:
      "The device has conflicting packages left over from other Ai Pin projects. These may cause issues with the installed system. Removal is recommended, but you may continue without removing them.\n\n" +
      formattedConflicts,
  };
}

function createRemoveConflictsRequirement(
  state: InstallControllerState,
): InstallConfirmationRequirement {
  const formattedConflicts = formatDetectedPackageConflicts(
    state.inspection?.detectedConflicts ?? [],
  );

  return {
    kind: "remove-conflicts",
    title: "Conflict Cleanup",
    description: `Known conflicting packages will be removed from the device.\n\n${formattedConflicts}`,
  };
}

export function createDialogForAction(options: {
  action: PendingAction;
  state: InstallControllerState;
  riskAcknowledged: boolean;
  unsupportedDeviceConfirmedForSession: boolean;
}): InstallConfirmationDialog | null {
  const requirements: InstallConfirmationRequirement[] = [];
  const primaryActionLabel = getPrimaryActionLabel(options.state);
  const unsupportedDevice =
    options.state.inspection !== null &&
    !options.state.inspection.device.recognizedAiPin;
  const hasKnownConflicts =
    options.action === "primary" &&
    Boolean(options.state.inspection?.hasDetectedConflicts);

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

  if (options.action === "remove-conflicts") {
    requirements.push(createRemoveConflictsRequirement(options.state));
  }

  if (
    options.action === "primary" &&
    options.state.inspection?.actionState.warnings.newerThanTarget
  ) {
    requirements.push(createNewerThanTargetRequirement());
  }

  if (hasKnownConflicts) {
    requirements.push(createKnownConflictsRequirement(options.state));
  }

  if (requirements.length === 0) {
    return null;
  }

  if (hasKnownConflicts) {
    return {
      action: options.action,
      title: "Conflicts Detected",
      body: "We found packages from other Ai Pin projects that may interfere with installation. You can remove the known conflicts before installing, or continue without removing them.",
      choices: [
        {
          action: "primary",
          label: `${primaryActionLabel} Anyway`,
          tone: "secondary",
        },
        {
          action: "fix-conflicts-and-install",
          label: `Remove and ${primaryActionLabel}`,
          tone: "primary",
          recommended: true,
        },
      ],
      requirements,
    };
  }

  return {
    action: options.action,
    title:
      options.action === "rollback" &&
      requirements.length === 1 &&
      requirements[0].kind === "rollback"
        ? "Confirm Rollback"
        : options.action === "uninstall" &&
            requirements.length === 1 &&
            requirements[0].kind === "uninstall"
          ? "Confirm Uninstall"
          : options.action === "remove-conflicts" &&
              requirements.length === 1 &&
              requirements[0].kind === "remove-conflicts"
            ? "Review Conflict Cleanup"
            : "Review",
    body:
      options.action === "primary"
        ? `Review the following before continuing with ${primaryActionLabel}.`
        : options.action === "rollback"
          ? "Review the following before continuing with rollback."
          : options.action === "remove-conflicts"
            ? "Review the following before removing detected conflicts."
            : "Review the following before continuing with uninstall.",
    choices: [
      {
        action: options.action,
        label:
          options.action === "primary"
            ? `Continue with ${primaryActionLabel}`
            : options.action === "rollback"
              ? "Continue with Rollback"
              : options.action === "remove-conflicts"
                ? "Remove Conflicts"
                : "Continue with Uninstall",
        tone: "primary",
        recommended: true,
      },
    ],
    requirements,
  };
}

export function useInstallActionConfirmation(options: {
  state: InstallControllerState;
  commands: InstallControllerCommands;
  runPrimaryAction: () => Promise<void>;
  runRollback: () => Promise<void>;
  runUninstall: () => Promise<void>;
  runRemoveConflicts: () => Promise<void>;
  runFixConflictsThenPrimaryAction: () => Promise<void>;
}): InstallActionConfirmation {
  const {
    state,
    commands,
    runPrimaryAction,
    runRollback,
    runUninstall,
    runRemoveConflicts,
    runFixConflictsThenPrimaryAction,
  } = options;
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [confirmedUnsupportedSessionKey, setConfirmedUnsupportedSessionKey] =
    useState<string | null>(null);
  const [dialog, setDialog] = useState<InstallConfirmationDialog | null>(null);

  const currentSessionKey = useMemo(
    () => buildConnectionSessionKey(state.connection),
    [state.connection],
  );
  const unsupportedDeviceConfirmedForSession =
    currentSessionKey !== null &&
    confirmedUnsupportedSessionKey === currentSessionKey;

  const effectiveDialog = useMemo(() => {
    if (!dialog) {
      return null;
    }

    if (
      dialog.action === "primary" &&
      (!commands.primaryAction.visible || commands.primaryAction.disabled)
    ) {
      return null;
    }

    if (
      dialog.action === "rollback" &&
      (!commands.rollback.visible || commands.rollback.disabled)
    ) {
      return null;
    }

    if (
      dialog.action === "uninstall" &&
      (!commands.uninstall.visible || commands.uninstall.disabled)
    ) {
      return null;
    }

    if (
      dialog.action === "remove-conflicts" &&
      (!commands.removeConflicts.visible || commands.removeConflicts.disabled)
    ) {
      return null;
    }

    return dialog;
  }, [
    commands.primaryAction.disabled,
    commands.primaryAction.visible,
    commands.removeConflicts.disabled,
    commands.removeConflicts.visible,
    commands.rollback.disabled,
    commands.rollback.visible,
    commands.uninstall.disabled,
    commands.uninstall.visible,
    dialog,
  ]);

  const executeAction = useCallback(
    async (action: InstallConfirmationChoiceAction) => {
      if (action === "fix-conflicts-and-install") {
        if (
          !commands.primaryAction.visible ||
          commands.primaryAction.disabled
        ) {
          return;
        }

        await runFixConflictsThenPrimaryAction();
        return;
      }

      if (action === "primary") {
        if (
          !commands.primaryAction.visible ||
          commands.primaryAction.disabled
        ) {
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

      if (action === "remove-conflicts") {
        if (
          !commands.removeConflicts.visible ||
          commands.removeConflicts.disabled
        ) {
          return;
        }

        await runRemoveConflicts();
        return;
      }

      if (!commands.uninstall.visible || commands.uninstall.disabled) {
        return;
      }

      await runUninstall();
    },
    [
      commands.primaryAction.disabled,
      commands.primaryAction.visible,
      commands.removeConflicts.disabled,
      commands.removeConflicts.visible,
      commands.rollback.disabled,
      commands.rollback.visible,
      commands.uninstall.disabled,
      commands.uninstall.visible,
      runFixConflictsThenPrimaryAction,
      runPrimaryAction,
      runRemoveConflicts,
      runRollback,
      runUninstall,
    ],
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

  const requestRemoveConflicts = useCallback(async () => {
    if (
      !commands.removeConflicts.visible ||
      commands.removeConflicts.disabled
    ) {
      return;
    }

    const nextDialog = createDialogForAction({
      action: "remove-conflicts",
      state,
      riskAcknowledged,
      unsupportedDeviceConfirmedForSession,
    });

    if (nextDialog) {
      setDialog(nextDialog);
      return;
    }

    await executeAction("remove-conflicts");
  }, [
    commands.removeConflicts.disabled,
    commands.removeConflicts.visible,
    executeAction,
    riskAcknowledged,
    state,
    unsupportedDeviceConfirmedForSession,
  ]);

  const dismissDialog = useCallback(() => {
    setDialog(null);
  }, []);

  const confirmDialog = useCallback(
    async (action: InstallConfirmationChoiceAction) => {
      if (!effectiveDialog) {
        return;
      }

      if (!effectiveDialog.choices.some((choice) => choice.action === action)) {
        return;
      }

      const activeDialog = effectiveDialog;
      setDialog(null);

      if (
        activeDialog.requirements.some(
          (requirement) => requirement.kind === "risk",
        )
      ) {
        setRiskAcknowledged(true);
      }

      if (
        activeDialog.requirements.some(
          (requirement) => requirement.kind === "unsupported-device",
        ) &&
        currentSessionKey
      ) {
        setConfirmedUnsupportedSessionKey(currentSessionKey);
      }

      await executeAction(action);
    },
    [currentSessionKey, effectiveDialog, executeAction],
  );

  return {
    dialog: effectiveDialog,
    requestPrimaryAction,
    requestRollback,
    requestUninstall,
    requestRemoveConflicts,
    dismissDialog,
    confirmDialog,
  };
}

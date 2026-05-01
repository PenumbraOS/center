import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import { inspectInstallState, type InstallInspectionResult } from "../domain/inspection";
import { resolveInstallTarget, type ResolvedInstallTarget } from "../releases/assets";
import {
  getLockedTarget,
  lockResolvedInstallTarget,
  type TargetLock,
} from "../releases/targetLock";
import type { AdbSessionTransport } from "../device/adbTransport";
import { getBrowserSupport } from "../device/browserSupport";
import { runInstallOperation } from "../ops/install";
import { runRollbackOperation } from "../ops/rollback";
import { runUninstallOperation } from "../ops/uninstall";
import {
  createInitialInstallControllerState,
  deriveInstallControllerCommands,
  installControllerReducer,
  type ControllerOperationResult,
  type InstallControllerCommands,
  type InstallControllerState,
} from "./state";

export type {
  ControllerOperationResult,
  InstallControllerCommands,
  InstallControllerStage,
  InstallControllerState,
} from "./state";

export interface InstallController {
  readonly state: InstallControllerState;
  readonly commands: InstallControllerCommands;
  connectAndInspect(): Promise<void>;
  recheck(): Promise<void>;
  runPrimaryAction(): Promise<void>;
  runRollback(): Promise<void>;
  runUninstall(): Promise<void>;
  startOver(): Promise<void>;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getInspectionTargetResolutionError(
  inspection: InstallInspectionResult | null,
): Error | null {
  if (!inspection?.targetResolutionErrorMessage) {
    return null;
  }

  return new Error(inspection.targetResolutionErrorMessage);
}

function getActiveTarget(state: InstallControllerState): ResolvedInstallTarget | null {
  return getLockedTarget(state.targetLock) ?? state.target;
}

export function useInstallController(
  createTransport: () => AdbSessionTransport,
): InstallController {
  const transportRef = useRef<AdbSessionTransport | null>(null);
  const browserSupport = useMemo(() => getBrowserSupport(), []);
  const [state, dispatch] = useReducer(
    installControllerReducer,
    browserSupport,
    createInitialInstallControllerState,
  );
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const ensureTransport = useCallback(() => {
    if (!transportRef.current) {
      transportRef.current = createTransport();
    }

    return transportRef.current;
  }, [createTransport]);

  const refreshInspection = useCallback(
    async (
      transport: AdbSessionTransport,
      options: {
        target: ResolvedInstallTarget | null;
        targetResolutionError?: Error | null;
      },
    ) => {
      return inspectInstallState(transport, {
        target: options.target,
        targetResolutionError: options.targetResolutionError ?? null,
        readinessSettleDelayMs: 0,
      });
    },
    [],
  );

  const runInspection = useCallback(
    async (options?: { stage?: "connecting" | "inspecting"; forceTargetRefresh?: boolean }) => {
      const transport = ensureTransport();
      const currentState = stateRef.current;
      const stage = options?.stage ?? "inspecting";
      const forceTargetRefresh = options?.forceTargetRefresh ?? false;

      dispatch({
        type: "inspection-started",
        stage,
      });

      try {
        const connection = await transport.connect();
        dispatch({
          type: "connection-established",
          connection,
        });

        let target: ResolvedInstallTarget | null = forceTargetRefresh
          ? null
          : getActiveTarget(currentState);
        let targetLock: TargetLock | null = forceTargetRefresh ? null : currentState.targetLock;
        let targetResolutionError: Error | null = null;

        if (!target) {
          try {
            target = await resolveInstallTarget();
            targetLock = lockResolvedInstallTarget(target);
          } catch (error) {
            target = null;
            targetLock = null;
            targetResolutionError = error instanceof Error ? error : new Error(String(error));
          }
        }

        const inspection = await refreshInspection(transport, {
          target,
          targetResolutionError,
        });

        dispatch({
          type: "inspection-completed",
          connection,
          inspection,
          target,
          targetLock,
        });
      } catch (error) {
        dispatch({
          type: "inspection-failed",
          connection: transport.connectionInfo,
          error: toErrorMessage(error),
        });
      }
    },
    [ensureTransport, refreshInspection],
  );

  const connectAndInspect = useCallback(async () => {
    if (!browserSupport.supported) {
      return;
    }

    await runInspection({
      stage: "connecting",
      forceTargetRefresh: false,
    });
  }, [browserSupport.supported, runInspection]);

  const recheck = useCallback(async () => {
    await runInspection({
      stage: "inspecting",
      forceTargetRefresh: true,
    });
  }, [runInspection]);

  const runPrimaryAction = useCallback(async () => {
    const transport = ensureTransport();
    const currentState = stateRef.current;
    const activeTarget = getActiveTarget(currentState);
    let inspectionRefreshInFlight: Promise<void> | null = null;

    if (!activeTarget) {
      dispatch({
        type: "operation-failed",
        error: "Install-type actions are blocked until the installer can resolve a release target.",
      });
      return;
    }

    dispatch({ type: "operation-started" });

    try {
      const result = await runInstallOperation({
        transport,
        target: activeTarget,
        onProgress: (event) => {
          dispatch({
            type: "operation-progress",
            event,
          });

          if (event.logEntry === false || inspectionRefreshInFlight) {
            return;
          }

          inspectionRefreshInFlight = refreshInspection(transport, {
            target: activeTarget,
          })
            .then((inspection) => {
              dispatch({
                type: "operation-inspection-updated",
                inspection,
              });
            })
            .catch(() => undefined)
            .finally(() => {
              inspectionRefreshInFlight = null;
            });
        },
      });

      if (inspectionRefreshInFlight) {
        await inspectionRefreshInFlight;
      }

      const nextInspection = result.inspection
        ? result.inspection
        : await refreshInspection(transport, {
            target: activeTarget,
          });

      const operationResult: ControllerOperationResult = {
        kind: "install",
        result,
      };

      dispatch({
        type: "operation-completed",
        result: operationResult,
        inspection: nextInspection,
      });
    } catch (error) {
      dispatch({
        type: "operation-failed",
        error: toErrorMessage(error),
      });
    }
  }, [ensureTransport, refreshInspection]);

  const runRollback = useCallback(async () => {
    const transport = ensureTransport();
    const currentState = stateRef.current;

    dispatch({ type: "operation-started" });

    try {
      const result = await runRollbackOperation({
        transport,
        onProgress: (event) => {
          dispatch({
            type: "operation-progress",
            event,
          });
        },
      });

      const nextInspection = await refreshInspection(transport, {
        target: getActiveTarget(currentState),
        targetResolutionError: getInspectionTargetResolutionError(currentState.inspection),
      });

      const operationResult: ControllerOperationResult = {
        kind: "uninstall",
        result: {
          success: result.success,
          warnings: result.warnings,
          error: result.error,
        },
      };

      dispatch({
        type: "operation-completed",
        result: operationResult,
        inspection: nextInspection,
      });
    } catch (error) {
      dispatch({
        type: "operation-failed",
        error: toErrorMessage(error),
      });
    }
  }, [ensureTransport, refreshInspection]);

  const runUninstall = useCallback(async () => {
    const transport = ensureTransport();
    const currentState = stateRef.current;

    dispatch({ type: "operation-started" });

    try {
      const result = await runUninstallOperation({
        transport,
        onProgress: (event) => {
          dispatch({
            type: "operation-progress",
            event,
          });
        },
      });

      const nextInspection = await refreshInspection(transport, {
        target: getActiveTarget(currentState),
        targetResolutionError: getInspectionTargetResolutionError(currentState.inspection),
      });

      const operationResult: ControllerOperationResult = {
        kind: "uninstall",
        result,
      };

      dispatch({
        type: "operation-completed",
        result: operationResult,
        inspection: nextInspection,
      });
    } catch (error) {
      dispatch({
        type: "operation-failed",
        error: toErrorMessage(error),
      });
    }
  }, [ensureTransport, refreshInspection]);

  const startOver = useCallback(async () => {
    if (transportRef.current) {
      await transportRef.current.disconnect().catch(() => undefined);
      transportRef.current = null;
    }

    dispatch({ type: "reset" });
  }, []);

  useEffect(() => {
    return () => {
      if (transportRef.current) {
        void transportRef.current.disconnect().catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (state.stage !== "operating") {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [state.stage]);

  const commands = useMemo(() => deriveInstallControllerCommands(state), [state]);

  return {
    state,
    commands,
    connectAndInspect,
    recheck,
    runPrimaryAction,
    runRollback,
    runUninstall,
    startOver,
  };
}

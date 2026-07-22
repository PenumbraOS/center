// ---------------------------------------------------------------------------
// String constants for the install flow state machine
// ---------------------------------------------------------------------------

export const STEP = {
  decide: "decide",
  unsupportedBrowser: "unsupportedBrowser",
  disconnected: "disconnected",
  connecting: "connecting",
  inspecting: "inspecting",
  inspected: "inspected",
  ready: "ready",
  confirmOrRun: "confirmOrRun",
  confirm: "confirm",
  operate: "operate",
  assets: "assets",
  cleanup: "cleanup",
  bootstrap: "bootstrap",
  installApks: "installApks",
  disable: "disable",
  configure: "configure",
  verify: "verify",
  uninstallCleanup: "uninstallCleanup",
  uninstallRestore: "uninstallRestore",
  uninstallVerify: "uninstallVerify",
  rollbackCleanup: "rollbackCleanup",
  rollbackRestore: "rollbackRestore",
  rollbackVerify: "rollbackVerify",
  conflictsCleanup: "conflictsCleanup",
  apkFile: "apkFile",
  finishOperation: "finishOperation",
  result: "result",
  error: "error",
  blocked: "blocked",
} as const;

export type StepId = (typeof STEP)[keyof typeof STEP];

export const OPERATION = {
  install: "install",
  uninstall: "uninstall",
  rollback: "rollback",
  removeConflicts: "removeConflicts",
  apkFile: "apkFile",
} as const;

export type OperationName = (typeof OPERATION)[keyof typeof OPERATION];

export const PRESS_TYPE = {
  chooseInstall: "chooseInstall",
  chooseUninstall: "chooseUninstall",
  chooseRollback: "chooseRollback",
  chooseRemoveConflicts: "chooseRemoveConflicts",
  chooseApkFile: "chooseApkFile",
  confirm: "confirm",
  cancel: "cancel",
  recheck: "recheck",
  startOver: "startOver",
  connect: "connect",
} as const;

export type PressTypeName = (typeof PRESS_TYPE)[keyof typeof PRESS_TYPE];

export const PHASE = {
  inspect: "Inspect",
  assets: "Assets",
  cleanup: "Cleanup",
  bootstrap: "Bootstrap",
  install: "Install",
  disable: "Disable",
  configure: "Configure",
  verify: "Verify",
  restore: "Restore",
} as const;

export type PhaseName = (typeof PHASE)[keyof typeof PHASE];

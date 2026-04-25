export const INSTALLER_PACKAGE = "com.penumbraos.systeminjector";
export const EXPLOIT_PACKAGE = "com.penumbraos.systeminjector.exploit";

export const INSTALLER_ACTION = "com.penumbraos.systeminjector.INSTALL";
export const EXPLOIT_STAGE1_ACTION =
  "com.penumbraos.systeminjector.exploit.STAGE1";
export const EXPLOIT_STAGE2_ACTION =
  "com.penumbraos.systeminjector.exploit.STAGE2";

export const EXPLOIT_RECEIVER =
  "com.penumbraos.systeminjector.exploit/.InstallReceiver";
export const INSTALLER_RECEIVER =
  "com.penumbraos.systeminjector/.InstallReceiver";

export const DEVICE_TMP_DIR = "/data/local/tmp";
export const STAGING_AUTHORITY = "com.penumbraos.systeminjector.staging";
export const STAGING_URI = `content://${STAGING_AUTHORITY}`;

export const POLL_INTERVAL_MS = 3000;
export const POLL_TIMEOUT_MS = 120000;
export const SYSTEM_READY_TIMEOUT_MS = 60000;
export const SYSTEM_READY_POLL_MS = 2000;
export const SYSTEM_READY_SETTLE_MS = 3000;
export const SOFT_REBOOT_STABILIZATION_MS = 10000;

export const HOOK_PACKAGE = "com.penumbraos.hook";
export const INJECTOR_PACKAGE = "com.penumbraos.hook.injector";

export const DEFAULT_REMOTE_ADB_AUTH_URL = "https://adb.penumbraos.workers.dev";

export const INSTALLER_ASSET_PATHS = {
  installerApk: "/installer/system-injector/installer-debug.apk",
  exploitApk: "/installer/system-injector/exploit-debug.apk",
  hookApk: "/installer/humane-system-hook/hook-debug.apk",
  injectorApk: "/installer/humane-system-hook/injector-debug.apk",
} as const;

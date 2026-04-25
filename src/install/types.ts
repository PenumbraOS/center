export type InstallStage =
  | "idle"
  | "browser-check"
  | "usb-connect"
  | "status-check"
  | "bootstrap"
  | "install-hook"
  | "install-injector"
  | "uninstall-hook"
  | "activate"
  | "connect-server"
  | "complete"
  | "error";

export interface InstallLogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
}

export interface BrowserSupportResult {
  supported: boolean;
  reasons: string[];
  details: {
    secureContext: boolean;
    webUsb: boolean;
  };
}

export interface AdbConnectionInfo {
  serial: string;
  name: string;
}

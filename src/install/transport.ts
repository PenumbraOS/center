import type { AdbConnectionInfo } from "./types";

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ShellWithInputProgress {
  bytesWritten: number;
  totalBytes: number;
  elapsedMs: number;
}

export type ShellWithInputPhase =
  | "spawn"
  | "stdin-write"
  | "stdin-close"
  | "stdout-read"
  | "stderr-read"
  | "process-exit";

export type ShellWithInputDiagnostic =
  | {
      type: "spawned";
      totalBytes: number;
      elapsedMs: number;
      writeChunkBytes: number;
      estimatedChunkCount: number;
    }
  | {
      type: "stdin-complete";
      bytesWritten: number;
      totalBytes: number;
      elapsedMs: number;
      chunksWritten: number;
      writeChunkBytes: number;
    }
  | {
      type: "socket-closed";
      phase: ShellWithInputPhase;
      bytesWritten: number;
      totalBytes: number;
      elapsedMs: number;
      errorMessage: string;
      chunkIndex: number | null;
      chunkOffset: number | null;
      chunkBytes: number | null;
      writeChunkBytes: number;
    }
  | {
      type: "failed";
      phase: ShellWithInputPhase;
      bytesWritten: number;
      totalBytes: number;
      elapsedMs: number;
      errorMessage: string;
      chunkIndex: number | null;
      chunkOffset: number | null;
      chunkBytes: number | null;
      writeChunkBytes: number;
    };

export interface ShellWithInputOptions {
  onProgress?: (progress: ShellWithInputProgress) => void;
  onDiagnostic?: (diagnostic: ShellWithInputDiagnostic) => void;
}

export interface WaitForDeviceProgress {
  attempts: number;
  elapsedMs: number;
  lastError?: unknown;
}

export interface WaitForDeviceOptions {
  onProgress?: (progress: WaitForDeviceProgress) => void;
}

export interface WaitForSystemReadyProgress {
  phase: "device" | "package-manager";
  attempts: number;
  elapsedMs: number;
  detail?: string;
  lastError?: unknown;
}

export interface WaitForSystemReadyOptions {
  onProgress?: (progress: WaitForSystemReadyProgress) => void;
}

export interface PollForPackageProgress {
  packageName: string;
  attempts: number;
  elapsedMs: number;
  lastError?: unknown;
}

export interface PollForPackageOptions {
  onProgress?: (progress: PollForPackageProgress) => void;
}

export interface InstallApkOptions {
  packageName?: string;
}

export interface LogcatLine {
  id: string;
  timestamp: string;
  text: string;
}

export interface LogcatStreamController {
  stop(): Promise<void>;
}

export class InstallerTransportRecoveredDisconnectError extends Error {
  readonly operation: string;
  readonly attemptsSinceSuccess: number;
  readonly maxAttemptsSinceSuccess: number;
  override readonly cause: unknown;

  constructor(
    operation: string,
    attemptsSinceSuccess: number,
    maxAttemptsSinceSuccess: number,
    cause?: unknown,
  ) {
    super(`Socket closed during ${operation}. ADB session was reconnected.`, {
      cause,
    });
    this.name = "InstallerTransportRecoveredDisconnectError";
    this.operation = operation;
    this.attemptsSinceSuccess = attemptsSinceSuccess;
    this.maxAttemptsSinceSuccess = maxAttemptsSinceSuccess;
    this.cause = cause;
  }
}

export function isInstallerTransportRecoveredDisconnectError(
  error: unknown,
): error is InstallerTransportRecoveredDisconnectError {
  return error instanceof InstallerTransportRecoveredDisconnectError;
}

export interface InstallerTransport {
  readonly connectionInfo: AdbConnectionInfo | null;
  connect(): Promise<AdbConnectionInfo>;
  reconnect(): Promise<AdbConnectionInfo>;
  disconnect(): Promise<void>;
  startLogcatStream(onLine: (line: LogcatLine) => void): Promise<LogcatStreamController>;
  shell(command: string | readonly string[]): Promise<ShellResult>;
  shellWithInput(
    command: string | readonly string[],
    input: Blob,
    options?: ShellWithInputOptions,
  ): Promise<ShellResult>;
  pushFile(remotePath: string, file: Blob): Promise<void>;
  installApk(apk: Blob, name: string, options?: InstallApkOptions): Promise<void>;
  uninstallPackage(packageName: string): Promise<void>;
  reboot(): Promise<void>;
  waitForDevice(
    timeoutMs?: number,
    pollMs?: number,
    options?: WaitForDeviceOptions,
  ): Promise<void>;
  waitForSystemReady(
    timeoutMs: number,
    pollMs: number,
    settleMs: number,
    options?: WaitForSystemReadyOptions,
  ): Promise<void>;
  pollForPackage(
    packageName: string,
    intervalMs: number,
    timeoutMs: number,
    options?: PollForPackageOptions,
  ): Promise<boolean>;
}

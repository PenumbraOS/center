import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import {
  AdbDaemonWebUsbDevice,
  AdbDaemonWebUsbDeviceManager,
} from "@yume-chan/adb-daemon-webusb";
import {
  ConcatStringStream,
  ReadableStream,
  TextDecoderStream,
} from "@yume-chan/stream-extra";
import { logDebug, logError, logInfo, logWarn } from "../logging";
import { DEFAULT_REMOTE_ADB_AUTH_URL } from "./constants";
import {
  createRemoteAdbAuthenticator,
  HttpRemoteAdbAuthClient,
  REMOTE_ADB_NOOP_CREDENTIAL_STORE,
} from "./remoteAdbAuth";
import {
  InstallerTransportRecoveredDisconnectError,
  type InstallApkOptions,
} from "./transport";
import type {
  InstallerTransport,
  LogcatLine,
  LogcatStreamController,
  PollForPackageOptions,
  ShellResult,
  ShellWithInputOptions,
  ShellWithInputPhase,
  WaitForDeviceOptions,
  WaitForSystemReadyOptions,
} from "./transport";
import type { AdbConnectionInfo } from "./types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldEmitHeartbeat(
  lastHeartbeatAt: number,
  now: number,
  intervalMs = 5000,
): boolean {
  return now - lastHeartbeatAt >= intervalMs;
}

function errorMessageIncludesSocketClosed(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("Socket closed");
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function hasExactPackageLine(output: string, packageName: string): boolean {
  const exactLine = `package:${packageName}`;
  return output
    .split(/\r?\n/)
    .some((line) => line.trim() === exactLine);
}

async function* fixedSizeChunks(
  input: Blob,
  chunkBytes: number,
): AsyncGenerator<Uint8Array, void, void> {
  let offset = 0;

  while (offset < input.size) {
    const end = Math.min(offset + chunkBytes, input.size);
    const chunk = new Uint8Array(await input.slice(offset, end).arrayBuffer());
    yield chunk;
    offset = end;
  }
}

export interface WebUsbAdbTransportOptions {
  remoteAuthUrl?: string;
}

const MAX_RETRYABLE_DISCONNECTS_SINCE_SUCCESS = 3;
const SHELL_WITH_INPUT_WRITE_CHUNK_BYTES = 64 * 1024;

export class WebUsbAdbTransport implements InstallerTransport {
  private adb: Adb | null = null;
  private info: AdbConnectionInfo | null = null;
  private readonly remoteAuthUrl: string;
  private retryableDisconnectsSinceSuccess = 0;
  private logcatGeneration = 0;
  private logcatSubscriptionId = 0;
  private logcatOnLine: ((line: LogcatLine) => void) | null = null;
  private logcatStopCurrentProcess: (() => Promise<void>) | null = null;

  constructor(options: WebUsbAdbTransportOptions = {}) {
    this.remoteAuthUrl = options.remoteAuthUrl || DEFAULT_REMOTE_ADB_AUTH_URL;
  }

  get connectionInfo(): AdbConnectionInfo | null {
    return this.info;
  }

  private markOperationSuccess() {
    this.retryableDisconnectsSinceSuccess = 0;
  }

  private async recoverFromRetryableDisconnect(
    operation: string,
    cause: unknown,
    rethrowRecoveredError = true,
  ) {
    if (!errorMessageIncludesSocketClosed(cause)) {
      throw cause;
    }

    this.retryableDisconnectsSinceSuccess += 1;
    if (
      this.retryableDisconnectsSinceSuccess > MAX_RETRYABLE_DISCONNECTS_SINCE_SUCCESS
    ) {
      logError("webusb-adb", "Exceeded retryable disconnect budget", cause, {
        operation,
        attemptsSinceSuccess: this.retryableDisconnectsSinceSuccess,
        maxAttemptsSinceSuccess: MAX_RETRYABLE_DISCONNECTS_SINCE_SUCCESS,
        device: this.info,
      });
      throw cause;
    }

    logWarn("webusb-adb", "Socket closed during operation; reconnecting", {
      operation,
      attemptsSinceSuccess: this.retryableDisconnectsSinceSuccess,
      maxAttemptsSinceSuccess: MAX_RETRYABLE_DISCONNECTS_SINCE_SUCCESS,
      device: this.info,
    });

    await this.reconnect();

    if (rethrowRecoveredError) {
      throw new InstallerTransportRecoveredDisconnectError(
        operation,
        this.retryableDisconnectsSinceSuccess,
        MAX_RETRYABLE_DISCONNECTS_SINCE_SUCCESS,
        cause,
      );
    }
  }

  async connect(): Promise<AdbConnectionInfo> {
    if (this.adb && this.info) {
      logDebug("webusb-adb", "Reusing existing ADB connection", {
        device: this.info,
      });
      return this.info;
    }

    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) {
      throw new Error("WebUSB is not supported in this browser.");
    }

    logInfo("webusb-adb", "Requesting USB device through WebUSB");
    const device = await manager.requestDevice();
    if (!device) {
      throw new Error("No USB device was selected.");
    }

    logInfo("webusb-adb", "USB device selected", {
      serial: device.serial,
      name: device.name,
    });

    return this.connectToDevice(device);
  }

  async reconnect(): Promise<AdbConnectionInfo> {
    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) {
      throw new Error("WebUSB is not supported in this browser.");
    }

    const shouldRestartLogcat = this.logcatOnLine !== null;

    logInfo("webusb-adb", "Attempting USB reconnect", {
      previousDevice: this.info,
      shouldRestartLogcat,
    });
    await this.disconnect();

    const devices = await manager.getDevices();
    if (devices.length === 0) {
      throw new Error("No previously authorized USB device is available.");
    }

    const device = this.info?.serial
      ? devices.find((entry) => entry.serial === this.info?.serial) ?? devices[0]
      : devices[0];

    logInfo("webusb-adb", "Reconnecting to previously authorized device", {
      serial: device.serial,
      name: device.name,
      authorizedDeviceCount: devices.length,
    });

    const info = await this.connectToDevice(device);
    if (shouldRestartLogcat && this.logcatOnLine) {
      this.logcatSubscriptionId += 1;
      const subscriptionId = this.logcatSubscriptionId;
      logInfo("webusb-adb", "Restarting logcat stream after reconnect", {
        device: info,
        subscriptionId,
      });
      await this.launchLogcatStream(subscriptionId);
    }

    return info;
  }

  async disconnect(): Promise<void> {
    await this.stopLogcatProcess();
    this.logcatGeneration += 1;
    if (this.logcatOnLine) {
      this.logcatSubscriptionId += 1;
    }
    if (this.adb) {
      logDebug("webusb-adb", "Closing ADB connection", {
        device: this.info,
      });
      await this.adb.close();
    }
    this.adb = null;
  }

  private async stopLogcatProcess() {
    const stop = this.logcatStopCurrentProcess;
    this.logcatStopCurrentProcess = null;
    if (stop) {
      await stop().catch(() => undefined);
    }
  }

  private async launchLogcatStream(subscriptionId: number): Promise<void> {
    const onLine = this.logcatOnLine;
    if (!onLine || subscriptionId !== this.logcatSubscriptionId) {
      return;
    }

    const adb = this.requireAdb();
    const shell = adb.subprocess.shellProtocol;

    if (!shell) {
      throw new Error("Shell protocol is not supported by this device.");
    }

    const generation = ++this.logcatGeneration;
    logInfo("webusb-adb", "Starting logcat stream", {
      device: this.info,
      generation,
      subscriptionId,
    });

    const process = await shell.spawn([
      "logcat",
      "-v",
      "threadtime",
      "SystemInjector:I",
      "Exploit:I",
      "ExploitBootstrap:I",
      "*:W",
    ]);
    let stopped = false;
    const decoder = new TextDecoder();
    let pending = "";

    this.logcatStopCurrentProcess = async () => {
      if (stopped) {
        return;
      }
      stopped = true;
      try {
        await process.kill();
      } catch {
        // Ignore logcat shutdown errors.
      }
    };

    const publishLine = (text: string) => {
      if (!text.trim()) {
        return;
      }

      onLine({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: new Date().toLocaleTimeString(),
        text,
      });
    };

    const consume = async (stream: ReadableStream<Uint8Array>) => {
      const reader = stream.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (
            stopped ||
            generation !== this.logcatGeneration ||
            subscriptionId !== this.logcatSubscriptionId
          ) {
            break;
          }

          pending += decoder.decode(value, { stream: true });
          const parts = pending.split(/\r?\n/);
          pending = parts.pop() ?? "";
          for (const part of parts) {
            publishLine(part);
          }
        }
      } finally {
        reader.releaseLock();
      }
    };

    void consume(process.stdout).catch((error) => {
      if (!stopped && generation === this.logcatGeneration) {
        logWarn("webusb-adb", "Logcat stdout stream ended with error", {
          error,
          generation,
          subscriptionId,
          device: this.info,
        });
      }
    });

    void consume(process.stderr).catch((error) => {
      if (!stopped && generation === this.logcatGeneration) {
        logWarn("webusb-adb", "Logcat stderr stream ended with error", {
          error,
          generation,
          subscriptionId,
          device: this.info,
        });
      }
    });

    void process.exited.then(
      (exitCode) => {
        if (!stopped && generation === this.logcatGeneration) {
          if (pending) {
            publishLine(pending);
            pending = "";
          }
          logInfo("webusb-adb", "Logcat process exited", {
            exitCode,
            generation,
            subscriptionId,
            device: this.info,
          });
        }
      },
      (error) => {
        if (!stopped && generation === this.logcatGeneration) {
          logWarn("webusb-adb", "Logcat process exited with error", {
            error,
            generation,
            subscriptionId,
            device: this.info,
          });
        }
      },
    );
  }

  async startLogcatStream(
    onLine: (line: LogcatLine) => void,
  ): Promise<LogcatStreamController> {
    this.logcatOnLine = onLine;
    this.logcatSubscriptionId += 1;
    const subscriptionId = this.logcatSubscriptionId;

    await this.stopLogcatProcess();
    await this.launchLogcatStream(subscriptionId);

    return {
      stop: async () => {
        if (subscriptionId !== this.logcatSubscriptionId) {
          return;
        }
        this.logcatOnLine = null;
        this.logcatSubscriptionId += 1;
        await this.stopLogcatProcess();
      },
    };
  }

  async shell(command: string | readonly string[]): Promise<ShellResult> {
    const adb = this.requireAdb();
    const shell = adb.subprocess.shellProtocol;

    if (!shell) {
      throw new Error("Shell protocol is not supported by this device.");
    }

    logDebug("webusb-adb", "Executing shell command", {
      command,
      device: this.info,
    });

    try {
      const result = await shell.spawnWaitText(command);
      logDebug("webusb-adb", "Shell command completed", {
        command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      });
      this.markOperationSuccess();
      return result;
    } catch (error) {
      await this.recoverFromRetryableDisconnect(
        `shell ${Array.isArray(command) ? command.join(" ") : command}`,
        error,
      );
      throw error;
    }
  }

  async shellWithInput(
    command: string | readonly string[],
    input: Blob,
    options: ShellWithInputOptions = {},
  ): Promise<ShellResult> {
    const adb = this.requireAdb();
    const shell = adb.subprocess.shellProtocol;

    if (!shell) {
      throw new Error("Shell protocol is not supported by this device.");
    }

    logDebug("webusb-adb", "Executing shell command with stdin", {
      command,
      inputBytes: input.size,
      device: this.info,
      writeChunkBytes: SHELL_WITH_INPUT_WRITE_CHUNK_BYTES,
      estimatedChunkCount: Math.ceil(input.size / SHELL_WITH_INPUT_WRITE_CHUNK_BYTES),
    });
    const start = Date.now();
    let bytesWritten = 0;
    let chunksWritten = 0;
    let currentPhase: ShellWithInputPhase = "spawn";
    let currentChunkIndex: number | null = null;
    let currentChunkOffset: number | null = null;
    let currentChunkBytes: number | null = null;

    try {
      const process = await shell.spawn(command);
      options.onDiagnostic?.({
        type: "spawned",
        totalBytes: input.size,
        elapsedMs: Date.now() - start,
        writeChunkBytes: SHELL_WITH_INPUT_WRITE_CHUNK_BYTES,
        estimatedChunkCount: Math.ceil(input.size / SHELL_WITH_INPUT_WRITE_CHUNK_BYTES),
      });
      const writer = process.stdin.getWriter();
      let lastProgressAt = 0;

      try {
        currentPhase = "stdin-write";
        for await (const chunk of fixedSizeChunks(input, SHELL_WITH_INPUT_WRITE_CHUNK_BYTES)) {
          currentChunkIndex = chunksWritten;
          currentChunkOffset = bytesWritten;
          currentChunkBytes = chunk.byteLength;
          await writer.write(chunk);
          bytesWritten += chunk.byteLength;
          chunksWritten += 1;

          const now = Date.now();
          if (
            options.onProgress &&
            (bytesWritten === input.size || shouldEmitHeartbeat(lastProgressAt, now, 750))
          ) {
            options.onProgress({
              bytesWritten,
              totalBytes: input.size,
              elapsedMs: now - start,
            });
            lastProgressAt = now;
          }
        }
        currentChunkIndex = null;
        currentChunkOffset = null;
        currentChunkBytes = null;
        currentPhase = "stdin-close";
        await writer.close();
        options.onDiagnostic?.({
          type: "stdin-complete",
          bytesWritten,
          totalBytes: input.size,
          elapsedMs: Date.now() - start,
          chunksWritten,
          writeChunkBytes: SHELL_WITH_INPUT_WRITE_CHUNK_BYTES,
        });
      } finally {
        writer.releaseLock();
      }

      currentPhase = "stdout-read";
      const stdout = await this.readText(process.stdout);
      currentPhase = "stderr-read";
      const stderr = await this.readText(process.stderr);
      currentPhase = "process-exit";
      const exitCode = await process.exited;

      logDebug("webusb-adb", "Shell command with stdin completed", {
        command,
        exitCode,
        stdout,
        stderr,
        bytesWritten,
        chunksWritten,
        writeChunkBytes: SHELL_WITH_INPUT_WRITE_CHUNK_BYTES,
        elapsedMs: Date.now() - start,
      });
      this.markOperationSuccess();
      return { stdout, stderr, exitCode };
    } catch (error) {
      const diagnostic = {
        bytesWritten,
        totalBytes: input.size,
        elapsedMs: Date.now() - start,
        phase: currentPhase,
        errorMessage: toErrorMessage(error),
        chunkIndex: currentChunkIndex,
        chunkOffset: currentChunkOffset,
        chunkBytes: currentChunkBytes,
        writeChunkBytes: SHELL_WITH_INPUT_WRITE_CHUNK_BYTES,
      } as const;

      if (errorMessageIncludesSocketClosed(error)) {
        options.onDiagnostic?.({
          type: "socket-closed",
          ...diagnostic,
        });
      } else {
        options.onDiagnostic?.({
          type: "failed",
          ...diagnostic,
        });
      }

      await this.recoverFromRetryableDisconnect(
        `shellWithInput ${Array.isArray(command) ? command.join(" ") : command}`,
        error,
      );
      throw error;
    }
  }

  async pushFile(remotePath: string, file: Blob): Promise<void> {
    logInfo("webusb-adb", "Pushing file to device", {
      remotePath,
      bytes: file.size,
      device: this.info,
    });

    while (true) {
      const adb = this.requireAdb();
      const sync = await adb.sync();
      let shouldRetry = false;

      try {
        await sync.write({
          filename: remotePath,
          file: ReadableStream.from(file.stream() as globalThis.ReadableStream<Uint8Array>),
        });
        this.markOperationSuccess();
        return;
      } catch (error) {
        if (errorMessageIncludesSocketClosed(error)) {
          await this.recoverFromRetryableDisconnect(
            `pushFile ${remotePath}`,
            error,
            false,
          );
          shouldRetry = true;
        } else {
          throw error;
        }
      } finally {
        await sync.dispose().catch(() => undefined);
      }

      if (shouldRetry) {
        logInfo("webusb-adb", "Retrying file push after reconnect", {
          remotePath,
          bytes: file.size,
          device: this.info,
        });
      }
    }
  }

  async installApk(
    apk: Blob,
    name: string,
    options: InstallApkOptions = {},
  ): Promise<void> {
    const remotePath = `/data/local/tmp/${name}`;
    logInfo("webusb-adb", "Installing APK via pm install", {
      name,
      remotePath,
      bytes: apk.size,
      packageName: options.packageName,
    });

    while (true) {
      await this.pushFile(remotePath, apk);

      try {
        const result = await this.shell(["pm", "install", "-r", remotePath]);
        if (result.exitCode !== 0) {
          throw new Error(result.stderr || result.stdout || `pm install failed for ${name}`);
        }
        this.markOperationSuccess();
        return;
      } catch (error) {
        if (errorMessageIncludesSocketClosed(error)) {
          await this.recoverFromRetryableDisconnect(
            `installApk ${name}`,
            error,
            false,
          );
          if (options.packageName) {
            const result = await this.shell(["pm", "list", "packages", options.packageName]);
            if (result.stdout.includes(`package:${options.packageName}`)) {
              logInfo("webusb-adb", "Package already installed after reconnect", {
                name,
                packageName: options.packageName,
                device: this.info,
              });
              return;
            }
          }

          logInfo("webusb-adb", "Retrying APK install after reconnect", {
            name,
            remotePath,
            bytes: apk.size,
            packageName: options.packageName,
            device: this.info,
          });
          continue;
        }

        throw error;
      }
    }
  }

  async uninstallPackage(packageName: string): Promise<void> {
    logInfo("webusb-adb", "Uninstalling package", {
      packageName,
      device: this.info,
    });

    while (true) {
      try {
        const result = await this.shell(["pm", "uninstall", packageName]);
        if (result.exitCode !== 0) {
          throw new Error(result.stderr || result.stdout || `pm uninstall failed for ${packageName}`);
        }
        this.markOperationSuccess();
        return;
      } catch (error) {
        if (errorMessageIncludesSocketClosed(error)) {
          await this.recoverFromRetryableDisconnect(
            `uninstallPackage ${packageName}`,
            error,
            false,
          );
          const result = await this.shell(["pm", "list", "packages", packageName]);
          if (!hasExactPackageLine(result.stdout, packageName)) {
            logInfo("webusb-adb", "Package already absent after reconnect", {
              packageName,
              device: this.info,
            });
            return;
          }

          logInfo("webusb-adb", "Retrying package uninstall after reconnect", {
            packageName,
            device: this.info,
          });
          continue;
        }

        throw error;
      }
    }
  }

  async reboot(): Promise<void> {
    const adb = this.requireAdb();
    logInfo("webusb-adb", "Rebooting device", {
      device: this.info,
    });

    try {
      await adb.power.reboot();
    } catch (error) {
      if (errorMessageIncludesSocketClosed(error)) {
        logInfo("webusb-adb", "ADB socket closed during reboot command", {
          device: this.info,
        });
        this.markOperationSuccess();
        return;
      }
      throw error;
    }

    this.markOperationSuccess();
  }

  async waitForDevice(
    timeoutMs = 30000,
    pollMs = 1000,
    options: WaitForDeviceOptions = {},
  ): Promise<void> {
    const start = Date.now();
    let attempts = 0;
    let lastError: unknown;
    let lastHeartbeatAt = 0;

    while (Date.now() - start < timeoutMs) {
      attempts += 1;
      try {
        if (!this.adb) {
          await this.reconnect();
        }
        await this.shell(["echo", "ready"]);
        logInfo("webusb-adb", "Device became ready", {
          attempts,
          elapsedMs: Date.now() - start,
          device: this.info,
        });
        return;
      } catch (error) {
        lastError = error;
        const elapsedMs = Date.now() - start;
        logDebug("webusb-adb", "Device wait retry", {
          attempts,
          elapsedMs,
          error,
          device: this.info,
        });
        options.onProgress?.({
          attempts,
          elapsedMs,
          lastError: error,
        });
        if (shouldEmitHeartbeat(lastHeartbeatAt, Date.now())) {
          logInfo("webusb-adb", "Still waiting for device readiness", {
            attempts,
            elapsedMs,
            device: this.info,
          });
          lastHeartbeatAt = Date.now();
        }
        await sleep(pollMs);
      }
    }

    logError("webusb-adb", "Timed out waiting for device", lastError, {
      timeoutMs,
      pollMs,
      attempts,
      device: this.info,
    });
    throw new Error(`Timed out after ${timeoutMs}ms waiting for device.`);
  }

  async waitForSystemReady(
    timeoutMs: number,
    pollMs: number,
    settleMs: number,
    options: WaitForSystemReadyOptions = {},
  ): Promise<void> {
    await this.waitForDevice(timeoutMs, pollMs, {
      onProgress: (progress) => {
        options.onProgress?.({
          phase: "device",
          attempts: progress.attempts,
          elapsedMs: progress.elapsedMs,
          lastError: progress.lastError,
        });
      },
    });

    const start = Date.now();
    let attempts = 0;
    let lastError: unknown;
    let lastHeartbeatAt = 0;

    while (Date.now() - start < timeoutMs) {
      attempts += 1;
      try {
        const output = await this.shell(["service", "check", "package"]);
        if (output.stdout.includes("found")) {
          await sleep(settleMs);
          logInfo("webusb-adb", "PackageManagerService became ready", {
            attempts,
            elapsedMs: Date.now() - start,
            settleMs,
          });
          return;
        }

        const elapsedMs = Date.now() - start;
        options.onProgress?.({
          phase: "package-manager",
          attempts,
          elapsedMs,
          detail: output.stdout.trim() || output.stderr.trim() || "service check package pending",
        });
        if (shouldEmitHeartbeat(lastHeartbeatAt, Date.now())) {
          logInfo("webusb-adb", "Still waiting for PackageManagerService", {
            attempts,
            elapsedMs,
            output: output.stdout.trim() || output.stderr.trim() || "pending",
          });
          lastHeartbeatAt = Date.now();
        }
      } catch (error) {
        lastError = error;
        const elapsedMs = Date.now() - start;
        logDebug("webusb-adb", "System ready poll retry", {
          attempts,
          elapsedMs,
          error,
        });
        options.onProgress?.({
          phase: "package-manager",
          attempts,
          elapsedMs,
          lastError: error,
        });
        if (shouldEmitHeartbeat(lastHeartbeatAt, Date.now())) {
          logInfo("webusb-adb", "PackageManagerService not ready yet", {
            attempts,
            elapsedMs,
          });
          lastHeartbeatAt = Date.now();
        }
      }

      await sleep(pollMs);
    }

    logError("webusb-adb", "Timed out waiting for PackageManagerService", lastError, {
      timeoutMs,
      pollMs,
      settleMs,
      attempts,
    });
    throw new Error(
      `Timed out after ${timeoutMs}ms waiting for PackageManagerService.`,
    );
  }

  async pollForPackage(
    packageName: string,
    intervalMs: number,
    timeoutMs: number,
    options: PollForPackageOptions = {},
  ): Promise<boolean> {
    const start = Date.now();
    let attempts = 0;
    let lastError: unknown;
    let lastHeartbeatAt = 0;

    while (Date.now() - start < timeoutMs) {
      attempts += 1;
      try {
        await this.waitForDevice(intervalMs, intervalMs);
        const result = await this.shell(["pm", "list", "packages", packageName]);
        if (hasExactPackageLine(result.stdout, packageName)) {
          logInfo("webusb-adb", "Package appeared during polling", {
            packageName,
            attempts,
            elapsedMs: Date.now() - start,
          });
          return true;
        }

        const elapsedMs = Date.now() - start;
        options.onProgress?.({
          packageName,
          attempts,
          elapsedMs,
        });
        if (shouldEmitHeartbeat(lastHeartbeatAt, Date.now())) {
          logInfo("webusb-adb", "Still waiting for package to appear", {
            packageName,
            attempts,
            elapsedMs,
          });
          lastHeartbeatAt = Date.now();
        }
      } catch (error) {
        lastError = error;
        const elapsedMs = Date.now() - start;
        logDebug("webusb-adb", "Package poll retry", {
          packageName,
          attempts,
          elapsedMs,
          error,
        });
        options.onProgress?.({
          packageName,
          attempts,
          elapsedMs,
          lastError: error,
        });
        if (shouldEmitHeartbeat(lastHeartbeatAt, Date.now())) {
          logInfo("webusb-adb", "Package not visible yet during polling", {
            packageName,
            attempts,
            elapsedMs,
          });
          lastHeartbeatAt = Date.now();
        }
      }

      await sleep(intervalMs);
    }

    logWarn("webusb-adb", "Package polling timed out", {
      packageName,
      timeoutMs,
      intervalMs,
      attempts,
      lastError,
    });
    return false;
  }

  private async connectToDevice(
    device: AdbDaemonWebUsbDevice,
  ): Promise<AdbConnectionInfo> {
    logInfo("webusb-adb", "Opening USB device connection", {
      serial: device.serial,
      name: device.name,
    });

    try {
      const connection = await device.connect();
      logDebug("webusb-adb", "USB device connection opened", {
        serial: device.serial,
        name: device.name,
      });
      logInfo("webusb-adb", "Authenticating ADB transport with remote signer", {
        serial: device.serial,
        name: device.name,
        remoteAuthUrl: this.remoteAuthUrl,
      });

      const remoteAuthClient = new HttpRemoteAdbAuthClient(this.remoteAuthUrl);
      const transport = await AdbDaemonTransport.authenticate({
        serial: device.serial,
        connection,
        credentialStore: REMOTE_ADB_NOOP_CREDENTIAL_STORE,
        authenticators: [createRemoteAdbAuthenticator(remoteAuthClient)],
        initialDelayedAckBytes: 0,
      });

      this.adb = new Adb(transport);
      this.info = {
        serial: device.serial,
        name: device.name,
      };

      logInfo("webusb-adb", "ADB transport authenticated", {
        device: this.info,
      });
      return this.info;
    } catch (error) {
      logError("webusb-adb", "Failed to connect to USB device", error, {
        serial: device.serial,
        name: device.name,
      });
      throw error;
    }
  }

  private async readText(
    stream: ReadableStream<Uint8Array>,
  ): Promise<string> {
    return stream
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new ConcatStringStream());
  }

  private requireAdb(): Adb {
    if (!this.adb) {
      throw new Error("ADB is not connected.");
    }
    return this.adb;
  }
}

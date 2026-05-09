import { Adb, AdbDaemonTransport, type AdbSocket } from "@yume-chan/adb";
import {
  AdbDaemonWebUsbDevice,
  AdbDaemonWebUsbDeviceManager,
} from "@yume-chan/adb-daemon-webusb";
import {
  ConcatStringStream,
  ReadableStream,
  TextDecoderStream,
} from "@yume-chan/stream-extra";
import { logDebug, logError, logInfo, logWarn } from "../../logging";
import type { AdbAuthStrategy } from "./adbAuth";

export interface AdbConnectionInfo {
  readonly serial: string;
  readonly name: string;
}

export interface ShellResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface ShellWithInputProgress {
  readonly bytesWritten: number;
  readonly totalBytes: number;
  readonly elapsedMs: number;
}

export interface ShellWithInputOptions {
  readonly onProgress?: (progress: ShellWithInputProgress) => void;
}

export interface CommandStreamLine {
  readonly id: string;
  readonly timestamp: string;
  readonly text: string;
}

export interface CommandStreamController {
  stop(): Promise<void>;
}

export interface AdbPtySession {
  readonly output: ReadableStream<Uint8Array>;
  readonly exited: Promise<number>;
  write(data: Uint8Array): Promise<void>;
  sigint(): Promise<void>;
  close(): Promise<void>;
}

export interface AdbSessionTransport {
  readonly connectionInfo: AdbConnectionInfo | null;
  connect(): Promise<AdbConnectionInfo>;
  reconnect(): Promise<AdbConnectionInfo>;
  disconnect(): Promise<void>;
  shell(command: string | readonly string[]): Promise<ShellResult>;
  shellWithInput(
    command: string | readonly string[],
    input: Blob,
    options?: ShellWithInputOptions,
  ): Promise<ShellResult>;
  pushFile(remotePath: string, file: Blob): Promise<void>;
  reboot(): Promise<void>;
  openPty(): Promise<AdbPtySession>;
  startCommandStream(
    command: string | readonly string[],
    onLine: (line: CommandStreamLine) => void,
  ): Promise<CommandStreamController>;
  createSocket?(service: string): Promise<AdbSocket>;
}

export const DEVICE_STEP_TIMEOUT_MS = 60000;

export class AdbDeviceStepTimeoutError extends Error {
  readonly operation: string;
  readonly timeoutMs: number;

  constructor(operation: string, timeoutMs = DEVICE_STEP_TIMEOUT_MS) {
    super(`Timed out after ${timeoutMs}ms during device step: ${operation}.`);
    this.name = "AdbDeviceStepTimeoutError";
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

const timedTransportCache = new WeakMap<AdbSessionTransport, AdbSessionTransport>();
const timedTransportWrappers = new WeakSet<AdbSessionTransport>();

function formatCommand(command: string | readonly string[]) {
  return Array.isArray(command) ? command.join(" ") : command;
}

export function withDeviceStepTimeout<T>(
  operation: string,
  work: () => Promise<T>,
  timeoutMs = DEVICE_STEP_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timeoutId = globalThis.setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      reject(new AdbDeviceStepTimeoutError(operation, timeoutMs));
    }, timeoutMs);

    const settle = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      globalThis.clearTimeout(timeoutId);
      callback();
    };

    let workPromise: Promise<T>;
    try {
      workPromise = work();
    } catch (error) {
      settle(() => reject(error));
      return;
    }

    workPromise.then(
      (value) => {
        settle(() => resolve(value));
      },
      (error) => {
        settle(() => reject(error));
      },
    );
  });
}

export function createTimedAdbSessionTransport(
  transport: AdbSessionTransport,
  timeoutMs = DEVICE_STEP_TIMEOUT_MS,
): AdbSessionTransport {
  if (timedTransportWrappers.has(transport)) {
    return transport;
  }

  if (timeoutMs === DEVICE_STEP_TIMEOUT_MS) {
    const cached = timedTransportCache.get(transport);
    if (cached) {
      return cached;
    }
  }

  const wrappedTransport: AdbSessionTransport = {
    get connectionInfo() {
      return transport.connectionInfo;
    },
    connect() {
      return transport.connect();
    },
    reconnect() {
      return transport.reconnect();
    },
    disconnect() {
      return transport.disconnect();
    },
    shell(command) {
      return withDeviceStepTimeout(
        `shell ${formatCommand(command)}`,
        () => transport.shell(command),
        timeoutMs,
      );
    },
    shellWithInput(command, input, options) {
      return withDeviceStepTimeout(
        `shellWithInput ${formatCommand(command)}`,
        () => transport.shellWithInput(command, input, options),
        timeoutMs,
      );
    },
    pushFile(remotePath, file) {
      return withDeviceStepTimeout(
        `pushFile ${remotePath}`,
        () => transport.pushFile(remotePath, file),
        timeoutMs,
      );
    },
    reboot() {
      return withDeviceStepTimeout("reboot", () => transport.reboot(), timeoutMs);
    },
    openPty() {
      return transport.openPty();
    },
    startCommandStream(command, onLine) {
      return transport.startCommandStream(command, onLine);
    },
  };

  timedTransportWrappers.add(wrappedTransport);
  if (timeoutMs === DEVICE_STEP_TIMEOUT_MS) {
    timedTransportCache.set(transport, wrappedTransport);
  }

  return wrappedTransport;
}

export class AdbTransportRecoveredDisconnectError extends Error {
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
    this.name = "AdbTransportRecoveredDisconnectError";
    this.operation = operation;
    this.attemptsSinceSuccess = attemptsSinceSuccess;
    this.maxAttemptsSinceSuccess = maxAttemptsSinceSuccess;
    this.cause = cause;
  }
}

function errorMessageIncludesSocketClosed(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Socket closed");
}

async function* fixedSizeChunks(
  input: Blob,
  chunkBytes: number,
): AsyncGenerator<Uint8Array, void, void> {
  let offset = 0;

  while (offset < input.size) {
    const end = Math.min(offset + chunkBytes, input.size);
    yield new Uint8Array(await input.slice(offset, end).arrayBuffer());
    offset = end;
  }
}

const MAX_RETRYABLE_DISCONNECTS_SINCE_SUCCESS = 3;
const SHELL_WITH_INPUT_WRITE_CHUNK_BYTES = 64 * 1024;

export interface WebUsbAdbSessionTransportOptions {
  authStrategy: AdbAuthStrategy;
}

export class WebUsbAdbSessionTransport implements AdbSessionTransport {
  private adb: Adb | null = null;
  private info: AdbConnectionInfo | null = null;
  private readonly authStrategy: AdbAuthStrategy;
  private retryableDisconnectsSinceSuccess = 0;
  private streamSubscriptionId = 0;
  private currentStreamStop: (() => Promise<void>) | null = null;
  private currentStreamHandler: ((line: CommandStreamLine) => void) | null =
    null;
  private currentStreamCommand: string | readonly string[] | null = null;
  private currentPtySession: AdbPtySession | null = null;

  constructor(options: WebUsbAdbSessionTransportOptions) {
    this.authStrategy = options.authStrategy;
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
      this.retryableDisconnectsSinceSuccess >
      MAX_RETRYABLE_DISCONNECTS_SINCE_SUCCESS
    ) {
      throw cause;
    }

    logWarn("install-adb", "Socket closed during operation; reconnecting", {
      operation,
      attemptsSinceSuccess: this.retryableDisconnectsSinceSuccess,
      maxAttemptsSinceSuccess: MAX_RETRYABLE_DISCONNECTS_SINCE_SUCCESS,
      device: this.info,
    });

    await this.reconnect();

    if (rethrowRecoveredError) {
      throw new AdbTransportRecoveredDisconnectError(
        operation,
        this.retryableDisconnectsSinceSuccess,
        MAX_RETRYABLE_DISCONNECTS_SINCE_SUCCESS,
        cause,
      );
    }
  }

  async connect(): Promise<AdbConnectionInfo> {
    if (this.adb && this.info) {
      return this.info;
    }

    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) {
      throw new Error("WebUSB is not supported in this browser.");
    }

    const device = await manager.requestDevice();
    if (!device) {
      throw new Error("No USB device was selected.");
    }

    return this.connectToDevice(device);
  }

  async reconnect(): Promise<AdbConnectionInfo> {
    const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
    if (!manager) {
      throw new Error("WebUSB is not supported in this browser.");
    }

    const previousInfo = this.info;
    const activeStream = this.currentStreamHandler && this.currentStreamCommand;
    await this.disconnect();

    const devices = await manager.getDevices();
    if (devices.length === 0) {
      throw new Error("No previously authorized USB device is available.");
    }

    const device = previousInfo?.serial
      ? (devices.find((entry) => entry.serial === previousInfo.serial) ??
        devices[0])
      : devices[0];

    const info = await this.connectToDevice(device);

    if (
      activeStream &&
      this.currentStreamHandler &&
      this.currentStreamCommand
    ) {
      const subscriptionId = ++this.streamSubscriptionId;
      await this.launchCommandStream(
        subscriptionId,
        this.currentStreamCommand,
        this.currentStreamHandler,
      );
    }

    return info;
  }

  async disconnect(): Promise<void> {
    await this.stopCurrentPty();
    await this.stopCurrentStream();
    if (this.adb) {
      await this.adb.close();
    }
    this.adb = null;
    this.info = null;
  }

  async shell(command: string | readonly string[]): Promise<ShellResult> {
    const adb = this.requireAdb();
    const shell = adb.subprocess.shellProtocol;

    if (!shell) {
      throw new Error("Shell protocol is not supported by this device.");
    }

    try {
      const result = await shell.spawnWaitText(command);
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

    const start = Date.now();
    let bytesWritten = 0;

    try {
      const process = await shell.spawn(command);
      const writer = process.stdin.getWriter();

      try {
        for await (const chunk of fixedSizeChunks(
          input,
          SHELL_WITH_INPUT_WRITE_CHUNK_BYTES,
        )) {
          await writer.write(chunk);
          bytesWritten += chunk.byteLength;
          options.onProgress?.({
            bytesWritten,
            totalBytes: input.size,
            elapsedMs: Date.now() - start,
          });
        }
        await writer.close();
      } finally {
        writer.releaseLock();
      }

      const stdout = await this.readText(process.stdout);
      const stderr = await this.readText(process.stderr);
      const exitCode = await process.exited;
      this.markOperationSuccess();
      return { stdout, stderr, exitCode };
    } catch (error) {
      await this.recoverFromRetryableDisconnect(
        `shellWithInput ${Array.isArray(command) ? command.join(" ") : command}`,
        error,
      );
      throw error;
    }
  }

  async pushFile(remotePath: string, file: Blob): Promise<void> {
    while (true) {
      const adb = this.requireAdb();
      const sync = await adb.sync();
      let shouldRetry = false;

      try {
        await sync.write({
          filename: remotePath,
          file: ReadableStream.from(
            file.stream() as globalThis.ReadableStream<Uint8Array>,
          ),
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

      if (!shouldRetry) {
        return;
      }
    }
  }

  async reboot(): Promise<void> {
    const adb = this.requireAdb();

    try {
      await adb.power.reboot();
    } catch (error) {
      if (errorMessageIncludesSocketClosed(error)) {
        this.markOperationSuccess();
        return;
      }
      throw error;
    }

    this.markOperationSuccess();
  }

  async openPty(): Promise<AdbPtySession> {
    const adb = this.requireAdb();
    const shell = adb.subprocess.shellProtocol;

    if (!shell) {
      throw new Error("Shell protocol is not supported by this device.");
    }

    await this.stopCurrentPty();

    const process = await shell.pty({ terminalType: "xterm-256color" });
    const writer = process.input.getWriter();

    const session: AdbPtySession = {
      output: process.output,
      exited: process.exited,
      write: async (data) => {
        await writer.write(data);
      },
      sigint: async () => {
        await process.sigint();
      },
      close: async () => {
        try {
          await Promise.resolve(process.kill()).catch(() => undefined);
        } finally {
          writer.releaseLock();
          await process.output.cancel().catch(() => undefined);
          if (this.currentPtySession === session) {
            this.currentPtySession = null;
          }
        }
      },
    };

    this.currentPtySession = session;
    this.markOperationSuccess();
    return session;
  }

  async createSocket(service: string): Promise<AdbSocket> {
    const adb = this.requireAdb();
    try {
      const socket = await adb.createSocket(service);
      this.markOperationSuccess();
      return socket;
    } catch (error) {
      await this.recoverFromRetryableDisconnect(`createSocket ${service}`, error);
      throw error;
    }
  }

  async startCommandStream(
    command: string | readonly string[],
    onLine: (line: CommandStreamLine) => void,
  ): Promise<CommandStreamController> {
    this.currentStreamHandler = onLine;
    this.currentStreamCommand = command;
    const subscriptionId = ++this.streamSubscriptionId;

    await this.stopCurrentStream();
    await this.launchCommandStream(subscriptionId, command, onLine);

    return {
      stop: async () => {
        if (subscriptionId !== this.streamSubscriptionId) {
          return;
        }

        this.currentStreamHandler = null;
        this.currentStreamCommand = null;
        this.streamSubscriptionId += 1;
        await this.stopCurrentStream();
      },
    };
  }

  private async connectToDevice(
    device: AdbDaemonWebUsbDevice,
  ): Promise<AdbConnectionInfo> {
    try {
      const connection = await device.connect();
      const authBundle = await this.authStrategy.createAuthenticationBundle({
        serial: device.serial,
        name: device.name,
      });
      const transport = await AdbDaemonTransport.authenticate({
        serial: device.serial,
        connection,
        credentialStore: authBundle.credentialStore,
        authenticators: [...authBundle.authenticators],
        initialDelayedAckBytes: 0,
      });

      this.adb = new Adb(transport);
      this.info = {
        serial: device.serial,
        name: device.name,
      };
      logInfo("install-adb", "ADB transport authenticated", {
        device: this.info,
      });
      return this.info;
    } catch (error) {
      logError("install-adb", "Failed to connect to USB device", error, {
        serial: device.serial,
        name: device.name,
      });
      throw error;
    }
  }

  private async launchCommandStream(
    subscriptionId: number,
    command: string | readonly string[],
    onLine: (line: CommandStreamLine) => void,
  ) {
    const adb = this.requireAdb();
    const shell = adb.subprocess.shellProtocol;

    if (!shell) {
      throw new Error("Shell protocol is not supported by this device.");
    }

    const process = await shell.spawn(command);
    let stopped = false;

    this.currentStreamStop = async () => {
      if (stopped) {
        return;
      }
      stopped = true;
      try {
        await Promise.resolve(process.kill()).catch(() => undefined);
      } finally {
        await Promise.allSettled([
          process.stdout.cancel().catch(() => undefined),
          process.stderr.cancel().catch(() => undefined),
        ]);
      }
    };

    void process.stdout
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(new ConcatStringStream())
      .then((output) => {
        if (stopped || subscriptionId !== this.streamSubscriptionId) {
          return;
        }

        output.split(/\r?\n/).forEach((text) => {
          if (!text.trim()) {
            return;
          }

          onLine({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            text,
          });
        });
      })
      .catch((error) => {
        logDebug("install-adb", "Command stream ended with error", {
          command,
          error,
        });
      });
  }

  private async stopCurrentPty() {
    const session = this.currentPtySession;
    this.currentPtySession = null;
    if (session) {
      await session.close().catch(() => undefined);
    }
  }

  private async stopCurrentStream() {
    const stop = this.currentStreamStop;
    this.currentStreamStop = null;
    if (stop) {
      await stop();
    }
  }

  private async readText(stream: ReadableStream<Uint8Array>) {
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

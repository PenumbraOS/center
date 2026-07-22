import { useCallback, useEffect, useRef, useState } from "react";
import type { AdbPtySession, AdbSessionTransport } from "../device/adbTransport";
import { advance, createInitialContext } from "./engine";
import type { FlowContext, Press } from "./engine";
import { STEPS, applyPress } from "./steps";
import { deriveView, type InstallView } from "./view";
import { getBrowserSupport } from "../device/browserSupport";

export interface FlowApi {
  readonly view: InstallView;
  readonly value: string;
  readonly context: FlowContext;
  readonly isBusy: boolean;
  press(press: Press): void;
  getLogcatContent(): Promise<string>;
  openTerminalSession(): Promise<AdbPtySession>;
}

export function useFlow(
  createTransport: () => AdbSessionTransport,
): FlowApi {
  const ctxRef = useRef<FlowContext | null>(null);
  const [, tick] = useState(0);
  const notify = useCallback(() => tick((n) => n + 1), []);

  if (!ctxRef.current) {
    ctxRef.current = createInitialContext(createTransport, getBrowserSupport());
  }

  const ctx = ctxRef.current;

  useEffect(() => {
    const current = ctxRef.current;
    if (current) {
      advance(current, STEPS, notify).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = deriveView(STEPS[ctx.current], ctx);

  // An async action is running (ctx.run.busy) OR we're inside the advance loop
  const isBusy = ctx.run.busy;

  const press = useCallback(
    (p: Press) => {
      if (p.do) {
        applyPress(ctx, p.do);
      }
      ctx.current = p.to;
      advance(ctx, STEPS, notify, p.edge ?? {}).catch(() => undefined);
    },
    [ctx, notify],
  );

  const getLogcatContent = useCallback(async () => {
    const transport = ctx.transport;
    if (!transport) {
      return "";
    }
    const result = await transport.shell(["logcat", "-d"]);
    return result.stdout;
  }, [ctx.transport]);

  const openTerminalSession = useCallback(async () => {
    const transport = ctx.transport;
    if (!transport) {
      throw new Error("No active device connection.");
    }
    await transport.connect();
    return transport.openPty();
  }, [ctx.transport]);

  return {
    view,
    value: ctx.current,
    context: ctx,
    isBusy,
    press,
    getLogcatContent,
    openTerminalSession,
  };
}

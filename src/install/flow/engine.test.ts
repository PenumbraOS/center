import { describe, expect, it, vi } from "vitest";
import {
  advance,
  emitProgress,
  resetRun,
  connectionKey,
  type FlowContext,
  type Step,
  type StepResult,
} from "./engine";
import { createTestContext, createTestDevice, createTestRun } from "./testFixtures";

function simpleStep(
  id: string,
  run?: (ctx: FlowContext, edge: Record<string, unknown>) => Promise<StepResult | undefined> | StepResult | undefined,
): Step {
  return { id, run };
}

describe("advance", () => {
  it("runs a step run exactly once, returns undefined for terminal steps", async () => {
    const calls: string[] = [];
    const ctx = createTestContext({ current: "a" });
    const steps: Record<string, Step> = {
      a: simpleStep("a", () => { calls.push("run-a"); return undefined; }),
    };
    await advance(ctx, steps, () => undefined);
    expect(calls).toEqual(["run-a"]);
    expect(ctx.current).toBe("a");
  });

  it("transitions to next step when run returns a result", async () => {
    const calls: string[] = [];
    const ctx = createTestContext({ current: "a" });
    const steps: Record<string, Step> = {
      a: simpleStep("a", () => { calls.push("run-a"); return { to: "b", data: {} }; }),
      b: simpleStep("b", () => { calls.push("run-b"); return undefined; }),
    };
    await advance(ctx, steps, () => undefined);
    expect(calls).toEqual(["run-a", "run-b"]);
    expect(ctx.current).toBe("b");
  });

  it("passes edge data from one step to the next", async () => {
    const received: unknown[] = [];
    const ctx = createTestContext({ current: "a" });
    const steps: Record<string, Step> = {
      a: simpleStep("a", () => ({ to: "b", data: { foo: "bar" } })),
      b: simpleStep("b", (_ctx, edge) => { received.push(edge); return undefined; }),
    };
    await advance(ctx, steps, () => undefined);
    expect(received).toEqual([{ foo: "bar" }]);
  });

  it("captures errors from run into ctx.run.error and routes to error", async () => {
    const ctx = createTestContext({ current: "a" });
    const steps: Record<string, Step> = {
      a: simpleStep("a", () => { throw new Error("boom"); }),
      error: { id: "error" },
    };
    await advance(ctx, steps, () => undefined);
    expect(ctx.run.error).toBe("boom");
    expect(ctx.current).toBe("error");
  });

  it("guards against re-entrancy when busy", async () => {
    const ctx = createTestContext({ current: "a", run: createTestRun({ busy: true }) });
    const run = vi.fn();
    const steps: Record<string, Step> = {
      a: simpleStep("a", run),
    };
    await advance(ctx, steps, () => undefined);
    expect(run).not.toHaveBeenCalled();
    expect(ctx.current).toBe("a");
  });

  it("sets busy flag during async run and clears afterwards", async () => {
    const busyValues: boolean[] = [];
    const ctx = createTestContext({ current: "a" });
    const steps: Record<string, Step> = {
      a: simpleStep("a", async () => {
        busyValues.push(ctx.run.busy);
        await Promise.resolve();
        busyValues.push(ctx.run.busy);
        return { to: "b", data: {} };
      }),
      b: simpleStep("b"),
    };
    await advance(ctx, steps, () => undefined);
    expect(busyValues).toEqual([true, true]);
    expect(ctx.run.busy).toBe(false);
  });

  it("throws on unknown step", async () => {
    const ctx = createTestContext({ current: "nonexistent" });
    await expect(
      advance(ctx, {}, () => undefined),
    ).rejects.toThrow("Unknown step: nonexistent");
  });

  it("calls notify at each lifecycle point", async () => {
    const notify = vi.fn();
    const ctx = createTestContext({ current: "a" });
    const steps: Record<string, Step> = {
      a: simpleStep("a", () => ({ to: "b", data: {} })),
      b: simpleStep("b"),
    };
    await advance(ctx, steps, notify);
    // Called: after busy set + before await, after transition stay (b returns undefined)
    expect(notify).toHaveBeenCalled();
  });

  it("allows chaining through multiple steps", async () => {
    const calls: string[] = [];
    const ctx = createTestContext({ current: "a" });
    const steps: Record<string, Step> = {
      a: simpleStep("a", () => { calls.push("a"); return { to: "b", data: {} }; }),
      b: simpleStep("b", () => { calls.push("b"); return { to: "c", data: {} }; }),
      c: simpleStep("c", () => { calls.push("c"); return undefined; }),
    };
    await advance(ctx, steps, () => undefined);
    expect(calls).toEqual(["a", "b", "c"]);
    expect(ctx.current).toBe("c");
  });

  it("closes the terminal button when busy", async () => {
    // busy is set on entry and cleared in finally — verify with an async step
    const ctx = createTestContext({ current: "a" });
    let busyDuring = false;
    const steps: Record<string, Step> = {
      a: simpleStep("a", async () => {
        busyDuring = ctx.run.busy;
        await Promise.resolve();
        return { to: "b", data: {} };
      }),
      b: simpleStep("b"),
    };
    await advance(ctx, steps, () => undefined);
    expect(busyDuring).toBe(true);
    expect(ctx.run.busy).toBe(false);
  });
});

describe("helpers", () => {
  describe("emitProgress", () => {
    it("appends to progressEntries when logEntry is true/undefined", () => {
      const ctx = createTestContext();
      emitProgress(ctx, {
        phase: "Assets",
        message: "downloading...",
        overallPercent: 10,
        phasePercent: 50,
        phaseCompleted: 1,
        phaseTotal: 2,
        phaseUnitLabel: "asset",
        bytes: { loaded: 50, total: 100 },
        logEntry: true,
      });
      expect(ctx.run.progressEntries).toHaveLength(1);
      expect(ctx.run.currentProgress).not.toBeNull();
      expect(ctx.run.currentProgress!.phase).toBe("Assets");
      expect(ctx.run.currentProgress!.bytesLoaded).toBe(50);
    });

    it("skips progressEntries append when logEntry is false", () => {
      const ctx = createTestContext();
      emitProgress(ctx, {
        phase: "Bootstrap",
        message: "substep...",
        overallPercent: 30,
        logEntry: false,
      });
      expect(ctx.run.progressEntries).toHaveLength(0);
      expect(ctx.run.currentProgress).not.toBeNull();
    });

    it("always updates currentProgress", () => {
      const ctx = createTestContext();
      emitProgress(ctx, {
        phase: "Verify",
        message: "verifying...",
        overallPercent: 100,
      });
      expect(ctx.run.currentProgress!.message).toBe("verifying...");
    });
  });

  describe("resetRun", () => {
    it("resets run state but preserves other sub-objects", () => {
      const ctx = createTestContext({
        run: createTestRun({
          warnings: [{ code: "disable-failed" as const, message: "warn" }],
          progressEntries: [{ id: "1", timestamp: "t", phase: "Assets", message: "m", overallPercent: 50, phasePercent: 100, phaseCompleted: null, phaseTotal: null, phaseUnitLabel: null, bytesLoaded: null, bytesTotal: null }],
          currentProgress: { id: "1", timestamp: "t", phase: "Assets", message: "m", overallPercent: 50, phasePercent: 100, phaseCompleted: null, phaseTotal: null, phaseUnitLabel: null, bytesLoaded: null, bytesTotal: null },
          error: "boom",
          lastResult: null as never,
          failedPhase: "Bootstrap",
          destructiveStarted: true,
        }),
      });
      resetRun(ctx);
      expect(ctx.run.warnings).toEqual([]);
      expect(ctx.run.progressEntries).toEqual([]);
      expect(ctx.run.currentProgress).toBeNull();
      expect(ctx.run.error).toBeNull();
      expect(ctx.run.lastResult).toBeNull();
      expect(ctx.run.failedPhase).toBeNull();
      expect(ctx.run.destructiveStarted).toBe(false);
      expect(ctx.op.operation).toBe("install");
      // device should be preserved
      expect(ctx.device).not.toBeNull();
    });
  });

  describe("connectionKey", () => {
    it("returns `${serial}:${name}` when connected", () => {
      const ctx = createTestContext({ device: createTestDevice({ connection: { serial: "s1", name: "My Pin" } }) });
      expect(connectionKey(ctx)).toBe("s1:My Pin");
    });

    it("returns null when not connected", () => {
      const ctx = createTestContext({ device: null });
      expect(connectionKey(ctx)).toBeNull();
    });
  });
});

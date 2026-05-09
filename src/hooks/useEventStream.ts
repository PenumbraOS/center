import { useEffect, useRef } from "react";
import type { PinClient, StreamEvent } from "../api";
import { logDebug, logError, logInfo, logWarn } from "../logging";

/**
 * Connects to the Pin server's NDJSON event stream and calls `onEvent`
 * for each parsed event. Automatically reconnects on failure with a 3s delay.
 */
export function useEventStream(
  client: PinClient | null,
  onEvent: (event: StreamEvent) => void,
) {
  // Keep a stable ref to the callback so we don't reconnect when it changes.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!client) return;

    const activeClient = client;
    const baseUrl = activeClient.baseUrl;

    let cancelled = false;
    let reconnectAttempt = 0;
    const controller = new AbortController();

    async function connect() {
      while (!cancelled) {
        reconnectAttempt += 1;
        logInfo("event-stream", "Connecting to event stream", {
          baseUrl,
          reconnectAttempt,
        });

        try {
          const stream = await activeClient.openStream("/api/events", controller.signal);

          logInfo("event-stream", "Event stream connected", {
            baseUrl,
            reconnectAttempt,
          });

          const reader = stream.getReader();

          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done || cancelled) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop()!;
            for (const line of lines) {
              if (line.trim()) {
                try {
                  onEventRef.current(JSON.parse(line) as StreamEvent);
                } catch (error) {
                  logWarn("event-stream", "Failed to parse NDJSON event line", {
                    baseUrl,
                    line,
                    error,
                  });
                }
              }
            }
          }

          logDebug("event-stream", "Event stream reader ended", {
            baseUrl,
            cancelled,
          });
        } catch (error) {
          if (!cancelled) {
            logError("event-stream", "Event stream connection failed", error, {
              baseUrl,
              reconnectAttempt,
            });
          }
        }
        if (!cancelled) {
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    }

    connect().catch((error) => {
      logError("event-stream", "Event stream loop crashed", error, {
        baseUrl,
      });
    });

    return () => {
      cancelled = true;
      controller.abort();
      logInfo("event-stream", "Event stream cleanup", {
        baseUrl,
      });
    };
  }, [client]);
}

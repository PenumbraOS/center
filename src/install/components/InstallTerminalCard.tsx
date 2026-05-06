import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import type { InstallController } from "../app/useInstallController";
import type { AdbPtySession } from "../device/adbTransport";
import { useBeforeUnload } from "../../hooks/useBeforeUnload";

const TERMINAL_COLS = 80;
const TERMINAL_ROWS = 24;

type TerminalStatus = "closed" | "opening" | "open" | "exited" | "error";

export function InstallTerminalCard({
  controller,
  onBack,
}: {
  controller: InstallController;
  onBack: () => void;
}) {
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const sessionRef = useRef<AdbPtySession | null>(null);
  const cleanupOutputRef = useRef<(() => void) | null>(null);
  const openAttemptRef = useRef(0);
  const [status, setStatus] = useState<TerminalStatus>("closed");

  const closeTerminal = useCallback(async () => {
    openAttemptRef.current += 1;
    cleanupOutputRef.current?.();
    cleanupOutputRef.current = null;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      await session.close().catch(() => undefined);
    }
    terminalRef.current?.dispose();
    terminalRef.current = null;
    terminalHostRef.current?.replaceChildren();
    setStatus("closed");
  }, []);

  const openTerminal = useCallback(async () => {
    if (!terminalHostRef.current) {
      return;
    }

    await closeTerminal();
    const attemptId = ++openAttemptRef.current;
    setStatus("opening");

    try {
      const session = await controller.openTerminalSession();
      if (attemptId !== openAttemptRef.current) {
        await session.close().catch(() => undefined);
        return;
      }

      terminalHostRef.current?.replaceChildren();

      const terminal = new Terminal({
        cols: TERMINAL_COLS,
        rows: TERMINAL_ROWS,
        convertEol: true,
        cursorBlink: true,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        fontSize: 12,
        theme: {
          background: "#000000",
          foreground: "#d6d6d6",
        },
      });

      terminalRef.current = terminal;
      sessionRef.current = session;
      terminal.open(terminalHostRef.current);
      terminal.focus();

      const inputDisposable = terminal.onData((data) => {
        const activeSession = sessionRef.current;
        if (!activeSession) {
          return;
        }

        void activeSession
          .write(new TextEncoder().encode(data))
          .catch((error) => {
            terminal.writeln(
              `\r\n[write error] ${error instanceof Error ? error.message : String(error)}`,
            );
          });
      });

      let readerCancelled = false;
      const outputReader = session.output.getReader();
      const decoder = new TextDecoder();

      void (async () => {
        try {
          while (!readerCancelled) {
            const { done, value } = await outputReader.read();
            if (done) {
              break;
            }

            if (value) {
              terminal.write(decoder.decode(value, { stream: true }));
            }
          }
        } catch (error) {
          if (!readerCancelled) {
            terminal.writeln(
              `\r\n[output error] ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        } finally {
          outputReader.releaseLock();
        }
      })();

      cleanupOutputRef.current = () => {
        readerCancelled = true;
        inputDisposable.dispose();
        void outputReader.cancel().catch(() => undefined);
      };

      void session.exited
        .then(() => {
          if (
            attemptId !== openAttemptRef.current ||
            sessionRef.current !== session
          ) {
            return;
          }

          terminal.writeln("\r\n[terminal exited]");
          setStatus("exited");
        })
        .catch((error) => {
          if (
            attemptId !== openAttemptRef.current ||
            sessionRef.current !== session
          ) {
            return;
          }

          terminal.writeln(
            `\r\n[terminal error] ${error instanceof Error ? error.message : String(error)}`,
          );
          setStatus("error");
        });

      if (attemptId !== openAttemptRef.current) {
        terminal.dispose();
        await session.close().catch(() => undefined);
        return;
      }

      setStatus("open");
    } catch (error) {
      if (attemptId !== openAttemptRef.current) {
        return;
      }

      terminalRef.current?.dispose();
      terminalRef.current = null;
      sessionRef.current = null;
      terminalHostRef.current?.replaceChildren();
      setStatus("error");
    }
  }, [closeTerminal, controller]);

  useEffect(() => {
    void openTerminal().catch(() => undefined);

    return () => {
      void closeTerminal();
    };
  }, [closeTerminal, openTerminal]);

  useEffect(() => {
    if (controller.state.connection !== null) {
      return;
    }

    void closeTerminal().finally(() => {
      onBack();
    });
  }, [closeTerminal, controller.state.connection, onBack]);

  async function handleBack() {
    await closeTerminal();
    onBack();
  }

  const isTerminalActive = status === "opening" || status === "open";
  useBeforeUnload(isTerminalActive);

  const canReconnect = status === "exited" || status === "error";

  return (
    <section className="install-stage" aria-labelledby="install-terminal-title">
      <div className="install-stage__content">
        <header className="install-stage__heading">
          <h1 id="install-terminal-title" className="install-stage__title">
            Terminal
          </h1>
        </header>

        <div className="install-terminal__viewport-wrap">
          <div ref={terminalHostRef} className="install-terminal__viewport" />
        </div>
      </div>

      <footer className="install-stage__footer">
        <div className="install-stage__primary-slot">
          <button
            type="button"
            className="install-stage__primary"
            onClick={() => {
              void handleBack();
            }}
          >
            Back
          </button>
        </div>

        <div className="install-stage__links-slot">
          <div className="install-stage__links-wrap">
            {canReconnect ? (
              <div
                className="install-stage__links"
                aria-label="Terminal Actions"
              >
                <span className="install-stage__link-item">
                  <button
                    type="button"
                    className="install-stage__link"
                    onClick={() => {
                      void openTerminal();
                    }}
                  >
                    Reconnect
                  </button>
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </footer>
    </section>
  );
}

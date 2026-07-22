import { useCallback, useState } from "react";
import { RemoteSignerAdbAuthStrategy } from "../device/adbAuth";
import { WebUsbAdbSessionTransport } from "../device/adbTransport";
import { useBeforeUnload } from "../../hooks/useBeforeUnload";
import { useFlow } from "../flow/useFlow";
import { InstallView } from "../InstallView";
import {
  ConfirmActionModal,
  InstallDiagnosticsCard,
  InstallTerminalCard,
} from "../components";
import SiteChrome from "../../components/SiteChrome";
import type { Press } from "../flow/view";

export default function InstallApp() {
  const [view, setView] = useState<"installer" | "terminal">("installer");

  const createTransport = useCallback(
    () =>
      new WebUsbAdbSessionTransport({
        authStrategy: new RemoteSignerAdbAuthStrategy(),
      }),
    [],
  );
  const flow = useFlow(createTransport);

  useBeforeUnload(flow.isBusy);

  const handlePress = useCallback(
    (press: Press | null) => {
      if (press) {
        flow.press(press);
      }
    },
    [flow],
  );

  return (
    <SiteChrome title="Center">
      <div className="install-page">
        <section className="install-page__section">
          <div className="install-page__column">
            {view === "terminal" ? (
              <InstallTerminalCard
                openTerminalSession={flow.openTerminalSession}
                connected={flow.context.device !== null}
                onBack={() => {
                  setView("installer");
                }}
              />
            ) : (
              <InstallView
                view={flow.view}
                onPress={handlePress}
                onOpenTerminal={() => {
                  setView("terminal");
                }}
              />
            )}
            <InstallDiagnosticsCard
              context={flow.context}
              value={flow.value}
              getLogcatContent={flow.getLogcatContent}
            />
          </div>
        </section>
        <ConfirmActionModal
          dialog={flow.view.dialog}
          onCancel={handlePress}
          onConfirm={handlePress}
        />
      </div>
    </SiteChrome>
  );
}

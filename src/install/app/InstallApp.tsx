import { useCallback } from "react";
import { RemoteSignerAdbAuthStrategy } from "../device/adbAuth";
import { WebUsbAdbSessionTransport } from "../device/adbTransport";
import { useInstallController } from "./useInstallController";
import {
  ConfirmActionModal,
  InstallDiagnosticsCard,
  InstallPrimaryCard,
} from "../components";
import { useInstallActionConfirmation } from "./useInstallActionConfirmation";
import SiteChrome from "../../components/SiteChrome";

export default function InstallAppV1() {
  const createTransport = useCallback(
    () =>
      new WebUsbAdbSessionTransport({
        authStrategy: new RemoteSignerAdbAuthStrategy(),
      }),
    [],
  );
  const controller = useInstallController(createTransport);

  const confirmation = useInstallActionConfirmation({
    state: controller.state,
    commands: controller.commands,
    runPrimaryAction: controller.runPrimaryAction,
    runRollback: controller.runRollback,
    runUninstall: controller.runUninstall,
  });

  return (
    <SiteChrome title="Center">
      <div className="install-page">
        <section className="install-page__section">
          <div className="install-page__column">
            <InstallPrimaryCard
              controller={controller}
              onPrimaryAction={() => {
                void confirmation.requestPrimaryAction();
              }}
              onRollback={() => {
                void confirmation.requestRollback();
              }}
              onUninstall={() => {
                void confirmation.requestUninstall();
              }}
            />
            <InstallDiagnosticsCard state={controller.state} />
          </div>
        </section>
        <ConfirmActionModal
          dialog={confirmation.dialog}
          onCancel={confirmation.dismissDialog}
          onConfirm={confirmation.confirmDialog}
        />
      </div>
    </SiteChrome>
  );
}

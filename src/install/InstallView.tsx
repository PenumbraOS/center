import { useState } from "react";
import { PackageStatusList } from "../components/PackageStatusList";
import { ConnectionHelpModal } from "./components/ConnectionHelpModal";
import { OverflowMenu } from "./components/OverflowMenu";
import type { InstallView as InstallViewModel, ViewButton, Press } from "./flow/view";

function ActionButton({
  button,
  className,
  onPress,
}: {
  button: ViewButton;
  className: string;
  onPress: (press: Press | null) => void;
}) {
  if (button.href) {
    return (
      <a href={button.href} className={className}>
        {button.label}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        if (!button.disabled && button.press) {
          onPress(button.press);
        }
      }}
      disabled={button.disabled || button.press === null}
      title={button.reason ?? undefined}
    >
      {button.label}
    </button>
  );
}

export function InstallView({
  view,
  onPress,
  onOpenTerminal,
}: {
  view: InstallViewModel;
  onPress: (press: Press | null) => void;
  onOpenTerminal: () => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  const overflowButtons = view.showTerminal
    ? [
        ...view.overflowButtons,
        {
          key: "openTerminal",
          label: "Terminal",
          press: null as Press | null,
          href: null as string | null,
          disabled: false,
          reason: null as string | null,
        } satisfies ViewButton,
      ]
    : view.overflowButtons;

  return (
    <section className="install-stage" aria-labelledby="install-stage-title">
      <div className="install-stage__content">
        {view.showHero ? (
          <div className="install-stage__hero" aria-hidden="true">
            <img
              src="/install/ai-pin.webp"
              alt=""
              className="install-stage__hero-image"
            />
          </div>
        ) : null}

        <header className="install-stage__heading">
          <h1 id="install-stage-title" className="install-stage__title">
            {view.title}
          </h1>
          <p className="install-stage__copy">{view.body}</p>
        </header>

        {view.notice ? (
          <div
            className={`install-stage__notice install-stage__notice--${view.notice.tone}`}
            role={view.notice.tone === "danger" ? "alert" : "status"}
          >
            {view.notice.text}
          </div>
        ) : null}

        {view.showProgress ? (
          <div className="install-stage__progress" aria-live="polite">
            <div className="install-stage__progress-meta">
              <span>In progress</span>
              <span>{view.progressPercent}%</span>
            </div>
            <progress
              className="app-progress-bar"
              max={100}
              value={view.progressPercent}
            />
          </div>
        ) : null}

        {view.device ? (
          <section className="install-stage__device" aria-label="Connected Device">
            <div className="install-stage__device-head">
              <div className="install-stage__device-identity">
                <div className="install-stage__device-name">
                  {view.device.name}
                </div>
                <div className="install-stage__device-serial">
                  {view.device.serial}
                </div>
              </div>
              {view.device.badge ? (
                <span className="install-stage__device-badge">
                  {view.device.badge}
                </span>
              ) : null}
            </div>

            <PackageStatusList
              ariaLabel="Managed Packages and Detected Conflicts"
              rows={view.packageRows}
              conflictRows={view.conflictRows}
              topPadding={true}
            />
          </section>
        ) : null}
      </div>

      <footer className="install-stage__footer">
        <div className="install-stage__primary-slot">
          {view.primaryButton ? (
            <ActionButton
              button={view.primaryButton}
              className="install-stage__primary"
              onPress={onPress}
            />
          ) : null}
        </div>

        <div className="install-stage__links-slot">
          {view.secondaryButtons.length > 0 ||
          view.showConnectionHelp ||
          overflowButtons.length > 0 ? (
            <div className="install-stage__links-wrap">
              <nav className="install-stage__links" aria-label="More Actions">
                {view.secondaryButtons.map((button) => (
                  <span key={button.key} className="install-stage__link-item">
                    <ActionButton
                      button={button}
                      className="install-stage__link"
                      onPress={onPress}
                    />
                  </span>
                ))}
                {view.showConnectionHelp ? (
                  <span className="install-stage__link-item">
                    <button
                      type="button"
                      className="install-stage__link"
                      onClick={() => setHelpOpen(true)}
                    >
                      Connection Help
                    </button>
                  </span>
                ) : null}
              </nav>
              {overflowButtons.length > 0 ? (
                <OverflowMenu
                  actions={overflowButtons}
                  onAction={(button) => {
                    if (button.key === "openTerminal") {
                      onOpenTerminal();
                      return;
                    }
                    if (!button.disabled && button.press) {
                      onPress(button.press);
                    }
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </footer>

      <ConnectionHelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  );
}

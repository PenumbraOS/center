import { useState } from "react";
import type { InstallController } from "../app/useInstallController";
import {
  derivePrimaryCardViewModel,
  type PrimaryCardActionViewModel,
} from "../presentation/primaryCardViewModel";
import { ConnectionHelpModal } from "./ConnectionHelpModal";
import { OverflowMenu } from "./OverflowMenu";

function runAction(options: {
  action: PrimaryCardActionViewModel;
  controller: InstallController;
  onPrimaryAction: () => void;
  onRollback: () => void;
  onUninstall: () => void;
  onRemoveConflicts: () => void;
  onOpenTerminal: () => void;
}) {
  const {
    action,
    controller,
    onPrimaryAction,
    onRollback,
    onUninstall,
    onRemoveConflicts,
    onOpenTerminal,
  } = options;

  if (action.disabled) {
    return;
  }

  if (action.key === "rollback") {
    onRollback();
    return;
  }

  if (action.key === "primaryAction") {
    onPrimaryAction();
    return;
  }

  if (action.key === "installApkFile") {
    void controller.runInstallApkFile();
    return;
  }

  if (action.key === "openTerminal") {
    onOpenTerminal();
    return;
  }

  if (action.key === "uninstall") {
    onUninstall();
    return;
  }

  if (action.key === "removeConflicts") {
    onRemoveConflicts();
    return;
  }

  if (action.key === "connect") {
    void controller.connectAndInspect();
    return;
  }

  if (action.key === "recheck") {
    void controller.recheck();
    return;
  }

  if (action.key === "startOver") {
    void controller.startOver();
  }
}

function PrimaryButton({
  action,
  controller,
  onPrimaryAction,
  onRollback,
  onUninstall,
  onRemoveConflicts,
  onOpenTerminal,
}: {
  action: PrimaryCardActionViewModel;
  controller: InstallController;
  onPrimaryAction: () => void;
  onRollback: () => void;
  onUninstall: () => void;
  onRemoveConflicts: () => void;
  onOpenTerminal: () => void;
}) {
  if (action.href) {
    return (
      <a href={action.href} className="install-stage__primary">
        {action.label}
      </a>
    );
  }

  return (
    <button
      type="button"
      className="install-stage__primary"
      onClick={() =>
        runAction({
          action,
          controller,
          onPrimaryAction,
          onRollback,
          onUninstall,
          onRemoveConflicts,
          onOpenTerminal,
        })
      }
      disabled={action.disabled}
      title={action.reason ?? undefined}
    >
      {action.label}
    </button>
  );
}

function SecondaryLink({
  action,
  controller,
  onPrimaryAction,
  onRollback,
  onUninstall,
  onRemoveConflicts,
  onOpenTerminal,
}: {
  action: PrimaryCardActionViewModel;
  controller: InstallController;
  onPrimaryAction: () => void;
  onRollback: () => void;
  onUninstall: () => void;
  onRemoveConflicts: () => void;
  onOpenTerminal: () => void;
}) {
  if (action.href) {
    return (
      <a href={action.href} className="install-stage__link">
        {action.label}
      </a>
    );
  }

  return (
    <button
      type="button"
      className="install-stage__link"
      onClick={() =>
        runAction({
          action,
          controller,
          onPrimaryAction,
          onRollback,
          onUninstall,
          onRemoveConflicts,
          onOpenTerminal,
        })
      }
      disabled={action.disabled}
      title={action.reason ?? undefined}
    >
      {action.label}
    </button>
  );
}

export function InstallPrimaryCard({
  controller,
  onPrimaryAction,
  onRollback,
  onUninstall,
  onRemoveConflicts,
  onOpenTerminal,
}: {
  controller: InstallController;
  onPrimaryAction: () => void;
  onRollback: () => void;
  onUninstall: () => void;
  onRemoveConflicts: () => void;
  onOpenTerminal: () => void;
}) {
  const viewModel = derivePrimaryCardViewModel(
    controller.state,
    controller.commands,
  );
  const [helpOpen, setHelpOpen] = useState(false);
  const showConnectionHelp = viewModel.primaryAction?.key === "connect";
  const { overflowActions } = viewModel;

  return (
    <section className="install-stage" aria-labelledby="install-stage-title">
      <div className="install-stage__content">
        {viewModel.showHero ? (
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
            {viewModel.title}
          </h1>
          <p className="install-stage__copy">{viewModel.copy}</p>
        </header>

        {viewModel.notice ? (
          <div
            className={`install-stage__notice install-stage__notice--${viewModel.notice.tone}`}
            role={viewModel.notice.tone === "danger" ? "alert" : "status"}
          >
            {viewModel.notice.text}
          </div>
        ) : null}

        {viewModel.showProgress ? (
          <div className="install-stage__progress" aria-live="polite">
            <div className="install-stage__progress-meta">
              <span>In progress</span>
              <span>{viewModel.progressPercent}%</span>
            </div>
            <progress
              className="app-progress-bar"
              max={100}
              value={viewModel.progressPercent}
            />
          </div>
        ) : null}

        {viewModel.device ? (
          <section
            className="install-stage__device"
            aria-label="Connected Device"
          >
            <div className="install-stage__device-head">
              <div className="install-stage__device-identity">
                <div className="install-stage__device-name">
                  {viewModel.device.name}
                </div>
                <div className="install-stage__device-serial">
                  {viewModel.device.serial}
                </div>
              </div>
              {viewModel.device.badge ? (
                <span className="install-stage__device-badge">
                  {viewModel.device.badge}
                </span>
              ) : null}
            </div>

            {viewModel.packageRows.length > 0 ||
            viewModel.conflictRows.length > 0 ? (
              <dl
                className="install-stage__packages"
                aria-label="Managed Packages and Detected Conflicts"
              >
                {viewModel.packageRows.map((pkg) => (
                  <div
                    key={`${pkg.category ?? "managed"}-${pkg.role}`}
                    className="install-stage__package"
                  >
                    <dt>{pkg.role}</dt>
                    <dd
                      className={`install-stage__package-value install-stage__package-value--${pkg.tone}`}
                      title={pkg.value}
                    >
                      {pkg.value}
                    </dd>
                  </div>
                ))}
                {viewModel.conflictRows.length > 0 ? (
                  <div
                    className="install-stage__packages-divider"
                    aria-hidden="true"
                  >
                    <span>Installation Conflicts</span>
                  </div>
                ) : null}
                {viewModel.conflictRows.map((pkg) => (
                  <div
                    key={`${pkg.category ?? "conflict"}-${pkg.role}`}
                    className="install-stage__package install-stage__package--conflict"
                  >
                    <dt>{pkg.role}</dt>
                    <dd
                      className={`install-stage__package-value install-stage__package-value--${pkg.tone}`}
                      title={pkg.value}
                    >
                      <span className="install-stage__package-conflict-copy">
                        {pkg.value}
                      </span>
                      {pkg.badge ? (
                        <span className="install-stage__package-badge install-stage__package-badge--warning">
                          {pkg.badge}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>
        ) : null}
      </div>

      <footer className="install-stage__footer">
        <div className="install-stage__primary-slot">
          {viewModel.primaryAction ? (
            <PrimaryButton
              action={viewModel.primaryAction}
              controller={controller}
              onPrimaryAction={onPrimaryAction}
              onRollback={onRollback}
              onUninstall={onUninstall}
              onRemoveConflicts={onRemoveConflicts}
              onOpenTerminal={onOpenTerminal}
            />
          ) : null}
        </div>

        <div className="install-stage__links-slot">
          {viewModel.secondaryActions.length > 0 ||
          showConnectionHelp ||
          overflowActions.length > 0 ? (
            <div className="install-stage__links-wrap">
              <nav className="install-stage__links" aria-label="More Actions">
                {viewModel.secondaryActions.map((action) => (
                  <span key={action.key} className="install-stage__link-item">
                    <SecondaryLink
                      action={action}
                      controller={controller}
                      onPrimaryAction={onPrimaryAction}
                      onRollback={onRollback}
                      onUninstall={onUninstall}
                      onRemoveConflicts={onRemoveConflicts}
                      onOpenTerminal={onOpenTerminal}
                    />
                  </span>
                ))}
                {showConnectionHelp ? (
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
              {overflowActions.length > 0 ? (
                <OverflowMenu
                  actions={overflowActions}
                  onAction={(action) =>
                    runAction({
                      action,
                      controller,
                      onPrimaryAction,
                      onRollback,
                      onUninstall,
                      onRemoveConflicts,
                      onOpenTerminal,
                    })
                  }
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

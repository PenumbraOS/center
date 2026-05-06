import type { InstallController } from "../app/useInstallController";

function commandReason(
  controller: InstallController,
): { tone: "info" | "warning" | "danger"; text: string } | null {
  const { commands, state } = controller;

  if (commands.rollback.visible && commands.rollback.reason) {
    return {
      tone: "warning",
      text: commands.rollback.reason,
    };
  }

  if (commands.primaryAction.visible && commands.primaryAction.reason) {
    return {
      tone:
        state.inspection?.installActionsBlocked ||
        state.inspection?.readiness.credentialState.state === "locked"
          ? "warning"
          : "info",
      text: commands.primaryAction.reason,
    };
  }

  if (commands.uninstall.visible && commands.uninstall.reason) {
    return {
      tone: "info",
      text: commands.uninstall.reason,
    };
  }

  if (commands.startOver.visible && commands.startOver.reason) {
    return {
      tone: "warning",
      text: commands.startOver.reason,
    };
  }

  return null;
}

export function InstallActionsCard({
  controller,
  onPrimaryAction,
  onRollback,
  onUninstall,
}: {
  controller: InstallController;
  onPrimaryAction: () => void;
  onRollback: () => void;
  onUninstall: () => void;
}) {
  const { commands, state } = controller;
  const visibleCommandCount = [
    commands.primaryAction.visible,
    commands.rollback.visible,
    commands.uninstall.visible,
    commands.recheck.visible,
    commands.startOver.visible,
    commands.goToCenter.visible,
  ].filter(Boolean).length;

  if (visibleCommandCount === 0) {
    return null;
  }

  const help = commandReason(controller);

  return (
    <section className="app-info-card app-flow app-flow--sm" aria-labelledby="install-actions-title">
      <h2 id="install-actions-title" className="app-panel-title">
        Available Actions
      </h2>

      <div className="app-inline-actions">
        {commands.rollback.visible ? (
          <button
            className="hero-cta app-button"
            onClick={onRollback}
            disabled={commands.rollback.disabled}
          >
            {commands.rollback.label}
          </button>
        ) : null}

        {commands.recheck.visible ? (
          <button
            className={commands.recheck.prominent ? "hero-cta app-button" : "app-button app-button--ghost"}
            onClick={() => void controller.recheck()}
            disabled={commands.recheck.disabled}
          >
            {commands.recheck.label}
          </button>
        ) : null}

        {commands.primaryAction.visible ? (
          <button
            className="hero-cta app-button"
            onClick={onPrimaryAction}
            disabled={commands.primaryAction.disabled}
          >
            {commands.primaryAction.label}
          </button>
        ) : null}

        {commands.uninstall.visible ? (
          <button
            className="app-button app-button--ghost"
            onClick={onUninstall}
            disabled={commands.uninstall.disabled}
          >
            {commands.uninstall.label}
          </button>
        ) : null}

        {commands.goToCenter.visible ? (
          <a href={commands.goToCenter.href} className="hero-cta app-button">
            {commands.goToCenter.label}
          </a>
        ) : null}

        {commands.startOver.visible ? (
          <button
            className="app-button app-button--ghost"
            onClick={() => void controller.startOver()}
            disabled={commands.startOver.disabled}
          >
            {commands.startOver.label}
          </button>
        ) : null}
      </div>

      {help ? <div className={`app-notice app-notice--${help.tone}`}>{help.text}</div> : null}

      {state.stage === "result" && state.lastOperationResult?.kind === "install" && state.lastOperationResult.result.success ? (
        <p className="app-panel-copy">
          The install completed. Continue to Center to configure the server URL separately.
        </p>
      ) : null}

      {state.stage === "result" && state.lastOperationResult?.kind === "install" && !state.lastOperationResult.result.success ? (
        <div className="app-notice app-notice--warning">
          Install changes were preserved for inspection. Use <strong>Recheck</strong> to inspect the
          current device state, or <strong>Rollback Install</strong> to undo the failed install.
        </div>
      ) : null}
    </section>
  );
}

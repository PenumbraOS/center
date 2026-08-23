import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePin } from "../hooks";
import {
  PackageStatusList,
  type PackageStatusRowViewModel,
} from "../components/PackageStatusList";
import SchemaSettingsForm from "../components/SchemaSettingsForm";
import UnsavedChangesPrompt from "../components/UnsavedChangesPrompt";
import { logError, logInfo } from "../logging";

function displayVersionValue(value: string | null | undefined) {
  return value && value.trim() ? value : "Unavailable";
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { client, disconnect, device } = usePin();

  const [formDirty, setFormDirty] = useState(false);
  const [logDownloadError, setLogDownloadError] = useState<string | null>(null);
  const [downloadingLogKind, setDownloadingLogKind] = useState<
    "server" | "logcat" | null
  >(null);
  const [allowDisconnectNavigation, setAllowDisconnectNavigation] =
    useState(false);

  function downloadTextFile(fileName: string, text: string) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.append(link);
    link.click();
    link.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  async function handleDownloadLogs(kind: "server" | "logcat") {
    if (!client || downloadingLogKind) return;

    setLogDownloadError(null);
    setDownloadingLogKind(kind);

    try {
      logInfo("settings-page", "Downloading logs", {
        baseUrl: client.baseUrl,
        kind,
      });
      const result = await client.fetchLogs(kind);
      if (!result.available) {
        setLogDownloadError(result.text || `Failed to download ${kind} logs`);
        return;
      }

      downloadTextFile(
        kind === "server" ? "humane-server.log" : "penumbra-logcat.log",
        result.text,
      );
      logInfo("settings-page", "Logs downloaded", {
        baseUrl: client.baseUrl,
        kind,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to download ${kind} logs`;
      logError("settings-page", "Failed to download logs", error, {
        baseUrl: client?.baseUrl,
        kind,
      });
      setLogDownloadError(message);
    } finally {
      setDownloadingLogKind(null);
    }
  }

  function handleDisconnect() {
    setAllowDisconnectNavigation(true);
    disconnect();
  }

  return (
    <>
      <section className="app-page-header">
        <div className="container">
          <div className="app-page-intro">
            <h1 className="app-page-title">Settings</h1>
            <p className="app-page-copy">
              Customize your PenumbraOS experience.
            </p>
          </div>
        </div>
      </section>

      <section className="app-page-content">
        <div className="container app-flow app-settings-width">
          <SchemaSettingsForm onDirtyChange={setFormDirty} />

          <section className="app-form-card app-flow--sm">
            <h2>Device Software</h2>
            {device?.versions ? (
              <>
                <PackageStatusList
                  ariaLabel="Device Software Versions"
                  rows={[
                    {
                      id: "arcos",
                      role: "arcOS",
                      value: displayVersionValue(
                        device.versions.os.humane_display_version,
                      ),
                      tone: device.versions.os.humane_display_version
                        ? "success"
                        : "warning",
                    },
                    ...device.versions.components.map(
                      (component): PackageStatusRowViewModel => ({
                        id: component.package_name,
                        role: component.label,
                        value: displayVersionValue(component.version_name),
                        tone: component.version_name ? "success" : "warning",
                      }),
                    ),
                  ]}
                />
              </>
            ) : (
              <p className="home-card-desc">
                Device software versions are unavailable from this server.
              </p>
            )}
          </section>

          <section className="app-form-card app-flow--sm">
            <h2>eSIM</h2>
            <p className="home-card-desc">
              Manage cellular profiles and activate a new eSIM.
            </p>
            <button
              type="button"
              className="app-button app-button--ghost"
              onClick={() => navigate("/settings/esim")}
            >
              Manage eSIM
            </button>
          </section>

          <section className="app-form-card app-flow--sm">
            <h2>Logs</h2>
            <div className="app-inline-actions">
              <button
                type="button"
                onClick={() => handleDownloadLogs("server")}
                disabled={downloadingLogKind !== null}
                className="app-button app-button--ghost"
              >
                {downloadingLogKind === "server"
                  ? "Downloading Server Logs..."
                  : "Download Server Logs"}
              </button>
              <button
                type="button"
                onClick={() => handleDownloadLogs("logcat")}
                disabled={downloadingLogKind !== null}
                className="app-button app-button--ghost"
              >
                {downloadingLogKind === "logcat"
                  ? "Downloading Logcat..."
                  : "Download Logcat"}
              </button>
            </div>
            {logDownloadError && (
              <p className="app-form-error">{logDownloadError}</p>
            )}
          </section>

          <section className="app-form-card app-flow--sm">
            <h2>Troubleshooting</h2>
            <p className="home-card-desc">
              If you're having problems, you can uninstall and reinstall
              PenumbraOS from the Install page. You can also disconnect this
              browser from the Pin and reconnect later.
            </p>
            <div className="app-inline-actions">
              <a
                className="app-button app-button--ghost"
                href="/install/"
                target="_blank"
                rel="noopener"
              >
                Open Installer
              </a>
              <button
                onClick={handleDisconnect}
                className="app-button app-button--danger"
              >
                Disconnect
              </button>
            </div>
          </section>
        </div>
      </section>

      <UnsavedChangesPrompt when={formDirty && !allowDisconnectNavigation} />
    </>
  );
}

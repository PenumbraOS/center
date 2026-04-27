import { DEVICE_LOGCAT_FILENAME } from "./constants";
import type { LogcatLine } from "./transport";
import type { InstallLogEntry } from "./types";

function downloadFile(filename: string, content: BlobPart, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatInstallerLogLine(
  entry: Pick<InstallLogEntry, "timestamp" | "level" | "message">,
) {
  return `[${entry.timestamp}] [${entry.level}] ${entry.message}`;
}

export function createInstallerLogEntry(
  level: InstallLogEntry["level"],
  message: string,
): InstallLogEntry {
  const now = new Date();

  return {
    id: `${now.getTime()}-${Math.random().toString(36).slice(2)}`,
    timestamp: now.toLocaleTimeString(),
    level,
    message,
  };
}

export function formatInstallerLogText(
  installerLogEntries: ReadonlyArray<
    Pick<InstallLogEntry, "timestamp" | "level" | "message">
  >,
) {
  return installerLogEntries.map(formatInstallerLogLine).join("\n");
}

export function appendDeviceLogcatLine(
  deviceLogcatLines: string[],
  line: LogcatLine,
) {
  deviceLogcatLines.push(line.text);
  return line.text;
}

export function createInstallerMarkerLines(eventName: string, at = new Date()) {
  return [
    "----",
    `---- INSTALLER EVENT @ ${at.toISOString()} : ${eventName} ----`,
    "----",
  ];
}

export function appendInstallerMarker(
  deviceLogcatLines: string[],
  eventName: string,
  at = new Date(),
) {
  const markerLines = createInstallerMarkerLines(eventName, at);
  deviceLogcatLines.push(...markerLines);
  return markerLines;
}

export function formatDeviceLogcatText(deviceLogcatLines: ReadonlyArray<string>) {
  return deviceLogcatLines.join("\n");
}

export function saveAnnotatedDeviceLogcatTextFile(
  deviceLogcatLines: ReadonlyArray<string>,
) {
  downloadFile(
    DEVICE_LOGCAT_FILENAME,
    formatDeviceLogcatText(deviceLogcatLines),
    "text/plain;charset=utf-8",
  );
}

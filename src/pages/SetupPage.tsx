import { Link } from "react-router-dom";

export default function SetupPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-4xl space-y-10">
        <div className="max-w-2xl">
          <h1 className="mb-3 text-4xl font-semibold tracking-tight">
            Set up Pin Center
          </h1>
          <p className="text-base leading-7 text-neutral-400">
            Connect this portal to an existing deployment, or install the
            required components to a USB-connected Pin directly from your
            browser.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="mb-6 space-y-3">
              <h2 className="text-2xl font-semibold text-neutral-100">
                Connect to existing server
              </h2>
              <p className="text-sm leading-6 text-neutral-400">
                Use this if your remote or LAN-hosted server is already running
                and your device has already been set up.
              </p>
            </div>

            <ul className="mb-8 space-y-2 text-sm text-neutral-300">
              <li>• Enter a remote HTTPS URL or LAN host and port</li>
              <li>• Reuse the current gallery, device, and settings views</li>
              <li>• No USB device access required</li>
            </ul>

            <Link
              to="/connect"
              className="inline-flex rounded-lg bg-neutral-100 px-4 py-3 font-medium text-neutral-900 transition-colors hover:bg-white"
            >
              Connect to server
            </Link>
          </section>

          <section className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
            <div className="mb-6 space-y-3">
              <h2 className="text-2xl font-semibold text-neutral-100">
                Install to device over USB
              </h2>
              <p className="text-sm leading-6 text-neutral-400">
                Use the browser installer to bootstrap the shared installer and
                install the hook APKs onto a connected device.
              </p>
            </div>

            <ul className="mb-8 space-y-2 text-sm text-neutral-300">
              <li>• Requires USB debugging on the device</li>
              <li>• Chromium browser with WebUSB support required</li>
              <li>• Device will temporarily disconnect during install steps</li>
            </ul>

            <Link
              to="/install"
              className="inline-flex rounded-lg border border-neutral-700 px-4 py-3 font-medium text-neutral-100 transition-colors hover:border-neutral-500 hover:bg-neutral-800"
            >
              Open installer
            </Link>
          </section>
        </div>

        <section className="max-w-3xl rounded-2xl border border-neutral-800 bg-neutral-950/70 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-neutral-300">
            Installer requirements
          </h2>
          <div className="space-y-2 text-sm leading-6 text-neutral-400">
            <p>
              The installer is intended for Chromium-family browsers in a secure
              context and uses WebUSB to talk to the device over ADB.
            </p>
            <p>
              A later pass will make the chosen remote server become real
              device-side backend configuration. In this pass it is used for the
              final portal connection handoff and stored as the intended backend
              target.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

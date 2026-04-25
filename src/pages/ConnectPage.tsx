import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePin, loadSavedUrl } from "../hooks";
import { logError, logInfo } from "../logging";

export default function ConnectPage() {
  const { connect, status } = usePin();
  const navigate = useNavigate();
  const [address, setAddress] = useState(() => loadSavedUrl() ?? "");
  const [error, setError] = useState<string | null>(null);

  const isConnecting = status === "connecting";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    let url = address.trim();
    if (!url) return;

    if (!/^https?:\/\//i.test(url)) {
      url = `http://${url}`;
    }

    logInfo("connect-page", "Manual connect requested", {
      url,
      path: window.location.pathname,
    });

    try {
      await connect(url);
      logInfo("connect-page", "Manual connect succeeded", {
        url,
      });
      navigate("/gallery");
    } catch (err) {
      logError("connect-page", "Manual connect failed", err, {
        url,
      });
      setError("Could not connect. Check the address and make sure the server is running.");
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-6 inline-flex text-sm text-neutral-500 transition-colors hover:text-neutral-300"
        >
          ← Back to setup options
        </Link>

        <h1 className="mb-2 text-3xl font-semibold tracking-tight">
          Connect to existing server
        </h1>
        <p className="mb-8 text-neutral-400">
          Enter your remote Pin server address to connect the portal.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="https://pin.example.com or 192.168.1.125:9090"
              disabled={isConnecting}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-500 disabled:opacity-50"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={isConnecting || !address.trim()}
            className="w-full rounded-lg bg-neutral-100 px-4 py-3 font-medium text-neutral-900 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isConnecting ? "Connecting..." : "Connect"}
          </button>
        </form>

        <p className="mt-6 text-xs leading-relaxed text-neutral-500">
          Your browser may ask for permission to access your local network if you
          connect to a LAN-hosted server. This is required for the portal to
          communicate with your Pin server.
        </p>
      </div>
    </div>
  );
}

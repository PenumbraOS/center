import { HashRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Layout from "./components/Layout";
import { PinProvider, usePin } from "./hooks";
import {
  clearFailedHandoffUrl,
  clearHandoffUrl,
  loadHandoffUrl,
  saveFailedHandoffUrl,
} from "./handoff";
import { logError, logInfo } from "./logging";
import ConnectPage from "./pages/ConnectPage";
import DevicePage from "./pages/DevicePage";
import GalleryPage from "./pages/GalleryPage";
import MemoryDetailPage from "./pages/MemoryDetailPage";
import SettingsPage from "./pages/SettingsPage";
import SetupPage from "./pages/SetupPage";

function CenterRootRedirect() {
  const { status } = usePin();

  if (status === "connected") {
    return <Navigate to="/gallery" replace />;
  }

  return <SetupPage />;
}

function CenterHandoffBootstrap() {
  const { status, connect } = usePin();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (status === "connected") {
      clearFailedHandoffUrl();
      return;
    }

    const handoffUrl = loadHandoffUrl();
    if (!handoffUrl) {
      return;
    }

    clearHandoffUrl();
    clearFailedHandoffUrl();

    logInfo("handoff", "Attempting center handoff connection", {
      handoffUrl,
      path: location.pathname,
      hash: location.hash,
    });

    connect(handoffUrl)
      .then(() => {
        clearFailedHandoffUrl();
        logInfo("handoff", "Center handoff connection succeeded", {
          handoffUrl,
        });
        navigate("/gallery", { replace: true });
      })
      .catch((error) => {
        saveFailedHandoffUrl(handoffUrl);
        logError("handoff", "Center handoff connection failed", error, {
          handoffUrl,
        });
        navigate("/connect", { replace: true });
      });
  }, [connect, location.hash, location.pathname, navigate, status]);

  return null;
}

function CenterAppRoutes() {
  return (
    <>
      <CenterHandoffBootstrap />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<CenterRootRedirect />} />
          <Route path="/connect" element={<ConnectPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/gallery/:uuid" element={<MemoryDetailPage />} />
          <Route path="/device" element={<DevicePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </>
  );
}

export default function CenterApp() {
  return (
    <HashRouter>
      <PinProvider>
        <CenterAppRoutes />
      </PinProvider>
    </HashRouter>
  );
}

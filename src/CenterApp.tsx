import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { PinProvider, usePin } from "./hooks";
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

function CenterAppRoutes() {
  return (
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

import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PinProvider, usePin } from "./hooks";
import Layout from "./components/Layout";
import SetupPage from "./pages/SetupPage";
import ConnectPage from "./pages/ConnectPage";
import InstallPage from "./pages/InstallPage";
import GalleryPage from "./pages/GalleryPage";
import MemoryDetailPage from "./pages/MemoryDetailPage";
import DevicePage from "./pages/DevicePage";
import SettingsPage from "./pages/SettingsPage";

function RootRedirect() {
  const { status } = usePin();
  if (status === "connected") {
    return <Navigate to="/gallery" replace />;
  }
  return <SetupPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <PinProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<RootRedirect />} />
            <Route path="/connect" element={<ConnectPage />} />
            <Route path="/install" element={<InstallPage />} />
            <Route path="/gallery" element={<GalleryPage />} />
            <Route path="/gallery/:uuid" element={<MemoryDetailPage />} />
            <Route path="/device" element={<DevicePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </PinProvider>
    </BrowserRouter>
  );
}

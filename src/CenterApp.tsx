import {
  Navigate,
  RouterProvider,
  createHashRouter,
} from "react-router-dom";
import Layout from "./components/Layout";
import { PinProvider, usePin } from "./hooks";
import ConnectPage from "./pages/ConnectPage";
import GalleryPage from "./pages/GalleryPage";
import MemoryDetailPage from "./pages/MemoryDetailPage";
import EsimSettingsPage from "./pages/EsimSettingsPage";
import SettingsPage from "./pages/SettingsPage";
import SetupPage from "./pages/SetupPage";

function CenterRootRedirect() {
  const { status } = usePin();

  if (status === "connected") {
    return <Navigate to="/gallery" replace />;
  }

  return <SetupPage />;
}

function ProvidersLayout() {
  return (
    <PinProvider>
      <Layout />
    </PinProvider>
  );
}

const router = createHashRouter([
  {
    element: <ProvidersLayout />,
    children: [
      { path: "/", element: <CenterRootRedirect /> },
      { path: "/connect", element: <ConnectPage /> },
      { path: "/gallery", element: <GalleryPage /> },
      { path: "/gallery/:uuid", element: <MemoryDetailPage /> },
      { path: "/settings", element: <SettingsPage /> },
      { path: "/settings/esim", element: <EsimSettingsPage /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function CenterApp() {
  return <RouterProvider router={router} />;
}

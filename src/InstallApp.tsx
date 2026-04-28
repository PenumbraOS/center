import { useEffect, useState } from "react";
import RecoveryPage from "./pages/RecoveryPage";
import InstallPage from "./pages/InstallPage";

function getInstallView(search: string): "install" | "recovery" {
  const params = new URLSearchParams(search);
  return params.get("view") === "recovery" ? "recovery" : "install";
}

export default function InstallApp() {
  const [view, setView] = useState(() => getInstallView(window.location.search));

  useEffect(() => {
    const handlePopState = () => {
      setView(getInstallView(window.location.search));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  if (view === "recovery") {
    return <RecoveryPage />;
  }

  return <InstallPage />;
}

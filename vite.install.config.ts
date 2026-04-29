import { createSharedViteConfig } from "./vite.shared.config";

export default createSharedViteConfig("/install/", "dist-install", "install.html", {
  isolateYumeChanPackages: true,
  minify: false,
});

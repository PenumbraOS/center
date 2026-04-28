import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export function createSharedViteConfig(
  base: string,
  outDir: string,
  htmlEntry: string,
) {
  return defineConfig({
    base,
    plugins: [react(), tailwindcss()],
    build: {
      outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: htmlEntry,
      },
    },
    optimizeDeps: {
      exclude: [
        "@yume-chan/adb",
        "@yume-chan/adb-daemon-webusb",
        "@yume-chan/stream-extra",
        "@yume-chan/struct",
      ],
    },
  });
}

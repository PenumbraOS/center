import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const YUME_CHAN_PACKAGES = [
  "@yume-chan/adb",
  "@yume-chan/adb-daemon-webusb",
  "@yume-chan/stream-extra",
  "@yume-chan/struct",
] as const;

export function createSharedViteConfig(
  base: string,
  outDir: string,
  htmlEntry: string,
  options?: {
    isolateYumeChanPackages?: boolean;
    minify?: boolean;
  },
) {
  return defineConfig({
    base,
    plugins: [react(), tailwindcss()],
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: true,
      minify: options?.minify,
      rollupOptions: {
        input: htmlEntry,
        output: options?.isolateYumeChanPackages
          ? {
              manualChunks(id) {
                if (YUME_CHAN_PACKAGES.some((pkg) => id.includes(`/node_modules/${pkg}/`))) {
                  return "yume-chan";
                }
              },
            }
          : undefined,
      },
    },
    optimizeDeps: {
      exclude: [...YUME_CHAN_PACKAGES],
    },
  });
}

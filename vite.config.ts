import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: [
      '@yume-chan/adb',
      '@yume-chan/adb-daemon-webusb',
      '@yume-chan/stream-extra',
      '@yume-chan/struct',
    ],
  },
})

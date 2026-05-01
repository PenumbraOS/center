/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOCAL_APK_MODE?: string;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};

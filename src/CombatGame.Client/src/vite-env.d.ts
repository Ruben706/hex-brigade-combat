/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_PATH?: string;
  readonly VITE_HUB_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GIT_SHA?: string;
  readonly VITE_GIT_SHORT?: string;
  readonly VITE_BUILD_TIME?: string;
  readonly VITE_GITHUB_RUN_ID?: string;
  readonly VITE_COINDCX_PROXY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

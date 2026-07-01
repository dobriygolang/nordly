/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string
  readonly VITE_NORDLY_DOWNLOAD_MAC?: string
  readonly VITE_NORDLY_DOWNLOAD_WIN?: string
  readonly VITE_NORDLY_HERO_VIDEO?: string
  readonly VITE_NORDLY_HERO_POSTER?: string
  readonly VITE_SITE_ORIGIN?: string
  readonly VITE_WS_BASE?: string
  readonly VITE_NOTES_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

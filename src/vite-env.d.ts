/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Optional app version string surfaced in logs. */
  readonly VITE_APP_VERSION?: string
  /** Optional Cloudflare Web Analytics beacon token (public). */
  readonly VITE_CF_BEACON_TOKEN?: string
  /** Git short hash injected at build time. */
  readonly VITE_BUILD_HASH?: string
  /** whp-api worker URL (public); unset → leaderboard + accounts hidden. */
  readonly VITE_API_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

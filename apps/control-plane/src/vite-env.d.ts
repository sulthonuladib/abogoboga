/// <reference types="vite/client" />

// Collector base URL for this app's browser traces. The exporter appends
// `/v1/traces` to it. Absent means the browser exports nothing, which is how the
// app runs with no local collector. Set it in the shell or an app-local `.env`
// as `VITE_OTEL_EXPORTER_OTLP_ENDPOINT`.
interface ImportMetaEnv {
  readonly VITE_OTEL_EXPORTER_OTLP_ENDPOINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

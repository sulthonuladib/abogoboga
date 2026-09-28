import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * Vite configuration for the control-plane single-page application.
 *
 * The dev server proxies `/api` to the control-plane process so development and
 * production resolve identical API paths; the production build emits
 * `dist/`, which the process serves at the site root.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.CONTROL_PLANE_ORIGIN ?? "http://localhost:3001",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true
  },
  preview: {
    port: 4173,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.CONTROL_PLANE_ORIGIN ?? "http://localhost:3001",
        changeOrigin: true
      }
    }
  }
})

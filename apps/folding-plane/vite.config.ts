import { randomUUID } from 'node:crypto'
import { defineConfig } from 'vite'

import { foldkit } from '@foldkit/vite-plugin'
import tailwindcss from '@tailwindcss/vite'

// NOTE: one id has to name this build, and a build that has none refuses to
// render a hydratable page. A deployment sets FOLDKIT_BUILD_ID to a value it
// already has, such as a commit or a release tag; a local build takes a fresh
// one rather than a constant, which would make a stale page look current.
// NOTE: the fallback is stored back into the environment because Vite reads
// this file once per environment it builds, and a fresh id per read would give
// the browser bundle and the server bundle different ids, which is the exact
// disagreement the id exists to catch: every page of a deployment refused at
// hydration. Storing it means every later read of this file, in this process,
// resolves the same id.
// NOTE: `||=` rather than `??=` because the plugin treats an empty
// FOLDKIT_BUILD_ID as absent, so an empty value has to take the fallback here
// too; `??=` would keep it and the build would compile no id at all.
process.env['FOLDKIT_BUILD_ID'] ||= randomUUID()
const buildId = process.env['FOLDKIT_BUILD_ID']

// NOTE: the browser reads the control-plane API from this app's own origin, so
// the dev server forwards /api to the API process. The production host does the
// same in scripts/serve.ts, which keeps one origin in both environments.
const apiOrigin = process.env['API_ORIGIN'] ?? 'http://localhost:3001'

const proxy = {
  '/api': {
    target: apiOrigin,
    changeOrigin: true,
  },
}

export default defineConfig({
  plugins: [
    tailwindcss(),
    foldkit({
      buildId,
      devToolsMcpPort: 9988,
      ssr: {
        serverEntry: '/src/entry.server.ts',
        build: true,
      },
    }),
  ],
  optimizeDeps: {
    entries: ['src/entry.ts'],
  },
  server: {
    host: true,
    proxy,
  },
  preview: {
    proxy,
  },
})

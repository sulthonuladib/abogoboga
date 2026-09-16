# AGENTS.md

----

Stack: Bun + oRPC `@orpc/*@2.0.0-beta` (v2 API: `.meta(openapi(...))`, `CORSHandlerPlugin`, `converters`, `call`) + Zod v4 + Drizzle. Entry: `src/index.ts` (RPCHandler + OpenAPIHandler + OpenAPIGenerator), routers in `src/router.ts` + `src/core/*/*.router`. `src/crawl-workers/` is excluded from typecheck.

oRPC docs index: `https://orpc.dev/llms.txt` — fetch the relevant sub-page live via webfetch before writing/changing oRPC code, don't rely on training data.
Canonical pages: `https://orpc.dev/docs/procedure`, `https://orpc.dev/docs/router`, `https://orpc.dev/docs/openapi/routing`, `https://orpc.dev/docs/openapi/handler`, `https://orpc.dev/docs/integrations/zod`.

Runtime: never start the server or any infra yourself (`bun run`, `bun dev`, `docker compose`, DB, Redis, etc.). If you need the running app for testing, ask the user to start/provide it.

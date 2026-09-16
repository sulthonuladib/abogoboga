import { RPCHandler } from "@orpc/server/fetch";
import { COMMON_ERROR_STATUS_MAP } from "@orpc/server";
import { CORSHandlerPlugin } from "@orpc/server/plugins";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { router } from "./router";
import { corsHeaders, corsOrigins } from "./config";

// Preserves the v1 `statusCode` semantics of `.errors({...})` definitions.
const errorStatusMap = {
  ...COMMON_ERROR_STATUS_MAP,
  CRYPTOCURRENCY_EXISTS: 409,
  SLUG_EXISTS: 409,
  SOMETHING_WRONG: 500,
};

const handler = new RPCHandler(router, {
  errorStatusMap,
  plugins: [new CORSHandlerPlugin({ origin: corsOrigins() ?? undefined })],
});

const openAPIHandler = new OpenAPIHandler(router, {
  errorStatusMap,
  plugins: [new CORSHandlerPlugin({ origin: corsOrigins() ?? undefined })],
});

const openAPIDocument = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
}).generate(router, {
  errorStatusMap,
  base: {
    info: {
      title: "Cryptocurrency metadata API",
      version: "1.0.0",
    },
  },
});

const scalarDocumentPage = `<!doctype html>
<html>
  <head>
    <title>Cryptocurrency metadata API</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', { url: '/openapi.json' })
    </script>
  </body>
</html>`;

Bun.serve({
  async fetch(request: Request) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/docs" || pathname === "/docs/") {
      return new Response(scalarDocumentPage, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          ...corsHeaders(request),
        },
      });
    }

    if (pathname === "/openapi.json") {
      return new Response(JSON.stringify(await openAPIDocument), {
        headers: {
          "content-type": "application/json",
          ...corsHeaders(request),
        },
      });
    }

    const { response: openAPIResponse } = await openAPIHandler.handle(request, {
      context: {}, // Provide initial context if needed
    });
    if (openAPIResponse) {
      return openAPIResponse;
    }

    const { response } = await handler.handle(request, {
      context: {}, // Provide initial context if needed
    });
    if (response) {
      return response;
    }

    return new Response("NOT FOUND", {
      status: 404,
    });
  },
  port: 3001,
});

console.info(`listening on port 3001`);

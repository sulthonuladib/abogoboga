import { RPCHandler } from "@orpc/server/fetch";
import { CORSPlugin } from "@orpc/server/plugins";
import { OpenAPIGenerator } from "@orpc/openapi";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { router } from "./router";
import { zodToJsonSchemaConverter } from "./openapi/zod.converter";
import { corsHeaders, corsOrigins } from "./config";

const handler = new RPCHandler(router, {
  plugins: [new CORSPlugin({ origin: corsOrigins() })],
});

const openAPIHandler = new OpenAPIHandler(router, {
  plugins: [new CORSPlugin({ origin: corsOrigins() })],
});

const openAPIDocument = new OpenAPIGenerator({
  schemaConverters: [zodToJsonSchemaConverter],
}).generate(router, {
  info: {
    title: "Cryptocurrency metadata API",
    version: "1.0.0",
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

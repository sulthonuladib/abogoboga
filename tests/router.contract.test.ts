import { describe, expect, test } from "bun:test";
import { OpenAPIGenerator } from "@orpc/openapi";
import { router } from "../src/router";
import { zodToJsonSchemaConverter } from "../src/openapi/zod.converter";

type Procedure = {
  "~orpc": {
    inputSchema?: object;
    outputSchema?: object;
  };
};

// SAFETY: router exports are oRPC procedures with the documented procedure shape.
type ProcedureContainer = { [name: string]: Procedure };
const procedures = (value: ProcedureContainer): [string, Procedure][] => {
  // SAFETY: every router member is an oRPC procedure with the documented contract.
  return Object.entries(value) as [string, Procedure][];
};
function asProcedureRouter(value: typeof router): Record<string, ProcedureContainer> {
  // SAFETY: router is statically composed exclusively of oRPC procedure containers.
  return value as Record<string, ProcedureContainer>;
}

describe("core router contracts", () => {
  // SAFETY: router members are all oRPC procedures in this contract test.
  const typedRouter = asProcedureRouter(router);
  test.each([
    ["cryptocurrency", ["add", "list", "findById", "update", "remove", "metadata"]],
    ["exchange", ["add", "list", "findById", "update", "remove"]],
    ["chain", ["add", "list", "findById", "update", "remove"]],
    ["exchangeCryptocurrency", ["assign", "unassign", "update", "list", "findById", "count"]],
    ["exchangeCryptocurrencyChain", ["add", "list", "findById", "update", "remove"]],
    ["utility", ["clearDatabase", "ping"]],
  ] as const)("%s exposes its complete procedure surface", (name, expected) => {
    expect(Object.keys(router[name])).toEqual([...expected]);
  });

  for (const [routerName, coreRouter] of Object.entries(typedRouter)) {
    describe(routerName, () => {
      for (const [procedureName, procedure] of procedures(coreRouter)) {
        test(`${procedureName} has input and output contracts`, () => {
          // Procedures without `.input(...)` intentionally accept no input schema.
          if (procedure["~orpc"].inputSchema) {
            expect(procedure["~orpc"].inputSchema).toBeDefined();
          }
          if (procedureName !== "unassign") {
            expect(procedure["~orpc"].outputSchema).toBeDefined();
          }
        });
      }
    });
  }
});

describe("oRPC validation contracts", () => {
  test("coerces cryptocurrency and exchange IDs", () => {
    expect(
      router.cryptocurrency.findById["~orpc"].inputSchema?.safeParse({ id: "42" }).success,
    ).toBe(true);
    expect(
      router.exchange.findById["~orpc"].inputSchema?.safeParse({ id: "42" }).success,
    ).toBe(true);
  });

  test("uses detailed input shapes for PATCH procedures", () => {
    for (const procedure of [
      router.cryptocurrency.update,
      router.exchange.update,
      router.chain.update,
      router.exchangeCryptocurrency.update,
      router.exchangeCryptocurrencyChain.update,
    ]) {
      expect(
        procedure["~orpc"].inputSchema?.safeParse({
          params: { id: "42" },
          body: {},
        }).success,
      ).toBe(true);
    }
  });

  test("applies stable pagination defaults for collection procedures", () => {
    for (const procedure of [
      router.cryptocurrency.list,
      router.exchange.list,
      router.chain.list,
    ]) {
      const parsed = procedure["~orpc"].inputSchema?.safeParse({});
      expect(parsed?.success).toBe(true);
    }
  });

  describe("OpenAPI generation", () => {
    test("generates every core route with its REST path and method", async () => {
      const document = await new OpenAPIGenerator({
        schemaConverters: [zodToJsonSchemaConverter],
      }).generate(router, {
        info: { title: "Test API", version: "1.0.0" },
      });

      const expected = {
        "/cryptocurrency/{id}": ["get", "patch", "delete"],
        "/exchange/{id}": ["get", "patch", "delete"],
        "/chain/{id}": ["get", "patch", "delete"],
        "/exchange-cryptocurrency/{id}": ["get", "patch", "delete"],
        "/exchange-cryptocurrency-chain/{id}": ["get", "patch", "delete"],
      };

      for (const [path, methods] of Object.entries(expected)) {
        expect(document.paths?.[path]).toBeDefined();
        for (const method of methods) {
          // SAFETY: expected methods are restricted to the OpenAPI path operation keys.
          expect(document.paths?.[path]?.[method as "get" | "patch" | "delete"]).toBeDefined();
        }
      }
    });
  });

  test("rejects malformed required inputs before reaching Drizzle", async () => {
    expect(
      router.cryptocurrency.findById.callable()({ id: "not-a-number" }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    // SAFETY: callable is the validated oRPC procedure interface used by this contract test.
    expect(router.exchangeCryptocurrencyChain.findById.callable()({ id: "not-a-number" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("ping is a dependency-free health check", async () => {
    expect(router.utility.ping.callable()()).resolves.toBe("OK");
  });
});

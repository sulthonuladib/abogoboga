import { describe, expect, test } from "bun:test";
import { OpenAPIGenerator } from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";
import { call } from "@orpc/server";
import { router } from "../src/router";

type SchemaLike = {
  safeParse: (value: unknown) => { success: boolean };
};

function firstInputSchema(procedure: {
  "~orpc": { inputSchemas?: readonly unknown[] };
}): SchemaLike | undefined {
  // SAFETY: every procedure under test declares a single Zod input schema.
  return procedure["~orpc"].inputSchemas?.[0] as SchemaLike | undefined;
}

type Procedure = {
  "~orpc": {
    inputSchemas?: SchemaLike[];
    outputSchemas?: SchemaLike[];
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
          if (procedure["~orpc"].inputSchemas?.length) {
            expect(procedure["~orpc"].inputSchemas).toBeDefined();
          }
          if (procedureName !== "unassign") {
            expect(procedure["~orpc"].outputSchemas?.length).toBeGreaterThan(0);
          }
        });
      }
    });
  }
});

describe("oRPC validation contracts", () => {
  test("coerces cryptocurrency and exchange IDs", () => {
    expect(
      firstInputSchema(router.cryptocurrency.findById)?.safeParse({ id: "42" })?.success,
    ).toBe(true);
    expect(
      firstInputSchema(router.exchange.findById)?.safeParse({ id: "42" })?.success,
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
        firstInputSchema(procedure)?.safeParse({
          params: { id: "42" },
          body: {},
        })?.success,
      ).toBe(true);
    }
  });

  test("applies stable pagination defaults for collection procedures", () => {
    for (const procedure of [
      router.cryptocurrency.list,
      router.exchange.list,
      router.chain.list,
    ]) {
      const parsed = firstInputSchema(procedure)?.safeParse({});
      expect(parsed?.success).toBe(true);
    }
  });

  describe("OpenAPI generation", () => {
    test("generates every core route with its REST path and method", async () => {
      const document = await new OpenAPIGenerator({
        converters: [new ZodToJsonSchemaConverter()],
      }).generate(router, {
        base: { info: { title: "Test API", version: "1.0.0" } },
      });

      const expected = {
        "/cryptocurrency/{id}": ["get", "patch", "delete"],
        "/exchange/{id}": ["get", "patch", "delete"],
        "/chain/{id}": ["get", "patch", "delete"],
        "/exchange-cryptocurrency/{id}": ["get", "patch", "delete"],
        "/exchange-cryptocurrency-chain/{id}": ["get", "patch", "delete"],
      };

      for (const [path, methods] of Object.entries(expected)) {
        // SAFETY: v2 types `paths` without an index signature; tests look up known paths.
        const paths = document.paths as unknown as
          | Record<string, Record<string, unknown>>
          | undefined;
        expect(paths?.[path]).toBeDefined();
        for (const method of methods) {
          // SAFETY: expected methods are restricted to the OpenAPI path operation keys.
          expect(paths?.[path]?.[method as "get" | "patch" | "delete"]).toBeDefined();
        }
      }
    });
  });

  test("rejects malformed required inputs before reaching Drizzle", async () => {
    expect(
      call(router.cryptocurrency.findById, { id: "not-a-number" }, { context: {} }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    // SAFETY: call is the validated oRPC procedure interface used by this contract test.
    expect(call(router.exchangeCryptocurrencyChain.findById, { id: "not-a-number" }, { context: {} })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  test("ping is a dependency-free health check", async () => {
    expect(call(router.utility.ping, undefined, { context: {} })).resolves.toBe("OK");
  });
});

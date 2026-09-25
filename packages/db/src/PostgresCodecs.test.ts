import { describe, expect, test } from "bun:test"
import { normalizePgEnum, postgresCodecs } from "./PostgresCodecs.ts"

const encode = (value: string): Uint8Array => new TextEncoder().encode(value)

describe("normalizePgEnum", () => {
  test("decodes raw enum bytes to text", () => {
    expect(normalizePgEnum(encode("usdt"))).toBe("usdt")
    expect(normalizePgEnum(encode("idr"))).toBe("idr")
  })

  test("passes an already-decoded string through unchanged", () => {
    expect(normalizePgEnum("usdt")).toBe("usdt")
  })

  test("wires into the enum codec used by every read path", () => {
    expect(postgresCodecs.enum?.normalize?.(encode("idr"))).toBe("idr")
    expect(postgresCodecs.enum?.normalize?.("usdt")).toBe("usdt")
  })
})

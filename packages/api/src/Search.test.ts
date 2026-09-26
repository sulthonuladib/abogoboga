import { describe, expect, test } from "bun:test"
import { literalLikePattern } from "./Search.ts"

describe("literalLikePattern", () => {
  test("lower-cases and wraps plain text", () => {
    expect(literalLikePattern("Ethereum")).toBe("%ethereum%")
  })

  test("leaves an empty search as a match-everything pattern", () => {
    expect(literalLikePattern("")).toBe("%%")
  })

  test("escapes the percent wildcard", () => {
    expect(literalLikePattern("100%")).toBe("%100\\%%")
  })

  test("escapes the underscore wildcard", () => {
    expect(literalLikePattern("A_B")).toBe("%a\\_b%")
  })

  test("escapes the escape character itself", () => {
    expect(literalLikePattern("C:\\path")).toBe("%c:\\\\path%")
  })

  test("escapes a mix of wildcards", () => {
    expect(literalLikePattern("%_%")).toBe("%\\%\\_\\%%")
  })
})

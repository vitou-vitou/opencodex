import { describe, expect, test } from "bun:test";
import { parseRouteUseArgs } from "../src/cli/claude-route";

describe("parseRouteUseArgs", () => {
  test("soft pin", () => {
    expect(parseRouteUseArgs(["kiro"])).toEqual({ action: "pin", provider: "kiro", hard: false });
  });
  test("hard pin", () => {
    expect(parseRouteUseArgs(["kiro", "--hard"])).toEqual({ action: "pin", provider: "kiro", hard: true });
  });
  test("auto clears the pin", () => {
    expect(parseRouteUseArgs(["auto"])).toEqual({ action: "auto" });
  });
  test("missing provider is an error", () => {
    expect(parseRouteUseArgs([])).toHaveProperty("error");
  });
});

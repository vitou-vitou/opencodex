import { expect, test } from "bun:test";
import { matchesLogStatusFilter } from "../src/log-status-filter";

test("matchesLogStatusFilter: all accepts any finite status", () => {
  expect(matchesLogStatusFilter(200, "all")).toBe(true);
  expect(matchesLogStatusFilter(429, "all")).toBe(true);
  expect(matchesLogStatusFilter(502, "all")).toBe(true);
});

test("matchesLogStatusFilter: 2xx / 4xx / 5xx class boundaries", () => {
  expect(matchesLogStatusFilter(199, "2xx")).toBe(false);
  expect(matchesLogStatusFilter(200, "2xx")).toBe(true);
  expect(matchesLogStatusFilter(299, "2xx")).toBe(true);
  expect(matchesLogStatusFilter(300, "2xx")).toBe(false);

  expect(matchesLogStatusFilter(399, "4xx")).toBe(false);
  expect(matchesLogStatusFilter(400, "4xx")).toBe(true);
  expect(matchesLogStatusFilter(429, "4xx")).toBe(true);
  expect(matchesLogStatusFilter(499, "4xx")).toBe(true);
  expect(matchesLogStatusFilter(500, "4xx")).toBe(false);

  expect(matchesLogStatusFilter(499, "5xx")).toBe(false);
  expect(matchesLogStatusFilter(500, "5xx")).toBe(true);
  expect(matchesLogStatusFilter(599, "5xx")).toBe(true);
  expect(matchesLogStatusFilter(600, "5xx")).toBe(false);
});

test("matchesLogStatusFilter: non-finite status fails class filters", () => {
  expect(matchesLogStatusFilter(Number.NaN, "2xx")).toBe(false);
  expect(matchesLogStatusFilter(Number.POSITIVE_INFINITY, "4xx")).toBe(false);
  expect(matchesLogStatusFilter(Number.NaN, "all")).toBe(true);
});

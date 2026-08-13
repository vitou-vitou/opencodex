/**
 * Client-side HTTP status class filter for Logs.
 * Aligns with src/server/request-log.filterRequestLogs `status=Nxx` class matching
 * (parent entry status only).
 */

export type LogStatusFilter = "all" | "2xx" | "4xx" | "5xx";

export function matchesLogStatusFilter(status: number, filter: LogStatusFilter): boolean {
  if (filter === "all") return true;
  if (!Number.isFinite(status)) return false;
  const classDigit = Math.floor(status / 100);
  if (filter === "2xx") return classDigit === 2;
  if (filter === "4xx") return classDigit === 4;
  return classDigit === 5;
}

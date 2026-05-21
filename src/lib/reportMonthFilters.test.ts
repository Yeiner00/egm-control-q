import { describe, expect, it } from "vitest";
import { buildReportMonthRanges, getReportMonthBounds, isDateInReportMonthRanges } from "./reportMonthFilters";

describe("report month filters", () => {
  it("builds sorted unique half-open date ranges", () => {
    expect(buildReportMonthRanges(2026, ["3", "1", "3", "bad", "13"])).toEqual([
      { month: 1, startDate: "2026-01-01", endDateExclusive: "2026-02-01" },
      { month: 3, startDate: "2026-03-01", endDateExclusive: "2026-04-01" },
    ]);
  });

  it("handles december as a cross-year upper bound", () => {
    expect(buildReportMonthRanges(2026, ["12"])).toEqual([
      { month: 12, startDate: "2026-12-01", endDateExclusive: "2027-01-01" },
    ]);
  });

  it("returns the broad query bounds for selected ranges", () => {
    expect(getReportMonthBounds(buildReportMonthRanges(2026, ["2", "5"]))).toEqual({
      startDate: "2026-02-01",
      endDateExclusive: "2026-06-01",
    });
  });

  it("checks exact membership inside non-contiguous selected months", () => {
    const ranges = buildReportMonthRanges(2026, ["2", "5"]);

    expect(isDateInReportMonthRanges("2026-02-28", ranges)).toBe(true);
    expect(isDateInReportMonthRanges("2026-03-01", ranges)).toBe(false);
    expect(isDateInReportMonthRanges("2026-05-31", ranges)).toBe(true);
    expect(isDateInReportMonthRanges("2026-06-01", ranges)).toBe(false);
  });
});

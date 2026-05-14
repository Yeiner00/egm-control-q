import { describe, expect, it } from "vitest";
import {
  buildPeriodDays,
  buildSquadPeriodsOverlappingYear,
  buildSquadPeriodsForYear,
  dateKeyToExcelSerial,
  getSquadPeriodForDate,
  getSquadType,
  parseDateKey,
  toDateKey,
} from "./squadCalendar";

describe("squad calendar helpers", () => {
  it("keeps the known Alfa anchor and switches after 8 days", () => {
    expect(getSquadType(new Date(2026, 0, 27))).toBe("alfa");
    expect(getSquadType(new Date(2026, 1, 3))).toBe("alfa");
    expect(getSquadType(new Date(2026, 1, 4))).toBe("bravo");
  });

  it("builds official 8 day periods for a selected squad", () => {
    const alfaPeriods = buildSquadPeriodsForYear(2026, "alfa");
    const aprilPeriod = alfaPeriods.find((period) => period.startDate === "2026-04-01");

    expect(aprilPeriod).toEqual({
      squad: "alfa",
      startDate: "2026-04-01",
      endDate: "2026-04-08",
    });
  });

  it("finds selectable periods that overlap a year boundary", () => {
    const alfaPeriods = buildSquadPeriodsOverlappingYear(2026, "alfa");

    expect(alfaPeriods[0]).toEqual({
      squad: "alfa",
      startDate: "2025-12-26",
      endDate: "2026-01-02",
    });
  });

  it("finds the active official period for a date", () => {
    expect(getSquadPeriodForDate(new Date(2026, 4, 14))).toEqual({
      squad: "bravo",
      startDate: "2026-05-11",
      endDate: "2026-05-18",
    });
  });

  it("builds inclusive day keys for a statistic period", () => {
    expect(buildPeriodDays("2026-04-01")).toEqual([
      "2026-04-01",
      "2026-04-02",
      "2026-04-03",
      "2026-04-04",
      "2026-04-05",
      "2026-04-06",
      "2026-04-07",
      "2026-04-08",
    ]);
  });

  it("converts between local date keys and Excel serials", () => {
    expect(toDateKey(parseDateKey("2026-04-01"))).toBe("2026-04-01");
    expect(dateKeyToExcelSerial("2026-04-01")).toBe(46113);
    expect(dateKeyToExcelSerial("2026-04-08")).toBe(46120);
  });
});

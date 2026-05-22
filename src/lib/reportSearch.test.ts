import { describe, expect, it } from "vitest";
import { filterReportOptions, matchesReportSearch } from "./reportSearch";

const reports = [
  { id: "1", no_reporte: "0842", unidad: "SNG-25", fecha: "2026-02-13" },
  { id: "2", no_reporte: "0001", unidad: "SNG-08", fecha: "2026-03-03" },
  { id: "3", no_reporte: "0002", unidad: "SNG-08", fecha: "2026-03-04" },
  { id: "4", no_reporte: "0023", unidad: "SNG-08", fecha: "2026-03-21" },
  { id: "5", no_reporte: "0123", unidad: "SNG-08", fecha: "2026-03-22" },
];

describe("matchesReportSearch", () => {
  it("matches an exact padded report number", () => {
    expect(matchesReportSearch(reports[3], "0023")).toBe(true);
  });

  it("does not match numeric searches against the report date", () => {
    expect(matchesReportSearch(reports[1], "0023")).toBe(false);
    expect(matchesReportSearch(reports[2], "0023")).toBe(false);
  });

  it("allows short numeric searches to find padded report numbers", () => {
    expect(filterReportOptions(reports, "23").map((report) => report.no_reporte)).toEqual(["0023", "0123"]);
  });

  it("keeps text searches available for unit or date details", () => {
    expect(filterReportOptions(reports, "sng-25").map((report) => report.no_reporte)).toEqual(["0842"]);
  });
});

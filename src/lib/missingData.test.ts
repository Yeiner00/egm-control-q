import { describe, expect, it } from "vitest";
import { hasEmptyReportValue, isEmptyReportValue } from "./missingData";

describe("isEmptyReportValue", () => {
  it("treats nullish and blank strings as empty", () => {
    expect(isEmptyReportValue(null)).toBe(true);
    expect(isEmptyReportValue(undefined)).toBe(true);
    expect(isEmptyReportValue("   ")).toBe(true);
    expect(isEmptyReportValue("Reporte")).toBe(false);
  });

  it("keeps real numeric zero as present", () => {
    expect(isEmptyReportValue(0)).toBe(false);
    expect(isEmptyReportValue(12)).toBe(false);
    expect(isEmptyReportValue(Number.NaN)).toBe(true);
  });

  it("detects empty lists and blank object rows", () => {
    expect(isEmptyReportValue([])).toBe(true);
    expect(isEmptyReportValue(["", "  "])).toBe(true);
    expect(isEmptyReportValue(["Oficial"])).toBe(false);
    expect(isEmptyReportValue({ nombre_sitio: "", zona: "" })).toBe(true);
    expect(isEmptyReportValue({ nombre_sitio: "Playa Rajada", zona: "" })).toBe(false);
  });

  it("detects whether any value in a group is empty", () => {
    expect(hasEmptyReportValue(["ok", 0, { a: "x" }])).toBe(false);
    expect(hasEmptyReportValue(["ok", { a: "" }])).toBe(true);
  });
});

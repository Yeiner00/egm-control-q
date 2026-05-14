import { describe, expect, it } from "vitest";
import { normalizeReportNumber, normalizeReportUnit } from "./reportNumber";

describe("normalizeReportNumber", () => {
  it("normalizes report numbers to at least four digits", () => {
    expect(normalizeReportNumber("1")).toBe("0001");
    expect(normalizeReportNumber("02")).toBe("0002");
    expect(normalizeReportNumber("001")).toBe("0001");
    expect(normalizeReportNumber("2222")).toBe("2222");
  });

  it("removes a year suffix without using it as the report year", () => {
    expect(normalizeReportNumber("841-2026")).toBe("0841");
    expect(normalizeReportNumber("194-2025")).toBe("0194");
  });
});

describe("normalizeReportUnit", () => {
  it("normalizes unit casing and spacing", () => {
    expect(normalizeReportUnit(" sng-25 ")).toBe("SNG-25");
    expect(normalizeReportUnit("GC38-  22")).toBe("GC38- 22");
  });
});


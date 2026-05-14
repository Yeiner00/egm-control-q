import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  buildBoatExcelFileName,
  buildReportConsecutive,
  buildVehicleExcelFileName,
  excelHoursFraction,
  excelTimeFraction,
  formatBoatReportDate,
  formatVehicleReportDate,
  joinReportValues,
  patchXlsxTemplateBytes,
} from "./reportExcelExport";

describe("report Excel formatting helpers", () => {
  it("formats report dates in the template styles", () => {
    expect(formatVehicleReportDate("2026-01-01")).toBe("Jueves 01 de enero 2026");
    expect(formatBoatReportDate("2026-02-22")).toBe("22  DE FEBRERO DEL 2026");
  });

  it("formats report consecutive values", () => {
    expect(buildReportConsecutive("822", 2026)).toBe("822-2026");
    expect(buildReportConsecutive("010", 2026)).toBe("010-2026");
  });

  it("converts times and decimal hours to Excel day fractions", () => {
    expect(excelTimeFraction("12:00")).toBe(0.5);
    expect(excelHoursFraction(1.5)).toBe(0.0625);
    expect(excelTimeFraction("")).toBeNull();
    expect(excelHoursFraction(null)).toBeNull();
  });

  it("joins only present report values", () => {
    expect(joinReportValues(["A", "", undefined, "B"])).toBe("A, B");
  });

  it("builds vehicle Excel file names with the stored report number and driver", () => {
    expect(buildVehicleExcelFileName("0822", "Minor Cambronero Campos")).toBe(
      "Reporte de viaje # 0822 Minor Cambronero Campos.xlsx",
    );
  });

  it("builds vehicle Excel file names without a driver fallback", () => {
    expect(buildVehicleExcelFileName("0822", "")).toBe("Reporte de viaje # 0822.xlsx");
  });

  it("removes invalid file name characters from vehicle Excel file names", () => {
    expect(buildVehicleExcelFileName("08/22", "Minor: Cambronero *Campos?")).toBe(
      "Reporte de viaje # 0822 Minor Cambronero Campos.xlsx",
    );
  });

  it("builds boat Excel file names with the stored report number and captain", () => {
    expect(buildBoatExcelFileName("010", "Pablo Barrantes Palma")).toBe(
      "Reporte de viaje # 010 Pablo Barrantes Palma.xlsx",
    );
  });

  it("builds boat Excel file names without a captain fallback", () => {
    expect(buildBoatExcelFileName("010", "")).toBe("Reporte de viaje # 010.xlsx");
  });
});

describe("patchXlsxTemplateBytes", () => {
  it("preserves workbook media, drawings and styles while updating cells", () => {
    const template = readFileSync(join(process.cwd(), "public/templates/reporte-vehiculo-template.xlsx"));
    const patched = patchXlsxTemplateBytes(template, { B7: "REPORTE DE VIAJE No: 999" }, { I24: 0 });
    const zip = unzipSync(patched);
    const names = Object.keys(zip);

    expect(names.some((name) => name.startsWith("xl/media/"))).toBe(true);
    expect(names.some((name) => name.startsWith("xl/drawings/"))).toBe(true);
    expect(names).toContain("xl/styles.xml");

    const sheetPath = names.find((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name));
    expect(sheetPath).toBeTruthy();

    const sheet = strFromU8(zip[sheetPath as string]);
    expect(sheet).toContain("REPORTE DE VIAJE No: 999");
    expect(sheet).toContain('<c r="I24"');
    expect(sheet).toContain("<v>0</v>");
  });
});

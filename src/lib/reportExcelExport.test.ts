import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import {
  buildBoatPatches,
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

  it("deduplicates joined report values while preserving order", () => {
    expect(joinReportValues(["Jorge Gonzalez", "Randall Mena", "Jorge Gonzalez"])).toBe("Jorge Gonzalez, Randall Mena");
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

describe("boat report Excel patches", () => {
  it("keeps multiple roles on one person without duplicating crew names or shifting signatures", () => {
    const patches = buildBoatPatches({
      report: {
        no_reporte: "017",
        anio: 2026,
        estacion: "Murcielago",
        embarcacion: "GC38-22",
        bitacora: "01",
        folios: "1-2",
        no_cierre_os: "",
        fecha: "2026-05-21",
        hora_salida: "06:00",
        hora_regreso: "09:00",
        horas_navegadas: null,
        horas_motor_babor: null,
        horas_motor_centro: null,
        horas_motor_estribor: null,
        destino: "Sector norte",
        novedades: "",
        tipo_combustible: "",
        saldo_anterior: null,
        combustible_trasegado_bodega: null,
        total_antes_viaje: null,
        combustible_trasegado_durante: null,
        combustible_gastado: null,
        saldo_despues: null,
        estacion_combustible: "",
        lugar_combustible: "",
        cedula_juridica_combustible: "",
        no_factura: "",
        millas_nauticas: null,
      } as Parameters<typeof buildBoatPatches>[0]["report"],
      people: [
        {
          id: "1",
          reporte_id: "boat-1",
          tipo_reporte: "embarcacion",
          nombre: "Jorge Gonzalez Barrantes",
          nombre_normalizado: "jorge gonzalez barrantes",
          cedula: "501010643",
          roles: ["capitan", "tripulante"],
        },
        {
          id: "2",
          reporte_id: "boat-1",
          tipo_reporte: "embarcacion",
          nombre: "Randall Mena Villavicencio",
          nombre_normalizado: "randall mena villavicencio",
          cedula: "205200912",
          roles: ["encargado_mision", "oficial_director", "tripulante"],
        },
        {
          id: "3",
          reporte_id: "boat-1",
          tipo_reporte: "embarcacion",
          nombre: "Michael Rojas Brenes",
          nombre_normalizado: "michael rojas brenes",
          cedula: "603310561",
          roles: ["operacional"],
        },
        {
          id: "4",
          reporte_id: "boat-1",
          tipo_reporte: "embarcacion",
          nombre: "Joel Mora Estrada",
          nombre_normalizado: "joel mora estrada",
          cedula: null,
          roles: ["tripulante"],
        },
      ],
      motivos: [],
      sitios: [
        {
          nombre_sitio: "Manzanillo",
          zona: "",
          posicion: "",
        },
      ] as Parameters<typeof buildBoatPatches>[0]["sitios"],
      inspectedBoats: [],
    });

    expect(patches.text.C9).toBe("Jorge Gonzalez Barrantes, Randall Mena Villavicencio, Joel Mora Estrada");
    expect(patches.text.F15).toBe("Manzanillo");
    expect(patches.text.G15).toBe("1B");
    expect(patches.text.H15).toBe("11\u00B001'28.31\" N / 085\u00B043'57.52\" W");
    expect(patches.text.C35).toBe("Randall Mena Villavicencio");
    expect(patches.text.C36).toBe("Michael Rojas Brenes");
    expect(patches.text.C37).toBe("Jorge Gonzalez Barrantes");
    expect(patches.text.C38).toBe("Randall Mena Villavicencio");
    expect(patches.numbers.H35).toBe(205200912);
    expect(patches.numbers.H37).toBe(603100467);
    expect(patches.numbers.H38).toBe(205200912);
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

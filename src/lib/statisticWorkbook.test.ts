import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildStatisticFileName, patchStatisticWorkbookBytes } from "./statisticWorkbook";

const readTemplate = () => readFileSync(join(process.cwd(), "public/templates/estadistica-template.xlsx"));
const TEST_TIMEOUT = 30_000;

describe("patchStatisticWorkbookBytes", () => {
  it("fills station dates and unit resource rows while preserving formulas", () => {
    const patched = patchStatisticWorkbookBytes(readTemplate(), {
      squad: "alfa",
      startDate: "2026-04-01",
      endDate: "2026-04-08",
      vehicleReports: [
        {
          id: "vehicle-1",
          fecha: "2026-04-01",
          no_reporte: "123",
          vehiculo: "SNG-16",
          kilometros_recorridos: 10,
          combustible_trasegado_bomba: 5,
          combustible_gastado: 2,
          novedades: "Revision de ruta.",
        },
        {
          id: "vehicle-2",
          fecha: "2026-04-01",
          no_reporte: "321",
          vehiculo: "SNG 16",
          kilometros_recorridos: 20,
          combustible_trasegado_bomba: 3,
          combustible_gastado: 1,
          novedades: "",
        },
      ],
      boatReports: [
        {
          id: "boat-1",
          fecha: "2026-04-02",
          no_reporte: "50",
          embarcacion: "GC-38-22",
          millas_nauticas: 12,
          horas_navegadas: 2,
          horas_motor_babor: 1,
          horas_motor_centro: null,
          horas_motor_estribor: 2,
          combustible_trasegado_bodega: 40,
          combustible_gastado: 15,
          novedades: "Patrullaje maritimo.",
        },
      ],
      motives: [
        {
          reporte_id: "vehicle-1",
          tipo_reporte: "vehiculo",
          motivo: "Control de narcotráfico",
          motivo_key: "control de narcotrafico",
        },
        {
          reporte_id: "vehicle-2",
          tipo_reporte: "vehiculo",
          motivo: "Apoyo operativo",
          motivo_key: "apoyo operativo",
        },
        {
          reporte_id: "boat-1",
          tipo_reporte: "embarcacion",
          motivo: "Pesca ilegal",
          motivo_key: "pesca ilegal",
        },
      ],
      aiCells: [
        { sheetName: "SNG-16", date: "2026-04-01", row: 108, value: 2, source: "Reporte 123" },
        { sheetName: "GC-38-22", date: "2026-04-02", row: 259, value: 1, source: "Reporte 50" },
      ],
    });

    const zip = unzipSync(patched.bytes);
    expect(Object.keys(zip)).not.toContain("xl/vbaProject.bin");

    const workbook = XLSX.read(patched.bytes, { type: "array", bookVBA: true, cellFormula: true });
    expect(workbook.vbaraw).toBeFalsy();

    const station = workbook.Sheets["ESTACIÓN"];
    expect(station.D5.v).toBe(46113);
    expect(station.I5.v).toBe(46120);

    const vehicleSheet = workbook.Sheets["SNG-16"];
    expect(vehicleSheet.B5.v).toBe(46113);
    expect(vehicleSheet.G5.v).toBe(46120);
    expect(vehicleSheet.B7.v).toBe("123/321");
    expect(vehicleSheet.B11.v).toBe(30);
    expect(vehicleSheet.B17.v).toBe(8);
    expect(vehicleSheet.B18.v).toBe(3);
    expect(vehicleSheet.B44.v).toBe(2);
    expect(vehicleSheet.B52.v).toBe(2);
    expect(vehicleSheet.B53.v).toBe(2);
    expect(vehicleSheet.B78.v).toBe(1);
    expect(vehicleSheet.B108.v).toBe(2);
    expect(vehicleSheet.B147.f).toBe("SUM(B148:B155)");
    expect(vehicleSheet.J11.f).toBe("SUM(B11:I11)");

    const boatSheet = workbook.Sheets["GC-38-22"];
    expect(boatSheet.B5.v).toBe(46113);
    expect(boatSheet.G5.v).toBe(46120);
    expect(boatSheet.C7.v).toBe("50");
    expect(boatSheet.C10.v).toBe(12);
    expect(boatSheet.C13.v).toBe(2 / 24);
    expect(boatSheet.C14.v).toBe(3 / 24);
    expect(boatSheet.C15.v).toBe(40);
    expect(boatSheet.C16.v).toBe(15);
    expect(boatSheet.C46.v).toBe(1);
    expect(boatSheet.C52.v).toBe(1);
    expect(boatSheet.C53.v).toBe(1);
    expect(boatSheet.C95.v).toBe(1);
    expect(boatSheet.C259.v).toBe(1);
    expect(boatSheet.J13.f).toBe("SUM(B13:I13)");
    expect(boatSheet.J259.f).toBe("SUM(B259:I259)");
    expect(patched.summary.usedReports).toBe(3);
    expect(patched.summary.pendingReports).toHaveLength(0);
    expect(patched.summary.pendingMotives).toEqual([
      {
        reporte_id: "vehicle-2",
        tipo_reporte: "vehiculo",
        motivo: "Apoyo operativo",
        motivo_key: "apoyo operativo",
      },
    ]);
    expect(patched.summary.omittedData.length).toBeGreaterThan(0);
  }, TEST_TIMEOUT);

  it("fills row 24 with deduplicated operational human hours", () => {
    const patched = patchStatisticWorkbookBytes(readTemplate(), {
      squad: "alfa",
      startDate: "2026-04-01",
      endDate: "2026-04-08",
      vehicleReports: [
        {
          id: "vehicle-1",
          fecha: "2026-04-01",
          no_reporte: "123",
          vehiculo: "SNG-16",
          hora_salida: "13:00",
          hora_regreso: "14:00",
          total_horas: null,
          kilometros_recorridos: 0,
          combustible_trasegado_bomba: null,
          combustible_gastado: null,
          novedades: "",
        },
        {
          id: "vehicle-2",
          fecha: "2026-04-01",
          no_reporte: "124",
          vehiculo: "SNG-16",
          hora_salida: "15:00",
          hora_regreso: "16:00",
          total_horas: null,
          kilometros_recorridos: 0,
          combustible_trasegado_bomba: null,
          combustible_gastado: null,
          novedades: "",
        },
        {
          id: "vehicle-official-only",
          fecha: "2026-04-01",
          no_reporte: "125",
          vehiculo: "SNG-16",
          hora_salida: "16:00",
          hora_regreso: "20:00",
          total_horas: null,
          kilometros_recorridos: 0,
          combustible_trasegado_bomba: null,
          combustible_gastado: null,
          novedades: "",
        },
      ],
      boatReports: [
        {
          id: "boat-1",
          fecha: "2026-04-02",
          no_reporte: "50",
          embarcacion: "GC-38-22",
          hora_salida: "10:00",
          hora_regreso: "12:00",
          millas_nauticas: null,
          horas_navegadas: 2,
          horas_motor_babor: null,
          horas_motor_centro: null,
          horas_motor_estribor: null,
          combustible_trasegado_bodega: null,
          combustible_gastado: null,
          novedades: "",
        },
        {
          id: "boat-2",
          fecha: "2026-04-02",
          no_reporte: "51",
          embarcacion: "GC-38-22",
          hora_salida: "22:00",
          hora_regreso: "23:00",
          millas_nauticas: null,
          horas_navegadas: null,
          horas_motor_babor: null,
          horas_motor_centro: null,
          horas_motor_estribor: null,
          combustible_trasegado_bodega: null,
          combustible_gastado: null,
          novedades: "",
        },
      ],
      people: [
        { reporte_id: "vehicle-1", tipo_reporte: "vehiculo", nombre_normalizado: "chofer uno", roles: ["oficial", "chofer"] },
        { reporte_id: "vehicle-1", tipo_reporte: "vehiculo", nombre_normalizado: "acompanante uno", roles: ["acompanante"] },
        { reporte_id: "vehicle-1", tipo_reporte: "vehiculo", nombre_normalizado: "acompanante dos", roles: ["acompanante"] },
        { reporte_id: "vehicle-1", tipo_reporte: "vehiculo", nombre_normalizado: "jefe externo", roles: ["oficial"] },
        { reporte_id: "vehicle-2", tipo_reporte: "vehiculo", nombre_normalizado: "chofer dos", roles: ["chofer"] },
        { reporte_id: "vehicle-2", tipo_reporte: "vehiculo", nombre_normalizado: "acompanante tres", roles: ["acompanante"] },
        { reporte_id: "vehicle-2", tipo_reporte: "vehiculo", nombre_normalizado: "acompanante cuatro", roles: ["acompanante"] },
        { reporte_id: "vehicle-2", tipo_reporte: "vehiculo", nombre_normalizado: "acompanante cinco", roles: ["acompanante"] },
        { reporte_id: "vehicle-official-only", tipo_reporte: "vehiculo", nombre_normalizado: "oficial solo", roles: ["oficial"] },
        { reporte_id: "boat-1", tipo_reporte: "embarcacion", nombre_normalizado: "capitan uno", roles: ["capitan"] },
        { reporte_id: "boat-1", tipo_reporte: "embarcacion", nombre_normalizado: "tripulante uno", roles: ["tripulante"] },
        { reporte_id: "boat-1", tipo_reporte: "embarcacion", nombre_normalizado: "operacional uno", roles: ["operacional"] },
        { reporte_id: "boat-1", tipo_reporte: "embarcacion", nombre_normalizado: "encargado uno", roles: ["encargado_mision"] },
        { reporte_id: "boat-1", tipo_reporte: "embarcacion", nombre_normalizado: "particular uno", roles: ["particular"] },
        { reporte_id: "boat-2", tipo_reporte: "embarcacion", nombre_normalizado: "capitan dos", roles: ["capitan", "operacional"] },
        { reporte_id: "boat-2", tipo_reporte: "embarcacion", nombre_normalizado: "tripulante dos", roles: ["tripulante", "encargado_mision"] },
      ],
    });

    const workbook = XLSX.read(patched.bytes, { type: "array", cellFormula: true });
    const vehicleSheet = workbook.Sheets["SNG-16"];
    const boatSheet = workbook.Sheets["GC-38-22"];

    expect(vehicleSheet.B24.v).toBeCloseTo(7 / 24);
    expect(boatSheet.C24.v).toBeCloseTo(8 / 24);
    expect(patched.summary.omittedData.join(" ")).not.toContain("Fila 24");
  }, TEST_TIMEOUT);

  it("clears stale template resource values for recognized sheets without clearing totals", () => {
    const patched = patchStatisticWorkbookBytes(readTemplate(), {
      squad: "alfa",
      startDate: "2026-04-01",
      endDate: "2026-04-08",
      vehicleReports: [],
      boatReports: [],
    });

    const workbook = XLSX.read(patched.bytes, { type: "array", cellFormula: true });
    const vehicleSheet = workbook.Sheets["SNG-16"];
    const boatSheet = workbook.Sheets["GC-38-22"];

    expect(vehicleSheet.B7).toBeUndefined();
    expect(vehicleSheet.B11).toBeUndefined();
    expect(vehicleSheet.B44).toBeUndefined();
    expect(vehicleSheet.B24).toBeUndefined();
    expect(vehicleSheet.B78).toBeUndefined();
    expect(vehicleSheet.B108).toBeUndefined();
    expect(vehicleSheet.B147.f).toBe("SUM(B148:B155)");
    expect(boatSheet.B10).toBeUndefined();
    expect(boatSheet.B46).toBeUndefined();
    expect(boatSheet.B95).toBeUndefined();
    expect(boatSheet.B259).toBeUndefined();
    expect(vehicleSheet.J11.f).toBe("SUM(B11:I11)");
    expect(boatSheet.J10.f).toBe("SUM(B10:I10)");
  }, TEST_TIMEOUT);

  it("reports units that cannot be mapped to a workbook sheet", () => {
    const patched = patchStatisticWorkbookBytes(readTemplate(), {
      squad: "alfa",
      startDate: "2026-04-01",
      endDate: "2026-04-08",
      vehicleReports: [
        {
          id: "vehicle-unknown",
          fecha: "2026-04-01",
          no_reporte: "999",
          vehiculo: "SNG-99",
          kilometros_recorridos: 10,
          combustible_trasegado_bomba: 5,
          combustible_gastado: 2,
          novedades: "",
        },
      ],
      boatReports: [],
    });

    expect(patched.summary.usedReports).toBe(0);
    expect(patched.summary.pendingReports).toEqual([
      {
        id: "vehicle-unknown",
        tipo: "vehiculo",
        no_reporte: "999",
        fecha: "2026-04-01",
        unidad: "SNG-99",
        reason: "missing_sheet",
      },
    ]);
  }, TEST_TIMEOUT);

  it("marks workbook formulas for recalculation on open", () => {
    const patched = patchStatisticWorkbookBytes(readTemplate(), {
      squad: "bravo",
      startDate: "2026-04-09",
      endDate: "2026-04-16",
      vehicleReports: [],
      boatReports: [],
    });
    const zip = unzipSync(patched.bytes);
    const workbookXml = strFromU8(zip["xl/workbook.xml"]);

    expect(workbookXml).toContain('fullCalcOnLoad="1"');
    expect(workbookXml).toContain('forceFullCalc="1"');
  }, TEST_TIMEOUT);
});

describe("buildStatisticFileName", () => {
  it("formats same-month periods with the operational naming style", () => {
    expect(buildStatisticFileName("alfa", "2026-04-01", "2026-04-08")).toBe(
      "Estadistica del 1 al 8 de abril 2026 Esc Alfa.xlsx",
    );
  });

  it("includes both month names when the period crosses months", () => {
    expect(buildStatisticFileName("bravo", "2026-04-30", "2026-05-07")).toBe(
      "Estadistica del 30 de abril al 7 de mayo 2026 Esc Bravo.xlsx",
    );
  });

  it("includes both years when the period crosses years", () => {
    expect(buildStatisticFileName("alfa", "2026-12-30", "2027-01-06")).toBe(
      "Estadistica del 30 de diciembre 2026 al 6 de enero 2027 Esc Alfa.xlsx",
    );
  });
});

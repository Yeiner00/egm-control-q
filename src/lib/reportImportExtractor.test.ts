import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildReportImportDraftFromWorkbook, parseImportExcelDate, parseImportExcelTime } from "./reportImportExtractor";

const makeWorkbook = (cells: Record<string, unknown>) => {
  const sheet: XLSX.WorkSheet = {};
  Object.entries(cells).forEach(([ref, value]) => {
    sheet[ref] = { v: value, t: typeof value === "number" ? "n" : "s" } as XLSX.CellObject;
  });
  sheet["!ref"] = "A1:N48";
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Reporte");
  return workbook;
};

describe("reportImportExtractor", () => {
  it("parses mixed Excel time formats", () => {
    expect(parseImportExcelTime(0.5833333333333334)).toBe("14:00");
    expect(parseImportExcelTime("14:00:00")).toBe("14:00");
    expect(parseImportExcelTime("7:05")).toBe("07:05");
  });

  it("parses date formats found in real reports", () => {
    expect(parseImportExcelDate("MARTES 10 FEBRERO 2026")).toBe("2026-02-10");
    expect(parseImportExcelDate("Del 01/01/2026 al 01/01/2026")).toBe("2026-01-01");
    expect(parseImportExcelDate(46041)).toBe("2026-01-19");
    expect(parseImportExcelDate("1/19/26")).toBe("2026-01-19");
  });

  it("extracts vehicle reports with cedula match and preserves novedades text", () => {
    const workbook = makeWorkbook({
      B2: "REPORTE DE VIAJE DE VEHÍCULOS",
      B7: "REPORTE DE VIAJE No: 863",
      H3: "Fecha: Lunes 01 de abril de 2026",
      K5: 0.5833333333333334,
      N5: "18:30:00",
      B9: "ESTACIÓN DE GUARDACOSTAS: MURCIELAGO",
      B11: "VEHICULO  SNG: SNG-16",
      D7: "DESTINO: Sector norte",
      D12: "MOTIVO: Seguridad ciudadana, proteccion a bañistas.",
      B12: "BITACORA: 12",
      C25: "AGENTE JOEL MORA ESTRADAA",
      L25: "604640540",
      C26: "S INT MICHAEL ROJAS BRENES",
      L26: "603310561",
      B15: "ACOMPAÑANTES: JPRGE GONZALES BARRANTES y Agente Alfonso Noguera Corrales.",
      B17: "NOVEDADES Y ACTIVIDADES DURANTE EL VIAJE: Texto libre, sin modificar.",
      I9: "Playa Rajada",
      H9: "3A",
      L9: "11 01 N",
      B24: 10,
      C24: 20,
      D24: 5,
      F24: 15,
      I24: 100,
    });

    const draft = buildReportImportDraftFromWorkbook(workbook, XLSX, {
      jobId: "job-1",
      fileName: "vehiculo.xlsx",
    });

    expect(draft.reportType).toBe("vehiculo");
    expect(draft.extractedData).toMatchObject({
      no_reporte: "0863",
      fecha: "2026-04-01",
      hora_salida: "14:00",
      hora_regreso: "18:30",
      chofer: "Joel Mora Estrada",
      chofer_cedula: "604640540",
      novedades: "Texto libre, sin modificar.",
    });
    expect(draft.fields.find((field) => field.fieldKey === "chofer")?.metadata.match).toMatchObject({
      level: "cedula",
      confidence: 1,
    });
    expect(draft.fields.find((field) => field.fieldKey === "novedades")?.finalValue).toBe("Texto libre, sin modificar.");
  });

  it("parses vehicle dates written without de separators", () => {
    const workbook = makeWorkbook({
      B2: "REPORTE DE VIAJE DE VEHICULOS",
      B7: "REPORTE DE VIAJE No: 841",
      H3: "MARTES 10 FEBRERO 2026",
      K5: "08:00:00",
      N5: "10:00:00",
      B11: "VEHICULO  SNG: SNG-16",
      C25: "Olman Alfaro Quiros",
      L25: "118150120",
      C26: "Joel Mora Estrada",
      L26: "604640540",
      B17: "NOVEDADES Y ACTIVIDADES DURANTE EL VIAJE: Sin novedad.",
    });

    const draft = buildReportImportDraftFromWorkbook(workbook, XLSX, {
      jobId: "job-841",
      fileName: "vehiculo-841.xlsx",
    });

    expect(draft.extractedData.fecha).toBe("2026-02-10");
    expect(draft.fields.find((field) => field.fieldKey === "fecha")).toMatchObject({
      finalValue: "2026-02-10",
      status: "accepted",
    });
  });

  it("extracts companion names that were written without a comma between officers", () => {
    const workbook = makeWorkbook({
      B2: "REPORTE DE VIAJE DE VEHICULOS",
      B7: "REPORTE DE VIAJE No: 822",
      H3: "01/01/2026",
      K5: "08:50:00",
      N5: "12:00:00",
      B11: "VEHICULO  SNG: SNG-25",
      B15: "ACOMPANANTES: Subintendente Jorge Gonzalez Barrantes, agente Yeiner Castro Alvarez Cesar Alvarez Martines",
      C25: "Minor Cambronero Campos",
      L25: "603460878",
      C26: "Joel Mora Estrada",
      L26: "604640540",
      B17: "NOVEDADES Y ACTIVIDADES DURANTE EL VIAJE: Sin novedad.",
    });

    const draft = buildReportImportDraftFromWorkbook(workbook, XLSX, {
      jobId: "job-822",
      fileName: "vehiculo-822.xlsx",
    });

    expect(draft.extractedData.acompanantes).toEqual([
      "Jorge Gonzalez Barrantes",
      "Yeiner Castro Alvarez",
      "Cesar Alvarez Martinez",
    ]);
    expect(draft.fields.find((field) => field.rawValue === "Cesar Alvarez Martines")).toMatchObject({
      finalValue: "Cesar Alvarez Martinez",
      status: "needs_review",
    });
  });

  it("keeps unknown companion names between known officers for review", () => {
    const workbook = makeWorkbook({
      B2: "REPORTE DE VIAJE DE VEHICULOS",
      B7: "REPORTE DE VIAJE No: 10",
      H3: "01/01/2026",
      K5: "08:50:00",
      N5: "12:00:00",
      B11: "VEHICULO  SNG: SNG-25",
      B15: "ACOMPANANTES: Cesar Alvarez Martinez.. Mambo Nunez Yeiner Castro",
      C25: "Minor Cambronero Campos",
      L25: "603460878",
      C26: "Joel Mora Estrada",
      L26: "604640540",
      B17: "NOVEDADES Y ACTIVIDADES DURANTE EL VIAJE: Sin novedad.",
    });

    const draft = buildReportImportDraftFromWorkbook(workbook, XLSX, {
      jobId: "job-unknown",
      fileName: "vehiculo-unknown.xlsx",
    });

    expect(draft.fields.filter((field) => field.fieldKey.startsWith("acompanantes.")).map((field) => field.rawValue)).toEqual([
      "Cesar Alvarez Martinez",
      "Mambo Nunez",
      "Yeiner Castro",
    ]);
    expect(draft.fields.find((field) => field.rawValue === "Mambo Nunez")).toMatchObject({
      finalValue: null,
      status: "rejected",
      metadata: { resolutionType: "unknown_person" },
    });
  });

  it("adds a review warning when companion names are repeated", () => {
    const workbook = makeWorkbook({
      B2: "REPORTE DE VIAJE DE VEHICULOS",
      B7: "REPORTE DE VIAJE No: 11",
      H3: "01/01/2026",
      K5: "08:50:00",
      N5: "12:00:00",
      B11: "VEHICULO  SNG: SNG-25",
      B15: "ACOMPANANTES: Cesar Alvarez Martinez, Cesar Alvarez Martinez, Yeiner Castro",
      C25: "Minor Cambronero Campos",
      L25: "603460878",
      C26: "Joel Mora Estrada",
      L26: "604640540",
      B17: "NOVEDADES Y ACTIVIDADES DURANTE EL VIAJE: Sin novedad.",
    });

    const draft = buildReportImportDraftFromWorkbook(workbook, XLSX, {
      jobId: "job-duplicates",
      fileName: "vehiculo-duplicates.xlsx",
    });

    expect(draft.extractedData.acompanantes).toEqual([
      "Cesar Alvarez Martinez",
      "Yeiner Castro Alvarez",
    ]);
    expect(draft.fields.find((field) => field.fieldKey === "acompanantes_duplicates")).toMatchObject({
      status: "needs_review",
      metadata: {
        warningType: "duplicate_person",
        duplicateNames: ["Cesar Alvarez Martinez"],
      },
    });
  });

  it("detects shifted boat fuel and signature sections", () => {
    const workbook = makeWorkbook({
      B1: "EMBARCACIÓN",
      C2: "MURCIELAGO",
      E2: "GC38-22",
      G2: "01",
      I2: "32-33",
      B4: "REPORTE VIAJE #: 018 FECHA:",
      C4: "02 de Abril del 2026",
      C5: 0.625,
      E5: "18:15:00",
      C6: 0.1423611111111111,
      E6: 0.1423611111111111,
      G6: 0.1423611111111111,
      C8: "SECTOR NORTE",
      F8: "Control narcotrafico, pesca ilegal",
      C9: "Operador Subintendente Jorge Gonzalez Barrantes, Jefe de Mision Inspector Minor Cambronero Campos, Marineros Agente Alfonso Noguera Corrales.",
      B13: "NOVEDADES DURANTE EL VIAJE: Novedad libre.",
      F15: "PLAYA JUNQUILLAL",
      G15: "3A",
      H15: "10 N",
      F25: "EMBARCACIONES INSPECCIONADAS",
      F26: "NOMBRE",
      G26: "MATRÍCULA",
      H26: "N° INSPECCION",
      I26: "No. ZONA",
      B34: "SALDO DEL COMBUSTIBLE VIAJE ANTERIOR",
      B35: 450,
      C35: 250,
      D35: 700,
      F35: 200,
      H35: 500,
      I35: "GASOLINA",
      H36: "MILLAS NAUTICAS",
      B37: "Dist. Garcia",
      C37: "3-101",
      D37: "La Cruz",
      F37: "58380",
      H37: 45,
      B39: "OFICIAL DIRECTOR /AMBIENTAL",
      C39: "Comandante Randall Mena Villavicencio",
      H39: "205200912",
      B40: "OPERACIONAL:",
      C40: "Subintendente Michael Rojas Brenes",
      H40: "603310561",
      B41: "CAPITÁN/OPERADOR AL MANDO:",
      C41: "Subintendente Jorge Gonzalez Barrantes",
      H41: "603100467",
      B42: "ENCARGADO DE LA MISIÓN",
      C42: "Inspector Minor Cambronero Campos",
      H42: "603460878",
    });

    const draft = buildReportImportDraftFromWorkbook(workbook, XLSX, {
      jobId: "job-2",
      fileName: "embarcacion.xlsx",
    });

    expect(draft.reportType).toBe("embarcacion");
    expect(draft.extractedData).toMatchObject({
      no_reporte: "0018",
      hora_salida: "15:00",
      hora_regreso: "18:15",
      capitan: "Jorge Gonzalez Barrantes",
      encargado_mision: "Minor Cambronero Campos",
      millas_nauticas: 45,
      novedades: "Novedad libre.",
    });
  });

  it("splits boat motives separated by periods and attached unknown text", () => {
    const workbook = makeWorkbook({
      B1: "EMBARCACION",
      C2: "MURCIELAGO",
      E2: "GC38-22",
      B4: "REPORTE VIAJE #: 010",
      C4: "22/02/2026",
      C5: "11:30:00",
      E5: "13:30:00",
      C8: "SECTOR NORTE",
      F8: "Realizar inspeccion de la embarcacion GC38-11. Pesca Ilegal, Piratria, Narcotrafico Coyotaje. Soberania",
      C9: "Operador Subintendente Pablo Barrantes Palma",
      B13: "NOVEDADES DURANTE EL VIAJE: Sin novedad.",
      F25: "EMBARCACIONES INSPECCIONADAS",
      B30: "SALDO DEL COMBUSTIBLE VIAJE ANTERIOR",
      B31: 100,
      C31: 0,
      D31: 100,
      F31: 10,
      H31: 90,
      B33: "OFICIAL DIRECTOR /AMBIENTAL",
      C33: "Comandante Randall Mena Villavicencio",
      H33: "205200912",
      B34: "OPERACIONAL:",
      C34: "Subintendente Dara Chavarria Hernandez",
      H34: "304310005",
      B35: "CAPITAN/OPERADOR AL MANDO:",
      C35: "Subintendente Pablo Barrantes Palma",
      H35: "603790678",
      B36: "ENCARGADO DE LA MISION",
      C36: "Inspector Minor Cambronero Campos",
      H36: "603460878",
    });

    const draft = buildReportImportDraftFromWorkbook(workbook, XLSX, {
      jobId: "job-motives",
      fileName: "embarcacion-motives.xlsx",
    });

    expect(draft.extractedData.motivos).toEqual([
      "Realizar Inspeccion de la Embarcacion Gc38-11",
      "Pesca ilegal",
      "Pirateria",
      "Control de narcotráfico",
      "Coyotaje",
      "Reafirmación de soberanía",
    ]);
    expect(draft.fields.find((field) => field.rawValue === "Realizar Inspeccion de la Embarcacion Gc38-11")).toMatchObject({
      kind: "catalog",
      finalValue: null,
      status: "rejected",
    });
    expect(draft.fields.find((field) => field.rawValue === "Coyotaje")).toMatchObject({
      kind: "catalog",
      finalValue: null,
      status: "rejected",
    });
    expect(draft.fields.find((field) => field.rawValue === "Soberania")).toMatchObject({
      finalValue: "Reafirmación de soberanía",
      status: "accepted",
    });
  });
});

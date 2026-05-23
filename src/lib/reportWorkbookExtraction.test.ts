import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { extractReportFromWorkbook, mergeExtractedReportData } from "./reportWorkbookExtraction";

const makeWorkbook = (cells: Record<string, string | number>) => {
  const sheet: XLSX.WorkSheet = {};
  Object.entries(cells).forEach(([ref, value]) => {
    sheet[ref] = {
      t: typeof value === "number" ? "n" : "s",
      v: value,
    } as XLSX.CellObject;
  });
  sheet["!ref"] = "B2:I40";

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Reporte");
  return workbook;
};

const baseBoatCells = {
  B2: "ESTACION GUARDACOSTAS:",
  C2: "MURCIELAGO",
  D2: "EMBARCACION SNG: G-C",
  E2: "GC38-22",
  G2: "01",
  I2: "56-57",
  B4: "REPORTE VIAJE #: 036 FECHA:",
  C4: "29 de Abril del 2026",
  I4: "036-2026",
  C5: 0.1875,
  E5: 0.2916666666666667,
  B6: "HORAS MOTOR BABOR:",
  C6: 0.1111111111111111,
  E6: 0.1111111111111111,
  G6: 0.1111111111111111,
  C8: "SECTOR NORTE DE LA ESTACION",
  F8: "Control narcotrafico, Pesca Ilegal",
  B13: "NOVEDADES DURANTE EL VIAJE: Texto de novedades",
};

describe("extractReportFromWorkbook", () => {
  it("reads shifted boat reports without treating labels as data", () => {
    const workbook = makeWorkbook({
      ...baseBoatCells,
      B11: "PERSONAS PARTICULARES A BORDO:",
      F14: "NOMBRE",
      G14: "No. ZONA",
      H14: "POSICION",
      F15: "BAHIA CUAJINIQUIL",
      G15: "3A",
      H15: "10 57 15 N / 085 43 13 W",
      F21: "BAHIA SALINAS",
      G21: "3A",
      H21: "11 03 50 N / 085 41 33 W",
      F23: "**EMBARCACIONES INSPECCIONADAS FISICA Y VISUALMENTE**",
      F24: "NOMBRE",
      G24: "MATRICULA",
      H24: "N INSPECCION",
      I24: "No. ZONA",
      F25: "ALOHA",
      G25: "GPC-7080",
      H25: "ABORDAJE",
      I25: "3C",
      B28: "Saldo del combustible en tanque del viaje anterior (litros)",
      D29: 400,
      F29: 70,
      H29: 330,
      I29: "GASOLINA",
      B30: "ESTACION DE COMBUSTIBLE",
      C30: "CEDULA JURIDICA",
      D30: "LUGAR",
      F30: "No. FACTURA",
      H30: "Millas Nauticas recorridas (EN NUMEROS)",
      H31: 21,
      B33: "OFICIAL DIRECTOR /AMBIENTAL",
      C33: "Comandante Randall Mena Villavicencio",
      G33: "Cedula:",
      H33: 205200912,
      B34: "OPERACIONAL:",
      C34: "Subintendente Pablo Barrantes Palma",
      H34: 603790678,
      B35: "CAPITAN/OPERADOR AL MANDO:",
      C35: "Subintendente Pablo Barrantes Palma",
      H35: 603790678,
      B36: "ENCARGADO DE LA MISION",
      C36: "Agente Jhonny Araya Chacon",
      H36: 206900634,
    });

    const data = extractReportFromWorkbook(workbook, XLSX);

    expect(data?.personas_particulares).toEqual([]);
    expect(data?.sitios_visitados).toEqual([
      { nombre_sitio: "BAHIA CUAJINIQUIL", zona: "3A", posicion: "10 57 15 N / 085 43 13 W" },
      { nombre_sitio: "BAHIA SALINAS", zona: "3A", posicion: "11 03 50 N / 085 41 33 W" },
    ]);
    expect(data?.embarcaciones_inspeccionadas).toEqual([
      { nombre: "ALOHA", matricula: "GPC-7080", no_inspeccion: "ABORDAJE", zona: "3C", posicion: "" },
    ]);
    expect(data?.saldo_despues).toBe(330);
    expect(data?.millas_nauticas).toBe(21);
    expect(data?.estacion_combustible).toBe("");
    expect(data?.oficial_director).toBe("Comandante Randall Mena Villavicencio");
    expect(data?.oficial_director_cedula).toBe("205200912");
    expect(data?.operacional).toBe("Subintendente Pablo Barrantes Palma");
    expect(data?.capitan).toBe("Subintendente Pablo Barrantes Palma");
    expect(data?.encargado_mision).toBe("Agente Jhonny Araya Chacon");
  });

  it("keeps reading the default boat template row layout", () => {
    const workbook = makeWorkbook({
      ...baseBoatCells,
      B11: "PERSONAS PARTICULARES A BORDO: Ana Mora, Luis Solis",
      F24: "**EMBARCACIONES INSPECCIONADAS FISICA Y VISUALMENTE**",
      F25: "NOMBRE",
      G25: "MATRICULA",
      H25: "N INSPECCION",
      I25: "No. ZONA",
      F26: "POSEIDON",
      G26: "P-123",
      H26: "VISUAL",
      I26: "3A",
      B30: "Saldo del combustible en tanque del viaje anterior (litros)",
      B31: 320,
      D31: 320,
      F31: 40,
      H31: 280,
      I31: "GASOLINA",
      B32: "ESTACION DE COMBUSTIBLE",
      H32: "Millas Nauticas recorridas (EN NUMEROS)",
      B33: "MUELLE",
      H33: 7,
      B35: "OFICIAL DIRECTOR /AMBIENTAL",
      C35: "Comandante Randall Mena Villavicencio",
      H35: 205200912,
      B36: "OPERACIONAL:",
      C36: "Subintendente Dara Chavarria Hernandez",
      H36: 304310005,
      B37: "CAPITAN/OPERADOR AL MANDO:",
      C37: "Subintendente Pablo Barrantes Palma",
      H37: 603790678,
      B38: "ENCARGADO DE LA MISION",
      C38: "Agente Jhonny Araya Chacon",
      H38: 206900634,
    });

    const data = extractReportFromWorkbook(workbook, XLSX);

    expect(data?.personas_particulares).toEqual(["Ana Mora", "Luis Solis"]);
    expect(data?.embarcaciones_inspeccionadas).toEqual([
      { nombre: "POSEIDON", matricula: "P-123", no_inspeccion: "VISUAL", zona: "3A", posicion: "" },
    ]);
    expect(data?.saldo_despues).toBe(280);
    expect(data?.millas_nauticas).toBe(7);
    expect(data?.estacion_combustible).toBe("MUELLE");
    expect(data?.oficial_director).toBe("Comandante Randall Mena Villavicencio");
    expect(data?.oficial_director_cedula).toBe("205200912");
    expect(data?.operacional).toBe("Subintendente Dara Chavarria Hernandez");
  });

  it("lets workbook empty people fields correct AI label-only extractions", () => {
    const merged = mergeExtractedReportData(
      {
        tipo: "embarcacion",
        personas_particulares: ["Personas Particulares A Bordo:"],
        tripulantes: ["Tripulante IA"],
      },
      {
        tipo: "embarcacion",
        personas_particulares: [],
        tripulantes: [],
      },
    );

    expect(merged?.personas_particulares).toEqual([]);
    expect(merged?.tripulantes).toEqual(["Tripulante IA"]);
  });
});

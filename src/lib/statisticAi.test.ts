import { describe, expect, it } from "vitest";
import { buildStatisticAiPackage, parseStatisticAiCells } from "./statisticAi";

describe("buildStatisticAiPackage", () => {
  it("exports reports, allowed row catalog, and expected response schema", () => {
    const pack = buildStatisticAiPackage({
      period: { squad: "alfa", startDate: "2026-04-01", endDate: "2026-04-08" },
      sheetNames: ["SNG-16", "GC-38-22"],
      vehicleReports: [
        {
          id: "vehicle-1",
          fecha: "2026-04-01",
          no_reporte: "123",
          vehiculo: "SNG 16",
          kilometros_recorridos: 10,
          combustible_trasegado_bomba: 5,
          combustible_gastado: 2,
          novedades: "Se inspeccionaron dos embarcaciones.",
        },
      ],
      boatReports: [],
      motives: [
        {
          reporte_id: "vehicle-1",
          tipo_reporte: "vehiculo",
          motivo: "Control de narcotrafico",
          motivo_key: "control de narcotrafico",
        },
      ],
      sites: [
        {
          reporte_id: "vehicle-1",
          nombre_sitio: "Playa Blanca",
          zona: "Norte",
          posicion: "10.1,-85.1",
        },
      ],
    });

    expect(pack.tipo).toBe("estadistica_novedades_guardacostas");
    expect(pack.respuesta_esperada.celdas[0]).toMatchObject({ hoja: "SNG-16", fila: 108 });
    expect(pack.filas_permitidas.some((row) => row.row === 108)).toBe(true);
    expect(pack.filas_permitidas.some((row) => row.row === 107)).toBe(false);
    expect(pack.filas_permitidas.some((row) => row.row === 147)).toBe(false);
    expect(pack.reportes[0]).toMatchObject({
      id: "vehicle-1",
      hoja_excel: "SNG-16",
      motivos: ["Control de narcotrafico"],
      sitios: [{ nombre_sitio: "Playa Blanca", zona: "Norte", posicion: "10.1,-85.1" }],
    });
  });
});

describe("parseStatisticAiCells", () => {
  it("accepts valid cells and sums duplicates", () => {
    const result = parseStatisticAiCells(
      JSON.stringify({
        version: 1,
        celdas: [
          { hoja: "SNG-16", fecha: "2026-04-01", fila: 108, valor: 2, fuente: "Reporte 123" },
          { hoja: "sng 16", fecha: "2026-04-01", fila: "108", valor: "1.5", fuente: "Reporte 321" },
        ],
      }),
      { startDate: "2026-04-01", sheetNames: ["SNG-16"] },
    );

    expect(result.rejected).toHaveLength(0);
    expect(result.cells).toEqual([
      {
        sheetName: "SNG-16",
        date: "2026-04-01",
        row: 108,
        value: 3.5,
        source: "Reporte 123; Reporte 321",
      },
    ]);
  });

  it("rejects unknown sheets, dates outside the period, disallowed rows, and invalid values", () => {
    const result = parseStatisticAiCells(
      JSON.stringify({
        version: 1,
        celdas: [
          { hoja: "SNG-99", fecha: "2026-04-01", fila: 108, valor: 1 },
          { hoja: "SNG-16", fecha: "2026-04-09", fila: 108, valor: 1 },
          { hoja: "SNG-16", fecha: "2026-04-01", fila: 147, valor: 1 },
          { hoja: "SNG-16", fecha: "2026-04-01", fila: 108, valor: -1 },
          { hoja: "SNG-16", fecha: "2026-04-01", fila: 108, valor: "dos" },
        ],
      }),
      { startDate: "2026-04-01", sheetNames: ["SNG-16"] },
    );

    expect(result.cells).toHaveLength(0);
    expect(result.rejected.map((item) => item.reason)).toEqual([
      "missing_sheet",
      "date_out_of_range",
      "row_not_allowed",
      "invalid_value",
      "invalid_value",
    ]);
  });

  it("throws when the pasted text is not the expected JSON shape", () => {
    expect(() => parseStatisticAiCells("not-json", { startDate: "2026-04-01", sheetNames: ["SNG-16"] })).toThrow(
      "JSON valido",
    );
    expect(() => parseStatisticAiCells("{}", { startDate: "2026-04-01", sheetNames: ["SNG-16"] })).toThrow(
      "arreglo llamado celdas",
    );
  });
});

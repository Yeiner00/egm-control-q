import { describe, expect, it } from "vitest";
import { countVehicleMotiveReports, normalizeMotiveKey, normalizeMotives } from "./motives";

describe("normalizeMotiveKey", () => {
  it("normalizes case, accents and punctuation", () => {
    expect(normalizeMotiveKey("Control de narcotráfico.")).toBe("control de narcotrafico");
    expect(normalizeMotiveKey("PROTECCIÓN A BAÑISTAS.")).toBe("proteccion a banistas");
  });
});

describe("normalizeMotives", () => {
  it("maps common variants to canonical motives", () => {
    expect(normalizeMotives([
      "Pesca Ilegal",
      "pesca ilegal.",
      "PATRULLAJE PARA EL CONTROL PESCA ILEGAL",
    ])).toEqual([
      {
        motivo: "Pesca ilegal",
        motivo_original: "Pesca Ilegal",
        motivo_key: "pesca ilegal",
      },
    ]);
  });

  it("splits combined motives into separate canonical categories", () => {
    expect(normalizeMotives(["Pesca ilegal y Migracion ilegal"]).map((motivo) => motivo.motivo)).toEqual([
      "Control migratorio",
      "Pesca ilegal",
    ]);
  });

  it("keeps specific boat inspection text as a report-only motive", () => {
    expect(normalizeMotives(["Realizar inspeccion de la embarcacion GC38-11"])).toEqual([
      {
        motivo: "Realizar inspeccion de la embarcacion GC38-11",
        motivo_original: "Realizar inspeccion de la embarcacion GC38-11",
        motivo_key: "realizar inspeccion de la embarcacion gc38 11",
      },
    ]);
  });
});

describe("countVehicleMotiveReports", () => {
  it("counts vehicle motives by report and ignores duplicated motives in the same report", () => {
    const reportIds = Array.from({ length: 16 }, (_, index) => `report-${index + 1}`);
    const motives = [
      ...reportIds.slice(0, 6).map((reporte_id) => ({
        reporte_id,
        motivo: "Control de narcotráfico",
        motivo_key: "control de narcotrafico",
      })),
      {
        reporte_id: reportIds[0],
        motivo: "Control de narcotráfico",
        motivo_key: "control de narcotrafico",
      },
      {
        reporte_id: reportIds[0],
        motivo: "Pesca ilegal",
        motivo_key: "pesca ilegal",
      },
      {
        reporte_id: reportIds[6],
        motivo: "Pesca ilegal",
        motivo_key: "pesca ilegal",
      },
      {
        reporte_id: reportIds[7],
        motivo: "PATRULLAJE PARA EL CONTROL PESCA ILEGAL",
        motivo_key: null,
      },
      {
        reporte_id: reportIds[8],
        motivo: "Protección a bañistas",
        motivo_key: "proteccion a banistas",
      },
      {
        reporte_id: reportIds[9],
        motivo: "Protección de bañistas",
        motivo_key: "proteccion de banistas",
      },
      {
        reporte_id: reportIds[9],
        motivo: "Protección a bañistas",
        motivo_key: "proteccion a banistas",
      },
      {
        reporte_id: reportIds[10],
        motivo: "Seguridad ciudadana",
        motivo_key: "seguridad ciudadana",
      },
      {
        reporte_id: reportIds[11],
        motivo: "Control migratorio",
        motivo_key: "control migratorio",
      },
      {
        reporte_id: reportIds[12],
        motivo: "Control migración ilegal",
        motivo_key: "control migracion ilegal",
      },
    ];

    expect(countVehicleMotiveReports(motives)).toEqual({
      controlNarcotrafico: 6,
      controlMigracionIlegal: 2,
      seguridadCiudadana: 1,
      proteccionBanistas: 2,
      pescaIlegal: 3,
    });
  });
});

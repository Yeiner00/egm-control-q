import { describe, expect, it } from "vitest";
import { normalizeMotiveKey, normalizeMotives } from "./motives";

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
});

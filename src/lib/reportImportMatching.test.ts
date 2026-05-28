import { describe, expect, it } from "vitest";
import { matchImportOfficer, splitImportPersonNames, splitImportPersonNamesDetailed } from "./reportImportMatching";

describe("reportImportMatching", () => {
  it("splits companions with commas, y separators, ranks, and punctuation", () => {
    expect(
      splitImportPersonNames(
        "ACOMPAÑANTES: Subintendente Jorge Gonzalez Barrantes, Agente Luis Carlos Gonzalez Jarquin y Agente Alfonso Noguera Corrales.",
      ),
    ).toEqual([
      "Jorge Gonzalez Barrantes",
      "Luis Carlos Gonzalez Jarquin",
      "Alfonso Noguera Corrales",
    ]);
  });

  it("splits concatenated catalog names when a comma is missing", () => {
    expect(
      splitImportPersonNames(
        "ACOMPANANTES: Subintendente Jorge Gonzalez Barrantes, agente Yeiner Castro Alvarez Cesar Alvarez Martines",
      ),
    ).toEqual([
      "Jorge Gonzalez Barrantes",
      "Yeiner Castro Alvarez",
      "Cesar Alvarez Martines",
    ]);
  });

  it("preserves unknown names between known officers", () => {
    expect(
      splitImportPersonNames(
        "Cesar Alvarez Martinez.. Mambo Nunez Yeiner Castro",
      ),
    ).toEqual([
      "Cesar Alvarez Martinez",
      "Mambo Nunez",
      "Yeiner Castro",
    ]);
  });

  it("deduplicates repeated names and reports the duplicate", () => {
    expect(
      splitImportPersonNamesDetailed(
        "Cesar Alvarez Martinez, Cesar Alvarez Martinez, Yeiner Castro",
      ),
    ).toEqual({
      names: ["Cesar Alvarez Martinez", "Yeiner Castro"],
      duplicates: ["Cesar Alvarez Martinez"],
    });
  });

  it("uses cedula as level zero with confidence 1", () => {
    const result = matchImportOfficer("AGENTE JOEL MORA ESTRADAA", undefined, "604640540");

    expect(result.match).toMatchObject({
      nombre: "Joel Mora Estrada",
      cedula: "604640540",
      confidence: 1,
      level: "cedula",
      needsReview: false,
    });
  });

  it("keeps fuzzy Gonzalez versus Gonzales matches in review", () => {
    const result = matchImportOfficer("Jorge Gonzales Barrantes");

    expect(result.match).toMatchObject({
      nombre: "Jorge Gonzalez Barrantes",
      level: "fuzzy",
      needsReview: true,
    });
    expect(result.match?.confidence).toBeLessThan(0.95);
  });
});

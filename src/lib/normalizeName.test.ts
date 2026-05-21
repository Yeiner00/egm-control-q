import { describe, expect, it } from "vitest";
import { normalizeName, normalizeNameList, splitPersonNames } from "./normalizeName";

describe("normalizeName", () => {
  it("removes rank prefixes, accents, punctuation, and applies title case", () => {
    expect(normalizeName("S Int Michael Rojas Brenes")).toBe("Michael Rojas Brenes");
    expect(normalizeName("Agente jorge gonzalez barrantes.")).toBe("Jorge Gonzalez Barrantes");
    expect(normalizeName("Cmdt. Randall Mena Villavicencio")).toBe("Randall Mena Villavicencio");
  });

  it("splits multiple people joined by conjunctions or repeated rank prefixes", () => {
    expect(splitPersonNames("Jorge Gonzalez Barrantes Y Agente Luis Carlos Gonzalez Jarquin.")).toEqual([
      "Jorge Gonzalez Barrantes",
      "Luis Carlos Gonzalez Jarquin",
    ]);
    expect(splitPersonNames("Alfonso Noguera Corrales Agente Joel Mora Estrada")).toEqual([
      "Alfonso Noguera Corrales",
      "Joel Mora Estrada",
    ]);
  });

  it("deduplicates normalized person lists", () => {
    expect(normalizeNameList(["S Int Jorge Gonzalez Barrantes", "Jorge Gonzalez Barrantes."])).toEqual([
      "Jorge Gonzalez Barrantes",
    ]);
  });
});

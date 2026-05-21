import { describe, expect, it } from "vitest";
import { findOfficerByName, mergeOfficerOptions } from "./officers";

describe("officers", () => {
  it("finds officers ignoring accents and casing", () => {
    expect(findOfficerByName("yeiner castro alvarez")?.identificacion).toBe("603830474");
    expect(findOfficerByName("JOSUE ACEVEDO RIOS")?.identificacion).toBe("603290196");
  });

  it("returns null identification when the officer has no id", () => {
    expect(findOfficerByName("Luis Carlos Gonzalez Jarquin")?.identificacion).toBeNull();
  });

  it("merges officer options without duplicating equivalent names", () => {
    expect(mergeOfficerOptions(["Yeiner Castro Alvarez", "Persona Externa"])).toEqual(
      expect.arrayContaining(["Yeiner Castro Alvarez", "Persona Externa"]),
    );
    expect(mergeOfficerOptions(["Yeiner Castro Alvarez"]).filter((name) => name.includes("Yeiner"))).toHaveLength(1);
  });

  it("normalizes common extracted rank prefixes and one-letter typos to known officers", () => {
    expect(findOfficerByName("S Int Jorge Gonzales Barrantes")?.nombre).toBe("Jorge Gonzalez Barrantes");
    expect(findOfficerByName("Jprge Gonzales Barrantes")?.nombre).toBe("Jorge Gonzalez Barrantes");
    expect(findOfficerByName("Cmdt. Cesar Alvares Martinez")?.nombre).toBe("Cesar Alvarez Martinez");
    expect(findOfficerByName("Luis Gonzales Jarquin")?.nombre).toBe("Luis Carlos Gonzalez Jarquin");
    expect(findOfficerByName("Obed Vasques Chavez")?.nombre).toBe("Obed Vasquez Chaves");
    expect(findOfficerByName("Obed Vazquez Chavez")?.nombre).toBe("Obed Vasquez Chaves");
    expect(findOfficerByName("Randall Mena Villavicencion")?.nombre).toBe("Randall Mena Villavicencio");
  });
});

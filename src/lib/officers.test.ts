import { describe, expect, it } from "vitest";
import { findOfficerByName, mergeOfficerOptions } from "./officers";

describe("officers", () => {
  it("finds officers ignoring accents and casing", () => {
    expect(findOfficerByName("yeiner castro alvarez")?.identificacion).toBe("603830474");
    expect(findOfficerByName("JOSUE ACEVEDO RIOS")?.identificacion).toBe("603290196");
  });

  it("returns null identification when the officer has no id", () => {
    expect(findOfficerByName("Luis Carlos González Jarquin")?.identificacion).toBeNull();
  });

  it("merges officer options without duplicating equivalent names", () => {
    expect(mergeOfficerOptions(["Yeiner Castro Alvarez", "Persona Externa"])).toEqual(
      expect.arrayContaining(["Yeiner Castro Álvarez", "Persona Externa"]),
    );
    expect(mergeOfficerOptions(["Yeiner Castro Alvarez"]).filter((name) => name.includes("Yeiner"))).toHaveLength(1);
  });
});

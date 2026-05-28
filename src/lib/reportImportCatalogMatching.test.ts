import { describe, expect, it } from "vitest";
import { DEFAULT_IMPORT_REPORT_CATALOGS, matchImportCatalogValue } from "./reportImportCatalogMatching";

describe("matchImportCatalogValue", () => {
  it("matches seeded site aliases exactly", () => {
    const { match } = matchImportCatalogValue("site", "Playa Rajada", DEFAULT_IMPORT_REPORT_CATALOGS);

    expect(match).toMatchObject({
      label: "Rajada",
      confidence: 1,
      level: "alias",
      needsReview: false,
    });
  });

  it("keeps looking when an older duplicate alias points to a missing item", () => {
    const { match } = matchImportCatalogValue("site", "Puerto Soley", {
      ...DEFAULT_IMPORT_REPORT_CATALOGS,
      sites: {
        items: [
          {
            id: "site-playa-puerto-soley",
            label: "Playa Puerto Soley",
            normalized: "playa puerto soley",
            zona: "1B",
            posicion: "11N",
          },
        ],
        aliases: [
          {
            id: "old-alias",
            itemId: "inactive-site",
            itemLabel: null,
            alias: "Puerto Soley",
            normalized: "puerto soley",
          },
          {
            id: "current-alias",
            itemId: "site-playa-puerto-soley",
            itemLabel: "Playa Puerto Soley",
            alias: "Puerto Soley",
            normalized: "puerto soley",
          },
        ],
      },
    });

    expect(match).toMatchObject({
      itemId: "site-playa-puerto-soley",
      label: "Playa Puerto Soley",
      confidence: 1,
      level: "alias",
      needsReview: false,
    });
  });

  it("keeps probable site variants in review", () => {
    const { match } = matchImportCatalogValue("site", "Sector Rajada", {
      ...DEFAULT_IMPORT_REPORT_CATALOGS,
      sites: {
        ...DEFAULT_IMPORT_REPORT_CATALOGS.sites,
        aliases: [],
      },
    });

    expect(match).toMatchObject({
      label: "Rajada",
      level: "fuzzy",
      needsReview: true,
    });
    expect(match?.confidence).toBeLessThan(0.95);
  });

  it("uses local motive rules before fuzzy matching", () => {
    const { match } = matchImportCatalogValue("motive", "Patrullaje seguridad cuidadana", DEFAULT_IMPORT_REPORT_CATALOGS);

    expect(match).toMatchObject({
      label: "Seguridad ciudadana",
      level: "rule",
      needsReview: false,
    });
  });

  it("does not treat one-off boat inspection text as a catalog motive", () => {
    const { match, candidates } = matchImportCatalogValue(
      "motive",
      "Realizar inspeccion de la embarcacion GC38-11",
      DEFAULT_IMPORT_REPORT_CATALOGS,
    );

    expect(match).toBeNull();
    expect(candidates).toEqual([]);
  });

  it("leaves unknown catalog values unresolved", () => {
    const { match, candidates } = matchImportCatalogValue("motive", "Actividad totalmente nueva", DEFAULT_IMPORT_REPORT_CATALOGS);

    expect(match).toBeNull();
    expect(candidates).toEqual([]);
  });
});

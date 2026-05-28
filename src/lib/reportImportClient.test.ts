import { describe, expect, it } from "vitest";
import { buildAliasSuggestionsFromFields, buildCatalogSuggestionsFromFields, buildPersonSuggestionsFromFields } from "./reportImportClient";
import type { ReportImportField } from "./reportImportSchema";

const personField = (overrides: Partial<ReportImportField>): ReportImportField => ({
  fieldKey: "acompanantes.0",
  label: "Acompanante",
  kind: "person",
  rawValue: "Mambo Nunez",
  normalizedValue: "mambo nunez",
  finalValue: null,
  cellAddress: "B15",
  source: "manual",
  confidence: 1,
  status: "accepted",
  metadata: {},
  ...overrides,
});

const catalogField = (overrides: Partial<ReportImportField>): ReportImportField => ({
  fieldKey: "sitios_visitados.0",
  label: "Sitio visitado",
  kind: "catalog",
  rawValue: "Playa Rajada",
  normalizedValue: "playa rajada",
  finalValue: "Rajada",
  cellAddress: "I9",
  source: "manual",
  confidence: 1,
  status: "accepted",
  metadata: {
    catalogType: "site",
    catalogAction: "accepted_suggestion",
    siteZona: "1B",
    sitePosicion: "11N",
  },
  ...overrides,
});

describe("reportImportClient", () => {
  it("builds person suggestions for unknown decisions without creating aliases", () => {
    const fields = [
      personField({
        finalValue: "Mambo Nunez",
        metadata: {
          personAction: "created_new_officer",
          officerCedula: "123456789",
        },
      }),
    ];

    expect(buildPersonSuggestionsFromFields(fields)).toEqual([
      {
        rawName: "Mambo Nunez",
        normalizedName: "mambo nunez",
        finalName: "Mambo Nunez",
        officerCedula: "123456789",
        fieldKey: "acompanantes.0",
        action: "created_new_officer",
      },
    ]);
    expect(buildAliasSuggestionsFromFields(fields)).toEqual([]);
  });

  it("builds alias and person suggestions when manually linking an existing officer", () => {
    const fields = [
      personField({
        rawValue: "Cesar Alvarez Martines",
        finalValue: "Cesar Alvarez Martinez",
        metadata: {
          personAction: "linked_existing",
          officerCedula: "208066620",
        },
      }),
    ];

    expect(buildAliasSuggestionsFromFields(fields)).toEqual([
      {
        rawAlias: "Cesar Alvarez Martines",
        normalizedAlias: "cesar alvarez martines",
        officerCedula: "208066620",
        fieldKey: "acompanantes.0",
      },
    ]);
    expect(buildPersonSuggestionsFromFields(fields)).toEqual([
      {
        rawName: "Cesar Alvarez Martines",
        normalizedName: "cesar alvarez martines",
        finalName: "Cesar Alvarez Martinez",
        officerCedula: "208066620",
        fieldKey: "acompanantes.0",
        action: "linked_existing",
      },
    ]);
  });

  it("builds catalog suggestions for confirmed site aliases", () => {
    expect(buildCatalogSuggestionsFromFields([catalogField({})])).toEqual([
      {
        catalogType: "site",
        rawValue: "Playa Rajada",
        normalizedValue: "playa rajada",
        finalValue: "Rajada",
        fieldKey: "sitios_visitados.0",
        action: "accepted_suggestion",
        zona: "1B",
        posicion: "11N",
      },
    ]);
  });
});

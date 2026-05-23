import { describe, expect, it } from "vitest";
import { normalizeReportText, normalizedReportTextOrNull } from "./reportText";

describe("reportText", () => {
  it("normalizes uppercase report labels using Spanish title casing", () => {
    expect(normalizeReportText("SECTOR NORTE DE LA ESTACION")).toBe("Sector Norte de la Estacion");
    expect(normalizeReportText("BAJOS DE RAJADA")).toBe("Bajos de Rajada");
    expect(normalizeReportText("GASOLINA")).toBe("Gasolina");
    expect(normalizeReportText("MURCIELAGO")).toBe("Murcielago");
  });

  it("keeps punctuation and short legal suffixes readable", () => {
    expect(normalizeReportText("DIST. GRACIA MARTINEZ S.A.")).toBe("Dist. Gracia Martinez S.A.");
    expect(normalizeReportText("PLAYA 4X4")).toBe("Playa 4x4");
  });

  it("returns null for blank nullable report text", () => {
    expect(normalizedReportTextOrNull("   ")).toBeNull();
  });
});

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportCatalogAdmin from "./ReportCatalogAdmin";
import {
  approveOfficerAliasSuggestion,
  loadReportCatalogAdminData,
  rejectOfficerAliasSuggestion,
  saveCatalogAlias,
  saveCatalogMotive,
  saveCatalogOfficer,
  saveCatalogSite,
  setCatalogAliasStatus,
  setCatalogMotiveActive,
  updateCatalogSuggestionStatus,
} from "@/lib/reportCatalogAdmin";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/reportCatalogAdmin", () => ({
  approveOfficerAliasSuggestion: vi.fn().mockResolvedValue(undefined),
  loadReportCatalogAdminData: vi.fn(),
  rejectOfficerAliasSuggestion: vi.fn().mockResolvedValue(undefined),
  saveCatalogAlias: vi.fn().mockResolvedValue(undefined),
  saveCatalogMotive: vi.fn().mockResolvedValue(undefined),
  saveCatalogOfficer: vi.fn().mockResolvedValue(undefined),
  saveCatalogSite: vi.fn().mockResolvedValue(undefined),
  setCatalogAliasStatus: vi.fn().mockResolvedValue(undefined),
  setCatalogMotiveActive: vi.fn().mockResolvedValue(undefined),
  setCatalogOfficerActive: vi.fn().mockResolvedValue(undefined),
  setCatalogSiteActive: vi.fn().mockResolvedValue(undefined),
  updateCatalogSuggestionStatus: vi.fn().mockResolvedValue(undefined),
  updatePersonSuggestionStatus: vi.fn().mockResolvedValue(undefined),
}));

const catalogData = {
  officers: [
    {
      id: "officer-1",
      nombre: "Joel Mora Estrada",
      cedula: "604640540",
      nombre_normalizado: "joel mora estrada",
      active: true,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      aliases: [
        {
          id: "alias-1",
          officer_id: "officer-1",
          alias: "joel mora",
          alias_normalizado: "joel mora",
          status: "active",
          source: "manual",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ],
    },
  ],
  motives: [
    {
      id: "motive-1",
      motivo: "Pesca ilegal",
      motivo_key: "pesca ilegal",
      active: true,
      created_by: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      aliases: [],
    },
  ],
  sites: [
    {
      id: "site-1",
      nombre_sitio: "Rajada",
      site_key: "rajada",
      zona: "1B",
      posicion: "11 N",
      active: true,
      created_by: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      aliases: [],
    },
  ],
  aliasSuggestions: [
    {
      id: "suggestion-1",
      job_id: "job-1",
      field_id: null,
      field_key: "chofer",
      officer_id: "officer-1",
      raw_alias: "J Mora",
      normalized_alias: "j mora",
      suggested_by: "user-1",
      status: "pending",
      created_at: "2026-01-01T00:00:00Z",
      reviewed_at: null,
      reviewed_by: null,
      officerName: "Joel Mora Estrada",
      officerCedula: "604640540",
    },
  ],
  personSuggestions: [],
  catalogSuggestions: [
    {
      id: "catalog-suggestion-1",
      job_id: "job-1",
      field_id: null,
      field_key: "motivos.0",
      catalog_type: "motive",
      catalog_item_id: "motive-1",
      raw_value: "Piratria",
      normalized_value: "piratria",
      final_value: "Pirateria",
      action_taken: "accepted_suggestion",
      suggested_by: "user-1",
      status: "active",
      metadata: {},
      created_at: "2026-01-01T00:00:00Z",
      reviewed_at: null,
      reviewed_by: null,
      catalogLabel: "Pirateria",
    },
  ],
  audit: [],
};

const renderAdmin = async () => {
  const onCatalogsChanged = vi.fn().mockResolvedValue(undefined);
  render(<ReportCatalogAdmin onCatalogsChanged={onCatalogsChanged} />);
  await screen.findByText("Joel Mora Estrada");
  return { onCatalogsChanged };
};

const selectTab = async (name: RegExp) => {
  const tab = screen.getByRole("tab", { name });
  fireEvent.keyDown(tab, { key: "Enter" });
  fireEvent.click(tab);
};

describe("ReportCatalogAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadReportCatalogAdminData).mockResolvedValue(catalogData);
  });

  it("adds a new motive and refreshes shared options", async () => {
    const { onCatalogsChanged } = await renderAdmin();

    await selectTab(/motivos/i);
    await screen.findByRole("button", { name: /agregar motivo/i });
    fireEvent.click(screen.getByRole("button", { name: /agregar motivo/i }));
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Coyotaje" } });
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => {
      expect(saveCatalogMotive).toHaveBeenCalledWith({
        motivo: "Coyotaje",
        active: true,
      });
    });
    expect(onCatalogsChanged).toHaveBeenCalled();
  });

  it("adds a site with optional zone and position", async () => {
    await renderAdmin();

    await selectTab(/sitios/i);
    await screen.findByRole("button", { name: /agregar sitio/i });
    fireEvent.click(screen.getByRole("button", { name: /agregar sitio/i }));
    fireEvent.change(screen.getByLabelText("Sitio"), { target: { value: "Playa Nueva" } });
    fireEvent.change(screen.getByLabelText("Zona"), { target: { value: "1B" } });
    fireEvent.change(screen.getByLabelText("Posicion"), { target: { value: "10 N" } });
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => {
      expect(saveCatalogSite).toHaveBeenCalledWith({
        nombre_sitio: "Playa Nueva",
        zona: "1B",
        posicion: "10 N",
        active: true,
      });
    });
  });

  it("adds an officer and creates aliases from a catalog row", async () => {
    await renderAdmin();

    fireEvent.click(screen.getByRole("button", { name: /agregar oficial/i }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Mambo Nunez" } });
    fireEvent.change(screen.getByLabelText("Cedula"), { target: { value: "123456789" } });
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => {
      expect(saveCatalogOfficer).toHaveBeenCalledWith({
        nombre: "Mambo Nunez",
        cedula: "123456789",
        active: true,
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /^alias$/i }));
    fireEvent.change(screen.getByLabelText("Alias"), { target: { value: "Mambo" } });
    fireEvent.click(screen.getByRole("button", { name: /^guardar$/i }));

    await waitFor(() => {
      expect(saveCatalogAlias).toHaveBeenCalledWith({
        type: "officer",
        targetId: "officer-1",
        alias: "Mambo",
        status: "active",
      });
    });
  });

  it("deactivates existing aliases and motives instead of deleting", async () => {
    await renderAdmin();

    fireEvent.click(screen.getByLabelText(/desactivar alias joel mora/i));
    await waitFor(() => {
      expect(setCatalogAliasStatus).toHaveBeenCalledWith("officer", "alias-1", "inactive");
    });

    await selectTab(/motivos/i);
    await screen.findByText("Pesca ilegal");
    const motiveRow = screen.getByText("Pesca ilegal").closest("div")?.parentElement?.parentElement;
    if (!motiveRow) throw new Error("Motive row not found");
    fireEvent.click(within(motiveRow).getByRole("button", { name: /desactivar/i }));

    await waitFor(() => {
      expect(setCatalogMotiveActive).toHaveBeenCalledWith("motive-1", false);
    });
  });

  it("approves alias suggestions and marks catalog history reviewed", async () => {
    await renderAdmin();

    await selectTab(/sugerencias/i);
    await screen.findByText("J Mora");
    fireEvent.click(screen.getByRole("button", { name: /^aprobar$/i }));

    await waitFor(() => {
      expect(approveOfficerAliasSuggestion).toHaveBeenCalledWith(expect.objectContaining({
        id: "suggestion-1",
        raw_alias: "J Mora",
      }));
    });

    fireEvent.click(screen.getByRole("button", { name: /^revisada$/i }));
    await waitFor(() => {
      expect(updateCatalogSuggestionStatus).toHaveBeenCalledWith("catalog-suggestion-1", "reviewed");
    });
    expect(rejectOfficerAliasSuggestion).not.toHaveBeenCalled();
  });
});

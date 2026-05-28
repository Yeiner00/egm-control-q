import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReportImportV2 from "./ReportImportV2";
import type { ReportImportDraft } from "@/lib/reportImportSchema";

const reportImportClientMocks = vi.hoisted(() => ({
  uploadReportImportFile: vi.fn(),
  buildAliasSuggestionsFromFields: vi.fn(() => []),
  buildPersonSuggestionsFromFields: vi.fn(() => []),
  buildCatalogSuggestionsFromFields: vi.fn(() => []),
  confirmReportImportJob: vi.fn(),
  persistReportImportCatalogDecision: vi.fn().mockResolvedValue({
    catalogItemId: "catalog-item-1",
    catalogLabel: "Rajada",
    aliasSaved: true,
  }),
}));

vi.mock("@/lib/reportImportClient", () => reportImportClientMocks);

vi.mock("@/lib/reportPersistence", () => ({
  createBoatReport: vi.fn(),
  createVehicleReport: vi.fn(),
}));

vi.mock("@/lib/report-utils", () => ({
  mapToVehicleFormData: (data: Record<string, unknown>) => ({
    no_reporte: String(data.no_reporte || ""),
    bitacora: "",
    fecha: String(data.fecha || ""),
    hora_salida: "",
    hora_regreso: "",
    estacion: String(data.estacion || ""),
    vehiculo: String(data.vehiculo || ""),
    destino: "",
    motivos: Array.isArray(data.motivos) ? data.motivos.map(String) : [],
    chofer: "",
    chofer_cedula: "",
    acompanantes: Array.isArray(data.acompanantes) ? data.acompanantes.map(String) : [],
    oficial_a_cargo: "",
    oficial_a_cargo_cedula: "",
    sitios_visitados: Array.isArray(data.sitios_visitados) ? data.sitios_visitados : [],
    estacion_combustible: "",
    lugar_combustible: "",
    cedula_juridica_combustible: "",
    no_factura: "",
    combustible_trasegado_bomba: null,
    total_combustible_antes_viaje: null,
    combustible_gastado: null,
    saldo_combustible_despues_viaje: null,
    kilometros_recorridos: null,
    novedades: "",
  }),
  mapToBoatFormData: () => ({}),
}));

vi.mock("@/lib/officers", () => ({
  findOfficerByName: (name: string) =>
    name ? { nombre: name, identificacion: "123456789" } : null,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/estadisticas/VehicleReportForm", () => ({
  default: ({ data }: { data: { motivos?: string[]; acompanantes?: string[]; sitios_visitados?: Array<{ nombre_sitio: string }> } }) => (
    <div data-testid="vehicle-form">
      <div data-testid="vehicle-motives">{(data.motivos || []).join("|")}</div>
      <div data-testid="vehicle-people">{(data.acompanantes || []).join("|")}</div>
      <div data-testid="vehicle-sites">{(data.sitios_visitados || []).map((site) => site.nombre_sitio).join("|")}</div>
    </div>
  ),
}));

vi.mock("@/components/estadisticas/BoatReportForm", () => ({
  default: () => <div data-testid="boat-form" />,
}));

const unknownPersonDraft: ReportImportDraft = {
  jobId: "job-1",
  fileName: "reporte.xlsx",
  reportType: "vehiculo",
  status: "review_required",
  storagePath: null,
  fields: [
    {
      fieldKey: "acompanantes.0",
      label: "Acompanante",
      kind: "person",
      rawValue: "Mambo Nunez",
      normalizedValue: "mambo nunez",
      finalValue: null,
      cellAddress: "C9",
      source: "local",
      confidence: 0.79,
      status: "rejected",
      metadata: {
        resolutionType: "unknown_person",
      },
    },
  ],
  extractedData: {
    no_reporte: "0010",
    fecha: "2026-01-01",
    estacion: "Murcielago",
    vehiculo: "SNG-08",
    acompanantes: ["Mambo Nunez"],
  },
};

const catalogDraft: ReportImportDraft = {
  jobId: "job-catalog",
  fileName: "reporte-catalogo.xlsx",
  reportType: "vehiculo",
  status: "review_required",
  storagePath: null,
  fields: [
    {
      fieldKey: "sitios_visitados.0",
      label: "Sitio visitado",
      kind: "catalog",
      rawValue: "Sector Rajada",
      normalizedValue: "sector rajada",
      finalValue: "Rajada",
      cellAddress: "I9",
      source: "local",
      confidence: 0.9,
      status: "needs_review",
      metadata: {
        catalogType: "site",
        listIndex: 0,
        match: {
          label: "Rajada",
          confidence: 0.9,
          level: "fuzzy",
          needsReview: true,
          zona: "1B",
          posicion: "11N",
        },
      },
    },
  ],
  extractedData: {
    no_reporte: "0011",
    fecha: "2026-01-01",
    estacion: "Murcielago",
    vehiculo: "SNG-08",
    sitios_visitados: [{ nombre_sitio: "Rajada", zona: "1B", posicion: "11N" }],
  },
};

const motiveOmitShiftDraft: ReportImportDraft = {
  jobId: "job-motives",
  fileName: "reporte-motivos.xlsx",
  reportType: "vehiculo",
  status: "review_required",
  storagePath: null,
  fields: [
    {
      fieldKey: "motivos.2",
      label: "Motivo",
      kind: "catalog",
      rawValue: "Piratria",
      normalizedValue: "piratria",
      finalValue: "Pirateria",
      cellAddress: "F8",
      source: "local",
      confidence: 0.89,
      status: "needs_review",
      metadata: {
        catalogType: "motive",
        listIndex: 2,
        match: { label: "Pirateria", confidence: 0.89, level: "fuzzy", needsReview: true },
      },
    },
    {
      fieldKey: "motivos.4",
      label: "Motivo",
      kind: "catalog",
      rawValue: "Coyotaje",
      normalizedValue: "coyotaje",
      finalValue: null,
      cellAddress: "F8",
      source: "local",
      confidence: 0,
      status: "rejected",
      metadata: {
        catalogType: "motive",
        listIndex: 4,
      },
    },
  ],
  extractedData: {
    no_reporte: "0010",
    fecha: "2026-02-22",
    estacion: "Murcielago",
    vehiculo: "GC38-22",
    motivos: [
      "Inspección de embarcación",
      "Pesca ilegal",
      "Pirateria",
      "Control de narcotráfico",
      "Coyotaje",
      "Reafirmación de soberanía",
    ],
  },
};

const siteOmitShiftDraft: ReportImportDraft = {
  jobId: "job-sites",
  fileName: "reporte-sitios.xlsx",
  reportType: "vehiculo",
  status: "review_required",
  storagePath: null,
  fields: [
    {
      fieldKey: "sitios_visitados.1",
      label: "Sitio visitado",
      kind: "catalog",
      rawValue: "Sitio Inventado Uno",
      normalizedValue: "sitio inventado uno",
      finalValue: null,
      cellAddress: "I10",
      source: "local",
      confidence: 0,
      status: "rejected",
      metadata: { catalogType: "site", listIndex: 1 },
    },
    {
      fieldKey: "sitios_visitados.2",
      label: "Sitio visitado",
      kind: "catalog",
      rawValue: "Sitio Inventado Dos",
      normalizedValue: "sitio inventado dos",
      finalValue: null,
      cellAddress: "I11",
      source: "local",
      confidence: 0,
      status: "rejected",
      metadata: { catalogType: "site", listIndex: 2 },
    },
  ],
  extractedData: {
    no_reporte: "0012",
    fecha: "2026-02-22",
    estacion: "Murcielago",
    vehiculo: "SNG-08",
    sitios_visitados: [
      { nombre_sitio: "Rajada", zona: "1B", posicion: "" },
      { nombre_sitio: "Sitio Inventado Uno", zona: "", posicion: "" },
      { nombre_sitio: "Sitio Inventado Dos", zona: "", posicion: "" },
      { nombre_sitio: "Soley", zona: "1B", posicion: "" },
    ],
  },
};

const peopleOmitDraft: ReportImportDraft = {
  jobId: "job-people",
  fileName: "reporte-personas.xlsx",
  reportType: "vehiculo",
  status: "review_required",
  storagePath: null,
  fields: [
    {
      fieldKey: "acompanantes.0",
      label: "Acompanante",
      kind: "person",
      rawValue: "Mambo Nunez",
      normalizedValue: "mambo nunez",
      finalValue: null,
      cellAddress: "B15",
      source: "local",
      confidence: 0,
      status: "rejected",
      metadata: { resolutionType: "unknown_person", groupKey: "acompanantes" },
    },
    {
      fieldKey: "acompanantes.2",
      label: "Acompanante",
      kind: "person",
      rawValue: "Otro Inventado",
      normalizedValue: "otro inventado",
      finalValue: null,
      cellAddress: "B15",
      source: "local",
      confidence: 0,
      status: "rejected",
      metadata: { resolutionType: "unknown_person", groupKey: "acompanantes" },
    },
  ],
  extractedData: {
    no_reporte: "0013",
    fecha: "2026-02-22",
    estacion: "Murcielago",
    vehiculo: "SNG-08",
    acompanantes: ["Mambo Nunez", "Cesar Alvarez Martinez", "Otro Inventado"],
  },
};

const renderImportedDraft = async (draft: ReportImportDraft = unknownPersonDraft) => {
  reportImportClientMocks.uploadReportImportFile.mockResolvedValueOnce(draft);
  render(<ReportImportV2 peopleOptions={["Obed Vasquez Chaves", "Cesar Alvarez Martinez"]} />);

  const input = document.querySelector("input[type='file']") as HTMLInputElement;
  const file = new File(["excel"], "reporte.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  fireEvent.change(input, { target: { files: [file] } });
  await screen.findByText("Mambo Nunez no esta en el catalogo. Que desea hacer?");
};

describe("ReportImportV2 unknown person actions", () => {
  beforeEach(() => {
    reportImportClientMocks.uploadReportImportFile.mockReset();
    reportImportClientMocks.persistReportImportCatalogDecision.mockClear();
  });

  it("starts with clear decision buttons instead of showing inputs by default", async () => {
    await renderImportedDraft();

    expect(screen.getByRole("button", { name: /vincular a oficial existente/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /agregar como agente nuevo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /guardar como persona sin cedula/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^omitir$/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /vincular mambo nunez/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/cedula del agente nuevo/i)).not.toBeInTheDocument();
  });

  it("expands only the selected decision details", async () => {
    await renderImportedDraft();

    fireEvent.click(screen.getByRole("button", { name: /vincular a oficial existente/i }));
    expect(screen.getByRole("combobox", { name: /vincular mambo nunez/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmar vinculacion/i })).toBeDisabled();
    expect(screen.queryByPlaceholderText(/cedula del agente nuevo/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: /vincular mambo nunez/i }), {
      target: { value: "Obed Vasquez Chaves" },
    });
    expect(screen.getByRole("button", { name: /confirmar vinculacion/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /agregar como agente nuevo/i }));
    expect(screen.queryByRole("combobox", { name: /vincular mambo nunez/i })).not.toBeInTheDocument();
    const cedulaInput = screen.getByPlaceholderText(/cedula del agente nuevo/i);
    const addOfficerButton = screen.getByRole("button", { name: /agregar agente nuevo/i });
    expect(cedulaInput).toBeInTheDocument();
    expect(addOfficerButton).toBeDisabled();

    fireEvent.change(cedulaInput, { target: { value: "604640540" } });
    expect(addOfficerButton).toBeEnabled();
  });

  it("direct actions resolve the pending field", async () => {
    await renderImportedDraft();

    fireEvent.click(screen.getByRole("button", { name: /guardar como persona sin cedula/i }));

    await waitFor(() => {
      expect(screen.getByText("Sin campos por revisar")).toBeInTheDocument();
    });
    expect(screen.queryByText("Mambo Nunez no esta en el catalogo. Que desea hacer?")).not.toBeInTheDocument();
  });
});

describe("ReportImportV2 catalog actions", () => {
  beforeEach(() => {
    reportImportClientMocks.uploadReportImportFile.mockReset();
  });

  it("shows clear decisions for probable catalog matches", async () => {
    reportImportClientMocks.uploadReportImportFile.mockResolvedValueOnce(catalogDraft);
    render(<ReportImportV2 siteOptions={[{ nombre_sitio: "Rajada", zona: "1B", posicion: "11N" }]} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["excel"], "reporte-catalogo.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText("Sector Rajada parece coincidir con Rajada. Que desea hacer?");
    expect(screen.getByRole("button", { name: /aceptar sugerencia/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /vincular a existente/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /agregar nuevo/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /aceptar sugerencia/i }));

    await waitFor(() => {
      expect(reportImportClientMocks.persistReportImportCatalogDecision).toHaveBeenCalledWith({
        catalogType: "site",
        rawValue: "Sector Rajada",
        finalValue: "Rajada",
        action: "accepted_suggestion",
        catalogItemId: null,
        zona: "1B",
        posicion: "11N",
      });
      expect(screen.getByText("Sin campos por revisar")).toBeInTheDocument();
    });
  });

  it("persists linked existing catalog values before resolving the field", async () => {
    reportImportClientMocks.persistReportImportCatalogDecision.mockResolvedValueOnce({
      catalogItemId: "site-1",
      catalogLabel: "Rajada",
      aliasSaved: true,
    });
    reportImportClientMocks.uploadReportImportFile.mockResolvedValueOnce(siteOmitShiftDraft);
    render(<ReportImportV2 siteOptions={[{ id: "site-1", nombre_sitio: "Rajada", zona: "1B", posicion: "11N" }]} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["excel"], "reporte-sitios.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText("Sitio Inventado Uno no esta en el catalogo. Que desea hacer?");
    fireEvent.click(screen.getAllByRole("button", { name: /vincular a existente/i })[0]);
    fireEvent.change(screen.getByRole("combobox", { name: /vincular sitio inventado uno/i }), {
      target: { value: "Rajada" },
    });
    fireEvent.click(screen.getByRole("button", { name: /confirmar vinculacion/i }));

    await waitFor(() => {
      expect(reportImportClientMocks.persistReportImportCatalogDecision).toHaveBeenCalledWith({
        catalogType: "site",
        rawValue: "Sitio Inventado Uno",
        finalValue: "Rajada",
        action: "linked_existing",
        catalogItemId: null,
        zona: "1B",
        posicion: "11N",
      });
    });
    expect(screen.getByTestId("vehicle-sites")).toHaveTextContent("Rajada|Sitio Inventado Dos|Soley");
  });

  it("omits motive review fields by value without deleting the shifted next motive", async () => {
    reportImportClientMocks.uploadReportImportFile.mockResolvedValueOnce(motiveOmitShiftDraft);
    render(<ReportImportV2 />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["excel"], "reporte-motivos.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText("Piratria parece coincidir con Pirateria. Que desea hacer?");
    const omitButtons = screen.getAllByRole("button", { name: /^omitir$/i });
    fireEvent.click(omitButtons[0]);

    await screen.findByText("Coyotaje no esta en el catalogo. Que desea hacer?");
    fireEvent.click(screen.getByRole("button", { name: /^omitir$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("vehicle-motives")).toHaveTextContent(
        "Inspección de embarcación|Pesca ilegal|Control de narcotráfico|Reafirmación de soberanía",
      );
    });
  });

  it("omits site review fields by value without deleting a shifted next site", async () => {
    reportImportClientMocks.uploadReportImportFile.mockResolvedValueOnce(siteOmitShiftDraft);
    render(<ReportImportV2 />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["excel"], "reporte-sitios.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText("Sitio Inventado Uno no esta en el catalogo. Que desea hacer?");
    const omitButtons = screen.getAllByRole("button", { name: /^omitir$/i });
    fireEvent.click(omitButtons[0]);

    await screen.findByText("Sitio Inventado Dos no esta en el catalogo. Que desea hacer?");
    fireEvent.click(screen.getByRole("button", { name: /^omitir$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("vehicle-sites")).toHaveTextContent("Rajada|Soley");
    });
  });
});

describe("ReportImportV2 person omit actions", () => {
  beforeEach(() => {
    reportImportClientMocks.uploadReportImportFile.mockReset();
  });

  it("omits person review fields by name without deleting shifted valid people", async () => {
    reportImportClientMocks.uploadReportImportFile.mockResolvedValueOnce(peopleOmitDraft);
    render(<ReportImportV2 />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["excel"], "reporte-personas.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText("Mambo Nunez no esta en el catalogo. Que desea hacer?");
    const omitButtons = screen.getAllByRole("button", { name: /^omitir$/i });
    fireEvent.click(omitButtons[0]);

    await screen.findByText("Otro Inventado no esta en el catalogo. Que desea hacer?");
    fireEvent.click(screen.getByRole("button", { name: /^omitir$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("vehicle-people")).toHaveTextContent("Cesar Alvarez Martinez");
    });
  });
});

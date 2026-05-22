import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ManageReport from "./ManageReport";

const fromMock = vi.hoisted(() => vi.fn());

type QueryState = {
  table: string;
  selected: string;
  filters: Array<{ column: string; value: unknown }>;
};

const boatReport = {
  id: "boat-1",
  no_reporte: "0017",
  anio: 2026,
  fecha: "2026-04-01",
  bitacora: "01",
  folios: "31-32",
  estacion: "MURCIELAGO",
  embarcacion: "GC38-22",
  no_cierre_os: "12",
  hora_salida: "09:30",
  hora_regreso: "13:00",
  horas_navegadas: 3.5,
  horas_motor_babor: 3.4,
  horas_motor_centro: 3.4,
  horas_motor_estribor: 3.4,
  horas_hombre: 7,
  destino: "SECTOR NORTE DE LA ESTACION",
  saldo_anterior: null,
  combustible_trasegado_bodega: null,
  total_antes_viaje: null,
  combustible_trasegado_durante: null,
  combustible_gastado: null,
  saldo_despues: null,
  tipo_combustible: null,
  estacion_combustible: null,
  lugar_combustible: null,
  cedula_juridica_combustible: null,
  no_factura: null,
  millas_nauticas: 27,
  novedades: "Sin novedad",
};

let vehicleUnitsDelay = 0;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const resolveList = async ({ table, selected }: QueryState) => {
  if (table === "reportes_vehiculo" && selected === "vehiculo") {
    await delay(vehicleUnitsDelay);
    return { data: [{ vehiculo: "SNG-08" }, { vehiculo: "SNG-16" }, { vehiculo: "SNG-25" }], error: null };
  }

  if (table === "reportes_embarcacion" && selected === "embarcacion") {
    return { data: [{ embarcacion: "GC38-11" }, { embarcacion: "GC38-22" }], error: null };
  }

  if (table === "reportes_embarcacion" && selected.includes("id, no_reporte")) {
    return {
      data: [
        {
          id: boatReport.id,
          no_reporte: boatReport.no_reporte,
          fecha: boatReport.fecha,
          embarcacion: boatReport.embarcacion,
        },
      ],
      error: null,
    };
  }

  return { data: [], error: null };
};

const resolveSingle = async ({ table, selected }: QueryState) => {
  if (table === "reportes_embarcacion" && selected === "*") {
    return { data: boatReport, error: null };
  }

  if (table === "reportes_embarcacion" && selected.includes("id, no_reporte")) {
    return {
      data: {
        id: boatReport.id,
        no_reporte: boatReport.no_reporte,
        fecha: boatReport.fecha,
        embarcacion: boatReport.embarcacion,
      },
      error: null,
    };
  }

  return { data: null, error: null };
};

const createQuery = (table: string) => {
  const state: QueryState = { table, selected: "*", filters: [] };
  const query = {
    select: vi.fn((selected = "*") => {
      state.selected = selected;
      return query;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters.push({ column, value });
      return query;
    }),
    order: vi.fn(() => query),
    in: vi.fn(() => query),
    single: vi.fn(() => resolveSingle(state)),
    then: (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => resolveList(state).then(resolve, reject),
  };

  return query;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock("@/lib/reportYears", () => ({
  loadAvailableReportYears: vi.fn(() => Promise.resolve(["2026"])),
}));

vi.mock("@/lib/reportPeople", () => ({
  countUniqueNormalizedNames: vi.fn(() => 0),
  deleteReportPeople: vi.fn(() => Promise.resolve()),
  loadPeopleNameOptions: vi.fn(() => Promise.resolve([])),
  loadReportPeopleByIds: vi.fn(() => Promise.resolve(new Map())),
  replaceReportPeople: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/lib/motives", async () => {
  const actual = await vi.importActual<typeof import("@/lib/motives")>("@/lib/motives");

  return {
    ...actual,
    loadMotiveOptions: vi.fn(() => Promise.resolve([])),
  };
});

vi.mock("@/lib/reportSites", async () => {
  const actual = await vi.importActual<typeof import("@/lib/reportSites")>("@/lib/reportSites");

  return {
    ...actual,
    loadSiteOptions: vi.fn(() => Promise.resolve(actual.DEFAULT_REPORT_SITE_OPTIONS)),
  };
});

describe("ManageReport", () => {
  beforeEach(() => {
    vehicleUnitsDelay = 0;
    fromMock.mockImplementation((table: string) => createQuery(table));
  });

  it("renders the report management search filters without crashing", async () => {
    render(<ManageReport />);

    expect(screen.getByText("Consultar, editar o eliminar reportes")).toBeInTheDocument();
    expect(screen.getByText((content) => content.includes("Reporte") && content.startsWith("N"))).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Sin resultado seleccionado")).toBeInTheDocument();
    });
  });

  it("keeps boat unit options when opening a boat report from proposals", async () => {
    vehicleUnitsDelay = 50;

    render(<ManageReport initialSelection={{ tipo: "embarcacion", reportId: "boat-1", nonce: 1 }} />);

    await waitFor(() => {
      expect(screen.getByText("Reporte de Embarcacion - Revisar Datos")).toBeInTheDocument();
    });
    await act(async () => {
      await delay(80);
    });

    const embarcacionLabel = screen
      .getAllByText("Embarcacion")
      .find((element) => element.tagName.toLowerCase() === "label");
    if (!(embarcacionLabel instanceof HTMLElement)) {
      throw new Error("Embarcacion label not found");
    }
    const embarcacionField = embarcacionLabel.parentElement;
    if (!(embarcacionField instanceof HTMLElement)) {
      throw new Error("Embarcacion field not found");
    }

    fireEvent.click(within(embarcacionField).getByRole("button"));

    expect(screen.getAllByText("GC38-22").length).toBeGreaterThan(1);
    expect(screen.queryByText("SNG-25")).not.toBeInTheDocument();
  });
});

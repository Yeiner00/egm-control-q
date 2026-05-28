import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoatFormData } from "@/components/estadisticas/BoatReportForm";
import type { VehicleFormData } from "@/components/estadisticas/VehicleReportForm";
import { createBoatReport, createVehicleReport, loadSavedReportEditorData } from "./reportPersistence";

const fromMock = vi.hoisted(() => vi.fn());
const loadReportPeopleByIdsMock = vi.hoisted(() => vi.fn());

type QueryState = {
  table: string;
  selected: string;
  filters: Record<string, unknown>;
};

const vehicleReport = {
  id: "vehicle-1",
  no_reporte: "0042",
  anio: 2026,
  fecha: "2026-05-20",
  bitacora: "16",
  hora_salida: "07:30",
  hora_regreso: "12:15",
  total_horas: 4.75,
  estacion: "Murcielago",
  vehiculo: "SNG-16",
  destino: "Sector Norte",
  estacion_combustible: "Bomba Central",
  lugar_combustible: "Base",
  cedula_juridica_combustible: "3101000000",
  no_factura: "F-100",
  combustible_trasegado_bomba: 20,
  total_combustible_antes_viaje: 80,
  combustible_gastado: 12,
  saldo_combustible_despues_viaje: 68,
  kilometros_recorridos: 144,
  novedades: "Sin novedad",
};

const boatReport = {
  id: "boat-1",
  no_reporte: "0017",
  anio: 2026,
  fecha: "2026-04-01",
  bitacora: "01",
  folios: "31-32",
  estacion: "Murcielago",
  embarcacion: "GC38-22",
  no_cierre_os: "12",
  hora_salida: "09:30",
  hora_regreso: "13:00",
  horas_navegadas: 3.5,
  horas_motor_babor: 3.4,
  horas_motor_centro: 3.4,
  horas_motor_estribor: 3.4,
  horas_hombre: 7,
  destino: "Sector Norte",
  saldo_anterior: 100,
  combustible_trasegado_bodega: 50,
  total_antes_viaje: 150,
  combustible_trasegado_durante: 5,
  combustible_gastado: 40,
  saldo_despues: 115,
  tipo_combustible: "Gasolina",
  estacion_combustible: "Bodega",
  lugar_combustible: "Muelle",
  cedula_juridica_combustible: "3102000000",
  no_factura: "B-200",
  millas_nauticas: 27,
  novedades: "Sin novedad",
};

const motiveRows = [
  { reporte_id: "vehicle-1", tipo_reporte: "vehiculo", motivo: "Patrullaje" },
  { reporte_id: "vehicle-1", tipo_reporte: "vehiculo", motivo: "Inspeccion" },
  { reporte_id: "boat-1", tipo_reporte: "embarcacion", motivo: "Control maritimo" },
];

const siteRows = [
  { reporte_id: "vehicle-1", nombre_sitio: "sector alfa", zona: "1A", posicion: "10N / 85W" },
  { reporte_id: "boat-1", nombre_sitio: "sector bravo", zona: "2B", posicion: "11N / 86W" },
];

const inspectedBoatRows = [
  {
    reporte_id: "boat-1",
    nombre: "Pesquera Uno",
    matricula: "P-001",
    no_inspeccion: "INS-7",
    zona: "3C",
  },
];

const person = (
  id: string,
  reportId: string,
  tipo: "vehiculo" | "embarcacion",
  nombre: string,
  roles: string[],
  cedula: string | null = null,
) => ({
  cedula,
  id,
  reporte_id: reportId,
  tipo_reporte: tipo,
  nombre,
  nombre_normalizado: nombre.toLowerCase(),
  roles,
});

const resolveList = ({ table, filters }: QueryState) => {
  if (table === "reporte_motivos") {
    return {
      data: motiveRows.filter((row) =>
        row.reporte_id === filters.reporte_id && row.tipo_reporte === filters.tipo_reporte,
      ),
      error: null,
    };
  }

  if (table === "reporte_sitios") {
    return {
      data: siteRows.filter((row) => row.reporte_id === filters.reporte_id),
      error: null,
    };
  }

  if (table === "reporte_embarcaciones_inspeccionadas") {
    return {
      data: inspectedBoatRows.filter((row) => row.reporte_id === filters.reporte_id),
      error: null,
    };
  }

  return { data: [], error: null };
};

const resolveSingle = ({ table, filters }: QueryState) => {
  if (table === "reportes_vehiculo" && filters.id === "vehicle-1") {
    return { data: vehicleReport, error: null };
  }

  if (table === "reportes_embarcacion" && filters.id === "boat-1") {
    return { data: boatReport, error: null };
  }

  return { data: null, error: new Error(`Unexpected single query for ${table}`) };
};

const createQuery = (table: string) => {
  const state: QueryState = { table, selected: "*", filters: {} };
  const query = {
    select: vi.fn((selected = "*") => {
      state.selected = selected;
      return query;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      state.filters[column] = value;
      return query;
    }),
    single: vi.fn(() => Promise.resolve(resolveSingle(state))),
    then: (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(resolveList(state)).then(resolve, reject),
  };

  return query;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: fromMock,
  },
}));

vi.mock("@/lib/reportPeople", () => ({
  countUniqueNormalizedNames: vi.fn((names: string[]) => new Set(names.filter(Boolean)).size),
  deleteReportPeople: vi.fn(() => Promise.resolve()),
  loadPeopleNameOptions: vi.fn(() => Promise.resolve([])),
  loadReportPeopleByIds: loadReportPeopleByIdsMock,
  replaceReportPeople: vi.fn(() => Promise.resolve()),
}));

describe("report identity validation", () => {
  const vehicleIdentity = {
    no_reporte: "0042",
    fecha: "2026-05-20",
    vehiculo: "SNG-16",
  } as VehicleFormData;

  const boatIdentity = {
    no_reporte: "0017",
    fecha: "2026-04-01",
    embarcacion: "GC38-22",
  } as BoatFormData;

  beforeEach(() => {
    fromMock.mockReset();
  });

  it("blocks vehicle saves without report number, date, or unit", async () => {
    await expect(createVehicleReport({ ...vehicleIdentity, no_reporte: "" })).resolves.toEqual({
      error: "N. de reporte obligatorio",
    });
    await expect(createVehicleReport({ ...vehicleIdentity, fecha: "" })).resolves.toEqual({
      error: "Fecha obligatoria para definir el anio del reporte",
    });
    await expect(createVehicleReport({ ...vehicleIdentity, vehiculo: " " })).resolves.toEqual({
      error: "Vehiculo obligatorio",
    });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it("blocks vehicle saves without the operational people and times", async () => {
    await expect(createVehicleReport({
      ...vehicleIdentity,
      hora_salida: "07:30",
      hora_regreso: "12:15",
      chofer: "",
      oficial_a_cargo: "Pablo Barrantes Palma",
    })).resolves.toEqual({
      error: "Complete los datos operativos obligatorios: Chofer",
    });

    await expect(createVehicleReport({
      ...vehicleIdentity,
      hora_salida: "",
      hora_regreso: "12:15",
      chofer: "Roberth Sanchez Parra",
      oficial_a_cargo: "",
    })).resolves.toEqual({
      error: "Complete los datos operativos obligatorios: Hora Salida, Oficial a Cargo",
    });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it("blocks boat saves without report number, date, or unit", async () => {
    await expect(createBoatReport({ ...boatIdentity, no_reporte: "" })).resolves.toEqual({
      error: "N. de reporte obligatorio",
    });
    await expect(createBoatReport({ ...boatIdentity, fecha: "" })).resolves.toEqual({
      error: "Fecha obligatoria para definir el anio del reporte",
    });
    await expect(createBoatReport({ ...boatIdentity, embarcacion: " " })).resolves.toEqual({
      error: "Embarcacion obligatoria",
    });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it("blocks boat saves without the operational crew and times", async () => {
    await expect(createBoatReport({
      ...boatIdentity,
      hora_salida: "09:30",
      hora_regreso: "13:00",
      capitan: "",
      encargado_mision: "Encargado Uno",
      operacional: "Operacional Uno",
      tripulantes: [{ nombre: "Tripulante Uno", cedula: "" }],
    })).resolves.toEqual({
      error: "Complete los datos operativos obligatorios: Capitan",
    });

    await expect(createBoatReport({
      ...boatIdentity,
      hora_salida: "",
      hora_regreso: "13:00",
      capitan: "Capitan Uno",
      encargado_mision: "",
      operacional: "",
      tripulantes: [],
    })).resolves.toEqual({
      error: "Complete los datos operativos obligatorios: Hora Salida, Encargado de Mision, Operacional, Tripulantes",
    });

    expect(fromMock).not.toHaveBeenCalled();
  });
});

describe("loadSavedReportEditorData", () => {
  beforeEach(() => {
    fromMock.mockImplementation((table: string) => createQuery(table));
    loadReportPeopleByIdsMock.mockReset();
  });

  it("hydrates vehicle form people and fields from saved report data", async () => {
    loadReportPeopleByIdsMock.mockResolvedValue(new Map([
      ["vehicle-1", [
        person("driver", "vehicle-1", "vehiculo", "Roberth Sanchez Parra", ["chofer"], "503950054"),
        person("officer", "vehicle-1", "vehiculo", "Pablo Barrantes Palma", ["oficial"], "603790678"),
        person("legacy-accented", "vehicle-1", "vehiculo", "Ana Mora", ["acompa\u00f1ante"]),
        person("current", "vehicle-1", "vehiculo", "Luis Vega", ["acompanante"]),
      ]],
    ]));

    const result = await loadSavedReportEditorData("vehiculo", "vehicle-1");

    expect(result.vehicleData).toMatchObject({
      no_reporte: "0042",
      bitacora: "16",
      fecha: "2026-05-20",
      hora_salida: "07:30",
      hora_regreso: "12:15",
      estacion: "Murcielago",
      vehiculo: "SNG-16",
      destino: "Sector Norte",
      motivos: ["Patrullaje", "Inspeccion"],
      chofer: "Roberth Sanchez Parra",
      chofer_cedula: "503950054",
      acompanantes: ["Ana Mora", "Luis Vega"],
      oficial_a_cargo: "Pablo Barrantes Palma",
      oficial_a_cargo_cedula: "603790678",
      sitios_visitados: [{ nombre_sitio: "Sector Alfa", zona: "1A", posicion: "10N / 85W" }],
      estacion_combustible: "Bomba Central",
      lugar_combustible: "Base",
      cedula_juridica_combustible: "3101000000",
      no_factura: "F-100",
      combustible_trasegado_bomba: 20,
      total_combustible_antes_viaje: 80,
      combustible_gastado: 12,
      saldo_combustible_despues_viaje: 68,
      kilometros_recorridos: 144,
      novedades: "Sin novedad",
    });
  });

  it("hydrates boat form people and fields from saved report data", async () => {
    loadReportPeopleByIdsMock.mockResolvedValue(new Map([
      ["boat-1", [
        person("captain", "boat-1", "embarcacion", "Capitan Uno", ["capitan"], "111"),
        person("mission", "boat-1", "embarcacion", "Encargado Uno", ["encargado_mision"], "222"),
        person("director", "boat-1", "embarcacion", "Ambiental Uno", ["oficial_ambiental"], "333"),
        person("operational", "boat-1", "embarcacion", "Operacional Uno", ["operacional"], "444"),
        person("crew", "boat-1", "embarcacion", "Tripulante Uno", ["tripulante"], "555"),
        person("private", "boat-1", "embarcacion", "Particular Uno", ["particular"]),
        person("private-legacy", "boat-1", "embarcacion", "Particular Dos", ["persona_particular"]),
      ]],
    ]));

    const result = await loadSavedReportEditorData("embarcacion", "boat-1");

    expect(result.boatData).toMatchObject({
      no_reporte: "0017",
      bitacora: "01",
      folios: "31-32",
      fecha: "2026-04-01",
      estacion: "Murcielago",
      embarcacion: "GC38-22",
      no_cierre_os: "12",
      hora_salida: "09:30",
      hora_regreso: "13:00",
      horas_motor_babor: 3.4,
      horas_motor_centro: 3.4,
      horas_motor_estribor: 3.4,
      destino: "Sector Norte",
      motivos: ["Control maritimo"],
      capitan: "Capitan Uno",
      capitan_cedula: "111",
      encargado_mision: "Encargado Uno",
      encargado_mision_cedula: "222",
      oficial_director: "Ambiental Uno",
      oficial_director_cedula: "333",
      operacional: "Operacional Uno",
      operacional_cedula: "444",
      tripulantes: [{ nombre: "Tripulante Uno", cedula: "555" }],
      personas_particulares: ["Particular Uno", "Particular Dos"],
      sitios_visitados: [{ nombre_sitio: "Sector Bravo", zona: "2B", posicion: "11N / 86W" }],
      embarcaciones_inspeccionadas: [{
        nombre: "Pesquera Uno",
        matricula: "P-001",
        no_inspeccion: "INS-7",
        zona: "3C",
      }],
      saldo_anterior: 100,
      combustible_trasegado_bodega: 50,
      total_antes_viaje: 150,
      combustible_trasegado_durante: 5,
      combustible_gastado: 40,
      saldo_despues: 115,
      tipo_combustible: "Gasolina",
      estacion_combustible: "Bodega",
      lugar_combustible: "Muelle",
      cedula_juridica_combustible: "3102000000",
      no_factura: "B-200",
      millas_nauticas: 27,
      novedades: "Sin novedad",
    });
  });
});

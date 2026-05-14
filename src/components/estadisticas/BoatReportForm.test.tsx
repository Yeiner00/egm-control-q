import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BoatReportForm, { type BoatFormData } from "./BoatReportForm";
import { DEFAULT_REPORT_SITE_OPTIONS } from "@/lib/reportSites";

const baseData: BoatFormData = {
  no_reporte: "0007",
  bitacora: "02",
  folios: "1-2",
  fecha: "2026-04-29",
  estacion: "Murcielago",
  embarcacion: "Lancha 01",
  no_cierre_os: "OS-1",
  hora_salida: "07:00",
  hora_regreso: "11:00",
  horas_motor_babor: 1,
  horas_motor_centro: null,
  horas_motor_estribor: 1,
  destino: "Bahia",
  motivos: ["Patrullaje"],
  capitan: "Capitan Actual",
  capitan_cedula: "",
  encargado_mision: "Encargado Actual",
  encargado_mision_cedula: "",
  operacional: "Operacional Actual",
  operacional_cedula: "",
  tripulantes: [{ nombre: "", cedula: "" }],
  personas_particulares: [],
  sitios_visitados: [],
  embarcaciones_inspeccionadas: [],
  saldo_anterior: null,
  combustible_trasegado_bodega: null,
  total_antes_viaje: null,
  combustible_trasegado_durante: null,
  combustible_gastado: null,
  saldo_despues: null,
  tipo_combustible: "",
  estacion_combustible: "",
  lugar_combustible: "",
  cedula_juridica_combustible: "",
  no_factura: "",
  millas_nauticas: null,
  novedades: "Sin novedad",
};

const peopleOptions = [
  "Yeiner Castro Álvarez",
  "Josué Acevedo Ríos",
  "César Álvarez Martínez",
  "Roberth Sánchez Parra",
  "Ana Mora",
  "Bruno Vega",
  "Carla Ruiz",
  "Diego Solis",
  "Elena Castro",
];

const motiveOptions = [
  "Patrullaje",
  "Inspeccion",
  "Apoyo operativo",
  "Traslado",
  "Custodia",
  "Capacitacion",
  "Reunion",
  "Control",
  "Verificacion",
  "Atencion ciudadana",
  "Emergencia",
];

const unitOptions = ["GC38-22", "Lancha 01", "Lancha 02"];

interface RenderOptions {
  data?: BoatFormData;
  autoCalculateMotorHours?: boolean;
  autoFillBoatBitacora?: boolean;
  useFuelLoadToggle?: boolean;
}

const renderBoatForm = ({
  data = baseData,
  autoCalculateMotorHours = false,
  autoFillBoatBitacora = false,
  useFuelLoadToggle = false,
}: RenderOptions = {}) => {
  const Harness = () => {
    const [formData, setFormData] = useState(data);
    const [fuelLoadEnabled, setFuelLoadEnabled] = useState(false);

    return (
      <BoatReportForm
        data={formData}
        onChange={setFormData}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        saving={false}
        stationOptions={["Murcielago"]}
        unitOptions={unitOptions}
        peopleOptions={peopleOptions}
        motiveOptions={motiveOptions}
        siteOptions={DEFAULT_REPORT_SITE_OPTIONS}
        showPendingState={false}
        autoCalculateMotorHours={autoCalculateMotorHours}
        autoFillBoatBitacora={autoFillBoatBitacora}
        useFuelLoadToggle={useFuelLoadToggle}
        fuelLoadEnabled={fuelLoadEnabled}
        onFuelLoadEnabledChange={setFuelLoadEnabled}
      />
    );
  };

  render(<Harness />);
};

const getFieldControl = (label: string) => {
  const field = screen.getByText(label).parentElement;
  if (!(field instanceof HTMLElement)) throw new Error(`${label} field not found`);
  return field;
};

const getInputByLabel = (label: string) => {
  const input = getFieldControl(label).querySelector("input");
  if (!(input instanceof HTMLInputElement)) throw new Error(`${label} input not found`);
  return input;
};

const openComboboxByLabel = (label: string) => {
  fireEvent.click(within(getFieldControl(label)).getByRole("button"));
};

const openMotivosSelector = () => {
  fireEvent.click(screen.getByRole("button", { name: /seleccionar motivos/i }));
};

const openTripulantesSelector = () => {
  fireEvent.click(screen.getByRole("button", { name: /seleccionar tripulantes/i }));
};

const getCommandItem = (text: string) => {
  const item = screen
    .getAllByText(text)
    .map((element) => element.closest("[cmdk-item]"))
    .find((element): element is HTMLElement => element instanceof HTMLElement);

  if (!item) throw new Error(`No command item found for ${text}`);
  return item;
};

describe("BoatReportForm", () => {
  it("orders the compact header fields and moves estacion and destino above sites", () => {
    renderBoatForm();

    const noReporte = screen.getByText("N. Reporte");
    const fecha = screen.getByText("Fecha");
    const embarcacion = screen.getByText("Embarcacion");
    const bitacora = screen.getByText("Bitacora");
    const folios = screen.getByText("Folios");
    const cierre = screen.getByText("N. Cierre OS");
    const estacion = screen.getByText("Estacion");
    const destino = screen.getByText("Destino");
    const sitios = screen.getByText("Sitios / posiciones");

    expect(noReporte.compareDocumentPosition(fecha) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(fecha.compareDocumentPosition(embarcacion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(embarcacion.compareDocumentPosition(bitacora) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bitacora.compareDocumentPosition(folios) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(folios.compareDocumentPosition(cierre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(estacion.compareDocumentPosition(destino) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(destino.compareDocumentPosition(sitios) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("calculates motor hours in manual mode and leaves hora salida empty when provided empty", () => {
    renderBoatForm({
      data: {
        ...baseData,
        hora_salida: "",
        hora_regreso: "",
        horas_motor_babor: null,
        horas_motor_centro: null,
        horas_motor_estribor: null,
      },
      autoCalculateMotorHours: true,
    });

    expect(getInputByLabel("Hora Salida")).toHaveValue("");

    fireEvent.change(getInputByLabel("Hora Salida"), { target: { value: "07:00" } });
    fireEvent.change(getInputByLabel("Hora Regreso"), { target: { value: "11:00" } });

    expect(screen.getAllByDisplayValue("04:10")).toHaveLength(3);
  });

  it("calculates motor hours when regreso is the next day", () => {
    renderBoatForm({
      data: {
        ...baseData,
        hora_salida: "",
        hora_regreso: "",
        horas_motor_babor: null,
        horas_motor_centro: null,
        horas_motor_estribor: null,
      },
      autoCalculateMotorHours: true,
    });

    fireEvent.change(getInputByLabel("Hora Salida"), { target: { value: "23:50" } });
    fireEvent.change(getInputByLabel("Hora Regreso"), { target: { value: "00:20" } });

    expect(screen.getAllByDisplayValue("00:40")).toHaveLength(3);
  });

  it("fills bitacora from selected embarcacion in manual mode and keeps it editable", () => {
    renderBoatForm({
      data: { ...baseData, embarcacion: "", bitacora: "" },
      autoFillBoatBitacora: true,
    });

    openComboboxByLabel("Embarcacion");
    fireEvent.click(getCommandItem("GC38-22"));

    const bitacora = screen.getByDisplayValue("01");
    expect(bitacora).toBeInTheDocument();

    fireEvent.change(bitacora, { target: { value: "03" } });
    expect(screen.getByDisplayValue("03")).toBeInTheDocument();
  });

  it("fills bitacora with 00 from unknown embarcacion in manual mode", () => {
    renderBoatForm({
      data: { ...baseData, embarcacion: "", bitacora: "" },
      autoFillBoatBitacora: true,
    });

    openComboboxByLabel("Embarcacion");
    fireEvent.click(getCommandItem("Lancha 02"));

    expect(screen.getByDisplayValue("00")).toBeInTheDocument();
  });

  it("fills site zone and position from selected site while keeping manual names allowed", () => {
    renderBoatForm({
      data: {
        ...baseData,
        sitios_visitados: [{ nombre_sitio: "Sitio temporal", zona: "", posicion: "" }],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /sitio temporal/i }));
    fireEvent.click(getCommandItem("Bello Horizonte"));

    expect(screen.getByDisplayValue("1B")).toBeInTheDocument();
    expect(screen.getByDisplayValue('10°58\'50.9" N / 085°39\'55.4" W')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /bello horizonte/i }));
    fireEvent.change(screen.getByPlaceholderText("Buscar o escribir..."), {
      target: { value: "Sitio no listado" },
    });
    fireEvent.click(screen.getByText('Usar "Sitio no listado"'));

    expect(screen.getByRole("button", { name: /sitio no listado/i })).toBeInTheDocument();
  });

  it("renders motivos inside novedades y motivos, supports typed motives, and enforces max ten", () => {
    renderBoatForm({ data: { ...baseData, motivos: [] } });

    const sectionTitle = screen.getByText("Novedades y motivos");
    const motivos = screen.getAllByText("Motivos").at(-1) as HTMLElement;
    const novedades = screen.getByText("Novedades");

    expect(sectionTitle.compareDocumentPosition(motivos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(motivos.compareDocumentPosition(novedades) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Sin motivos seleccionados")).toBeInTheDocument();

    openMotivosSelector();
    motiveOptions.slice(0, 9).forEach((motivo) => {
      fireEvent.click(getCommandItem(motivo));
    });
    fireEvent.change(screen.getByPlaceholderText("Buscar o escribir motivo..."), {
      target: { value: "Operacion especial" },
    });
    fireEvent.click(screen.getByText('Usar "Operacion especial"'));

    expect(screen.getByRole("button", { name: /10 motivos seleccionados/i })).toBeInTheDocument();
    expect(screen.getByText("Maximo 10 motivos seleccionados.")).toBeInTheDocument();
    expect(getCommandItem("Emergencia")).toHaveAttribute("data-disabled", "true");
  });

  it("selects up to six tripulantes, blocks capitan and encargado, autofills cedulas, and keeps them editable", () => {
    renderBoatForm({
      data: {
        ...baseData,
        capitan: "Yeiner Castro Álvarez",
        encargado_mision: "Josué Acevedo Ríos",
        tripulantes: [],
      },
    });

    expect(screen.getByText("Sin tripulantes seleccionados")).toBeInTheDocument();

    openTripulantesSelector();
    expect(getCommandItem("Yeiner Castro Álvarez")).toHaveAttribute("data-disabled", "true");
    expect(getCommandItem("Josué Acevedo Ríos")).toHaveAttribute("data-disabled", "true");

    [
      "Roberth Sánchez Parra",
      "César Álvarez Martínez",
      "Olman Alfaro Quirós",
      "Sergio Alpizar Carrillo",
      "Pablo Barrantes Palma",
      "Minor Cambronero Campos",
    ].forEach((name) => {
      fireEvent.click(getCommandItem(name));
    });

    expect(screen.getByRole("button", { name: /6 tripulantes seleccionados/i })).toBeInTheDocument();
    expect(screen.getByText("Maximo 6 tripulantes seleccionados.")).toBeInTheDocument();
    expect(getCommandItem("Jhonny Araya Chacón")).toHaveAttribute("data-disabled", "true");

    const tripulanteCedula = screen.getByDisplayValue("503950054");
    fireEvent.change(tripulanteCedula, { target: { value: "503950055" } });
    expect(screen.getByDisplayValue("503950055")).toBeInTheDocument();
  }, 10000);

  it("places operacional after tripulantes and fills crew cedulas from known officers", () => {
    renderBoatForm();

    const tripulantes = screen.getByText("Tripulantes");
    const operacional = screen.getByText("Operacional");

    expect(tripulantes.compareDocumentPosition(operacional) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /capitan actual/i }));
    fireEvent.click(getCommandItem("Yeiner Castro Álvarez"));
    expect(screen.getByDisplayValue("603830474")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /encargado actual/i }));
    fireEvent.click(getCommandItem("Josué Acevedo Ríos"));
    expect(screen.getByDisplayValue("603290196")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /operacional actual/i }));
    fireEvent.click(getCommandItem("César Álvarez Martínez"));
    expect(screen.getByDisplayValue("700270843")).toBeInTheDocument();
  }, 10000);

  it("shows fixed fuel fields, toggles trasegado fields, calculates saldo, and preserves fixed data", () => {
    renderBoatForm({
      data: {
        ...baseData,
        total_antes_viaje: null,
        combustible_gastado: null,
        saldo_despues: null,
        millas_nauticas: 12,
        no_factura: "",
        combustible_trasegado_bodega: null,
      },
      useFuelLoadToggle: true,
    });

    expect(screen.getByText("Total Antes Viaje")).toBeInTheDocument();
    expect(screen.getByText("Gastado")).toBeInTheDocument();
    expect(screen.getByText("Saldo Despues")).toBeInTheDocument();
    expect(screen.getByText("Millas Nauticas")).toBeInTheDocument();
    expect(screen.queryByText("Tipo Combustible")).not.toBeInTheDocument();
    expect(screen.queryByText("N. Factura")).not.toBeInTheDocument();

    fireEvent.change(getInputByLabel("Total Antes Viaje"), { target: { value: "100" } });
    fireEvent.change(getInputByLabel("Gastado"), { target: { value: "12.345" } });
    expect(screen.getByDisplayValue("87.655")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /trasegado de combustible/i }));
    expect(screen.getByText("Tipo Combustible")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Gasolina")).toBeInTheDocument();
    expect(screen.getByText("N. Factura")).toBeInTheDocument();
    expect(
      screen.getByText("Tipo Combustible").compareDocumentPosition(screen.getByText("N. Factura")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.change(getInputByLabel("N. Factura"), { target: { value: "FAC-1" } });
    fireEvent.change(getInputByLabel("Trasegado Bodega"), { target: { value: "5" } });

    fireEvent.click(screen.getByRole("checkbox", { name: /trasegado de combustible/i }));
    expect(screen.queryByText("Tipo Combustible")).not.toBeInTheDocument();
    expect(screen.queryByText("N. Factura")).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("100")).toBeInTheDocument();
    expect(screen.getByDisplayValue("12.345")).toBeInTheDocument();
    expect(screen.getByDisplayValue("87.655")).toBeInTheDocument();
    expect(screen.getByDisplayValue("12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: /trasegado de combustible/i }));
    expect(screen.queryByDisplayValue("FAC-1")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("5")).not.toBeInTheDocument();
  });
});

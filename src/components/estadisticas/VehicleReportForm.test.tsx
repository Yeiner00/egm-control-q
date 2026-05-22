import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import VehicleReportForm, { type VehicleFormData } from "./VehicleReportForm";
import { DEFAULT_REPORT_SITE_OPTIONS } from "@/lib/reportSites";

const baseData: VehicleFormData = {
  no_reporte: "0012",
  bitacora: "01",
  fecha: "2026-04-29",
  hora_salida: "08:00",
  hora_regreso: "12:00",
  estacion: "Murcielago",
  vehiculo: "Movil 01",
  destino: "Sector norte",
  motivos: ["Patrullaje"],
  chofer: "Carlos Soto",
  chofer_cedula: "1-1111-1111",
  acompanantes: [],
  oficial_a_cargo: "Oficial Gomez",
  oficial_a_cargo_cedula: "2-2222-2222",
  sitios_visitados: [{ nombre_sitio: "Playa", zona: "1", posicion: "10.1,-85.1" }],
  estacion_combustible: "",
  lugar_combustible: "",
  cedula_juridica_combustible: "",
  no_factura: "",
  combustible_trasegado_bomba: null,
  total_combustible_antes_viaje: null,
  combustible_gastado: 12,
  saldo_combustible_despues_viaje: null,
  kilometros_recorridos: 40,
  novedades: "Sin novedad",
};

const peopleOptions = [
  "Carlos Soto",
  "Yeiner Castro Alvarez",
  "Josue Acevedo Rios",
  "Luis Carlos Gonzalez Jarquin",
  "Ana Mora",
  "Bruno Vega",
  "Carla Ruiz",
  "Diego Solis",
  "Elena Castro",
  "Oficial Gomez",
];

const unitOptions = ["SNG-08", "SNG-16", "SNG-25", "SNG-26", "Movil 01"];

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

const renderVehicleForm = (initialData: VehicleFormData = baseData) => {
  const onSave = vi.fn();
  const onCancel = vi.fn();

  const Harness = () => {
    const [data, setData] = useState(initialData);

    return (
      <VehicleReportForm
        data={data}
        onChange={setData}
        onSave={onSave}
        onCancel={onCancel}
        saving={false}
        unitOptions={unitOptions}
        peopleOptions={peopleOptions}
        motiveOptions={motiveOptions}
        siteOptions={DEFAULT_REPORT_SITE_OPTIONS}
        showPendingState={false}
      />
    );
  };

  render(<Harness />);
};

const openAcompanantesSelector = () => {
  fireEvent.click(screen.getByRole("button", { name: /seleccionar acompanantes/i }));
};

const openMotivosSelector = () => {
  fireEvent.click(screen.getByRole("button", { name: /seleccionar motivos/i }));
};

const openVehiculoSelector = () => {
  const field = screen.getByText("Vehiculo").parentElement;
  if (!(field instanceof HTMLElement)) throw new Error("Vehiculo field not found");
  fireEvent.click(within(field).getByRole("button"));
};

const getCommandItem = (text: string) => {
  const item = screen
    .getAllByText(text)
    .map((element) => element.closest("[cmdk-item]"))
    .find((element): element is HTMLElement => element instanceof HTMLElement);

  if (!item) throw new Error(`No command item found for ${text}`);
  return item;
};

describe("VehicleReportForm", () => {
  it("renders vehicle personnel in the requested order", () => {
    renderVehicleForm();

    const chofer = screen.getByText("Chofer");
    const acompanantes = screen.getByText("Acompanantes");
    const oficial = screen.getByText("Oficial a Cargo");

    expect(chofer.compareDocumentPosition(acompanantes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(acompanantes.compareDocumentPosition(oficial) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("groups vehicle with bitacora and moves estacion and destino above sites", () => {
    renderVehicleForm();

    const bitacora = screen.getByText("Bitacora");
    const vehiculo = screen.getByText("Vehiculo");
    const estacion = screen.getByText("Estacion");
    const destino = screen.getByText("Destino");
    const sitios = screen.getByText("Sitios de interes visitados");

    expect(vehiculo.compareDocumentPosition(bitacora) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(estacion.compareDocumentPosition(destino) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(destino.compareDocumentPosition(sitios) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("fills bitacora from selected vehicle while keeping it editable", () => {
    renderVehicleForm({ ...baseData, vehiculo: "", bitacora: "" });

    openVehiculoSelector();
    fireEvent.click(getCommandItem("SNG-16"));

    const bitacora = screen.getByDisplayValue("03");
    expect(bitacora).toBeInTheDocument();

    fireEvent.change(bitacora, { target: { value: "04" } });
    expect(screen.getByDisplayValue("04")).toBeInTheDocument();
  });

  it("fills bitacora 02 for known vehicles with the same log number", () => {
    renderVehicleForm({ ...baseData, vehiculo: "", bitacora: "" });

    openVehiculoSelector();
    fireEvent.click(getCommandItem("SNG-08"));

    expect(screen.getByDisplayValue("02")).toBeInTheDocument();
  });

  it("fills bitacora with 00 for vehicles without a known bitacora", () => {
    renderVehicleForm({ ...baseData, vehiculo: "", bitacora: "" });

    openVehiculoSelector();
    fireEvent.click(getCommandItem("SNG-26"));

    expect(screen.getByDisplayValue("00")).toBeInTheDocument();
  });

  it("fills site zone and position from selected site while keeping manual names allowed", () => {
    renderVehicleForm({
      ...baseData,
      sitios_visitados: [{ nombre_sitio: "Playa", zona: "", posicion: "" }],
    });

    fireEvent.click(screen.getByRole("button", { name: /playa/i }));
    fireEvent.click(getCommandItem("Aguas Calientes"));

    expect(screen.getByDisplayValue("1B")).toBeInTheDocument();
    expect(screen.getByDisplayValue('10°56\'53" N / 085°39\'21" W')).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /aguas calientes/i }));
    fireEvent.change(screen.getByPlaceholderText("Buscar o escribir..."), {
      target: { value: "Zona nueva" },
    });
    fireEvent.click(screen.getByText('Usar "Zona nueva"'));

    expect(screen.getByRole("button", { name: /zona nueva/i })).toBeInTheDocument();
  });

  it("renders motivos inside novedades y motivos before novedades", () => {
    renderVehicleForm({ ...baseData, motivos: [] });

    const oficial = screen.getByText("Oficial a Cargo");
    const sectionTitle = screen.getByText("Novedades y motivos");
    const motivos = screen.getAllByText("Motivos").at(-1) as HTMLElement;
    const novedades = screen.getByText("Novedades");

    expect(oficial.compareDocumentPosition(sectionTitle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(sectionTitle.compareDocumentPosition(motivos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(motivos.compareDocumentPosition(novedades) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Sin motivos seleccionados")).toBeInTheDocument();
  });

  it("selects up to four acompanantes, allows typed names, and keeps the chofer unavailable", () => {
    renderVehicleForm();

    expect(screen.getByText("Sin acompanantes seleccionados")).toBeInTheDocument();

    openAcompanantesSelector();

    expect(getCommandItem("Carlos Soto")).toHaveAttribute("data-disabled", "true");

    fireEvent.click(getCommandItem("Ana Mora"));
    fireEvent.click(getCommandItem("Bruno Vega"));
    fireEvent.click(getCommandItem("Carla Ruiz"));

    fireEvent.change(screen.getByPlaceholderText("Buscar o escribir acompanante..."), {
      target: { value: "Invitado Externo" },
    });
    fireEvent.click(screen.getByText('Usar "Invitado Externo"'));

    expect(screen.getByRole("button", { name: /4 acompanantes seleccionados/i })).toBeInTheDocument();
    expect(screen.getByText("Maximo 4 acompanantes seleccionados.")).toBeInTheDocument();
    expect(getCommandItem("Elena Castro")).toHaveAttribute("data-disabled", "true");

    fireEvent.click(screen.getByLabelText("Quitar Bruno Vega"));

    expect(screen.getByRole("button", { name: /3 acompanantes seleccionados/i })).toBeInTheDocument();
    expect(screen.queryByText("Maximo 4 acompanantes seleccionados.")).not.toBeInTheDocument();
    expect(getCommandItem("Elena Castro")).not.toHaveAttribute("data-disabled", "true");
  });

  it("removes only the clicked acompanante when the chofer is already listed", () => {
    renderVehicleForm({
      ...baseData,
      chofer: "Carlos Soto",
      acompanantes: ["Carlos Soto", "Ana Mora", "Bruno Vega"],
    });

    fireEvent.click(screen.getByLabelText("Quitar Ana Mora"));

    expect(screen.getByRole("button", { name: /2 acompanantes seleccionados/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Quitar Carlos Soto")).toBeInTheDocument();
    expect(screen.queryByLabelText("Quitar Ana Mora")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quitar Bruno Vega")).toBeInTheDocument();
  });

  it("removes the chofer from acompanantes when the chofer changes", () => {
    renderVehicleForm({
      ...baseData,
      chofer: "Carlos Soto",
      acompanantes: ["Ana Mora", "Bruno Vega"],
    });

    fireEvent.click(screen.getAllByRole("button", { name: /carlos soto/i })[0]);
    fireEvent.change(screen.getByPlaceholderText("Buscar o escribir..."), {
      target: { value: "Ana Mora" },
    });
    fireEvent.click(getCommandItem("Ana Mora"));

    expect(screen.queryByLabelText("Quitar Ana Mora")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Quitar Bruno Vega")).toBeInTheDocument();
  });

  it("fills vehicle cedulas from known officers and keeps manual cedulas for unknown names", () => {
    renderVehicleForm({
      ...baseData,
      chofer_cedula: "999999999",
    });

    fireEvent.click(screen.getByRole("button", { name: /carlos soto/i }));
    fireEvent.click(getCommandItem("Yeiner Castro Alvarez"));

    expect(screen.getByDisplayValue("603830474")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /oficial gomez/i }));
    fireEvent.click(getCommandItem("Josue Acevedo Rios"));

    expect(screen.getByDisplayValue("603290196")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /yeiner castro alvarez/i }));
    fireEvent.change(screen.getByPlaceholderText("Buscar o escribir..."), {
      target: { value: "Persona No Listada" },
    });
    fireEvent.click(screen.getByText('Usar "Persona No Listada"'));

    expect(screen.getByDisplayValue("603830474")).toBeInTheDocument();
  });

  it("selects up to ten motivos and allows a typed motivo", () => {
    renderVehicleForm({ ...baseData, motivos: [] });

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

    fireEvent.click(screen.getByLabelText("Quitar Control"));

    expect(screen.getByRole("button", { name: /9 motivos seleccionados/i })).toBeInTheDocument();
    expect(screen.queryByText("Maximo 10 motivos seleccionados.")).not.toBeInTheDocument();
    expect(getCommandItem("Emergencia")).not.toHaveAttribute("data-disabled", "true");
  });
});

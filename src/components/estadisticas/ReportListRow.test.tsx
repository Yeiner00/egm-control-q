import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Clock3 } from "lucide-react";
import ReportListRow from "./ReportListRow";

describe("ReportListRow", () => {
  it("renders report facts and exposes row actions", () => {
    const onExpandedChange = vi.fn();
    const onGenerateExcel = vi.fn();
    const onToggleNovedades = vi.fn();
    const onEdit = vi.fn();
    const onRemove = vi.fn();

    render(
      <ReportListRow
        origin="gestion"
        type="vehiculo"
        reportNumber="0001"
        date="2026-03-03"
        unit="SNG-08"
        station="MURCIELAGO"
        role="Chofer"
        metrics={[{ label: "Horas", value: "3:20 h", icon: Clock3 }]}
        tags={["Seguridad ciudadana", "Proteccion a banistas"]}
        expanded={false}
        expandable
        onExpandedChange={onExpandedChange}
        onGenerateExcel={onGenerateExcel}
        onToggleNovedades={onToggleNovedades}
        onEdit={onEdit}
        onRemove={onRemove}
      />,
    );

    expect(screen.getByText("#0001")).toBeInTheDocument();
    expect(screen.getByText("SNG-08")).toBeInTheDocument();
    expect(screen.getByText("Chofer")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /abrir reporte/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /generar excel/i }));
    fireEvent.click(screen.getByRole("button", { name: /ver novedades/i }));
    fireEvent.click(screen.getByRole("button", { name: /editar reporte/i }));
    fireEvent.click(screen.getByRole("button", { name: /quitar reporte/i }));

    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(onGenerateExcel).toHaveBeenCalledTimes(1);
    expect(onToggleNovedades).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("shows expanded content and error state", () => {
    render(
      <ReportListRow
        origin="subida"
        status="save-error"
        title="reporte.xlsx"
        reportNumber="9999"
        expanded
        expandable
        errorText="Duplicado"
      >
        <div>Formulario editable</div>
      </ReportListRow>,
    );

    expect(screen.getByText("Duplicado")).toBeInTheDocument();
    expect(screen.getByText("Formulario editable")).toBeInTheDocument();
  });
});

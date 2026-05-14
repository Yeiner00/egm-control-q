import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ProposalReportCard from "./ProposalReportCard";

const baseProps = {
  date: "2026-04-26",
  reportNumber: "12",
  unit: "Unidad 01",
  secondaryLabel: "Estacion",
  role: "Conductor",
  metrics: [{ label: "Kilometros", value: 15 }],
  tags: ["Patrullaje"],
  onToggleNovedades: vi.fn(),
};

describe("ProposalReportCard", () => {
  it("renders text novedades when expanded", () => {
    render(
      <ProposalReportCard
        {...baseProps}
        expanded
        novedades="Reporte sin incidentes."
      />,
    );

    expect(screen.getByText("Reporte sin incidentes.")).toBeInTheDocument();
  });

  it("normalizes object novedades instead of crashing the expanded notes", () => {
    render(
      <ProposalReportCard
        {...baseProps}
        expanded
        novedades={{ detalle: "Atencion en sitio", resultado: "Finalizado" }}
      />,
    );

    expect(screen.getByText(/detalle: Atencion en sitio/)).toBeInTheDocument();
    expect(screen.getByText(/resultado: Finalizado/)).toBeInTheDocument();
  });

  it("calls the toggle handler from the novedades button", () => {
    const onToggleNovedades = vi.fn();
    render(
      <ProposalReportCard
        {...baseProps}
        expanded={false}
        novedades="Texto pendiente"
        onToggleNovedades={onToggleNovedades}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ver novedades/i }));

    expect(onToggleNovedades).toHaveBeenCalledTimes(1);
  });

  it("renders edit and print actions and keeps novedades action available", () => {
    const onEdit = vi.fn();
    const onPrint = vi.fn();
    const onToggleNovedades = vi.fn();

    render(
      <ProposalReportCard
        {...baseProps}
        expanded={false}
        novedades="Texto pendiente"
        onToggleNovedades={onToggleNovedades}
        onEdit={onEdit}
        onPrint={onPrint}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /imprimir reporte/i }));
    fireEvent.click(screen.getByRole("button", { name: /editar reporte/i }));
    fireEvent.click(screen.getByRole("button", { name: /ver novedades/i }));

    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onToggleNovedades).toHaveBeenCalledTimes(1);
  });
});

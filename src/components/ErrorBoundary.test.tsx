import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

const Boom = () => {
  throw new Error("exploto");
};

describe("ErrorBoundary", () => {
  it("renderiza hijos cuando no hay error", () => {
    render(
      <ErrorBoundary>
        <span>ok</span>
      </ErrorBoundary>
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
  });

  it("muestra fallback cuando un hijo lanza", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/algo salio mal/i)).toBeInTheDocument();
    spy.mockRestore();
  });
});

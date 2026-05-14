import { fireEvent, render, screen } from "@testing-library/react";
import HeaderMiniCalendar from "./HeaderMiniCalendar";

describe("HeaderMiniCalendar", () => {
  it("opens a compact calendar and changes visible month with arrows", () => {
    render(<HeaderMiniCalendar />);

    fireEvent.click(screen.getByRole("button", { name: /abrir calendario rapido/i }));

    const currentYear = new Date().getFullYear().toString();
    expect(screen.getByText(currentYear)).toBeInTheDocument();

    const visibleMonth = screen.getByText(/enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i).textContent;

    fireEvent.click(screen.getByRole("button", { name: /mes siguiente/i }));

    expect(screen.getByText(/enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre/i).textContent).not.toBe(visibleMonth);
    expect(screen.getByText("Alfa")).toBeInTheDocument();
    expect(screen.getByText("Bravo")).toBeInTheDocument();
  });
});

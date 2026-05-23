import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import ReportUploader from "./ReportUploader";

const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock("@/lib/xlsx", () => ({
  loadXlsx: async () => ({
    read: () => ({ SheetNames: ["Reporte"], Sheets: { Reporte: {} } }),
    utils: {
      sheet_to_csv: () => "reporte de viaje",
    },
  }),
}));

vi.mock("@/lib/reportWorkbookExtraction", () => ({
  extractReportFromWorkbook: () => null,
  mergeExtractedReportData: (aiData: unknown) => aiData,
}));

vi.mock("@/lib/aiRateLimit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/aiRateLimit")>();
  return {
    ...actual,
    runAiTask: async <T,>(task: () => Promise<T>, options?: { onStatus?: (status: { status: string; message: string; attempt: number }) => void }) => {
      options?.onStatus?.({ status: "waiting", message: "Esperando cupo de IA (1s).", attempt: 0 });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      options?.onStatus?.({ status: "running", message: "Procesando con IA.", attempt: 0 });
      return task();
    },
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("./VehicleReportForm", () => ({
  default: () => <div>Vehicle form</div>,
}));

vi.mock("./BoatReportForm", () => ({
  default: () => <div>Boat form</div>,
}));

describe("ReportUploader", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    vi.mocked(toast.error).mockReset();
  });

  it("processes multiple files sequentially and shows AI wait feedback", async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const releases: Array<() => void> = [];

    invokeMock.mockImplementation(() => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);

      return new Promise((resolve) => {
        releases.push(() => {
          activeRequests -= 1;
          resolve({
            data: {
              data: {
                tipo: "vehiculo",
                no_reporte: String(releases.length),
              },
            },
            error: null,
          });
        });
      });
    });

    render(<ReportUploader onExtracted={vi.fn()} onBatchSave={vi.fn()} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const first = new File(["first"], "first.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const second = new File(["second"], "second.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    Object.defineProperty(first, "arrayBuffer", { value: async () => new ArrayBuffer(1) });
    Object.defineProperty(second, "arrayBuffer", { value: async () => new ArrayBuffer(1) });

    fireEvent.change(input, { target: { files: [first, second] } });

    expect(await screen.findByText(/Esperando cupo de IA/)).toBeInTheDocument();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(maxActiveRequests).toBe(1);

    releases[0]();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(maxActiveRequests).toBe(1);

    releases[1]();
    await waitFor(() => {
      expect(screen.getByText("first.xlsx")).toBeInTheDocument();
      expect(screen.getByText("second.xlsx")).toBeInTheDocument();
    });
    expect(maxActiveRequests).toBe(1);
  });

  it("rejects non-Excel uploads before invoking AI extraction", async () => {
    render(<ReportUploader onExtracted={vi.fn()} onBatchSave={vi.fn()} />);

    const input = document.querySelector("input[type='file']") as HTMLInputElement;
    const file = new File(["not excel"], "report.pdf", { type: "application/pdf" });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Error", {
        description: "Solo se permiten archivos Excel .xlsx o .xls",
      });
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

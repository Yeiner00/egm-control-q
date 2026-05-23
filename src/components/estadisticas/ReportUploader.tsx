import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadXlsx } from "@/lib/xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, FileSpreadsheet, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { createAiServiceError, createAiServiceErrorFromSupabaseFunctionError, isAiRateLimitError, runAiTask, type AiTaskStatus } from "@/lib/aiRateLimit";
import { downloadReportExcel } from "@/lib/reportExcelExport";
import VehicleReportForm, { type VehicleFormData } from "./VehicleReportForm";
import BoatReportForm, { type BoatFormData } from "./BoatReportForm";
import ReportListRow, { type ReportRowStatus } from "./ReportListRow";
import type { ReportSiteOption } from "@/lib/reportSites";
import {
  mapToBoatFormData,
  mapToVehicleFormData,
  type ExtractedReportData,
  type ExtractedReportType,
} from "@/lib/report-utils";
import { extractReportFromWorkbook, mergeExtractedReportData } from "@/lib/reportWorkbookExtraction";

interface ReportUploaderProps {
  onExtracted: (data: ExtractedReportData) => void;
  onBatchSave?: (items: BatchItem[]) => Promise<BatchSaveResult>;
  showIntroHeader?: boolean;
  headerEyebrow?: string;
  headerTitle?: string;
  headerDescription?: string;
  stationOptions?: string[];
  vehicleUnitOptions?: string[];
  boatUnitOptions?: string[];
  peopleOptions?: string[];
  motiveOptions?: string[];
  siteOptions?: ReportSiteOption[];
}

export interface BatchItem {
  fileName: string;
  status: "pending" | "waiting" | "processing" | "ready" | "error" | "saved" | "save-error";
  error?: string;
  aiMessage?: string;
  data?: ExtractedReportData;
  tipo?: ExtractedReportType;
  vehicleData?: VehicleFormData;
  boatData?: BoatFormData;
  savedReportId?: string;
}

export interface BatchSaveResult {
  saved: number;
  errors: { index: number; reason: string }[];
  savedReports?: { index: number; reportId: string; tipo: ExtractedReportType }[];
}

const aiStatusToBatchStatus = (status: AiTaskStatus["status"]): BatchItem["status"] =>
  status === "queued" || status === "waiting" || status === "rate_limited" ? "waiting" : "processing";

const MAX_REPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_REPORT_EXTENSIONS = new Set(["xlsx", "xls"]);

const getBatchRowStatus = (status: BatchItem["status"]): ReportRowStatus => {
  if (status === "waiting") return "processing";
  return status;
};

const getBatchItemFormData = (item: BatchItem) => item.vehicleData || item.boatData;

const ReportUploader = ({
  onExtracted,
  onBatchSave,
  showIntroHeader = true,
  headerEyebrow = "Subir reporte excel",
  headerTitle = "Procesar reporte Excel",
  headerDescription = "Cargue uno o varios archivos de viaje. El sistema identifica el tipo de reporte y prepara la informacion para revision.",
  stationOptions = [],
  vehicleUnitOptions = [],
  boatUnitOptions = [],
  peopleOptions = [],
  motiveOptions = [],
  siteOptions = [],
}: ReportUploaderProps) => {
  const [loading, setLoading] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [generatingExcelIndex, setGeneratingExcelIndex] = useState<number | null>(null);
  const [saveResult, setSaveResult] = useState<BatchSaveResult | null>(null);
  const [singleAiMessage, setSingleAiMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = async (
    file: File,
    onAiStatus?: (status: AiTaskStatus) => void,
  ): Promise<{ data?: ExtractedReportData; error?: string; rateLimited?: boolean }> => {
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (!extension || !ALLOWED_REPORT_EXTENSIONS.has(extension)) {
        return { error: "Solo se permiten archivos Excel .xlsx o .xls" };
      }
      if (file.size > MAX_REPORT_FILE_SIZE_BYTES) {
        return { error: "El archivo supera el limite de 5 MB" };
      }

      const buffer = await file.arrayBuffer();
      const XLSX = await loadXlsx();
      const wb = XLSX.read(buffer, { type: "array" });
      const workbookData = extractReportFromWorkbook(wb, XLSX);
      let textContent = "";
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        textContent += `=== Hoja: ${name} ===\n`;
        textContent += XLSX.utils.sheet_to_csv(ws, { blankrows: false }) + "\n\n";
      }
      if (!textContent.trim()) return { error: "Archivo vacio" };

      const data = await runAiTask(
        async () => {
          const result = await supabase.functions.invoke("extract-report", {
            body: { content: textContent },
          });
          if (result.error) throw await createAiServiceErrorFromSupabaseFunctionError(result.error, "Error de extraccion");
          if (result.data?.error) throw createAiServiceError(result.data);
          return result.data;
        },
        {
          label: `Extraer ${file.name}`,
          onStatus: onAiStatus,
        },
      );
      if (data?.data || workbookData) {
        return { data: mergeExtractedReportData(data?.data, workbookData) || undefined };
      }
      if (data?.data) return { data: data.data };
      return { error: "No se pudieron extraer datos" };
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Error al procesar",
        rateLimited: isAiRateLimitError(err),
      };
    }
  };

  const handleFiles = async (files: FileList) => {
    if (files.length === 1) {
      setLoading(true);
      setSingleAiMessage("");
      const result = await processFile(files[0], (status) => setSingleAiMessage(status.message));
      setLoading(false);
      setSingleAiMessage("");
      if (inputRef.current) inputRef.current.value = "";
      if (result.error) {
        toast.error("Error", { description: result.error });
        return;
      }
      if (result.data) {
        onExtracted(result.data);
        toast.success(`Reporte de ${result.data.tipo === "vehiculo" ? "vehiculo" : "embarcacion"} detectado`);
      }
      return;
    }

    setBatchMode(true);
    setSaveResult(null);
    setExpandedIndex(null);
    const items: BatchItem[] = Array.from(files).map((file) => ({
      fileName: file.name,
      status: "pending",
    }));
    setBatchItems([...items]);

    const fileArr = Array.from(files);
    for (let i = 0; i < fileArr.length; i += 1) {
      setBatchItems((prev) => {
        const next = [...prev];
        next[i] = { ...next[i], status: "processing", aiMessage: "Preparando archivo para IA." };
        return next;
      });

      const result = await processFile(fileArr[i], (status) => {
        setBatchItems((prev) => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: aiStatusToBatchStatus(status.status),
            aiMessage: status.message,
          };
          return next;
        });
      });

      setBatchItems((prev) => {
        const next = [...prev];
        if (result.error) {
          next[i] = { ...next[i], status: "error", error: result.error, aiMessage: undefined };
        } else if (result.data) {
          const tipo = result.data.tipo as ExtractedReportType;
          next[i] = {
            ...next[i],
            status: "ready",
            aiMessage: undefined,
            error: undefined,
            data: result.data,
            tipo,
            vehicleData: tipo === "vehiculo" ? mapToVehicleFormData(result.data) : undefined,
            boatData: tipo === "embarcacion" ? mapToBoatFormData(result.data) : undefined,
          };
        }
        return next;
      });

      if (result.rateLimited) {
        toast.error("Limite temporal de IA", {
          description: "Se alcanzo el limite temporal de IA. Intente continuar en unos minutos.",
        });
        break;
      }
    }

    if (inputRef.current) inputRef.current.value = "";
  };

  const applySaveResultToItems = (result: BatchSaveResult, targetStatuses: BatchItem["status"][]) => {
    setBatchItems((prev) => {
      const next = [...prev];
      let readyIdx = 0;
      next.forEach((item, index) => {
        if (targetStatuses.includes(item.status)) {
          const errorEntry = result.errors.find((entry) => entry.index === readyIdx);
          const savedEntry = result.savedReports?.find((entry) => entry.index === readyIdx);
          next[index] = errorEntry
            ? { ...item, status: "save-error", error: errorEntry.reason }
            : { ...item, status: "saved", error: undefined, savedReportId: savedEntry?.reportId };
          readyIdx += 1;
        }
      });
      return next;
    });
  };

  const handleSaveAll = async () => {
    if (!onBatchSave) return;
    setSavingAll(true);
    try {
      const result = await onBatchSave(batchItems.filter((item) => item.status === "ready" || item.status === "save-error"));
      applySaveResultToItems(result, ["ready", "save-error"]);
      setSaveResult(result);
      toast.success(`${result.saved} reportes guardados${result.errors.length > 0 ? `, ${result.errors.length} con errores` : ""}`);
    } catch (error) {
      toast.error("No se pudieron guardar los reportes", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSavingAll(false);
    }
  };

  const handleSaveItem = async (index: number) => {
    if (!onBatchSave) return;
    const item = batchItems[index];
    if (!item || (item.status !== "ready" && item.status !== "save-error")) return;

    setSavingIndex(index);
    try {
      const result = await onBatchSave([item]);
      const errorEntry = result.errors[0];
      const savedEntry = result.savedReports?.[0];

      setBatchItems((prev) => {
        const next = [...prev];
        next[index] = errorEntry
          ? { ...next[index], status: "save-error", error: errorEntry.reason }
          : { ...next[index], status: "saved", error: undefined, savedReportId: savedEntry?.reportId };
        return next;
      });

      if (errorEntry) {
        toast.error("No se pudo guardar el reporte", { description: errorEntry.reason });
      } else {
        setExpandedIndex(null);
        toast.success("Reporte guardado correctamente");
      }
    } catch (error) {
      toast.error("No se pudo guardar el reporte", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSavingIndex(null);
    }
  };

  const handleGenerateSavedExcel = async (index: number) => {
    const item = batchItems[index];
    if (!item?.savedReportId || !item.tipo) return;

    setGeneratingExcelIndex(index);
    try {
      await downloadReportExcel(item.tipo, item.savedReportId);
      toast.success("Excel generado correctamente");
    } catch {
      toast.error("No se pudo generar el Excel");
    } finally {
      setGeneratingExcelIndex(null);
    }
  };

  const cancelBatch = () => {
    setBatchMode(false);
    setBatchItems([]);
    setExpandedIndex(null);
    setSaveResult(null);
  };

  const removeBatchItem = (index: number) => {
    setBatchItems((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
    setExpandedIndex((prev) => {
      if (prev === null) return null;
      if (prev === index) return null;
      return prev > index ? prev - 1 : prev;
    });
    setSaveResult(null);
  };

  const processedCount = batchItems.filter((item) => item.status !== "pending" && item.status !== "waiting" && item.status !== "processing").length;
  const totalCount = batchItems.length;
  const readyCount = batchItems.filter((item) => item.status === "ready" || item.status === "save-error").length;
  const isProcessing = batchItems.some((item) => item.status === "processing" || item.status === "waiting" || item.status === "pending");

  if (batchMode) {
    return (
      <Card className="mx-auto w-full overflow-hidden">
        <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
          <div className="flex items-start gap-3">
            <div className="flex shrink-0 items-center justify-center text-primary">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="section-eyebrow">Analisis con IA</div>
              <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">Procesamiento multiple de reportes</h3>
              <p className="section-copy">Archivos detectados: {totalCount}. Revise cada resultado antes de guardarlo.</p>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-5 sm:p-6 lg:p-4">
          {isProcessing && (
            <div className="panel-subtle space-y-2 p-4">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Procesando archivos...</span>
                <span>{processedCount}/{totalCount}</span>
              </div>
              <Progress value={(processedCount / totalCount) * 100} className="h-2" />
            </div>
          )}

          <div className="space-y-2">
            {batchItems.map((item, index) => {
              const data = getBatchItemFormData(item);
              const canEdit = item.status === "ready" || item.status === "save-error";

              return (
                <ReportListRow
                  key={`${item.fileName}-${index}`}
                  origin="subida"
                  type={item.tipo}
                  status={getBatchRowStatus(item.status)}
                  title={item.fileName}
                  reportNumber={data?.no_reporte}
                  date={data?.fecha}
                  unit={item.vehicleData?.vehiculo || item.boatData?.embarcacion}
                  station={data?.estacion}
                  expanded={expandedIndex === index}
                  expandable={canEdit}
                  statusText={item.aiMessage || (item.status === "saved" ? "Guardado" : undefined)}
                  errorText={(item.status === "error" || item.status === "save-error") ? item.error : undefined}
                  onExpandedChange={canEdit ? (open) => setExpandedIndex(open ? index : null) : undefined}
                  onRemove={
                    item.status !== "processing" && item.status !== "waiting" && item.status !== "pending" && item.status !== "saved"
                      ? () => removeBatchItem(index)
                      : undefined
                  }
                  removeLabel={`Quitar ${item.fileName}`}
                  onGenerateExcel={item.savedReportId ? () => handleGenerateSavedExcel(index) : undefined}
                  generatingExcel={generatingExcelIndex === index}
                >
                  {item.tipo === "vehiculo" && item.vehicleData && (
                    <VehicleReportForm
                      data={item.vehicleData}
                      onChange={(nextData) => {
                        setBatchItems((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], vehicleData: nextData, error: undefined, status: "ready" };
                          return next;
                        });
                      }}
                      onSave={() => handleSaveItem(index)}
                      onCancel={() => setExpandedIndex(null)}
                      saving={savingIndex === index}
                      saveLabel="Guardar reporte"
                      stationOptions={stationOptions}
                      unitOptions={vehicleUnitOptions}
                      peopleOptions={peopleOptions}
                      motiveOptions={motiveOptions}
                      siteOptions={siteOptions}
                    />
                  )}
                  {item.tipo === "embarcacion" && item.boatData && (
                    <BoatReportForm
                      data={item.boatData}
                      onChange={(nextData) => {
                        setBatchItems((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], boatData: nextData, error: undefined, status: "ready" };
                          return next;
                        });
                      }}
                      onSave={() => handleSaveItem(index)}
                      onCancel={() => setExpandedIndex(null)}
                      saving={savingIndex === index}
                      saveLabel="Guardar reporte"
                      stationOptions={stationOptions}
                      unitOptions={boatUnitOptions}
                      peopleOptions={peopleOptions}
                      motiveOptions={motiveOptions}
                      siteOptions={siteOptions}
                    />
                  )}
                </ReportListRow>
              );
            })}
          </div>

          {saveResult && (
            <Card className="space-y-1 bg-muted/50 p-3 text-sm">
              <div className="font-medium">Resultado: {saveResult.saved} guardados, {saveResult.errors.length} con errores</div>
              {saveResult.errors.map((error, index) => (
                <div key={index} className="text-xs text-destructive">
                  {batchItems[index]?.fileName || `Archivo ${error.index + 1}`}: {error.reason}
                </div>
              ))}
            </Card>
          )}

          <div className="flex flex-col gap-2 border-t border-border/70 pt-4 sm:flex-row">
            {!saveResult && (
              <Button onClick={handleSaveAll} disabled={savingAll || isProcessing || readyCount === 0} size="sm" className="sm:min-w-48">
                {savingAll ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Guardar todos ({readyCount})
              </Button>
            )}
            <Button variant="outline" onClick={cancelBatch} size="sm">
              <X className="h-4 w-4 mr-1" />{saveResult ? "Cerrar" : "Cancelar"}
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full overflow-hidden">
      {showIntroHeader && (
        <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
          <div className="flex items-start gap-3">
            <div className="flex shrink-0 items-center justify-center text-primary">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="section-eyebrow">{headerEyebrow}</div>
              <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">{headerTitle}</h3>
              <p className="section-copy">{headerDescription}</p>
            </div>
          </div>
        </div>
      )}
      <div className="space-y-4 p-5 sm:p-6 lg:p-4">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = event.target.files;
            if (files && files.length > 0) handleFiles(files);
          }}
        />
        <div className="panel-subtle flex flex-col gap-3 p-4 sm:flex-row">
          <Button
            onClick={() => inputRef.current?.click()}
            disabled={loading}
            className="w-full sm:w-auto sm:min-w-52"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {loading ? (singleAiMessage || "Procesando...") : "Seleccionar Archivos"}
          </Button>
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Formatos permitidos: XLSX y XLS.
        </p>
      </div>
    </Card>
  );
};

export default ReportUploader;

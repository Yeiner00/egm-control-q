import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadXlsx } from "@/lib/xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, FileSpreadsheet, ChevronDown, ChevronUp, Save, X, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { createAiServiceError, createAiServiceErrorFromSupabaseFunctionError, isAiRateLimitError, runAiTask, type AiTaskStatus } from "@/lib/aiRateLimit";
import VehicleReportForm, { type VehicleFormData } from "./VehicleReportForm";
import BoatReportForm, { type BoatFormData } from "./BoatReportForm";
import {
  mapToBoatFormData,
  mapToVehicleFormData,
  type ExtractedReportData,
  type ExtractedReportType,
} from "@/lib/report-utils";
import { extractReportFromWorkbook, mergeExtractedReportData } from "@/lib/reportWorkbookExtraction";

interface ReportUploaderProps {
  onExtracted: (data: ExtractedReportData) => void;
  onBatchSave?: (items: BatchItem[]) => Promise<{ saved: number; errors: { index: number; reason: string }[] }>;
  showIntroHeader?: boolean;
  headerEyebrow?: string;
  headerTitle?: string;
  headerDescription?: string;
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
}

const aiStatusToBatchStatus = (status: AiTaskStatus["status"]): BatchItem["status"] =>
  status === "queued" || status === "waiting" || status === "rate_limited" ? "waiting" : "processing";

const MAX_REPORT_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_REPORT_EXTENSIONS = new Set(["xlsx", "xls"]);

const ReportUploader = ({
  onExtracted,
  onBatchSave,
  showIntroHeader = true,
  headerEyebrow = "Subir reporte excel",
  headerTitle = "Procesar reporte Excel",
  headerDescription = "Cargue uno o varios archivos de viaje. El sistema identifica el tipo de reporte y prepara la información para revisión.",
}: ReportUploaderProps) => {
  const [loading, setLoading] = useState(false);
  const [batchMode, setBatchMode] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [saveResult, setSaveResult] = useState<{ saved: number; errors: { index: number; reason: string }[] } | null>(null);
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
      if (!textContent.trim()) return { error: "Archivo vacío" };

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
      // Single file: use original flow
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
        toast.success(`Reporte de ${result.data.tipo === "vehiculo" ? "vehículo" : "embarcación"} detectado`);
      }
      return;
    }

    // Multiple files: batch mode
    setBatchMode(true);
    setSaveResult(null);
    const items: BatchItem[] = Array.from(files).map(f => ({
      fileName: f.name,
      status: "pending" as const,
    }));
    setBatchItems([...items]);

    const fileArr = Array.from(files);
    for (let i = 0; i < fileArr.length; i += 1) {
      setBatchItems(prev => {
        const next = [...prev];
        next[i] = { ...next[i], status: "processing", aiMessage: "Preparando archivo para IA." };
        return next;
      });

      const result = await processFile(fileArr[i], (status) => {
        setBatchItems(prev => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: aiStatusToBatchStatus(status.status),
            aiMessage: status.message,
          };
          return next;
        });
      });

      setBatchItems(prev => {
        const next = [...prev];
        if (result.error) {
          next[i] = { ...next[i], status: "error", error: result.error, aiMessage: undefined };
        } else if (result.data) {
          const tipo = result.data.tipo as ExtractedReportType;
          next[i] = {
            ...next[i],
            status: "ready",
            aiMessage: undefined,
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

  const handleSaveAll = async () => {
    if (!onBatchSave) return;
    setSavingAll(true);
    const result = await onBatchSave(batchItems.filter(item => item.status === "ready"));

    setBatchItems(prev => {
      const next = [...prev];
      let readyIdx = 0;
      next.forEach((item, i) => {
        if (item.status === "ready") {
          const errorEntry = result.errors.find(e => e.index === readyIdx);
          if (errorEntry) {
            next[i] = { ...item, status: "save-error", error: errorEntry.reason };
          } else {
            next[i] = { ...item, status: "saved" };
          }
          readyIdx++;
        }
      });
      return next;
    });

    setSaveResult(result);
    setSavingAll(false);
    toast.success(`${result.saved} reportes guardados${result.errors.length > 0 ? `, ${result.errors.length} con errores` : ""}`);
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

  const processedCount = batchItems.filter(i => i.status !== "pending" && i.status !== "waiting" && i.status !== "processing").length;
  const totalCount = batchItems.length;
  const readyCount = batchItems.filter(i => i.status === "ready").length;
  const isProcessing = batchItems.some(i => i.status === "processing" || i.status === "waiting" || i.status === "pending");

  if (batchMode) {
    return (
      <Card className="mx-auto w-full overflow-hidden">
        <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
          <div className="flex items-start gap-3">
            <div className="flex shrink-0 items-center justify-center text-primary">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="section-eyebrow">Análisis con IA</div>
              <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">Procesamiento múltiple de reportes</h3>
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
          {batchItems.map((item, i) => (
            <Collapsible key={i} open={expandedIndex === i} onOpenChange={(open) => setExpandedIndex(open ? i : null)}>
              <div className={`rounded-[calc(var(--radius)-0.08rem)] border ${item.status === "error" || item.status === "save-error" ? "border-destructive bg-destructive/5" : item.status === "saved" ? "border-green-500/60 bg-green-500/5" : "border-border/80 bg-card/70"}`}>
                <CollapsibleTrigger asChild>
                  <button className="flex w-full items-center justify-between rounded-[calc(var(--radius)-0.08rem)] p-3 text-sm hover:bg-muted/40">
                    <div className="flex items-center gap-2 min-w-0">
                      {(item.status === "processing" || item.status === "waiting") && <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />}
                      {item.status === "pending" && <div className="h-4 w-4 rounded-full border-2 border-muted-foreground shrink-0" />}
                      {item.status === "ready" && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                      {item.status === "saved" && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
                      {(item.status === "error" || item.status === "save-error") && <AlertCircle className="h-4 w-4 text-destructive shrink-0" />}
                      <span className="truncate">{item.fileName}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.tipo && <Badge variant="outline" className="text-xs">{item.tipo === "vehiculo" ? "Vehículo" : "Embarcación"}</Badge>}
                      {item.vehicleData && <Badge variant="secondary" className="text-xs">#{item.vehicleData.no_reporte}</Badge>}
                      {item.boatData && <Badge variant="secondary" className="text-xs">#{item.boatData.no_reporte}</Badge>}
                      {item.aiMessage && <span className="hidden text-xs text-muted-foreground sm:inline">{item.aiMessage}</span>}
                      {(item.status === "error" || item.status === "save-error") && <span className="text-xs text-destructive">{item.error}</span>}
                      {item.status === "saved" && <span className="text-xs text-green-600">Guardado</span>}
                      {item.status !== "processing" && item.status !== "waiting" && item.status !== "pending" && item.status !== "saved" && (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Quitar ${item.fileName}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius)-0.16rem)] text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            removeBatchItem(i);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              removeBatchItem(i);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </span>
                      )}
                      {item.status === "ready" && (expandedIndex === i ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                    </div>
                  </button>
                </CollapsibleTrigger>
                {item.status === "ready" && (
                  <CollapsibleContent className="px-3 pb-3">
                    {item.tipo === "vehiculo" && item.vehicleData && (
                      <VehicleReportForm
                        data={item.vehicleData}
                        onChange={(d) => {
                          setBatchItems(prev => {
                            const next = [...prev];
                            next[i] = { ...next[i], vehicleData: d };
                            return next;
                          });
                        }}
                        onSave={() => {}}
                        onCancel={() => {}}
                        saving={false}
                        hideActions
                      />
                    )}
                    {item.tipo === "embarcacion" && item.boatData && (
                      <BoatReportForm
                        data={item.boatData}
                        onChange={(d) => {
                          setBatchItems(prev => {
                            const next = [...prev];
                            next[i] = { ...next[i], boatData: d };
                            return next;
                          });
                        }}
                        onSave={() => {}}
                        onCancel={() => {}}
                        saving={false}
                        hideActions
                      />
                    )}
                  </CollapsibleContent>
                )}
              </div>
            </Collapsible>
          ))}
        </div>

        {saveResult && (
          <Card className="space-y-1 bg-muted/50 p-3 text-sm">
            <div className="font-medium">Resultado: {saveResult.saved} guardados, {saveResult.errors.length} con errores</div>
            {saveResult.errors.map((e, i) => (
              <div key={i} className="text-xs text-destructive">• {batchItems.find((_, idx) => {
                let readyIdx = 0;
                for (let j = 0; j <= idx; j++) {
                  if (batchItems[j].status === "saved" || batchItems[j].status === "save-error") {
                    if (readyIdx === e.index) return j === idx;
                    readyIdx++;
                  }
                }
                return false;
              })?.fileName || `Archivo ${e.index + 1}`}: {e.reason}</div>
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
        onChange={(e) => {
          const f = e.target.files;
          if (f && f.length > 0) handleFiles(f);
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

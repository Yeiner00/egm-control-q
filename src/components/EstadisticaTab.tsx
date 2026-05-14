import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Copy, Download, FileJson, FileSpreadsheet, Loader2, Printer, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  buildSquadPeriodsOverlappingYear,
  dateKeyCompare,
  getSquadPeriodForDate,
  getSquadType,
  toDateKey,
  type SquadPeriod,
  type SquadType,
} from "@/lib/squadCalendar";
import { loadAvailableReportYears } from "@/lib/reportYears";
import { loadReportPeopleByIds, type ReportPersonWithRoles } from "@/lib/reportPeople";
import {
  buildStatisticAiPackage,
  parseStatisticAiCells,
  type StatisticAiRejectedCell,
  type StatisticSiteRecord,
} from "@/lib/statisticAi";
import {
  buildStatisticFileName,
  downloadBytes,
  patchStatisticWorkbookBytes,
  type StatisticBoatReport,
  type StatisticMotiveRecord,
  type StatisticReportPersonRecord,
  type StatisticVehicleReport,
  type StatisticWorkbookSummary,
} from "@/lib/statisticWorkbook";

const TEMPLATE_PATH = "/templates/estadistica-template.xlsx";

type MotiveRow = StatisticMotiveRecord;
type GenerationMode = "ai" | "manual";
type AiProcessingFeedback = {
  type: "success" | "warning" | "error";
  title: string;
  message: string;
} | null;

type PreparedStatisticReview = {
  vehicleReports: StatisticVehicleReport[];
  boatReports: StatisticBoatReport[];
  motives: MotiveRow[];
  sites: StatisticSiteRecord[];
  people: StatisticReportPersonRecord[];
  templateBytes: Uint8Array;
  workbookSummary: StatisticWorkbookSummary;
  novedadesJson: string;
};

const StepHeading = ({ number, title, description }: { number: number; title: string; description?: string }) => (
  <div className="flex items-start gap-4">
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-2xl font-bold text-primary">
      {number}
    </div>
    <div className="space-y-1 pt-1">
      <h4 className="text-base font-semibold text-foreground">{title}</h4>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  </div>
);

const StepBox = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-lg border border-border/80 bg-muted/30 p-4 ${className}`}>{children}</div>
);

const DetailTag = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex h-8 items-center rounded-md border border-border/80 bg-background px-3 text-sm font-medium text-foreground">
    {children}
  </span>
);

const SPANISH_MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const formatDayMonth = (dateKey: string) => {
  const [, rawMonth, rawDay] = dateKey.split("-");
  const monthIndex = Number(rawMonth) - 1;
  return `${Number(rawDay)} de ${SPANISH_MONTHS[monthIndex] || rawMonth}`;
};

const formatPeriodLabel = (period: SquadPeriod) => `${formatDayMonth(period.startDate)} al ${formatDayMonth(period.endDate)}`;

const formatSquadLabel = (squad: SquadType) => squad === "alfa" ? "Escuadra Alfa" : "Escuadra Bravo";

const flattenReportPeople = (peopleMap: Map<string, ReportPersonWithRoles[]>): StatisticReportPersonRecord[] =>
  Array.from(peopleMap.values())
    .flat()
    .map((person) => ({
      reporte_id: person.reporte_id,
      tipo_reporte: person.tipo_reporte,
      nombre_normalizado: person.nombre_normalizado,
      roles: person.roles,
    }));

const mergeYears = (years: string[], currentYear: number) =>
  Array.from(new Set(years))
    .filter((year) => /^\d{4}$/.test(year))
    .filter((year) => Number(year) <= currentYear)
    .sort((a, b) => Number(b) - Number(a));

const selectDefaultYear = (years: string[], currentYear: number) => {
  const currentYearText = String(currentYear);
  if (years.includes(currentYearText)) return currentYearText;
  return years.find((year) => Number(year) <= currentYear) || currentYearText;
};

const buildSelectablePeriods = (year: number, squad: SquadType, todayKey: string) =>
  buildSquadPeriodsOverlappingYear(year, squad).filter((period) => dateKeyCompare(period.startDate, todayKey) <= 0);

const selectDefaultPeriodStart = (periods: SquadPeriod[], today: Date) => {
  const currentPeriod = getSquadPeriodForDate(today);
  if (currentPeriod && periods.some((period) => period.startDate === currentPeriod.startDate)) {
    return currentPeriod.startDate;
  }

  return periods[periods.length - 1]?.startDate || "";
};

const downloadJson = (jsonText: string, fileName: string) => {
  const blob = new Blob([jsonText], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const loadTemplateBytes = async () => {
  const response = await fetch(TEMPLATE_PATH);
  if (!response.ok) {
    throw new Error("No se pudo cargar la plantilla de estadistica");
  }

  return new Uint8Array(await response.arrayBuffer());
};

const EstadisticaTab = () => {
  const today = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => toDateKey(today), [today]);
  const currentYear = today.getFullYear();
  const currentPeriod = useMemo(() => getSquadPeriodForDate(today), [today]);
  const [selectedSquad, setSelectedSquad] = useState<SquadType>(() => currentPeriod?.squad || getSquadType(today));
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedPeriodStart, setSelectedPeriodStart] = useState("");
  const [years, setYears] = useState<string[]>([String(currentYear)]);
  const [loadingYears, setLoadingYears] = useState(true);
  const [loadingGenerationMode, setLoadingGenerationMode] = useState<GenerationMode | null>(null);
  const [step, setStep] = useState<"select" | "review">("select");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("manual");
  const [vehicleReports, setVehicleReports] = useState<StatisticVehicleReport[]>([]);
  const [boatReports, setBoatReports] = useState<StatisticBoatReport[]>([]);
  const [motives, setMotives] = useState<MotiveRow[]>([]);
  const [reportPeople, setReportPeople] = useState<StatisticReportPersonRecord[]>([]);
  const [templateBytes, setTemplateBytes] = useState<Uint8Array | null>(null);
  const [workbookSummary, setWorkbookSummary] = useState<StatisticWorkbookSummary | null>(null);
  const [novedadesJson, setNovedadesJson] = useState("");
  const [aiResponseText, setAiResponseText] = useState("");
  const [aiRejectedCells, setAiRejectedCells] = useState<StatisticAiRejectedCell[]>([]);
  const [aiAcceptedCells, setAiAcceptedCells] = useState<number | null>(null);
  const [processedWorkbookBytes, setProcessedWorkbookBytes] = useState<Uint8Array | null>(null);
  const [aiProcessingFeedback, setAiProcessingFeedback] = useState<AiProcessingFeedback>(null);
  const [showGeneratedDetails, setShowGeneratedDetails] = useState(false);
  const [emptyPeriodMessage, setEmptyPeriodMessage] = useState<string | null>(null);

  const periods = useMemo(
    () => buildSelectablePeriods(Number(selectedYear), selectedSquad, todayKey),
    [selectedSquad, selectedYear, todayKey],
  );
  const selectedPeriod = periods.find((period) => period.startDate === selectedPeriodStart) || periods[0];
  const totalReports = vehicleReports.length + boatReports.length;
  const reportsWithNovedades = [...vehicleReports, ...boatReports].filter((report) => report.novedades?.trim()).length;
  const pendingCount = (workbookSummary?.pendingReports.length || 0) + (workbookSummary?.pendingMotives.length || 0) + aiRejectedCells.length;

  useEffect(() => {
    const loadYears = async () => {
      setLoadingYears(true);
      try {
        const [vehicleYears, boatYears] = await Promise.all([
          loadAvailableReportYears("reportes_vehiculo"),
          loadAvailableReportYears("reportes_embarcacion"),
        ]);
        const availableYears = mergeYears([...vehicleYears, ...boatYears], currentYear);
        const nextYears = availableYears.length > 0 ? availableYears : [String(currentYear)];
        setYears(nextYears);
        setSelectedYear((current) => nextYears.includes(current) ? current : selectDefaultYear(nextYears, currentYear));
      } catch {
        toast.error("No se pudieron cargar los anos disponibles");
        setYears([String(currentYear)]);
      } finally {
        setLoadingYears(false);
      }
    };

    loadYears();
  }, [currentYear]);

  useEffect(() => {
    if (!loadingYears && years.length > 0 && !years.includes(selectedYear)) {
      setSelectedYear(selectDefaultYear(years, currentYear));
    }
  }, [currentYear, loadingYears, selectedYear, years]);

  useEffect(() => {
    if (periods.length === 0) {
      setSelectedPeriodStart("");
      return;
    }

    if (!periods.some((period) => period.startDate === selectedPeriodStart)) {
      setSelectedPeriodStart(selectDefaultPeriodStart(periods, today));
    }
  }, [periods, selectedPeriodStart, today]);

  useEffect(() => {
    setEmptyPeriodMessage(null);
  }, [selectedSquad, selectedYear, selectedPeriodStart]);

  const resetSelection = () => {
    setStep("select");
    setGenerationMode("manual");
    setVehicleReports([]);
    setBoatReports([]);
    setMotives([]);
    setReportPeople([]);
    setTemplateBytes(null);
    setWorkbookSummary(null);
    setNovedadesJson("");
    setAiResponseText("");
    setAiRejectedCells([]);
    setAiAcceptedCells(null);
    setProcessedWorkbookBytes(null);
    setAiProcessingFeedback(null);
    setShowGeneratedDetails(false);
    setEmptyPeriodMessage(null);
  };

  const loadPreparedStatistic = async (): Promise<PreparedStatisticReview | null> => {
    if (!selectedPeriod) {
      throw new Error("Seleccione un periodo");
    }

    const [vehiclesResponse, boatsResponse] = await Promise.all([
      supabase
        .from("reportes_vehiculo")
        .select("id, fecha, no_reporte, vehiculo, hora_salida, hora_regreso, total_horas, kilometros_recorridos, combustible_trasegado_bomba, combustible_gastado, novedades")
        .gte("fecha", selectedPeriod.startDate)
        .lte("fecha", selectedPeriod.endDate)
        .order("fecha", { ascending: true }),
      supabase
        .from("reportes_embarcacion")
        .select("id, fecha, no_reporte, embarcacion, hora_salida, hora_regreso, millas_nauticas, horas_navegadas, horas_motor_babor, horas_motor_centro, horas_motor_estribor, combustible_trasegado_bodega, combustible_gastado, novedades")
        .gte("fecha", selectedPeriod.startDate)
        .lte("fecha", selectedPeriod.endDate)
        .order("fecha", { ascending: true }),
    ]);

    if (vehiclesResponse.error) throw vehiclesResponse.error;
    if (boatsResponse.error) throw boatsResponse.error;

    const vehicles = (vehiclesResponse.data || []) as StatisticVehicleReport[];
    const boats = (boatsResponse.data || []) as StatisticBoatReport[];
    const totalPreparedReports = vehicles.length + boats.length;

    if (totalPreparedReports === 0) {
      const message = `Semana sin datos: no hay reportes para ${formatSquadLabel(selectedSquad)} del ${formatPeriodLabel(selectedPeriod)}.`;
      setEmptyPeriodMessage(message);
      toast.info("Semana sin datos para el periodo seleccionado");
      return null;
    }

    const vehicleIds = vehicles.map((report) => report.id);
    const boatIds = boats.map((report) => report.id);
    const reportIds = [...vehicleIds, ...boatIds];
    const templateBytes = await loadTemplateBytes();
    let motives: MotiveRow[] = [];
    let sites: StatisticSiteRecord[] = [];
    let people: StatisticReportPersonRecord[] = [];

    if (reportIds.length > 0) {
      const [motivesResponse, sitesResponse, vehiclePeopleMap, boatPeopleMap] = await Promise.all([
        supabase
          .from("reporte_motivos")
          .select("reporte_id, tipo_reporte, motivo, motivo_key, motivo_original")
          .in("reporte_id", reportIds),
        supabase
          .from("reporte_sitios")
          .select("reporte_id, nombre_sitio, zona, posicion")
          .in("reporte_id", reportIds),
        loadReportPeopleByIds(vehicleIds, "vehiculo"),
        loadReportPeopleByIds(boatIds, "embarcacion"),
      ]);

      if (motivesResponse.error) throw motivesResponse.error;
      if (sitesResponse.error) throw sitesResponse.error;
      motives = (motivesResponse.data || []) as MotiveRow[];
      sites = (sitesResponse.data || []) as StatisticSiteRecord[];
      people = [...flattenReportPeople(vehiclePeopleMap), ...flattenReportPeople(boatPeopleMap)];
    }

    const baseWorkbook = patchStatisticWorkbookBytes(templateBytes, {
      startDate: selectedPeriod.startDate,
      endDate: selectedPeriod.endDate,
      squad: selectedPeriod.squad,
      vehicleReports: vehicles,
      boatReports: boats,
      motives,
      people,
    });
    const jsonText = JSON.stringify(
      buildStatisticAiPackage({
        period: selectedPeriod,
        vehicleReports: vehicles,
        boatReports: boats,
        motives,
        sites,
        sheetNames: baseWorkbook.summary.sheetNames,
      }),
      null,
      2,
    );

    return {
      vehicleReports: vehicles,
      boatReports: boats,
      motives,
      sites,
      people,
      templateBytes,
      workbookSummary: baseWorkbook.summary,
      novedadesJson: jsonText,
    };
  };

  const applyPreparedStatistic = (prepared: PreparedStatisticReview, mode: GenerationMode) => {
    setVehicleReports(prepared.vehicleReports);
    setBoatReports(prepared.boatReports);
    setMotives(prepared.motives);
    setReportPeople(prepared.people);
    setTemplateBytes(prepared.templateBytes);
    setWorkbookSummary(prepared.workbookSummary);
    setNovedadesJson(prepared.novedadesJson);
    setAiResponseText("");
    setAiRejectedCells([]);
    setAiAcceptedCells(null);
    setProcessedWorkbookBytes(null);
    setAiProcessingFeedback(null);
    setShowGeneratedDetails(false);
    setEmptyPeriodMessage(null);
    setGenerationMode(mode);
    setStep("review");
  };

  const applyAiJsonText = (jsonText: string, prepared: PreparedStatisticReview) => {
    if (!selectedPeriod) {
      toast.error("Seleccione un periodo");
      return;
    }

    if (!jsonText.trim()) {
      setProcessedWorkbookBytes(null);
      setAiRejectedCells([]);
      setAiAcceptedCells(null);
      setAiProcessingFeedback({
        type: "error",
        title: "Respuesta JSON pendiente",
        message: "Pegue la respuesta JSON de la IA antes de procesar la estadistica.",
      });
      toast.error("Pegue la respuesta JSON de la IA antes de procesar");
      return;
    }

    try {
      const aiResult = parseStatisticAiCells(jsonText, {
        startDate: selectedPeriod.startDate,
        sheetNames: prepared.workbookSummary.sheetNames,
      });

      setAiRejectedCells(aiResult.rejected);
      setAiAcceptedCells(aiResult.cells.length);

      if (aiResult.rejected.length > 0) {
        setProcessedWorkbookBytes(null);
        setAiProcessingFeedback({
          type: "error",
          title: "No se pudo activar la descarga",
          message: `${aiResult.cells.length} celda(s) valida(s), ${aiResult.rejected.length} rechazada(s). Corrija el JSON y vuelva a procesarlo.`,
        });
        toast.error("Corrija las celdas IA rechazadas");
        return;
      }

      if (aiResult.cells.length === 0) {
        setProcessedWorkbookBytes(null);
        setAiProcessingFeedback({
          type: "warning",
          title: "JSON procesado, pero sin celdas validas",
          message: "La respuesta no contiene datos aplicables al Excel. Revise la respuesta de IA.",
        });
        toast.warning("No hay celdas IA validas para descargar");
        return;
      }

      const patchedWorkbook = patchStatisticWorkbookBytes(prepared.templateBytes, {
        startDate: selectedPeriod.startDate,
        endDate: selectedPeriod.endDate,
        squad: selectedPeriod.squad,
        vehicleReports: prepared.vehicleReports,
        boatReports: prepared.boatReports,
        motives: prepared.motives,
        people: prepared.people,
        aiCells: aiResult.cells,
      });

      setProcessedWorkbookBytes(patchedWorkbook.bytes);
      setWorkbookSummary(patchedWorkbook.summary);
      setAiProcessingFeedback({
        type: "success",
        title: "JSON procesado correctamente",
        message: `${aiResult.cells.length} celda(s) IA valida(s). El Excel de estadistica esta listo para descargar.`,
      });
      toast.success("JSON procesado correctamente");
    } catch (error) {
      setAiRejectedCells([]);
      setAiAcceptedCells(null);
      setProcessedWorkbookBytes(null);
      setAiProcessingFeedback({
        type: "error",
        title: "No se pudo procesar el JSON",
        message: error instanceof Error ? error.message : "No se pudo leer la respuesta de IA",
      });
      toast.error(error instanceof Error ? error.message : "No se pudo leer la respuesta de IA");
    }
  };

  const invokeStatisticAi = async (jsonText: string) => {
    const payload = JSON.parse(jsonText);
    const { data, error } = await supabase.functions.invoke("generate-statistic-cells", {
      body: { package: payload },
    });

    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    const aiData = data?.data || data;
    if (!aiData) throw new Error("La IA no devolvio una respuesta valida");

    return JSON.stringify(aiData, null, 2);
  };

  const preparePreview = async (mode: GenerationMode) => {
    if (!selectedPeriod) {
      toast.error("Seleccione un periodo");
      return;
    }

    setLoadingGenerationMode(mode);
    setEmptyPeriodMessage(null);
    try {
      const prepared = await loadPreparedStatistic();
      if (!prepared) return;

      applyPreparedStatistic(prepared, mode);

      if (mode === "ai") {
        setAiProcessingFeedback({
          type: "warning",
          title: "Procesando con IA",
          message: "Lovable IA esta leyendo las novedades y preparando las celdas del Excel.",
        });
        const aiJsonText = await invokeStatisticAi(prepared.novedadesJson);
        setAiResponseText(aiJsonText);
        applyAiJsonText(aiJsonText, prepared);
      }
    } catch (error) {
      setProcessedWorkbookBytes(null);
      setAiProcessingFeedback({
        type: "error",
        title: "No se pudo generar la estadistica",
        message: error instanceof Error ? error.message : "No se pudo preparar la estadistica",
      });
      toast.error(error instanceof Error ? error.message : "No se pudo preparar la estadistica");
    } finally {
      setLoadingGenerationMode(null);
    }
  };

  const processAiResponse = () => {
    if (!templateBytes || !selectedPeriod || !workbookSummary) {
      toast.error("Primero genere la revision");
      return;
    }

    applyAiJsonText(aiResponseText, {
      vehicleReports,
      boatReports,
      motives,
      sites: [],
      people: reportPeople,
      templateBytes,
      workbookSummary,
      novedadesJson,
    });
  };

  const downloadProcessedWorkbook = () => {
    if (!processedWorkbookBytes || !selectedPeriod) {
      toast.error("Procese el JSON de IA antes de descargar el Excel");
      return;
    }

    downloadBytes(processedWorkbookBytes, buildStatisticFileName(selectedSquad, selectedPeriod.startDate, selectedPeriod.endDate));
    toast.success("Excel de estadistica descargado");
  };

  const exportJson = () => {
    if (!novedadesJson || !selectedPeriod) {
      toast.error("Primero genere la revision");
      return;
    }

    downloadJson(novedadesJson, `novedades-${selectedSquad}-${selectedPeriod.startDate}-al-${selectedPeriod.endDate}.json`);
  };

  const copyJson = async () => {
    if (!novedadesJson) {
      toast.error("Primero genere la revision");
      return;
    }

    try {
      await navigator.clipboard.writeText(novedadesJson);
      toast.success("JSON copiado al portapapeles");
    } catch {
      toast.error("No se pudo copiar el JSON");
    }
  };

  return (
    <div className="space-y-5 animate-fade-in lg:space-y-4">
      <Card className="overflow-hidden">
        <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
          <div className="flex items-start gap-3">
            <div className="flex shrink-0 items-center justify-center text-primary">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="section-eyebrow">Estadistica</div>
              <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">Generar estadistica por escuadra</h3>
              <p className="section-copy">
                Seleccione el bloque oficial y genere el Excel con IA o con el flujo manual de JSON.
              </p>
            </div>
          </div>
        </div>

        {step === "select" ? (
          <div className="space-y-5 p-5 sm:p-6 lg:p-4">
            <StepBox className="space-y-5">
              <StepHeading
                number={1}
                title="Seleccionar periodo"
                description="Elija la escuadra, el ano y el bloque oficial de ocho dias."
              />

              <div className="grid gap-4 lg:grid-cols-[220px_180px_minmax(260px,1fr)_auto] lg:items-end">
                <div className="space-y-2">
                  <Label>Escuadra</Label>
                  <Select value={selectedSquad} onValueChange={(value) => setSelectedSquad(value as SquadType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="alfa">Escuadra Alfa</SelectItem>
                      <SelectItem value="bravo">Escuadra Bravo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Ano</Label>
                  <Select value={selectedYear} onValueChange={setSelectedYear} disabled={loadingYears}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {years.map((year) => <SelectItem key={year} value={year}>{year}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Periodo de 8 dias</Label>
                  <Select value={selectedPeriod?.startDate || ""} onValueChange={setSelectedPeriodStart} disabled={periods.length === 0}>
                    <SelectTrigger><SelectValue placeholder="Seleccione un periodo" /></SelectTrigger>
                    <SelectContent>
                      {periods.map((period) => (
                        <SelectItem key={period.startDate} value={period.startDate}>
                          {formatPeriodLabel(period)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row lg:justify-end">
                  <Button type="button" onClick={() => preparePreview("ai")} disabled={!!loadingGenerationMode || !selectedPeriod}>
                    {loadingGenerationMode === "ai" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    Generar con IA
                  </Button>
                  <Button type="button" variant="outline" onClick={() => preparePreview("manual")} disabled={!!loadingGenerationMode || !selectedPeriod}>
                    {loadingGenerationMode === "manual" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileJson className="h-4 w-4" />}
                    Generar manual
                  </Button>
                </div>
              </div>

              {emptyPeriodMessage && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Semana sin datos</AlertTitle>
                  <AlertDescription>{emptyPeriodMessage}</AlertDescription>
                </Alert>
              )}
            </StepBox>

            <Alert>
              <CalendarDays className="h-4 w-4" />
              <AlertTitle>Periodo oficial</AlertTitle>
              <AlertDescription>
                Los periodos disponibles salen del calendario 8x8 del sistema. La fecha final se calcula automaticamente.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-5 p-5 sm:p-6 lg:p-4">
            <StepBox className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <StepHeading
                  number={1}
                  title="Periodo seleccionado"
                  description={`${totalReports} reporte${totalReports === 1 ? "" : "s"} dentro del rango. ${workbookSummary?.usedReports || 0} se mapearon a hojas del Excel.`}
                />

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={resetSelection}>
                    <RotateCcw className="h-4 w-4" />
                    Cambiar periodo
                  </Button>
                  <Button type="button" variant="outline" onClick={exportJson}>
                    <FileJson className="h-4 w-4" />
                    Descargar JSON
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-3 pl-[4.5rem] sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <DetailTag>{formatSquadLabel(selectedSquad)}</DetailTag>
                  {selectedPeriod && <DetailTag>{formatPeriodLabel(selectedPeriod)}</DetailTag>}
                  <DetailTag>{totalReports} reporte{totalReports === 1 ? "" : "s"}</DetailTag>
                </div>
                <Button type="button" variant="outline" onClick={() => setShowGeneratedDetails((current) => !current)}>
                  {showGeneratedDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {showGeneratedDetails ? "Ocultar detalles" : "Ver detalles"}
                </Button>
              </div>

              {showGeneratedDetails && (
                <div className="space-y-4 border-t border-border/70 pt-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="panel-subtle p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Reportes</div>
                    <div className="mt-2 text-2xl font-bold text-foreground">{totalReports}</div>
                  </div>
                  <div className="panel-subtle p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Con novedades</div>
                    <div className="mt-2 text-2xl font-bold text-foreground">{reportsWithNovedades}</div>
                  </div>
                  <div className="panel-subtle p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pendientes</div>
                    <div className="mt-2 text-2xl font-bold text-foreground">{pendingCount}</div>
                  </div>
                  <div className="panel-subtle p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">IA validas</div>
                    <div className="mt-2 text-2xl font-bold text-foreground">{aiAcceptedCells ?? "-"}</div>
                  </div>
                </div>

                {workbookSummary && workbookSummary.pendingReports.length > 0 ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Reportes pendientes de mapeo</AlertTitle>
                    <AlertDescription>
                      <div className="mt-2 space-y-1">
                        {workbookSummary.pendingReports.slice(0, 8).map((report) => (
                          <div key={`${report.tipo}-${report.id}`}>
                            {report.tipo} {report.no_reporte || "sin numero"} - {report.unidad || "sin unidad"} ({report.reason})
                          </div>
                        ))}
                        {workbookSummary.pendingReports.length > 8 && (
                          <div>Y {workbookSummary.pendingReports.length - 8} pendiente(s) mas.</div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <CheckCircle2 className="h-4 w-4" />
                    <AlertTitle>Hojas reconocidas</AlertTitle>
                    <AlertDescription>Todos los reportes con unidad se pudieron ubicar en una hoja existente del Excel.</AlertDescription>
                  </Alert>
                )}

                {workbookSummary && workbookSummary.pendingMotives.length > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Motivos pendientes de mapeo</AlertTitle>
                    <AlertDescription>
                      <div className="mt-2 space-y-1">
                        {workbookSummary.pendingMotives.slice(0, 8).map((motive) => (
                          <div key={`${motive.reporte_id}-${motive.motivo_key}`}>
                            {motive.tipo_reporte} - {motive.motivo}
                          </div>
                        ))}
                        {workbookSummary.pendingMotives.length > 8 && (
                          <div>Y {workbookSummary.pendingMotives.length - 8} motivo(s) pendiente(s) mas.</div>
                        )}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}

                {workbookSummary && workbookSummary.omittedData.length > 0 && (
                  <Alert>
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Datos omitidos por ahora</AlertTitle>
                    <AlertDescription>
                      <div className="mt-2 space-y-1">
                        {workbookSummary.omittedData.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              )}
            </StepBox>

            {aiRejectedCells.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Celdas IA rechazadas</AlertTitle>
                <AlertDescription>
                  <div className="mt-2 space-y-1">
                    {aiRejectedCells.slice(0, 8).map((cell) => (
                      <div key={`${cell.index}-${cell.reason}`}>
                        #{cell.index + 1}: {cell.message}
                      </div>
                    ))}
                    {aiRejectedCells.length > 8 && (
                      <div>Y {aiRejectedCells.length - 8} celda(s) pendiente(s) mas.</div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {generationMode === "ai" ? (
              <StepBox>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <StepHeading
                    number={2}
                    title="Generacion con IA"
                    description="Lovable IA procesa las novedades y prepara el Excel para descargar."
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" onClick={copyJson}>
                      <Copy className="h-4 w-4" />
                      Copiar JSON base
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setGenerationMode("manual")}>
                      <FileJson className="h-4 w-4" />
                      Usar flujo manual
                    </Button>
                  </div>
                </div>
              </StepBox>
            ) : (
              <>
                <StepBox>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <StepHeading
                      number={2}
                      title="Copiar novedades JSON"
                      description="Use este archivo para procesar las novedades con IA."
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={copyJson}>
                        <Copy className="h-4 w-4" />
                        Copiar JSON
                      </Button>
                      <Button type="button" variant="outline" onClick={exportJson}>
                        <Download className="h-4 w-4" />
                        Descargar JSON
                      </Button>
                    </div>
                  </div>
                </StepBox>

                <StepBox className="space-y-3">
                  <StepHeading
                    number={3}
                    title="Pegar novedades JSON"
                    description="Pegue la respuesta procesada y valide los datos antes de descargar el Excel."
                  />
                  <Textarea
                    value={aiResponseText}
                    onChange={(event) => {
                      setAiResponseText(event.target.value);
                      setAiRejectedCells([]);
                      setAiAcceptedCells(null);
                      setProcessedWorkbookBytes(null);
                      setAiProcessingFeedback(null);
                    }}
                    className="min-h-[14rem] font-mono text-xs"
                    placeholder={'{"version":1,"celdas":[{"hoja":"SNG-16","fecha":"2026-04-01","fila":108,"valor":2,"fuente":"Reporte 123"}]}'}
                    aria-label="Pegar novedades JSON"
                  />
                  <div className="flex justify-end">
                    <Button type="button" onClick={processAiResponse}>
                      <CheckCircle2 className="h-4 w-4" />
                      Procesar JSON
                    </Button>
                  </div>
                </StepBox>
              </>
            )}

            {aiProcessingFeedback && (
              <Alert variant={aiProcessingFeedback.type === "error" ? "destructive" : "default"}>
                {aiProcessingFeedback.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                <AlertTitle>{aiProcessingFeedback.title}</AlertTitle>
                <AlertDescription>{aiProcessingFeedback.message}</AlertDescription>
              </Alert>
            )}

            <div className="flex flex-col-reverse gap-2 border-t border-border/70 pt-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={resetSelection}>
                <RotateCcw className="h-4 w-4" />
                Cancelar
              </Button>
              <Button type="button" onClick={downloadProcessedWorkbook} disabled={!processedWorkbookBytes || aiRejectedCells.length > 0}>
                <Printer className="h-4 w-4" />
                Descargar Excel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default EstadisticaTab;

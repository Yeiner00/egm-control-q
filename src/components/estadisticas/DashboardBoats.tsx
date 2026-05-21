import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Clock3, Copy, FileText, Filter, Loader2, Sparkles, Waves } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { decimalToHHMM, sumHoursToHHMM } from "@/lib/formatHours";
import ResultPanelState from "@/components/ResultPanelState";
import {
  buildProposalRoleSummaries,
  formatProposalRoleLabel,
  buildProposalTotalsGroups,
} from "@/lib/proposalTotals";
import {
  loadPeopleNameOptions,
  searchPersonParticipations,
} from "@/lib/reportPeople";
import { getErrorMessage } from "@/lib/errorMessage";
import { buildReportMonthRanges, getReportMonthBounds, isDateInReportMonthRanges } from "@/lib/reportMonthFilters";
import { createAiServiceError, createAiServiceErrorFromSupabaseFunctionError, runAiTask } from "@/lib/aiRateLimit";
import { loadAvailableReportYears } from "@/lib/reportYears";
import { downloadReportExcel } from "@/lib/reportExcelExport";
import ProposalReportCard from "./ProposalReportCard";
import ProposalTotalsSection from "./ProposalTotalsSection";

const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
const NAME_FILTER_EXCLUDED_ROLES = ["particular", "persona_particular"];
const GENERIC_ROLES = ["tripulante"];

type BoatReport = Tables<"reportes_embarcacion">;

interface DashboardBoatsProps {
  onEditReport?: (target: { tipo: "embarcacion"; reportId: string }) => void;
}

const DashboardBoats = ({ onEditReport }: DashboardBoatsProps) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [persona, setPersona] = useState("");
  const [personaOpen, setPersonaOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [personNames, setPersonNames] = useState<string[]>([]);
  const [reports, setReports] = useState<BoatReport[]>([]);
  const [motivos, setMotivos] = useState<Record<string, string[]>>({});
  const [rolesByReport, setRolesByReport] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryAiMessage, setSummaryAiMessage] = useState("");
  const [expandedNovedades, setExpandedNovedades] = useState<Set<string>>(new Set());
  const [years, setYears] = useState<string[]>([new Date().getFullYear().toString()]);
  const [printingReportId, setPrintingReportId] = useState("");

  useEffect(() => {
    const loadNames = async () => {
      try {
        const names = await loadPeopleNameOptions(NAME_FILTER_EXCLUDED_ROLES, "embarcacion");
        setPersonNames(names);
      } catch (error) {
        setPersonNames([]);
        toast.error("No se pudieron cargar las personas", {
          description: getErrorMessage(error),
        });
      }
    };
    loadNames();
  }, []);

  useEffect(() => {
    const loadYears = async () => {
      try {
        const availableYears = await loadAvailableReportYears("reportes_embarcacion");
        setYears(availableYears);
        setSelectedYear((current) =>
          availableYears.length > 0 && !availableYears.includes(current) ? availableYears[0] : current,
        );
      } catch (error) {
        toast.error("No se pudieron cargar los años disponibles", {
          description: getErrorMessage(error),
        });
      }
    };
    loadYears();
  }, []);

  const buildRoleDisplay = (roles: string[]) => {
    const specials = Array.from(
      new Set(roles.filter((role) => !GENERIC_ROLES.includes(role))),
    );
    const visibleRoles = specials.length > 0 ? specials : Array.from(new Set(roles));
    return visibleRoles.map((role) => formatProposalRoleLabel(role)).join(" / ");
  };

  const toggleMonth = (value: string) => {
    setSelectedMonths((prev) =>
      prev.includes(value) ? prev.filter((month) => month !== value) : [...prev, value],
    );
  };

  const toggleNovedades = (id: string) => {
    setExpandedNovedades((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const printReport = async (reportId: string) => {
    setPrintingReportId(reportId);
    try {
      await downloadReportExcel("embarcacion", reportId);
      toast.success("Excel generado correctamente");
    } catch {
      toast.error("No se pudo generar el Excel");
    } finally {
      setPrintingReportId("");
    }
  };

  const search = async () => {
    if (selectedMonths.length === 0 || !persona.trim()) {
      toast.error("Selecciona uno o mas meses y una persona");
      return;
    }
    setLoading(true);
    setSummary("");
    setExpandedNovedades(new Set());
    setRolesByReport({});
    try {
      const year = parseInt(selectedYear, 10);
      const monthRanges = buildReportMonthRanges(year, selectedMonths);
      const monthBounds = getReportMonthBounds(monthRanges);
      if (!monthBounds) {
        toast.error("Selecciona uno o mas meses y una persona");
        return;
      }

      const { data: boatReports, error: boatReportsError } = await supabase
        .from("reportes_embarcacion")
        .select("*")
        .eq("anio", year)
        .gte("fecha", monthBounds.startDate)
        .lt("fecha", monthBounds.endDateExclusive)
        .order("fecha", { ascending: true });
      if (boatReportsError) throw boatReportsError;

      const candidateReports = (boatReports || []).filter((report) =>
        isDateInReportMonthRanges(report.fecha, monthRanges),
      );
      if (candidateReports.length === 0) {
        setReports([]);
        setMotivos({});
        setRolesByReport({});
        toast.info("No se encontraron reportes para ese periodo");
        setLoading(false);
        return;
      }

      const personRecords = await searchPersonParticipations(
        persona.trim(),
        "embarcacion",
        candidateReports.map((report) => report.id),
      );

      if (!personRecords || personRecords.length === 0) {
        setReports([]);
        setMotivos({});
        setRolesByReport({});
        toast.info("No se encontraron reportes para esa persona");
        setLoading(false);
        return;
      }

      const reportIds = new Set(personRecords.map((p) => p.reporte_id));
      const reportRolesMap: Record<string, string[]> = {};
      personRecords.forEach((p) => {
        reportRolesMap[p.reporte_id] = p.roles;
      });

      const filtered = candidateReports.filter((report) => reportIds.has(report.id));

      const filteredIds = filtered.map((r) => r.id);
      const { data: motivosData, error: motivosError } = filteredIds.length > 0
        ? await supabase
          .from("reporte_motivos")
          .select("reporte_id, motivo")
          .eq("tipo_reporte", "embarcacion")
          .in("reporte_id", filteredIds)
        : { data: [], error: null };
      if (motivosError) throw motivosError;

      const motivoMap: Record<string, string[]> = {};
      (motivosData || []).forEach((m) => {
        if (!motivoMap[m.reporte_id]) motivoMap[m.reporte_id] = [];
        motivoMap[m.reporte_id].push(m.motivo);
      });

      setReports(filtered);
      setMotivos(motivoMap);
      setRolesByReport(reportRolesMap);
    } catch (error) {
      setReports([]);
      setMotivos({});
      setRolesByReport({});
      toast.error("Error al buscar reportes", {
        description: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const copySummary = async () => {
    if (!summary.trim()) return;

    try {
      await navigator.clipboard.writeText(summary);
      toast.success("Resumen copiado");
    } catch {
      toast.error("No se pudo copiar el resumen");
    }
  };

  const generateSummary = async () => {
    const novedades = reports.map((r) => r.novedades).filter(Boolean);
    if (novedades.length === 0) {
      toast.info("No hay novedades para resumir");
      return;
    }
    setLoadingSummary(true);
    setSummaryAiMessage("");
    try {
      const reportNumbers = reports.map((r) => r.no_reporte).join(", ");
      const embarcaciones = [...new Set(reports.map((r) => r.embarcacion).filter(Boolean))].join(", ");
      const totalMillasVal = reports.reduce((s, r) => s + (r.millas_nauticas || 0), 0);
      const data = await runAiTask(
        async () => {
          const result = await supabase.functions.invoke("summarize-novedades", {
            body: {
              novedades,
              persona,
              tipo: "embarcacion",
              reportNumbers,
              embarcaciones,
              totalMillas: totalMillasVal,
            },
          });
          if (result.error) throw await createAiServiceErrorFromSupabaseFunctionError(result.error, "Error al generar resumen");
          if (result.data?.error) throw createAiServiceError(result.data);
          return result.data;
        },
        {
          label: "Resumen de novedades embarcacion",
          onStatus: (status) => setSummaryAiMessage(status.message),
        },
      );
      setSummary(data?.summary || "No se pudo generar resumen");
    } catch (error) {
      toast.error("Error al generar resumen", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoadingSummary(false);
      setSummaryAiMessage("");
    }
  };

  const totalMillas = reports.reduce((s, r) => s + (r.millas_nauticas || 0), 0);
  const totalHours = sumHoursToHHMM(reports.map((r) => r.horas_navegadas));
  const unitGroups = buildProposalTotalsGroups(
    reports,
    (report) => report.embarcacion,
    (report) => report.no_reporte,
  );
  const totalReportNumbers = reports.map((report) => report.no_reporte).filter(Boolean);
  const roleSummaries = buildProposalRoleSummaries(
    reports,
    (report) => rolesByReport[report.id],
    (report) => report.no_reporte,
    GENERIC_ROLES,
  );

  return (
    <div className="space-y-4">
      <Card className="mx-auto w-full overflow-hidden">
        <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
          <div className="flex items-start gap-3">
            <div className="section-icon-shell">
              <Filter className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="section-eyebrow">Ingrese el filtro</div>
              <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">
                Aplicar filtros deseados
              </h3>
              <p className="section-copy">Seleccione el ano, el mes y el usuario.</p>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-5 sm:p-6 lg:p-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[220px_220px_1.2fr_auto] xl:items-end">
            <div className="space-y-2">
              <Label>Ano</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Mes</Label>
              <Popover open={monthOpen} onOpenChange={setMonthOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    {selectedMonths.length > 0
                      ? `${selectedMonths.length} mes${selectedMonths.length === 1 ? "" : "es"} seleccionado${selectedMonths.length === 1 ? "" : "s"}`
                      : "Seleccionar meses..."}
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar mes..." />
                    <CommandList>
                      <CommandEmpty>No se encontro.</CommandEmpty>
                      <CommandGroup>
                        {MONTHS.map((month, index) => {
                          const value = String(index + 1);
                          const isSelected = selectedMonths.includes(value);
                          return (
                            <CommandItem key={month} value={month} onSelect={() => toggleMonth(value)}>
                              <Checkbox checked={isSelected} className="mr-2" />
                              {month}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label>Nombre de persona</Label>
              <Popover open={personaOpen} onOpenChange={setPersonaOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    {persona || "Seleccionar persona..."}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar persona..." />
                    <CommandList>
                      <CommandEmpty>No se encontro.</CommandEmpty>
                      <CommandGroup>
                        {personNames.map((name) => (
                          <CommandItem
                            key={name}
                            value={name}
                            onSelect={() => {
                              setPersona(name);
                              setPersonaOpen(false);
                            }}
                          >
                            {name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <Button onClick={search} disabled={loading} className="xl:min-w-32">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
            </Button>
          </div>

          <div className="result-panel-shell">
            <div className="result-panel-body">
              {reports.length > 0 ? (
                <div className="result-panel-scroll">
                  <div className="result-panel-section">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-foreground">
                          Reportes encontrados para {persona}
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          {selectedMonths.map((month) => MONTHS[Number(month) - 1]).join(", ")} de{" "}
                          {selectedYear}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {reports.length} registro{reports.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <div className="result-panel-grid">
                      {reports.map((r) => (
                        <ProposalReportCard
                          key={r.id}
                          date={r.fecha}
                          reportNumber={r.no_reporte}
                          unit={r.embarcacion}
                          secondaryLabel={r.estacion}
                          role={buildRoleDisplay(rolesByReport[r.id] || [])}
                          metrics={[
                            {
                              label: "Millas",
                              value: r.millas_nauticas,
                            },
                            {
                              label: "Horas nav",
                              value: r.horas_navegadas == null ? null : decimalToHHMM(r.horas_navegadas),
                            },
                          ]}
                          tags={motivos[r.id] || []}
                          expanded={expandedNovedades.has(r.id)}
                          novedades={r.novedades}
                          onToggleNovedades={() => toggleNovedades(r.id)}
                          onPrint={() => printReport(r.id)}
                          printing={printingReportId === r.id}
                          onEdit={onEditReport ? () => onEditReport({ tipo: "embarcacion", reportId: r.id }) : undefined}
                        />
                      ))}
                    </div>
                  </div>

                  <ProposalTotalsSection
                    metrics={[
                      {
                        label: "Reportes",
                        value: String(reports.length),
                        icon: FileText,
                      },
                      {
                        label: "Millas",
                        value: String(totalMillas),
                        icon: Waves,
                      },
                      {
                        label: "Horas nav",
                        value: totalHours,
                        icon: Clock3,
                      },
                    ]}
                    unitSectionTitle="Reportes por embarcacion"
                    unitGroups={unitGroups}
                    totalReportNumbers={totalReportNumbers}
                    roleSummaries={roleSummaries}
                  />

                  <div className="result-panel-section">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="flex items-center gap-1 text-sm font-medium">
                        <Sparkles className="h-4 w-4" />
                        Resumen IA
                      </h4>
                      <div className="flex items-center gap-2">
                        {summary && (
                          <Button size="sm" variant="outline" onClick={copySummary}>
                            <Copy className="mr-1 h-3 w-3" />
                            Copiar
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={generateSummary} disabled={loadingSummary}>
                          {loadingSummary ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                          Generar
                        </Button>
                      </div>
                    </div>
                    {summary ? (
                      <p className="whitespace-pre-line text-sm text-muted-foreground">{summary}</p>
                    ) : loadingSummary && summaryAiMessage ? (
                      <p className="text-sm text-muted-foreground">{summaryAiMessage}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Genere el resumen para consolidar las novedades dentro de este panel.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <ResultPanelState
                  title="Sin resultados generados"
                  description="Seleccione el ano, el mes y la persona para consultar datos."
                />
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default DashboardBoats;

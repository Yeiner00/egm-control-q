import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Clock3, FileText, Filter, Loader2, Route, Sparkles } from "lucide-react";
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
const GENERIC_ROLES = ["acompanante", "acompañante"];

type VehicleReport = Tables<"reportes_vehiculo">;

interface DashboardVehiclesProps {
  onEditReport?: (target: { tipo: "vehiculo"; reportId: string }) => void;
}

const DashboardVehicles = ({ onEditReport }: DashboardVehiclesProps) => {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear().toString());
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [persona, setPersona] = useState("");
  const [personaOpen, setPersonaOpen] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const [personNames, setPersonNames] = useState<string[]>([]);
  const [reports, setReports] = useState<VehicleReport[]>([]);
  const [motivos, setMotivos] = useState<Record<string, string[]>>({});
  const [rolesByReport, setRolesByReport] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [activities, setActivities] = useState<{ activity: string; count: number }[]>([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [expandedNovedades, setExpandedNovedades] = useState<Set<string>>(new Set());
  const [years, setYears] = useState<string[]>([new Date().getFullYear().toString()]);
  const [printingReportId, setPrintingReportId] = useState("");

  useEffect(() => {
    const loadNames = async () => {
      const names = await loadPeopleNameOptions(NAME_FILTER_EXCLUDED_ROLES, "vehiculo");
      setPersonNames(names);
    };
    loadNames();
  }, []);

  useEffect(() => {
    const loadYears = async () => {
      try {
        const availableYears = await loadAvailableReportYears("reportes_vehiculo");
        setYears(availableYears);
        if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
          setSelectedYear(availableYears[0]);
        }
      } catch {
        toast.error("No se pudieron cargar los años disponibles");
      }
    };
    loadYears();
  }, [selectedYear]);

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
      await downloadReportExcel("vehiculo", reportId);
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
    setActivities([]);
    setExpandedNovedades(new Set());
    setRolesByReport({});
    try {
      const year = parseInt(selectedYear);
      const personRecords = await searchPersonParticipations(persona.trim(), "vehiculo");

      if (!personRecords || personRecords.length === 0) {
        setReports([]);
        setRolesByReport({});
        toast.info("No se encontraron reportes para esa persona");
        setLoading(false);
        return;
      }

      const reportIds = personRecords.map((p) => p.reporte_id);
      const reportRolesMap: Record<string, string[]> = {};
      personRecords.forEach((p) => {
        reportRolesMap[p.reporte_id] = p.roles;
      });

      const { data: vehicleReports } = await supabase
        .from("reportes_vehiculo")
        .select("*")
        .in("id", reportIds)
        .eq("anio", year);

      const filtered = (vehicleReports || []).filter((r) => {
        if (!r.fecha) return false;
        const month = new Date(r.fecha).getMonth() + 1;
        return selectedMonths.includes(String(month));
      });

      const filteredIds = filtered.map((r) => r.id);
      const { data: motivosData } = await supabase
        .from("reporte_motivos")
        .select("reporte_id, motivo")
        .eq("tipo_reporte", "vehiculo")
        .in("reporte_id", filteredIds);

      const motivoMap: Record<string, string[]> = {};
      (motivosData || []).forEach((m) => {
        if (!motivoMap[m.reporte_id]) motivoMap[m.reporte_id] = [];
        motivoMap[m.reporte_id].push(m.motivo);
      });

      setReports(filtered);
      setMotivos(motivoMap);
      setRolesByReport(reportRolesMap);
    } catch {
      toast.error("Error al buscar reportes");
    } finally {
      setLoading(false);
    }
  };

  const generateSummary = async () => {
    const novedades = reports.map((r) => r.novedades).filter(Boolean);
    if (novedades.length === 0) {
      toast.info("No hay novedades para resumir");
      return;
    }
    setLoadingSummary(true);
    try {
      const reportNumbers = reports.map((r) => r.no_reporte).join(", ");
      const totalKmVal = reports.reduce((s, r) => s + (r.kilometros_recorridos || 0), 0);
      const { data, error } = await supabase.functions.invoke("summarize-novedades", {
        body: { novedades, persona, tipo: "vehiculo", reportNumbers, totalKm: totalKmVal },
      });
      if (error) throw error;
      setSummary(data?.summary || "No se pudo generar resumen");
      setActivities(data?.activities || []);
    } catch {
      toast.error("Error al generar resumen");
    } finally {
      setLoadingSummary(false);
    }
  };

  const totalKm = reports.reduce((s, r) => s + (r.kilometros_recorridos || 0), 0);
  const totalHours = sumHoursToHHMM(reports.map((r) => r.total_horas));
  const unitGroups = buildProposalTotalsGroups(
    reports,
    (report) => report.vehiculo,
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
                          unit={r.vehiculo}
                          secondaryLabel={r.estacion}
                          role={buildRoleDisplay(rolesByReport[r.id] || [])}
                          metrics={[
                            {
                              label: "Kilometros",
                              value: r.kilometros_recorridos,
                            },
                            {
                              label: "Horas",
                              value: r.total_horas == null ? null : decimalToHHMM(r.total_horas),
                            },
                          ]}
                          tags={motivos[r.id] || []}
                          expanded={expandedNovedades.has(r.id)}
                          novedades={r.novedades}
                          onToggleNovedades={() => toggleNovedades(r.id)}
                          onPrint={() => printReport(r.id)}
                          printing={printingReportId === r.id}
                          onEdit={onEditReport ? () => onEditReport({ tipo: "vehiculo", reportId: r.id }) : undefined}
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
                        label: "Kilometros",
                        value: String(totalKm),
                        icon: Route,
                      },
                      {
                        label: "Horas",
                        value: totalHours,
                        icon: Clock3,
                      },
                    ]}
                    unitSectionTitle="Reportes por vehiculo"
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
                      <Button size="sm" variant="outline" onClick={generateSummary} disabled={loadingSummary}>
                        {loadingSummary ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                        Generar
                      </Button>
                    </div>
                    {summary ? (
                      <p className="whitespace-pre-line text-sm text-muted-foreground">{summary}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Genere el resumen para consolidar las novedades y actividades destacadas dentro de este panel.
                      </p>
                    )}
                    {activities.length > 0 && (
                      <div className="space-y-1">
                        <h5 className="text-xs font-semibold text-foreground">Actividades destacadas:</h5>
                        {activities.map((a, i) => (
                          <div key={i} className="text-sm">
                            {a.activity}: <span className="font-bold">{a.count} {a.count === 1 ? "vez" : "veces"}</span>
                          </div>
                        ))}
                      </div>
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

export default DashboardVehicles;

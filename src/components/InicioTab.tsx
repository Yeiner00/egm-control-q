import { startTransition, useEffect, useState } from "react";
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, FilePlus2, FileText, ImageUp, LayoutDashboard, Ship } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { loadReportPeopleByIds } from "@/lib/reportPeople";
import { getErrorMessage } from "@/lib/errorMessage";
import { buildTopNauticalMiles, buildTopVehicleTrips, type PersonMetric } from "@/lib/homePerformance";

type RecentZarpe = Pick<
  Tables<"zarpes_semana">,
  "id" | "created_at" | "destino" | "fecha_viaje" | "nombre_embarcacion" | "zarpe_folio"
>;

type RecentVehicleReport = Pick<
  Tables<"reportes_vehiculo">,
  "id" | "created_at" | "fecha" | "no_reporte" | "vehiculo"
>;

type RecentBoatReport = Pick<
  Tables<"reportes_embarcacion">,
  "id" | "created_at" | "embarcacion" | "fecha" | "no_reporte"
>;

type HolidayInfo = {
  date: Date;
  label: string;
  kind: "obligatorio" | "no_obligatorio";
};

const MONTH_LABELS = [
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

const WEEKDAY_LABELS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
const AVAILABLE_YEARS = [2026, 2027, 2028];
const MAX_RECENT_ITEMS = 5;
const FULL_CYCLE_LENGTH = 16;
const ALFA_BLOCK_LENGTH = 8;
const SHIFT_ANCHOR = new Date(2026, 0, 27);
const SKELETON_ITEMS = Array.from({ length: MAX_RECENT_ITEMS }, (_, index) => index);

const buildCalendarDays = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const cells: Array<Date | null> = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const stripTime = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const formatDate = (value: string | null) => {
  if (!value) return "Sin fecha";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed
    .toLocaleDateString("es-CR", { day: "2-digit", month: "short" })
    .replace(/\s+/g, "-");
};

const formatTimestamp = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Actualizacion reciente";
  return parsed.toLocaleString("es-CR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatMetricValue = (value: number, unit: string) => {
  const formatted = Number.isInteger(value)
    ? value.toLocaleString("es-CR")
    : value.toLocaleString("es-CR", { maximumFractionDigits: 1 });
  return `${formatted} ${unit}`;
};

const getEasterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const getObservedOctober12 = (year: number) => {
  const base = new Date(year, 9, 12);
  const weekday = base.getDay();

  if (weekday >= 2 && weekday <= 5) {
    return addDays(base, 8 - weekday);
  }

  return base;
};

const toDateKey = (date: Date) => {
  const normalized = stripTime(date);
  return normalized.toISOString().slice(0, 10);
};

const getCostaRicaHolidays = (year: number) => {
  const easterSunday = getEasterSunday(year);
  const holidays: HolidayInfo[] = [
    { date: new Date(year, 0, 1), label: "Ano Nuevo", kind: "obligatorio" },
    { date: addDays(easterSunday, -3), label: "Jueves Santo", kind: "obligatorio" },
    { date: addDays(easterSunday, -2), label: "Viernes Santo", kind: "obligatorio" },
    { date: new Date(year, 3, 11), label: "Juan Santamaria", kind: "obligatorio" },
    { date: new Date(year, 4, 1), label: "Dia Internacional del Trabajo", kind: "obligatorio" },
    { date: new Date(year, 6, 25), label: "Anexion del Partido de Nicoya", kind: "obligatorio" },
    { date: new Date(year, 7, 2), label: "Virgen de los Angeles", kind: "no_obligatorio" },
    { date: new Date(year, 7, 15), label: "Dia de la Madre", kind: "obligatorio" },
    { date: new Date(year, 8, 15), label: "Independencia", kind: "obligatorio" },
    { date: getObservedOctober12(year), label: "Encuentro de Culturas", kind: "no_obligatorio" },
    { date: new Date(year, 11, 1), label: "Abolicion del Ejercito", kind: "no_obligatorio" },
    { date: new Date(year, 11, 25), label: "Navidad", kind: "obligatorio" },
  ];

  return new Map(holidays.map((holiday) => [toDateKey(holiday.date), holiday]));
};

const getSquadType = (date: Date) => {
  const targetDate = stripTime(date);
  const anchorDate = stripTime(SHIFT_ANCHOR);
  const diffInDays = Math.floor((targetDate.getTime() - anchorDate.getTime()) / 86400000);
  const cycleIndex = ((diffInDays % FULL_CYCLE_LENGTH) + FULL_CYCLE_LENGTH) % FULL_CYCLE_LENGTH;

  return cycleIndex < ALFA_BLOCK_LENGTH ? "alfa" : "bravo";
};

interface InicioTabProps {
  onOpenReportesManual?: () => void;
  onOpenZarpesUpload?: () => void;
  onOpenEstadistica?: () => void;
}

const InicioTab = ({ onOpenReportesManual, onOpenZarpesUpload, onOpenEstadistica }: InicioTabProps) => {
  const today = new Date();
  const [displayYear, setDisplayYear] = useState(today.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(today.getMonth());
  const [loading, setLoading] = useState(true);
  const [recentZarpes, setRecentZarpes] = useState<RecentZarpe[]>([]);
  const [recentVehicleReports, setRecentVehicleReports] = useState<RecentVehicleReport[]>([]);
  const [recentBoatReports, setRecentBoatReports] = useState<RecentBoatReport[]>([]);
  const [topNauticalMiles, setTopNauticalMiles] = useState<PersonMetric[]>([]);
  const [topVehicleTrips, setTopVehicleTrips] = useState<PersonMetric[]>([]);
  const [performanceLoading, setPerformanceLoading] = useState(true);

  useEffect(() => {
    if (!AVAILABLE_YEARS.includes(displayYear)) {
      setDisplayYear(2026);
      setDisplayMonth(0);
    }
  }, [displayYear]);

  useEffect(() => {
    let active = true;

    const loadOverview = async () => {
      setLoading(true);

      const [zarpesResponse, vehicleReportsResponse, boatReportsResponse] = await Promise.all([
        supabase
          .from("zarpes_semana")
          .select("id, created_at, destino, fecha_viaje, nombre_embarcacion, zarpe_folio")
          .order("created_at", { ascending: false })
          .limit(MAX_RECENT_ITEMS),
        supabase
          .from("reportes_vehiculo")
          .select("id, created_at, fecha, no_reporte, vehiculo")
          .order("created_at", { ascending: false })
          .limit(MAX_RECENT_ITEMS),
        supabase
          .from("reportes_embarcacion")
          .select("id, created_at, embarcacion, fecha, no_reporte")
          .order("created_at", { ascending: false })
          .limit(MAX_RECENT_ITEMS),
      ]);

      if (!active) return;

      const errors = [
        zarpesResponse.error,
        vehicleReportsResponse.error,
        boatReportsResponse.error,
      ].filter(Boolean);

      if (errors.length > 0) {
        toast.error("No se pudo cargar el resumen de inicio");
        setLoading(false);
        return;
      }

      setRecentZarpes((zarpesResponse.data ?? []) as RecentZarpe[]);
      setRecentVehicleReports((vehicleReportsResponse.data ?? []) as RecentVehicleReport[]);
      setRecentBoatReports((boatReportsResponse.data ?? []) as RecentBoatReport[]);
      setLoading(false);
    };

    loadOverview();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadPerformance = async () => {
      setPerformanceLoading(true);

      const [boatReportsResponse, vehicleReportsResponse] = await Promise.all([
        supabase.from("reportes_embarcacion").select("id, millas_nauticas").gt("millas_nauticas", 0),
        supabase.from("reportes_vehiculo").select("id"),
      ]);

      if (!active) return;

      if (boatReportsResponse.error || vehicleReportsResponse.error) {
        toast.error("No se pudieron cargar las estadisticas de inicio", {
          description: getErrorMessage(boatReportsResponse.error || vehicleReportsResponse.error),
        });
        setPerformanceLoading(false);
        return;
      }

      const boatReports = boatReportsResponse.data ?? [];
      const vehicleReports = vehicleReportsResponse.data ?? [];

      try {
        const [boatPeopleByReport, vehiclePeopleByReport] = await Promise.all([
          loadReportPeopleByIds(boatReports.map((report) => report.id), "embarcacion"),
          loadReportPeopleByIds(vehicleReports.map((report) => report.id), "vehiculo"),
        ]);

        if (!active) return;

        setTopNauticalMiles(buildTopNauticalMiles(boatReports, boatPeopleByReport));
        setTopVehicleTrips(buildTopVehicleTrips(vehicleReports, vehiclePeopleByReport));
        setPerformanceLoading(false);
      } catch (error) {
        if (active) {
          toast.error("No se pudieron cruzar personas y reportes para Inicio", {
            description: getErrorMessage(error),
          });
          setPerformanceLoading(false);
        }
      }
    };

    loadPerformance();

    return () => {
      active = false;
    };
  }, []);

  const calendarDays = buildCalendarDays(displayYear, displayMonth);
  const holidays = getCostaRicaHolidays(displayYear);
  const monthHolidays = Array.from(holidays.values()).filter(
    (holiday) => holiday.date.getMonth() === displayMonth,
  );
  const topNauticalMax = Math.max(...topNauticalMiles.map((item) => item.value), 1);
  const topVehicleMax = Math.max(...topVehicleTrips.map((item) => item.value), 1);

  const renderRecentSkeletons = () => (
    <div className="space-y-3 lg:space-y-2.5">
      {SKELETON_ITEMS.map((item) => (
        <article key={`recent-skeleton-${item}`} className="panel-subtle space-y-2 p-4 lg:space-y-1.5 lg:p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
              <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-6 w-14 shrink-0 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
        </article>
      ))}
    </div>
  );

  const renderMetricSkeletons = () => (
    <div className="space-y-2.5">
      {SKELETON_ITEMS.map((item) => (
        <div key={`metric-skeleton-${item}`} className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-14 shrink-0 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-4/5 animate-pulse rounded-full bg-muted-foreground/20" />
          </div>
        </div>
      ))}
    </div>
  );

  const renderMetricBars = (items: PersonMetric[], maxValue: number, unit: string) => (
    <div className="space-y-2.5">
      {items.length === 0 ? (
        <div className="empty-state py-4">
          <p className="text-sm font-medium text-muted-foreground">Aun no hay datos suficientes.</p>
        </div>
      ) : (
        items.map((item) => (
          <div key={`${unit}-${item.name}`} className="space-y-1.5">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-semibold text-foreground">{item.name}</span>
              <span className="shrink-0 text-xs font-semibold text-primary">{formatMetricValue(item.value, unit)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max((item.value / maxValue) * 100, 6)}%` }} />
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="inicio-compact-shell space-y-5 animate-fade-in lg:space-y-3.5">
      <div className="grid gap-5 xl:grid-cols-2 lg:gap-3.5">
        <div className="flex h-full flex-col gap-5 lg:gap-3.5">
          <Card className="shrink-0 overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card">
              <div className="flex items-start gap-4 lg:gap-3">
                <div className="flex shrink-0 items-center justify-center pt-0.5 text-primary">
                  <LayoutDashboard className="h-6 w-6" />
                </div>
                <div className="space-y-2 lg:space-y-1.5">
                  <div className="section-eyebrow">Accesos directos</div>
                  <CardTitle className="text-2xl sm:text-3xl lg:text-[1.4rem]">Accesos a carga de datos</CardTitle>
                  <CardDescription className="max-w-2xl text-sm leading-6 lg:text-[0.92rem] lg:leading-5">
                    Inicie los flujos de carga mas usados sin pasar por la navegacion lateral.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3 pt-4 lg:pt-3.5">
              <Button
                type="button"
                size="sm"
                className="h-9 justify-start gap-2.5 border border-primary/20 bg-primary px-3.5 text-left text-primary-foreground shadow-[0_10px_20px_-18px_rgba(15,23,42,0.6)] hover:bg-primary/90 dark:border-cyan-300/35 dark:bg-cyan-400/15 dark:text-cyan-50 dark:shadow-none dark:hover:bg-cyan-400/25"
                onClick={onOpenReportesManual}
              >
                <FilePlus2 className="h-4 w-4 shrink-0" />
                <span className="font-semibold text-inherit">Crear reporte manual</span>
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 justify-start gap-2.5 border border-primary/20 bg-primary px-3.5 text-left text-primary-foreground shadow-[0_10px_20px_-18px_rgba(15,23,42,0.6)] hover:bg-primary/90 dark:border-cyan-300/35 dark:bg-cyan-400/15 dark:text-cyan-50 dark:shadow-none dark:hover:bg-cyan-400/25"
                onClick={onOpenZarpesUpload}
              >
                <ImageUp className="h-4 w-4 shrink-0" />
                <span className="font-semibold text-inherit">Subir zarpe</span>
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 justify-start gap-2.5 border border-primary/20 bg-primary px-3.5 text-left text-primary-foreground shadow-[0_10px_20px_-18px_rgba(15,23,42,0.6)] hover:bg-primary/90 dark:border-cyan-300/35 dark:bg-cyan-400/15 dark:text-cyan-50 dark:shadow-none dark:hover:bg-cyan-400/25"
                onClick={onOpenEstadistica}
              >
                <BarChart3 className="h-4 w-4 shrink-0" />
                <span className="font-semibold text-inherit">Ver estadistica</span>
              </Button>
            </CardContent>
          </Card>

          <Card className="flex flex-1 flex-col overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card">
              <div className="flex items-start gap-4 lg:gap-3">
                <div className="flex shrink-0 items-center justify-center pt-0.5 text-primary">
                  <LayoutDashboard className="h-6 w-6" />
                </div>
                <div className="space-y-2 lg:space-y-1.5">
                  <div className="section-eyebrow">Inicio</div>
                  <CardTitle className="text-2xl sm:text-3xl lg:text-[1.55rem]">Resumen operativo reciente</CardTitle>
                  <CardDescription className="max-w-2xl text-sm leading-6 lg:text-[0.92rem] lg:leading-5">
                    Consulta rapida de los ultimos zarpes registrados y de los reportes recientes de movil y embarcacion.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="grid flex-1 gap-5 pt-6 xl:grid-cols-3 lg:gap-3.5 lg:pt-4">
              <section className="space-y-4 lg:space-y-3">
                <div className="flex items-center gap-3 lg:gap-2.5">
                  <div className="flex shrink-0 items-center justify-center text-primary">
                    <Ship className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground lg:text-[1.02rem]">Ultimos zarpes registrados</h3>
                    <p className="text-sm text-muted-foreground lg:text-[0.88rem]">Actividad reciente del modulo de zarpes.</p>
                  </div>
                </div>

                <div className="space-y-3 lg:space-y-2.5">
                  {loading && renderRecentSkeletons()}

                  {!loading && recentZarpes.length === 0 && (
                    <div className="empty-state">
                      <p className="text-sm font-medium text-muted-foreground">Aun no hay zarpes para mostrar.</p>
                    </div>
                  )}

                  {!loading && recentZarpes.map((zarpe) => (
                    <article key={zarpe.id} className="panel-subtle space-y-2 p-4 lg:space-y-1.5 lg:p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground lg:text-[0.95rem]">
                            {zarpe.nombre_embarcacion || "Embarcacion sin nombre"}
                          </div>
                          <div className="mt-1 text-xs uppercase tracking-[0.12em] text-muted-foreground">
                            Folio {zarpe.zarpe_folio || "sin asignar"}
                          </div>
                        </div>
                        <div className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold leading-none text-primary lg:px-2.5 lg:py-0.5">
                          {formatDate(zarpe.fecha_viaje)}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground lg:text-[0.88rem]">
                        Destino: <span className="font-medium text-foreground">{zarpe.destino || "Sin destino"}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Registrado: {formatTimestamp(zarpe.created_at)}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="space-y-4 lg:space-y-3">
                <div className="flex items-center gap-3 lg:gap-2.5">
                  <div className="flex shrink-0 items-center justify-center text-accent">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground lg:text-[1.02rem]">Ultimos reportes de movil</h3>
                    <p className="text-sm text-muted-foreground lg:text-[0.88rem]">Cargas recientes del modulo vehicular.</p>
                  </div>
                </div>

                <div className="space-y-3 lg:space-y-2.5">
                  {loading && renderRecentSkeletons()}

                  {!loading && recentVehicleReports.length === 0 && (
                    <div className="empty-state">
                      <p className="text-sm font-medium text-muted-foreground">Aun no hay reportes de movil para mostrar.</p>
                    </div>
                  )}

                  {!loading && recentVehicleReports.map((report) => (
                    <article key={report.id} className="panel-subtle space-y-2 p-4 lg:space-y-1.5 lg:p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground lg:text-[0.95rem]">Reporte {report.no_reporte}</div>
                          <div className="mt-1 text-sm text-muted-foreground lg:text-[0.88rem]">{report.vehiculo || "Unidad sin identificar"}</div>
                        </div>
                        <div className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-sky-300/70 bg-sky-100 px-3 py-1 text-xs font-semibold leading-none text-sky-800 dark:border-sky-400/35 dark:bg-sky-400/15 dark:text-sky-100 lg:px-2.5 lg:py-0.5">
                          Movil
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>Fecha: {formatDate(report.fecha)}</span>
                        <span>{formatTimestamp(report.created_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="space-y-4 lg:space-y-3">
                <div className="flex items-center gap-3 lg:gap-2.5">
                  <div className="flex shrink-0 items-center justify-center text-destructive">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-foreground lg:text-[1.02rem]">Ultimos reportes de embarcacion</h3>
                    <p className="text-sm text-muted-foreground lg:text-[0.88rem]">Cargas recientes del modulo maritimo.</p>
                  </div>
                </div>

                <div className="space-y-3 lg:space-y-2.5">
                  {loading && renderRecentSkeletons()}

                  {!loading && recentBoatReports.length === 0 && (
                    <div className="empty-state">
                      <p className="text-sm font-medium text-muted-foreground">Aun no hay reportes de embarcacion para mostrar.</p>
                    </div>
                  )}

                  {!loading && recentBoatReports.map((report) => (
                    <article key={report.id} className="panel-subtle space-y-2 p-4 lg:space-y-1.5 lg:p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-foreground lg:text-[0.95rem]">Reporte {report.no_reporte}</div>
                          <div className="mt-1 text-sm text-muted-foreground lg:text-[0.88rem]">{report.embarcacion || "Embarcacion sin identificar"}</div>
                        </div>
                        <div className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border border-red-300/70 bg-red-100 px-3 py-1 text-xs font-semibold leading-none text-red-800 dark:border-red-400/35 dark:bg-red-400/15 dark:text-red-100 lg:px-2.5 lg:py-0.5">
                          Embarcacion
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>Fecha: {formatDate(report.fecha)}</span>
                        <span>{formatTimestamp(report.created_at)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5 lg:space-y-3.5">
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card">
              <div className="flex items-start gap-4 lg:gap-3">
                <div className="flex shrink-0 items-center justify-center pt-0.5 text-primary">
                  <CalendarDays className="h-6 w-6" />
                </div>
                <div className="space-y-2 lg:space-y-1.5">
                  <div className="section-eyebrow">Turnos</div>
                  <CardTitle className="text-2xl lg:text-[1.45rem]">Calendario de escuadras</CardTitle>
                  <CardDescription className="max-w-md text-sm leading-6 lg:text-[0.92rem] lg:leading-5">
                    El patron 8 x 8 alterna entre Escuadra Alfa y Escuadra Bravo. Los feriados oficiales de Costa Rica se marcan dentro del calendario.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 pt-6 lg:space-y-3.5 lg:pt-4">
              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    startTransition(() => {
                      if (displayMonth === 0) {
                        if (displayYear > AVAILABLE_YEARS[0]) {
                          setDisplayYear((year) => year - 1);
                          setDisplayMonth(11);
                        }
                        return;
                      }

                      setDisplayMonth((month) => month - 1);
                    });
                  }}
                  disabled={displayMonth === 0 && displayYear === AVAILABLE_YEARS[0]}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-center">
                  <div className="text-lg font-bold text-foreground">{MONTH_LABELS[displayMonth]}</div>
                  <div className="text-sm text-muted-foreground">{displayYear}</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    startTransition(() => {
                      if (displayMonth === 11) {
                        if (displayYear < AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1]) {
                          setDisplayYear((year) => year + 1);
                          setDisplayMonth(0);
                        }
                        return;
                      }

                      setDisplayMonth((month) => month + 1);
                    });
                  }}
                  disabled={displayMonth === 11 && displayYear === AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1]}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:gap-2.5">
              <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/50 px-3.5 py-2.5 lg:px-3 lg:py-2">
                <span className="h-3 w-3 rounded-full bg-red-500" />
                <span className="text-sm font-semibold text-foreground">Escuadra Alfa</span>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/50 px-3.5 py-2.5 lg:px-3 lg:py-2">
                <span className="h-3 w-3 rounded-full bg-blue-500" />
                <span className="text-sm font-semibold text-foreground">Escuadra Bravo</span>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/50 px-3.5 py-2.5 lg:px-3 lg:py-2">
                <span className="h-3 w-3 rounded-full bg-amber-400" />
                <span className="text-sm font-semibold text-foreground">Feriados</span>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground lg:gap-1.5">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="py-1">
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2 lg:gap-1.5">
              {calendarDays.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="h-16 rounded-md border border-dashed border-border/60 bg-muted/40 lg:h-14" />;
                }

                const squadType = getSquadType(date);
                const holiday = holidays.get(toDateKey(date));
                const isToday =
                  date.getDate() === today.getDate()
                  && date.getMonth() === today.getMonth()
                  && date.getFullYear() === today.getFullYear();

                return (
                  <div
                    key={date.toISOString()}
                    title={holiday ? `${holiday.label} (${holiday.kind.replace("_", " ")})` : undefined}
                    className={cn(
                      "relative flex h-16 items-center justify-center rounded-md border text-sm font-semibold transition-colors lg:h-14",
                      squadType === "alfa" && "border-red-200 bg-red-500/15 text-red-700 dark:border-red-400/30 dark:bg-red-500/20 dark:text-red-200",
                      squadType === "bravo" && "border-blue-200 bg-blue-500/15 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/20 dark:text-blue-200",
                      holiday && "border-amber-300 shadow-[inset_0_0_0_1px_rgba(251,191,36,0.55)]",
                      isToday && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                    )}
                  >
                    {holiday && (
                      <span
                        className={cn(
                          "absolute right-1.5 top-1.5 h-2 w-2 rounded-full",
                          holiday.kind === "obligatorio" ? "bg-amber-400" : "bg-amber-300",
                        )}
                      />
                    )}
                    {date.getDate()}
                  </div>
                );
              })}
            </div>

            <div className="rounded-[calc(var(--radius)-0.05rem)] border border-border/70 bg-muted/50 p-4">
              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Feriados de {MONTH_LABELS[displayMonth]}
                </div>
                {monthHolidays.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Este mes no tiene feriados oficiales marcados.</p>
                ) : (
                  <div className="space-y-2">
                    {monthHolidays.map((holiday) => (
                      <div key={toDateKey(holiday.date)} className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-foreground">{holiday.label}</span>
                        <span className="text-muted-foreground">
                          {holiday.date.toLocaleDateString("es-CR", { day: "2-digit", month: "short" })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border/70 bg-card">
              <div className="flex items-start gap-4 lg:gap-3">
                <div className="flex shrink-0 items-center justify-center pt-0.5 text-primary">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <div className="space-y-2 lg:space-y-1.5">
                  <div className="section-eyebrow">Estadistica</div>
                  <CardTitle className="text-2xl lg:text-[1.45rem]">Rendimiento operativo</CardTitle>
                  <CardDescription className="max-w-2xl text-sm leading-6 lg:text-[0.92rem] lg:leading-5">
                    Top 5 por millas nauticas acumuladas y viajes registrados en moviles.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-5 pt-5 lg:grid-cols-2 lg:gap-4 lg:pt-4">
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Mas millas nauticas</h3>
                  <p className="text-xs text-muted-foreground">Reportes de embarcacion</p>
                </div>
                {performanceLoading ? renderMetricSkeletons() : renderMetricBars(topNauticalMiles, topNauticalMax, "mn")}
              </section>
              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Mas viajes en movil</h3>
                  <p className="text-xs text-muted-foreground">1 reporte equivale a 1 viaje</p>
                </div>
                {performanceLoading ? renderMetricSkeletons() : renderMetricBars(topVehicleTrips, topVehicleMax, "viajes")}
              </section>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
};

export default InicioTab;

import { useCallback, useEffect, useMemo, useState } from "react";
import { normalizeName } from "@/lib/normalizeName";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Clock3, FileSearch, Loader2, Route, Waves } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import VehicleReportForm, { type VehicleFormData } from "./VehicleReportForm";
import BoatReportForm, { type BoatFormData, type InspectedBoatData } from "./BoatReportForm";
import ReportListRow, { type ReportRowMetric } from "./ReportListRow";
import { calcTotalHours } from "@/lib/report-utils";
import { normalizeReportNumber, normalizeReportUnit } from "@/lib/reportNumber";
import { filterReportOptions } from "@/lib/reportSearch";
import { buildLegacyReportMotiveRows, buildReportMotiveRows, loadMotiveOptions } from "@/lib/motives";
import { loadAvailableReportYears } from "@/lib/reportYears";
import { getErrorMessage } from "@/lib/errorMessage";
import ResultPanelState from "@/components/ResultPanelState";
import {
  countUniqueNormalizedNames,
  deleteReportPeople,
  loadPeopleNameOptions,
  loadReportPeopleByIds,
  replaceReportPeople,
  type ReportPersonWithRoles,
} from "@/lib/reportPeople";
import { downloadReportExcel } from "@/lib/reportExcelExport";
import { DEFAULT_REPORT_SITE_OPTIONS, loadSiteOptions, type ReportSiteOption } from "@/lib/reportSites";
import type { ReportType } from "@/lib/reportPersistence";
import { buildReportMonthRanges, isDateInReportMonthRanges } from "@/lib/reportMonthFilters";
import { normalizeReportText, normalizedReportTextOrNull } from "@/lib/reportText";

const REPORT_STATIONS = ["Murcielago"];

const MONTHS = [
  { value: "1", label: "Enero" },
  { value: "2", label: "Febrero" },
  { value: "3", label: "Marzo" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Mayo" },
  { value: "6", label: "Junio" },
  { value: "7", label: "Julio" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Septiembre" },
  { value: "10", label: "Octubre" },
  { value: "11", label: "Noviembre" },
  { value: "12", label: "Diciembre" },
];

const isMotivesSchemaError = (message: string) =>
  message.includes("motivo_original") ||
  message.includes("motivo_key") ||
  message.includes("Could not find");

type VehicleReport = Tables<"reportes_vehiculo">;
type BoatReport = Tables<"reportes_embarcacion">;
type ReportPreview = VehicleReport | BoatReport;
type ReportOption = {
  id: string;
  no_reporte: string;
  fecha: string | null;
  unidad: string | null;
};

type InitialSelection = {
  tipo: ReportType;
  reportId: string;
  nonce: number;
};

interface ManageReportProps {
  initialSelection?: InitialSelection | null;
}

const ManageReport = ({ initialSelection }: ManageReportProps) => {
  const [tipo, setTipo] = useState<ReportType>("vehiculo");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [monthOpen, setMonthOpen] = useState(false);
  const [unidad, setUnidad] = useState("");
  const [unidades, setUnidades] = useState<string[]>([]);
  const [reportNumbers, setReportNumbers] = useState<ReportOption[]>([]);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [years, setYears] = useState<string[]>([new Date().getFullYear().toString()]);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [personas, setPersonas] = useState<ReportPersonWithRoles[]>([]);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [sitios, setSitios] = useState<{ nombre_sitio: string; zona: string; posicion: string }[]>([]);
  const [embarcacionesInspeccionadas, setEmbarcacionesInspeccionadas] = useState<InspectedBoatData[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingExcelId, setGeneratingExcelId] = useState("");
  const [vehicleData, setVehicleData] = useState<VehicleFormData | null>(null);
  const [boatData, setBoatData] = useState<BoatFormData | null>(null);
  const [peopleOptions, setPeopleOptions] = useState<string[]>([]);
  const [motiveOptions, setMotiveOptions] = useState<string[]>([]);
  const [siteOptions, setSiteOptions] = useState<ReportSiteOption[]>(DEFAULT_REPORT_SITE_OPTIONS);
  const [pinnedReportOption, setPinnedReportOption] = useState<ReportOption | null>(null);

  const saveMotives = async (
    reportId: string,
    tipoReporte: ReportType,
    reportMotives: string[],
  ) => {
    const motivosInsert = buildReportMotiveRows(reportId, tipoReporte, reportMotives);
    if (motivosInsert.length === 0) return;

    const { error } = await supabase.from("reporte_motivos").insert(motivosInsert);
    if (!error) return;
    if (!isMotivesSchemaError(error.message)) throw error;

    const { error: fallbackError } = await supabase
      .from("reporte_motivos")
      .insert(buildLegacyReportMotiveRows(reportId, tipoReporte, reportMotives));
    if (fallbackError) throw fallbackError;
  };

  const table = tipo === "vehiculo" ? "reportes_vehiculo" : "reportes_embarcacion";
  const allMonthsSelected = selectedMonths.length === MONTHS.length;
  const reportOptions = useMemo(
    () => (
      pinnedReportOption && !reportNumbers.some((report) => report.id === pinnedReportOption.id)
        ? [pinnedReportOption, ...reportNumbers]
        : reportNumbers
    ),
    [pinnedReportOption, reportNumbers],
  );
  const visibleReportOptions = useMemo(
    () => filterReportOptions(reportOptions, reportSearch),
    [reportOptions, reportSearch],
  );
  const allReportsSelected = reportOptions.length > 0 && reportOptions.every((report) => selectedReportIds.includes(report.id));
  const allVisibleReportsSelected =
    visibleReportOptions.length > 0 && visibleReportOptions.every((report) => selectedReportIds.includes(report.id));
  const selectedReports = selectedReportIds
    .map((id) => reportOptions.find((report) => report.id === id))
    .filter(Boolean) as ReportOption[];

  const toggleMonth = (value: string) => {
    setSelectedMonths((prev) =>
      prev.includes(value) ? prev.filter((month) => month !== value) : [...prev, value],
    );
  };

  const toggleAllMonths = () => {
    setSelectedMonths((prev) => (prev.length === MONTHS.length ? [] : MONTHS.map((month) => month.value)));
  };

  const toggleReport = (id: string) => {
    setSelectedReportIds((prev) =>
      prev.includes(id) ? prev.filter((reportId) => reportId !== id) : [...prev, id],
    );
  };

  const toggleAllReports = () => {
    const visibleIds = visibleReportOptions.map((report) => report.id);
    setSelectedReportIds((prev) => {
      const visibleIdSet = new Set(visibleIds);
      if (visibleIds.every((id) => prev.includes(id))) {
        return prev.filter((id) => !visibleIdSet.has(id));
      }

      return Array.from(new Set([...prev, ...visibleIds]));
    });
  };

  useEffect(() => {
    let active = true;

    const loadYears = async () => {
      try {
        const availableYears = await loadAvailableReportYears(table);
        if (!active) return;

        setYears(availableYears);
        if (availableYears.length > 0 && !availableYears.includes(year)) {
          setYear(availableYears[0]);
        }
      } catch (error) {
        if (!active) return;

        toast.error("No se pudieron cargar los años disponibles", {
          description: getErrorMessage(error),
        });
      }
    };
    loadYears();

    return () => {
      active = false;
    };
  }, [table, year]);

  useEffect(() => {
    let active = true;

    setUnidades([]);
    setUnidad("");

    const loadUnits = async () => {
      try {
        let nextUnidades: string[] = [];

        if (tipo === "vehiculo") {
          const { data, error } = await supabase
            .from("reportes_vehiculo")
            .select("vehiculo")
            .eq("anio", parseInt(year));
          if (error) throw error;
          nextUnidades = [...new Set((data || []).map((d) => d.vehiculo).filter(Boolean) as string[])].sort();
        } else {
          const { data, error } = await supabase
            .from("reportes_embarcacion")
            .select("embarcacion")
            .eq("anio", parseInt(year));
          if (error) throw error;
          nextUnidades = [...new Set((data || []).map((d) => d.embarcacion).filter(Boolean) as string[])].sort();
        }
        if (!active) return;

        setUnidades(nextUnidades);
      } catch (error) {
        if (!active) return;

        setUnidades([]);
        setUnidad("");
        toast.error("No se pudieron cargar las unidades", {
          description: getErrorMessage(error),
        });
      }
    };
    loadUnits();

    return () => {
      active = false;
    };
  }, [tipo, year]);

  useEffect(() => {
    let active = true;

    setPeopleOptions([]);

    const loadFormOptions = async () => {
      try {
        const [loadedPeopleOptions, loadedMotiveOptions, loadedSiteOptions] = await Promise.all([
          loadPeopleNameOptions([], tipo),
          loadMotiveOptions(),
          loadSiteOptions(),
        ]);
        if (!active) return;

        setPeopleOptions(loadedPeopleOptions);
        setMotiveOptions(loadedMotiveOptions);
        setSiteOptions(loadedSiteOptions);
      } catch (error) {
        if (!active) return;

        setPeopleOptions([]);
        setMotiveOptions([]);
        setSiteOptions(DEFAULT_REPORT_SITE_OPTIONS);
        toast.error("No se pudieron cargar las opciones del formulario", {
          description: getErrorMessage(error),
        });
      }
    };
    loadFormOptions();

    return () => {
      active = false;
    };
  }, [tipo]);

  useEffect(() => {
    if (!initialSelection?.reportId) return;
    let active = true;

    const loadInitialSelection = async () => {
      try {
        const targetTipo = initialSelection.tipo;
        setTipo(targetTipo);
        setSelectedMonths([]);
        setUnidad("");
        setPinnedReportOption(null);
        setSelectedReportIds([]);
        setSelectedId("");
        setPreview(null);
        setEditing(false);

        if (targetTipo === "vehiculo") {
          const { data, error } = await supabase
            .from("reportes_vehiculo")
            .select("id, no_reporte, fecha, vehiculo")
            .eq("id", initialSelection.reportId)
            .single();
          if (error) throw error;
          if (!data) return;
          if (!active) return;

          if (data.fecha) setYear(String(new Date(`${data.fecha}T00:00:00`).getFullYear()));
          setPinnedReportOption({
            id: data.id,
            no_reporte: data.no_reporte,
            fecha: data.fecha,
            unidad: data.vehiculo,
          });
          setSelectedReportIds([data.id]);
          setSelectedId(data.id);
          return;
        }

        const { data, error } = await supabase
          .from("reportes_embarcacion")
          .select("id, no_reporte, fecha, embarcacion")
          .eq("id", initialSelection.reportId)
          .single();
        if (error) throw error;
        if (!data) return;
        if (!active) return;

        if (data.fecha) setYear(String(new Date(`${data.fecha}T00:00:00`).getFullYear()));
        setPinnedReportOption({
          id: data.id,
          no_reporte: data.no_reporte,
          fecha: data.fecha,
          unidad: data.embarcacion,
        });
        setSelectedReportIds([data.id]);
        setSelectedId(data.id);
      } catch (error) {
        if (!active) return;

        toast.error("No se pudo abrir el reporte seleccionado", {
          description: getErrorMessage(error),
        });
      }
    };

    loadInitialSelection();

    return () => {
      active = false;
    };
  }, [initialSelection?.nonce, initialSelection?.reportId, initialSelection?.tipo]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        let results: ReportOption[] = [];
        const monthRanges = buildReportMonthRanges(parseInt(year, 10), selectedMonths);

        if (tipo === "vehiculo") {
          let q = supabase
            .from("reportes_vehiculo")
            .select("id, no_reporte, fecha, vehiculo")
            .eq("anio", parseInt(year))
            .order("no_reporte");
          if (unidad && unidad !== "all") q = q.eq("vehiculo", unidad);
          const { data, error } = await q;
          if (error) throw error;
          results = (data || [])
            .filter((d) => {
              if (selectedMonths.length === 0 || !d.fecha) return true;
              return isDateInReportMonthRanges(d.fecha, monthRanges);
            })
            .map((d) => ({ id: d.id, no_reporte: d.no_reporte, fecha: d.fecha, unidad: d.vehiculo }));
        } else {
          let q = supabase
            .from("reportes_embarcacion")
            .select("id, no_reporte, fecha, embarcacion")
            .eq("anio", parseInt(year))
            .order("no_reporte");
          if (unidad && unidad !== "all") q = q.eq("embarcacion", unidad);
          const { data, error } = await q;
          if (error) throw error;
          results = (data || [])
            .filter((d) => {
              if (selectedMonths.length === 0 || !d.fecha) return true;
              return isDateInReportMonthRanges(d.fecha, monthRanges);
            })
            .map((d) => ({ id: d.id, no_reporte: d.no_reporte, fecha: d.fecha, unidad: d.embarcacion }));
        }
        if (!active) return;

        setReportNumbers(results);
        const availableIds = new Set(results.map((report) => report.id));
        const pinnedId = pinnedReportOption?.id ?? initialSelection?.reportId;
        setSelectedReportIds((prev) => prev.filter((id) => availableIds.has(id) || id === pinnedId));
      } catch (error) {
        if (!active) return;

        setReportNumbers([]);
        setSelectedReportIds([]);
        toast.error("No se pudieron cargar los reportes", {
          description: getErrorMessage(error),
        });
      }
    };
    load();

    return () => {
      active = false;
    };
  }, [tipo, year, selectedMonths, unidad, pinnedReportOption?.id, initialSelection?.reportId]);

  useEffect(() => {
    if (!selectedId) return;
    const availableIds = new Set(reportOptions.map((report) => report.id));
    if (reportOptions.length > 0 && !availableIds.has(selectedId)) {
      clearSelection();
    }
  }, [reportOptions, selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setPreview(null);
      setEditing(false);
      return;
    }
    let active = true;

    const load = async () => {
      try {
        const { data: report, error: reportError } = await supabase.from(table).select("*").eq("id", selectedId).single();
        if (reportError) throw reportError;
        const { data: mots, error: motivesError } = await supabase
          .from("reporte_motivos")
          .select("motivo")
          .eq("reporte_id", selectedId)
          .eq("tipo_reporte", tipo);
        if (motivesError) throw motivesError;
        const { data: sits, error: sitesError } = await supabase
          .from("reporte_sitios")
          .select("nombre_sitio, zona, posicion")
          .eq("reporte_id", selectedId);
        if (sitesError) throw sitesError;
        const { data: inspectedBoats, error: inspectedBoatsError } = tipo === "embarcacion"
          ? await supabase
            .from("reporte_embarcaciones_inspeccionadas")
            .select("nombre, matricula, no_inspeccion, zona")
            .eq("reporte_id", selectedId)
          : { data: [], error: null };
        if (inspectedBoatsError) throw inspectedBoatsError;
        const peopleMap = await loadReportPeopleByIds([selectedId], tipo);
        if (!active) return;

        setPreview(report);
        setPersonas(peopleMap.get(selectedId) || []);
        setMotivos((mots || []).map((m) => m.motivo));
        setSitios((sits || []).map((site) => ({
          nombre_sitio: site.nombre_sitio,
          zona: site.zona || "",
          posicion: site.posicion || "",
        })));
        setEmbarcacionesInspeccionadas((inspectedBoats || []).map((item) => ({
          nombre: item.nombre || "",
          matricula: item.matricula || "",
          no_inspeccion: item.no_inspeccion || "",
          zona: item.zona || "",
        })));
      } catch (error) {
        if (!active) return;

        setPreview(null);
        setPersonas([]);
        setMotivos([]);
        setSitios([]);
        setEmbarcacionesInspeccionadas([]);
        toast.error("No se pudo cargar el reporte seleccionado", {
          description: getErrorMessage(error),
        });
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [selectedId, table, tipo]);

  const startEdit = useCallback(() => {
    if (!preview) return;

    if (tipo === "vehiculo") {
      const vehiclePreview = preview as VehicleReport;
      const choferPerson = personas.find((p) => p.roles.includes("chofer"));
      const oficialPerson = personas.find((p) => p.roles.includes("oficial"));
      const chofer = choferPerson?.nombre || "";
      const oficial = oficialPerson?.nombre || "";
      const acompanantes = personas
        .filter((p) => p.roles.includes("acompañante") || p.roles.includes("acompanante"))
        .map((p) => p.nombre);

      setVehicleData({
        no_reporte: vehiclePreview.no_reporte || "",
        bitacora: vehiclePreview.bitacora || "",
        fecha: vehiclePreview.fecha || "",
        hora_salida: vehiclePreview.hora_salida || "",
        hora_regreso: vehiclePreview.hora_regreso || "",
        estacion: vehiclePreview.estacion || "",
        vehiculo: vehiclePreview.vehiculo || "",
        destino: vehiclePreview.destino || "",
        motivos,
        chofer,
        chofer_cedula: choferPerson?.cedula || "",
        acompanantes,
        oficial_a_cargo: oficial,
        oficial_a_cargo_cedula: oficialPerson?.cedula || "",
        sitios_visitados: sitios,
        estacion_combustible: vehiclePreview.estacion_combustible || "",
        lugar_combustible: vehiclePreview.lugar_combustible || "",
        cedula_juridica_combustible: vehiclePreview.cedula_juridica_combustible || "",
        no_factura: vehiclePreview.no_factura || "",
        combustible_trasegado_bomba: vehiclePreview.combustible_trasegado_bomba,
        total_combustible_antes_viaje: vehiclePreview.total_combustible_antes_viaje,
        combustible_gastado: vehiclePreview.combustible_gastado,
        saldo_combustible_despues_viaje: vehiclePreview.saldo_combustible_despues_viaje,
        kilometros_recorridos: vehiclePreview.kilometros_recorridos,
        novedades: vehiclePreview.novedades || "",
      });
    } else {
      const boatPreview = preview as BoatReport;
      const capitanPerson = personas.find((p) => p.roles.includes("capitan"));
      const encargadoPerson = personas.find((p) => p.roles.includes("encargado_mision"));
      const oficialDirectorPerson = personas.find((p) =>
        p.roles.some((role) => ["oficial_director", "oficial_director_ambiental", "oficial_ambiental", "oficial"].includes(role)),
      ) ?? encargadoPerson;
      const operacionalPerson = personas.find((p) => p.roles.includes("operacional"));
      const capitan = capitanPerson?.nombre || "";
      const encargado = encargadoPerson?.nombre || "";
      const tripulantes = personas
        .filter((p) => p.roles.includes("tripulante"))
        .map((p) => ({ nombre: p.nombre, cedula: "" }));
      const particulares = personas
        .filter((p) => p.roles.includes("particular") || p.roles.includes("persona_particular"))
        .map((p) => p.nombre);

      setBoatData({
        no_reporte: boatPreview.no_reporte || "",
        bitacora: boatPreview.bitacora || "",
        folios: boatPreview.folios || "",
        fecha: boatPreview.fecha || "",
        estacion: boatPreview.estacion || "",
        embarcacion: boatPreview.embarcacion || "",
        no_cierre_os: boatPreview.no_cierre_os || "",
        hora_salida: boatPreview.hora_salida || "",
        hora_regreso: boatPreview.hora_regreso || "",
        horas_motor_babor: boatPreview.horas_motor_babor,
        horas_motor_centro: boatPreview.horas_motor_centro,
        horas_motor_estribor: boatPreview.horas_motor_estribor,
        destino: boatPreview.destino || "",
        motivos,
        capitan,
        capitan_cedula: capitanPerson?.cedula || "",
        encargado_mision: encargado,
        encargado_mision_cedula: encargadoPerson?.cedula || "",
        oficial_director: oficialDirectorPerson?.nombre || "",
        oficial_director_cedula: oficialDirectorPerson?.cedula || "",
        operacional: operacionalPerson?.nombre || "",
        operacional_cedula: operacionalPerson?.cedula || "",
        tripulantes,
        personas_particulares: particulares,
        sitios_visitados: sitios,
        embarcaciones_inspeccionadas: embarcacionesInspeccionadas,
        saldo_anterior: boatPreview.saldo_anterior,
        combustible_trasegado_bodega: boatPreview.combustible_trasegado_bodega,
        total_antes_viaje: boatPreview.total_antes_viaje,
        combustible_trasegado_durante: boatPreview.combustible_trasegado_durante,
        combustible_gastado: boatPreview.combustible_gastado,
        saldo_despues: boatPreview.saldo_despues,
        tipo_combustible: boatPreview.tipo_combustible || "",
        estacion_combustible: boatPreview.estacion_combustible || "",
        lugar_combustible: boatPreview.lugar_combustible || "",
        cedula_juridica_combustible: boatPreview.cedula_juridica_combustible || "",
        no_factura: boatPreview.no_factura || "",
        millas_nauticas: boatPreview.millas_nauticas,
        novedades: boatPreview.novedades || "",
      });
    }

    setEditing(true);
  }, [embarcacionesInspeccionadas, motivos, personas, preview, sitios, tipo]);

  useEffect(() => {
    if (!selectedId || !preview || preview.id !== selectedId) return;
    startEdit();
  }, [selectedId, preview, startEdit]);

  const saveEdit = async () => {
    setSaving(true);
    try {
      let normalizedNoReporte = "";
      let normalizedYear = parseInt(year);

      if (tipo === "vehiculo" && vehicleData) {
        normalizedNoReporte = normalizeReportNumber(vehicleData.no_reporte);
        if (!normalizedNoReporte) {
          toast.error("N° de reporte obligatorio");
          return;
        }

        if (!vehicleData.fecha) {
          toast.error("Fecha obligatoria para definir el anio del reporte");
          return;
        }
        normalizedYear = parseInt(vehicleData.fecha.split("-")[0], 10);

        const unitKey = normalizeReportUnit(vehicleData.vehiculo);
        if (!unitKey) {
          toast.error("Vehiculo obligatorio");
          return;
        }

        const { data: matches, error: duplicateError } = await supabase
          .from("reportes_vehiculo")
          .select("id, no_reporte, vehiculo")
          .eq("anio", normalizedYear);
        if (duplicateError) throw duplicateError;

        const duplicate = (matches || []).find(
          (report) =>
            report.id !== selectedId &&
            normalizeReportNumber(report.no_reporte) === normalizedNoReporte &&
            normalizeReportUnit(report.vehiculo) === unitKey,
        );
        if (duplicate) {
          toast.error(`Duplicado: reporte ${normalizedNoReporte} ya existe para ${vehicleData.vehiculo || "sin unidad"} en ${normalizedYear}`);
          return;
        }
      } else if (tipo === "embarcacion" && boatData) {
        normalizedNoReporte = normalizeReportNumber(boatData.no_reporte);
        if (!normalizedNoReporte) {
          toast.error("N° de reporte obligatorio");
          return;
        }

        if (!boatData.fecha) {
          toast.error("Fecha obligatoria para definir el anio del reporte");
          return;
        }
        normalizedYear = parseInt(boatData.fecha.split("-")[0], 10);

        const unitKey = normalizeReportUnit(boatData.embarcacion);
        if (!unitKey) {
          toast.error("Embarcacion obligatoria");
          return;
        }

        const { data: matches, error: duplicateError } = await supabase
          .from("reportes_embarcacion")
          .select("id, no_reporte, embarcacion")
          .eq("anio", normalizedYear);
        if (duplicateError) throw duplicateError;

        const duplicate = (matches || []).find(
          (report) =>
            report.id !== selectedId &&
            normalizeReportNumber(report.no_reporte) === normalizedNoReporte &&
            normalizeReportUnit(report.embarcacion) === unitKey,
        );
        if (duplicate) {
          toast.error(`Duplicado: reporte ${normalizedNoReporte} ya existe para ${boatData.embarcacion || "sin unidad"} en ${normalizedYear}`);
          return;
        }
      }

      await Promise.all([
        supabase.from("reporte_motivos").delete().eq("reporte_id", selectedId).eq("tipo_reporte", tipo),
        supabase.from("reporte_sitios").delete().eq("reporte_id", selectedId),
        supabase.from("reporte_embarcaciones_inspeccionadas").delete().eq("reporte_id", selectedId),
      ]);
      await deleteReportPeople(selectedId, tipo);

      if (tipo === "vehiculo" && vehicleData) {
        const totalHoras = calcTotalHours(vehicleData.hora_salida, vehicleData.hora_regreso);

        const { error: updateError } = await supabase
          .from("reportes_vehiculo")
          .update({
            no_reporte: normalizedNoReporte,
            anio: normalizedYear,
            fecha: vehicleData.fecha || null,
            bitacora: vehicleData.bitacora || null,
            hora_salida: vehicleData.hora_salida || null,
            hora_regreso: vehicleData.hora_regreso || null,
            total_horas: totalHoras,
            estacion: normalizedReportTextOrNull(vehicleData.estacion),
            vehiculo: vehicleData.vehiculo || null,
            destino: normalizedReportTextOrNull(vehicleData.destino),
            estacion_combustible: normalizedReportTextOrNull(vehicleData.estacion_combustible),
            lugar_combustible: normalizedReportTextOrNull(vehicleData.lugar_combustible),
            cedula_juridica_combustible: vehicleData.cedula_juridica_combustible || null,
            no_factura: vehicleData.no_factura || null,
            combustible_trasegado_bomba: vehicleData.combustible_trasegado_bomba,
            total_combustible_antes_viaje: vehicleData.total_combustible_antes_viaje,
            combustible_gastado: vehicleData.combustible_gastado,
            saldo_combustible_despues_viaje: vehicleData.saldo_combustible_despues_viaje,
            kilometros_recorridos: vehicleData.kilometros_recorridos,
            novedades: vehicleData.novedades || null,
          })
          .eq("id", selectedId);
        if (updateError) throw updateError;

        await replaceReportPeople(selectedId, "vehiculo", [
          ...(vehicleData.chofer
            ? [{ nombre: normalizeName(vehicleData.chofer), cedula: vehicleData.chofer_cedula || null, roles: ["chofer"] }]
            : []),
          ...(vehicleData.oficial_a_cargo
            ? [{ nombre: normalizeName(vehicleData.oficial_a_cargo), cedula: vehicleData.oficial_a_cargo_cedula || null, roles: ["oficial"] }]
            : []),
          ...vehicleData.acompanantes
            .filter(Boolean)
            .map((name) => ({ nombre: normalizeName(name), roles: ["acompanante"] })),
        ]);

        await saveMotives(selectedId, "vehiculo", vehicleData.motivos);

        const sitiosInsert = vehicleData.sitios_visitados
          .map((s) => ({
            reporte_id: selectedId,
            nombre_sitio: normalizeReportText(s.nombre_sitio),
            zona: s.zona || null,
            posicion: s.posicion || null,
          }))
          .filter((s) => s.nombre_sitio);
        if (sitiosInsert.length > 0) await supabase.from("reporte_sitios").insert(sitiosInsert);
      } else if (tipo === "embarcacion" && boatData) {
        const horasNavegadas = calcTotalHours(boatData.hora_salida, boatData.hora_regreso);
        const totalTripulantes = countUniqueNormalizedNames([
          boatData.capitan,
          boatData.encargado_mision,
          ...boatData.tripulantes.map((person) => person.nombre),
        ].filter(Boolean));
        const horasHombre = horasNavegadas != null ? horasNavegadas * totalTripulantes : null;

        const { error: updateError } = await supabase
          .from("reportes_embarcacion")
          .update({
            no_reporte: normalizedNoReporte,
            anio: normalizedYear,
            fecha: boatData.fecha || null,
            bitacora: boatData.bitacora || null,
            folios: boatData.folios || null,
            estacion: normalizedReportTextOrNull(boatData.estacion),
            embarcacion: boatData.embarcacion || null,
            no_cierre_os: boatData.no_cierre_os || null,
            hora_salida: boatData.hora_salida || null,
            hora_regreso: boatData.hora_regreso || null,
            horas_navegadas: horasNavegadas,
            horas_motor_babor: boatData.horas_motor_babor,
            horas_motor_centro: boatData.horas_motor_centro,
            horas_motor_estribor: boatData.horas_motor_estribor,
            horas_hombre: horasHombre,
            destino: normalizedReportTextOrNull(boatData.destino),
            saldo_anterior: boatData.saldo_anterior,
            combustible_trasegado_bodega: boatData.combustible_trasegado_bodega,
            total_antes_viaje: boatData.total_antes_viaje,
            combustible_trasegado_durante: boatData.combustible_trasegado_durante,
            combustible_gastado: boatData.combustible_gastado,
            saldo_despues: boatData.saldo_despues,
            tipo_combustible: normalizedReportTextOrNull(boatData.tipo_combustible),
            estacion_combustible: normalizedReportTextOrNull(boatData.estacion_combustible),
            lugar_combustible: normalizedReportTextOrNull(boatData.lugar_combustible),
            cedula_juridica_combustible: boatData.cedula_juridica_combustible || null,
            no_factura: boatData.no_factura || null,
            millas_nauticas: boatData.millas_nauticas,
            novedades: boatData.novedades || null,
          })
          .eq("id", selectedId);
        if (updateError) throw updateError;

        await replaceReportPeople(selectedId, "embarcacion", [
          ...(boatData.capitan
            ? [{ nombre: normalizeName(boatData.capitan), cedula: boatData.capitan_cedula || null, roles: ["capitan"] }]
            : []),
          ...(boatData.encargado_mision
            ? [{ nombre: normalizeName(boatData.encargado_mision), cedula: boatData.encargado_mision_cedula || null, roles: ["encargado_mision"] }]
            : []),
          ...(boatData.oficial_director
            ? [{ nombre: normalizeName(boatData.oficial_director), cedula: boatData.oficial_director_cedula || null, roles: ["oficial_director"] }]
            : []),
          ...(boatData.operacional
            ? [{ nombre: normalizeName(boatData.operacional), cedula: boatData.operacional_cedula || null, roles: ["operacional"] }]
            : []),
          ...boatData.tripulantes
            .filter((person) => person.nombre)
            .map((person) => ({ nombre: normalizeName(person.nombre), cedula: person.cedula || null, roles: ["tripulante"] })),
          ...boatData.personas_particulares
            .filter(Boolean)
            .map((name) => ({ nombre: normalizeName(name), roles: ["particular"] })),
        ]);

        await saveMotives(selectedId, "embarcacion", boatData.motivos);

        const sitiosInsert = boatData.sitios_visitados
          .map((s) => ({
            reporte_id: selectedId,
            nombre_sitio: normalizeReportText(s.nombre_sitio),
            zona: s.zona || null,
            posicion: s.posicion || null,
          }))
          .filter((s) => s.nombre_sitio);
        if (sitiosInsert.length > 0) await supabase.from("reporte_sitios").insert(sitiosInsert);

        const inspectedInsert = boatData.embarcaciones_inspeccionadas
          .filter((item) => item.nombre || item.matricula || item.no_inspeccion || item.zona)
          .map((item) => ({
            reporte_id: selectedId,
            nombre: item.nombre || "",
            matricula: item.matricula || null,
            no_inspeccion: item.no_inspeccion || null,
            zona: item.zona || null,
          }));
        if (inspectedInsert.length > 0) {
          await supabase.from("reporte_embarcaciones_inspeccionadas").insert(inspectedInsert);
        }
      }

      toast.success("Reporte actualizado correctamente");
      const activeId = selectedId;
      setEditing(false);
      setPreview(null);
      setSelectedId("");
      setTimeout(() => setSelectedId(activeId), 50);
    } catch {
      toast.error("Error al guardar cambios");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setDeleting(true);
    try {
      await Promise.all([
        supabase.from("reporte_motivos").delete().eq("reporte_id", selectedId).eq("tipo_reporte", tipo),
        supabase.from("reporte_sitios").delete().eq("reporte_id", selectedId),
        supabase.from("reporte_embarcaciones_inspeccionadas").delete().eq("reporte_id", selectedId),
      ]);
      await deleteReportPeople(selectedId, tipo);
      await supabase.from(table).delete().eq("id", selectedId);
      toast.success("Reporte eliminado correctamente");
      setSelectedId("");
      setPreview(null);
      setEditing(false);
      setReportNumbers((prev) => prev.filter((r) => r.id !== selectedId));
      setSelectedReportIds((prev) => prev.filter((id) => id !== selectedId));
      setDeleteDialogOpen(false);
    } catch {
      toast.error("Error al eliminar el reporte");
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerateExcel = async (reportId: string) => {
    setGeneratingExcelId(reportId);
    try {
      await downloadReportExcel(tipo, reportId);
      toast.success("Excel generado correctamente");
    } catch {
      toast.error("No se pudo generar el Excel");
    } finally {
      setGeneratingExcelId("");
    }
  };

  const clearSelection = () => {
    setSelectedId("");
    setPreview(null);
    setPersonas([]);
    setMotivos([]);
    setSitios([]);
    setEmbarcacionesInspeccionadas([]);
    setVehicleData(null);
    setBoatData(null);
    setEditing(false);
    setDeleteDialogOpen(false);
  };

  return (
    <div className="space-y-4">
      <Card className="mx-auto w-full overflow-hidden">
        <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
          <div className="flex items-start gap-3">
            <div className="section-icon-shell">
              <FileSearch className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="section-eyebrow">Gestion de reportes</div>
              <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">
                Consultar, editar o eliminar reportes
              </h3>
              <p className="section-copy">
                Seleccione tipo, periodo, unidad y numero de reporte para continuar.
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-5 sm:p-6 lg:p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label>Tipo de reporte</Label>
              <Select value={tipo} onValueChange={(value) => setTipo(value as "vehiculo" | "embarcacion")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vehiculo">Vehiculo</SelectItem>
                  <SelectItem value="embarcacion">Embarcacion</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Ano</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Mes (opcional)</Label>
              <Popover open={monthOpen} onOpenChange={setMonthOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    {allMonthsSelected
                      ? "Todos los meses"
                      : selectedMonths.length > 0
                        ? `${selectedMonths.length} mes${selectedMonths.length === 1 ? "" : "es"} seleccionado${selectedMonths.length === 1 ? "" : "s"}`
                      : "Todos"}
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[220px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar mes..." />
                    <CommandList>
                      <CommandEmpty>No se encontro.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="Todos los meses" onSelect={toggleAllMonths}>
                          <Checkbox checked={allMonthsSelected} className="mr-2" />
                          Todos
                        </CommandItem>
                        {MONTHS.map((m) => {
                          const isSelected = selectedMonths.includes(m.value);
                          return (
                            <CommandItem key={m.value} value={m.label} onSelect={() => toggleMonth(m.value)}>
                              <Checkbox checked={isSelected} className="mr-2" />
                              {m.label}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <Label>Unidad (opcional)</Label>
              <Select value={unidad} onValueChange={setUnidad}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {unidades.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>N° Reporte</Label>
              <Popover open={reportOpen} onOpenChange={setReportOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    {allReportsSelected
                      ? "Todos los reportes"
                      : selectedReportIds.length > 0
                        ? `${selectedReportIds.length} reporte${selectedReportIds.length === 1 ? "" : "s"}`
                        : "Seleccionar..."}
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Buscar numero de reporte..."
                      value={reportSearch}
                      onValueChange={setReportSearch}
                      inputMode="numeric"
                    />
                    <CommandList>
                      <CommandGroup>
                        {visibleReportOptions.length > 0 && (
                          <CommandItem value="Todos los reportes" onSelect={toggleAllReports}>
                            <Checkbox checked={allVisibleReportsSelected} className="mr-2" />
                            Todos los reportes
                          </CommandItem>
                        )}
                        {visibleReportOptions.length === 0 && (
                          <div className="py-6 text-center text-sm text-muted-foreground">
                            No se encontro.
                          </div>
                        )}
                        {visibleReportOptions.map((r) => (
                          <CommandItem
                            key={r.id}
                            value={`${r.no_reporte} ${r.unidad || ""} ${r.fecha || ""}`}
                            onSelect={() => toggleReport(r.id)}
                          >
                            <Checkbox checked={selectedReportIds.includes(r.id)} className="mr-2" />
                            <div className="flex min-w-0 flex-col">
                              <span className="font-medium">#{r.no_reporte}</span>
                              <span className="truncate text-xs text-muted-foreground">
                                {[r.unidad, r.fecha].filter(Boolean).join(" - ")}
                              </span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="result-panel-shell">
            <div className="result-panel-body">
              {selectedReports.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Reportes filtrados</div>
                      <p className="section-copy">
                        Seleccione un reporte de la lista para desplegarlo y editar sus datos.
                      </p>
                    </div>
                    <Badge variant="outline" className="w-fit">
                      {selectedReports.length} seleccionado{selectedReports.length === 1 ? "" : "s"}
                    </Badge>
                  </div>

                  {selectedReports.map((report) => {
                    const isOpen = selectedId === report.id;
                    const isReady = isOpen && preview?.id === report.id && editing;
                    const reportPreview = isOpen && preview?.id === report.id ? preview : null;
                    const rowMetrics: ReportRowMetric[] = [];

                    if (reportPreview && tipo === "vehiculo") {
                      const vehiclePreview = reportPreview as VehicleReport;
                      if (vehiclePreview.kilometros_recorridos != null) {
                        rowMetrics.push({
                          label: "Kilometros",
                          value: `${vehiclePreview.kilometros_recorridos} km`,
                          icon: Route,
                        });
                      }
                      if (vehiclePreview.total_horas != null) {
                        rowMetrics.push({
                          label: "Horas",
                          value: `${vehiclePreview.total_horas} h`,
                          icon: Clock3,
                        });
                      }
                    }

                    if (reportPreview && tipo === "embarcacion") {
                      const boatPreview = reportPreview as BoatReport;
                      if (boatPreview.millas_nauticas != null) {
                        rowMetrics.push({
                          label: "Millas",
                          value: `${boatPreview.millas_nauticas} mn`,
                          icon: Waves,
                        });
                      }
                      if (boatPreview.horas_navegadas != null) {
                        rowMetrics.push({
                          label: "Horas",
                          value: `${boatPreview.horas_navegadas} h`,
                          icon: Clock3,
                        });
                      }
                    }

                    const openReport = () => {
                      setSelectedId(report.id);
                      setEditing(false);
                    };

                    return (
                      <ReportListRow
                        key={report.id}
                        origin="gestion"
                        type={tipo}
                        reportNumber={report.no_reporte}
                        date={report.fecha}
                        unit={report.unidad}
                        station={reportPreview?.estacion}
                        role={tipo === "vehiculo" && isOpen && vehicleData?.chofer
                          ? "Chofer"
                          : tipo === "embarcacion" && isOpen && boatData?.capitan
                            ? "Capitan"
                            : undefined}
                        metrics={rowMetrics}
                        tags={isOpen ? motivos : []}
                        status={isOpen && !isReady ? "processing" : "ready"}
                        statusText={isOpen && !isReady ? "Cargando datos" : undefined}
                        expanded={isOpen}
                        expandable
                        onExpandedChange={(open) => {
                          if (open) {
                            openReport();
                          } else if (isOpen) {
                            clearSelection();
                          }
                        }}
                        onGenerateExcel={() => handleGenerateExcel(report.id)}
                        generatingExcel={generatingExcelId === report.id}
                        onEdit={isOpen ? undefined : openReport}
                        editing={isOpen && !isReady}
                        onRemove={() => {
                          setSelectedReportIds((prev) => prev.filter((id) => id !== report.id));
                          if (selectedId === report.id) clearSelection();
                        }}
                        removeLabel={`Quitar reporte ${report.no_reporte}`}
                      >
                        {!isReady && (
                          <div className="panel-subtle flex items-center gap-2 p-4 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            Cargando datos del reporte...
                          </div>
                        )}
                        {isReady && tipo === "vehiculo" && vehicleData && (
                          <VehicleReportForm
                            data={vehicleData}
                            onChange={setVehicleData}
                            onSave={saveEdit}
                            onCancel={clearSelection}
                            saving={saving}
                            stationOptions={REPORT_STATIONS}
                            unitOptions={unidades}
                            peopleOptions={peopleOptions}
                            motiveOptions={motiveOptions}
                            siteOptions={siteOptions}
                            onDelete={() => setDeleteDialogOpen(true)}
                            deleting={deleting}
                          />
                        )}
                        {isReady && tipo === "embarcacion" && boatData && (
                          <BoatReportForm
                            data={boatData}
                            onChange={setBoatData}
                            onSave={saveEdit}
                            onCancel={clearSelection}
                            saving={saving}
                            stationOptions={REPORT_STATIONS}
                            unitOptions={unidades}
                            peopleOptions={peopleOptions}
                            motiveOptions={motiveOptions}
                            siteOptions={siteOptions}
                            onDelete={() => setDeleteDialogOpen(true)}
                            deleting={deleting}
                          />
                        )}
                      </ReportListRow>
                    );
                  })}
                </div>
              ) : (
                <ResultPanelState
                  title="Sin resultado seleccionado"
                  description="Seleccione los filtros y uno o varios numeros de reporte para cargar la lista editable."
                />
              )}
            </div>
          </div>
        </div>
      </Card>
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar reporte</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion no se puede deshacer. El reporte y sus datos relacionados seran eliminados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ManageReport;

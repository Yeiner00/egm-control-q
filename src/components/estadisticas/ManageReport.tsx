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
import { CheckCircle2, ChevronDown, ChevronUp, FileSearch, FileSpreadsheet, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import VehicleReportForm, { type VehicleFormData } from "./VehicleReportForm";
import BoatReportForm, { type BoatFormData, type InspectedBoatData } from "./BoatReportForm";
import { calcTotalHours } from "@/lib/report-utils";
import { normalizeReportNumber, normalizeReportUnit } from "@/lib/reportNumber";
import { buildLegacyReportMotiveRows, buildReportMotiveRows, loadMotiveOptions } from "@/lib/motives";
import { loadAvailableReportYears } from "@/lib/reportYears";
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
  tipo: "vehiculo" | "embarcacion";
  reportId: string;
  nonce: number;
};

interface ManageReportProps {
  initialSelection?: InitialSelection | null;
}

const ManageReport = ({ initialSelection }: ManageReportProps) => {
  const [tipo, setTipo] = useState<"vehiculo" | "embarcacion">("vehiculo");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [monthOpen, setMonthOpen] = useState(false);
  const [unidad, setUnidad] = useState("");
  const [unidades, setUnidades] = useState<string[]>([]);
  const [reportNumbers, setReportNumbers] = useState<ReportOption[]>([]);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [reportOpen, setReportOpen] = useState(false);
  const [years, setYears] = useState<string[]>([new Date().getFullYear().toString()]);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [personas, setPersonas] = useState<ReportPersonWithRoles[]>([]);
  const [motivos, setMotivos] = useState<string[]>([]);
  const [sitios, setSitios] = useState<{ nombre_sitio: string; zona: string; posicion: string }[]>([]);
  const [embarcacionesInspeccionadas, setEmbarcacionesInspeccionadas] = useState<InspectedBoatData[]>([]);
  const [deleting, setDeleting] = useState(false);
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
    tipoReporte: "vehiculo" | "embarcacion",
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
  const allReportsSelected = reportOptions.length > 0 && selectedReportIds.length === reportOptions.length;
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
    setSelectedReportIds((prev) =>
      prev.length === reportOptions.length ? [] : reportOptions.map((report) => report.id),
    );
  };

  useEffect(() => {
    const loadYears = async () => {
      try {
        const availableYears = await loadAvailableReportYears(table);
        setYears(availableYears);
        if (availableYears.length > 0 && !availableYears.includes(year)) {
          setYear(availableYears[0]);
        }
      } catch {
        toast.error("No se pudieron cargar los años disponibles");
      }
    };
    loadYears();
  }, [table, year]);

  useEffect(() => {
    const loadUnits = async () => {
      if (tipo === "vehiculo") {
        const { data } = await supabase
          .from("reportes_vehiculo")
          .select("vehiculo")
          .eq("anio", parseInt(year));
        setUnidades([...new Set((data || []).map((d) => d.vehiculo).filter(Boolean) as string[])].sort());
      } else {
        const { data } = await supabase
          .from("reportes_embarcacion")
          .select("embarcacion")
          .eq("anio", parseInt(year));
        setUnidades([...new Set((data || []).map((d) => d.embarcacion).filter(Boolean) as string[])].sort());
      }
      setUnidad("");
    };
    loadUnits();
  }, [tipo, year]);

  useEffect(() => {
    const loadFormOptions = async () => {
      try {
        const [loadedPeopleOptions, loadedMotiveOptions, loadedSiteOptions] = await Promise.all([
          loadPeopleNameOptions([], tipo),
          loadMotiveOptions(),
          loadSiteOptions(),
        ]);
        setPeopleOptions(loadedPeopleOptions);
        setMotiveOptions(loadedMotiveOptions);
        setSiteOptions(loadedSiteOptions);
      } catch {
        setPeopleOptions([]);
        setMotiveOptions([]);
        setSiteOptions(DEFAULT_REPORT_SITE_OPTIONS);
      }
    };
    loadFormOptions();
  }, [tipo]);

  useEffect(() => {
    if (!initialSelection?.reportId) return;

    const loadInitialSelection = async () => {
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
        const { data } = await supabase
          .from("reportes_vehiculo")
          .select("id, no_reporte, fecha, vehiculo")
          .eq("id", initialSelection.reportId)
          .single();
        if (!data) return;
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

      const { data } = await supabase
        .from("reportes_embarcacion")
        .select("id, no_reporte, fecha, embarcacion")
        .eq("id", initialSelection.reportId)
        .single();
      if (!data) return;
      if (data.fecha) setYear(String(new Date(`${data.fecha}T00:00:00`).getFullYear()));
      setPinnedReportOption({
        id: data.id,
        no_reporte: data.no_reporte,
        fecha: data.fecha,
        unidad: data.embarcacion,
      });
      setSelectedReportIds([data.id]);
      setSelectedId(data.id);
    };

    loadInitialSelection();
  }, [initialSelection?.nonce, initialSelection?.reportId, initialSelection?.tipo]);

  useEffect(() => {
    const load = async () => {
      let results: ReportOption[] = [];

      if (tipo === "vehiculo") {
        let q = supabase
          .from("reportes_vehiculo")
          .select("id, no_reporte, fecha, vehiculo")
          .eq("anio", parseInt(year))
          .order("no_reporte");
        if (unidad && unidad !== "all") q = q.eq("vehiculo", unidad);
        const { data } = await q;
        results = (data || [])
          .filter((d) => {
            if (selectedMonths.length === 0 || !d.fecha) return true;
            const month = new Date(d.fecha).getMonth() + 1;
            return selectedMonths.includes(String(month));
          })
          .map((d) => ({ id: d.id, no_reporte: d.no_reporte, fecha: d.fecha, unidad: d.vehiculo }));
      } else {
        let q = supabase
          .from("reportes_embarcacion")
          .select("id, no_reporte, fecha, embarcacion")
          .eq("anio", parseInt(year))
          .order("no_reporte");
        if (unidad && unidad !== "all") q = q.eq("embarcacion", unidad);
        const { data } = await q;
        results = (data || [])
          .filter((d) => {
            if (selectedMonths.length === 0 || !d.fecha) return true;
            const month = new Date(d.fecha).getMonth() + 1;
            return selectedMonths.includes(String(month));
          })
          .map((d) => ({ id: d.id, no_reporte: d.no_reporte, fecha: d.fecha, unidad: d.embarcacion }));
      }

      setReportNumbers(results);
      const availableIds = new Set(results.map((report) => report.id));
      const pinnedId = pinnedReportOption?.id ?? initialSelection?.reportId;
      setSelectedReportIds((prev) => prev.filter((id) => availableIds.has(id) || id === pinnedId));
    };
    load();
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

    const load = async () => {
      const { data: report } = await supabase.from(table).select("*").eq("id", selectedId).single();
      const { data: mots } = await supabase
        .from("reporte_motivos")
        .select("motivo")
        .eq("reporte_id", selectedId)
        .eq("tipo_reporte", tipo);
      const { data: sits } = await supabase
        .from("reporte_sitios")
        .select("nombre_sitio, zona, posicion")
        .eq("reporte_id", selectedId);
      const { data: inspectedBoats } = tipo === "embarcacion"
        ? await supabase
          .from("reporte_embarcaciones_inspeccionadas")
          .select("nombre, matricula, no_inspeccion, zona, posicion")
          .eq("reporte_id", selectedId)
        : { data: [] };
      const peopleMap = await loadReportPeopleByIds([selectedId], tipo);

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
        posicion: item.posicion || "",
      })));
    };

    load();
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
      const operacionalPerson = personas.find((p) => p.roles.includes("operacional"));
      const capitan = capitanPerson?.nombre || "";
      const encargado = encargadoPerson?.nombre || "";
      const tripulantes = personas
        .filter((p) => p.roles.includes("tripulante"))
        .map((p) => ({ nombre: p.nombre, cedula: p.cedula || "" }));
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
        normalizedYear = vehicleData.fecha ? parseInt(vehicleData.fecha.split("-")[0]) : parseInt(year);
        if (!normalizedNoReporte) {
          toast.error("N° de reporte obligatorio");
          return;
        }

        const unitKey = normalizeReportUnit(vehicleData.vehiculo);
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
        normalizedYear = boatData.fecha ? parseInt(boatData.fecha.split("-")[0]) : parseInt(year);
        if (!normalizedNoReporte) {
          toast.error("N° de reporte obligatorio");
          return;
        }

        const unitKey = normalizeReportUnit(boatData.embarcacion);
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
            estacion: vehicleData.estacion || null,
            vehiculo: vehicleData.vehiculo || null,
            destino: vehicleData.destino || null,
            estacion_combustible: vehicleData.estacion_combustible || null,
            lugar_combustible: vehicleData.lugar_combustible || null,
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
          .filter((s) => s.nombre_sitio)
          .map((s) => ({
            reporte_id: selectedId,
            nombre_sitio: s.nombre_sitio,
            zona: s.zona || null,
            posicion: s.posicion || null,
          }));
        if (sitiosInsert.length > 0) await supabase.from("reporte_sitios").insert(sitiosInsert);
      } else if (tipo === "embarcacion" && boatData) {
        const horasNavegadas = calcTotalHours(boatData.hora_salida, boatData.hora_regreso);
        const totalTripulantes = countUniqueNormalizedNames([
          boatData.capitan,
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
            estacion: boatData.estacion || null,
            embarcacion: boatData.embarcacion || null,
            no_cierre_os: boatData.no_cierre_os || null,
            hora_salida: boatData.hora_salida || null,
            hora_regreso: boatData.hora_regreso || null,
            horas_navegadas: horasNavegadas,
            horas_motor_babor: boatData.horas_motor_babor,
            horas_motor_centro: boatData.horas_motor_centro,
            horas_motor_estribor: boatData.horas_motor_estribor,
            horas_hombre: horasHombre,
            destino: boatData.destino || null,
            saldo_anterior: boatData.saldo_anterior,
            combustible_trasegado_bodega: boatData.combustible_trasegado_bodega,
            total_antes_viaje: boatData.total_antes_viaje,
            combustible_trasegado_durante: boatData.combustible_trasegado_durante,
            combustible_gastado: boatData.combustible_gastado,
            saldo_despues: boatData.saldo_despues,
            tipo_combustible: boatData.tipo_combustible || null,
            estacion_combustible: boatData.estacion_combustible || null,
            lugar_combustible: boatData.lugar_combustible || null,
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
          .filter((s) => s.nombre_sitio)
          .map((s) => ({
            reporte_id: selectedId,
            nombre_sitio: s.nombre_sitio,
            zona: s.zona || null,
            posicion: s.posicion || null,
          }));
        if (sitiosInsert.length > 0) await supabase.from("reporte_sitios").insert(sitiosInsert);

        const inspectedInsert = boatData.embarcaciones_inspeccionadas
          .filter((item) => item.nombre || item.matricula || item.no_inspeccion || item.zona || item.posicion)
          .map((item) => ({
            reporte_id: selectedId,
            nombre: item.nombre || "",
            matricula: item.matricula || null,
            no_inspeccion: item.no_inspeccion || null,
            zona: item.zona || null,
            posicion: item.posicion || null,
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
                  <Command>
                    <CommandInput placeholder="Buscar numero de reporte..." />
                    <CommandList>
                      <CommandEmpty>No se encontro.</CommandEmpty>
                      <CommandGroup>
                        {reportOptions.length > 0 && (
                          <CommandItem value="Todos los reportes" onSelect={toggleAllReports}>
                            <Checkbox checked={allReportsSelected} className="mr-2" />
                            Todos los reportes
                          </CommandItem>
                        )}
                        {reportOptions.map((r) => (
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

                    return (
                      <Collapsible
                        key={report.id}
                        open={isOpen}
                        onOpenChange={(open) => {
                          if (open) {
                            setSelectedId(report.id);
                            setEditing(false);
                          } else if (isOpen) {
                            clearSelection();
                          }
                        }}
                      >
                        <div className="rounded-[calc(var(--radius)-0.08rem)] border border-border/80 bg-card/70">
                          <CollapsibleTrigger asChild>
                            <button className="flex w-full items-center justify-between gap-3 rounded-[calc(var(--radius)-0.08rem)] p-3 text-left text-sm hover:bg-muted/40">
                              <div className="flex min-w-0 items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-foreground">
                                    Reporte #{report.no_reporte}
                                  </div>
                                  <div className="truncate text-xs text-muted-foreground">
                                    {[report.unidad, report.fecha].filter(Boolean).join(" - ") || "Sin detalle"}
                                  </div>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <Badge variant="outline" className="text-xs">
                                  {tipo === "vehiculo" ? "Vehiculo" : "Embarcacion"}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">#{report.no_reporte}</Badge>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  aria-label={`Generar Excel del reporte ${report.no_reporte}`}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius)-0.16rem)] text-muted-foreground transition hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleGenerateExcel(report.id);
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      handleGenerateExcel(report.id);
                                    }
                                  }}
                                >
                                  {generatingExcelId === report.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <FileSpreadsheet className="h-4 w-4" />
                                  )}
                                </span>
                                <span
                                  role="button"
                                  tabIndex={0}
                                  aria-label={`Quitar reporte ${report.no_reporte}`}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-[calc(var(--radius)-0.16rem)] text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setSelectedReportIds((prev) => prev.filter((id) => id !== report.id));
                                    if (selectedId === report.id) clearSelection();
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      setSelectedReportIds((prev) => prev.filter((id) => id !== report.id));
                                      if (selectedId === report.id) clearSelection();
                                    }
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </span>
                                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </div>
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="px-3 pb-3">
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
                              />
                            )}
                            {isReady && (
                              <div className="mt-3 flex justify-end">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="destructive" size="sm" disabled={deleting}>
                                      {deleting ? (
                                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                                      ) : (
                                        <Trash2 className="mr-1 h-4 w-4" />
                                      )}
                                      Eliminar reporte
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>¿Está seguro?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        ¿Está seguro que desea eliminar este reporte? Esta acción no se puede deshacer.
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
                            )}
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
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
    </div>
  );
};

export default ManageReport;

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { normalizeName } from "@/lib/normalizeName";
import { calcTotalHours, mapToBoatFormData, mapToVehicleFormData, type ExtractedReportData } from "@/lib/report-utils";
import { normalizeReportNumber, normalizeReportUnit } from "@/lib/reportNumber";
import { countUniqueNormalizedNames, loadPeopleNameOptions, replaceReportPeople } from "@/lib/reportPeople";
import { buildLegacyReportMotiveRows, buildReportMotiveRows, loadMotiveOptions } from "@/lib/motives";
import { downloadReportExcel } from "@/lib/reportExcelExport";
import { loadSiteOptions, type ReportSiteOption } from "@/lib/reportSites";
import { isEmptyReportValue } from "@/lib/missingData";
import { findOfficerByName, mergeOfficerOptions } from "@/lib/officers";
import { getErrorMessage } from "@/lib/errorMessage";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import ReportUploader, { type BatchItem } from "@/components/estadisticas/ReportUploader";
import VehicleReportForm, { type VehicleFormData } from "@/components/estadisticas/VehicleReportForm";
import BoatReportForm, { type BoatFormData } from "@/components/estadisticas/BoatReportForm";
import ManageReport from "@/components/estadisticas/ManageReport";
import ExportSection from "@/components/estadisticas/ExportSection";
import { Car, CheckCircle2, FileOutput, FilePlus2, FileSpreadsheet, Loader2, Settings2, Ship, Upload } from "lucide-react";

type ReportType = "vehiculo" | "embarcacion";
type ReportesSubtab = "manual" | "subir" | "gestionar" | "exportar";
type ReportEditTarget = { tipo: ReportType; reportId: string };
type SubtabRequest<T extends string> = { value: T; nonce: number; editTarget?: ReportEditTarget };
type SaveReportResult = {
  reportId?: string;
  error?: string;
};

const MANUAL_STATIONS = ["Murcielago"];
const DEFAULT_MANUAL_STATION = MANUAL_STATIONS[0];
const DEFAULT_MANUAL_VEHICLE_OFFICIAL = "Michael Rojas Brenes";
const DEFAULT_MANUAL_BOAT_OPERATIONAL = "Michael Rojas Brenes";

const emptyVehicle: VehicleFormData = {
  no_reporte: "", bitacora: "", fecha: "", hora_salida: "", hora_regreso: "",
  estacion: "", vehiculo: "", destino: "", motivos: [],
  chofer: "", chofer_cedula: "", acompanantes: [], oficial_a_cargo: "",
  oficial_a_cargo_cedula: "", sitios_visitados: [],
  estacion_combustible: "", lugar_combustible: "",
  cedula_juridica_combustible: "", no_factura: "",
  combustible_trasegado_bomba: null, total_combustible_antes_viaje: null,
  combustible_gastado: null, saldo_combustible_despues_viaje: null,
  kilometros_recorridos: null, novedades: "",
};

const emptyBoat: BoatFormData = {
  no_reporte: "", bitacora: "", folios: "", fecha: "", estacion: "", embarcacion: "",
  no_cierre_os: "", hora_salida: "", hora_regreso: "",
  horas_motor_babor: null, horas_motor_centro: null, horas_motor_estribor: null,
  destino: "", motivos: [], capitan: "", encargado_mision: "",
  capitan_cedula: "", encargado_mision_cedula: "", operacional: "", operacional_cedula: "",
  tripulantes: [], personas_particulares: [], sitios_visitados: [], embarcaciones_inspeccionadas: [],
  saldo_anterior: null, combustible_trasegado_bodega: null,
  total_antes_viaje: null, combustible_trasegado_durante: null,
  combustible_gastado: null, saldo_despues: null,
  tipo_combustible: "", estacion_combustible: "", lugar_combustible: "",
  cedula_juridica_combustible: "", no_factura: "",
  millas_nauticas: null, novedades: "",
};

const withManualStation = <T extends { estacion: string }>(data: T, station: string): T => ({
  ...data,
  estacion: station,
});

const getCurrentManualDateTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");

  return {
    fecha: `${year}-${month}-${day}`,
    hora_salida: `${hours}:${minutes}`,
  };
};

const getCurrentManualDate = () => {
  const { fecha } = getCurrentManualDateTime();
  return { fecha };
};

const buildManualVehicleDefaults = () => ({
  ...withManualStation(emptyVehicle, DEFAULT_MANUAL_STATION),
  oficial_a_cargo: DEFAULT_MANUAL_VEHICLE_OFFICIAL,
  oficial_a_cargo_cedula: findOfficerByName(DEFAULT_MANUAL_VEHICLE_OFFICIAL)?.identificacion || "",
  ...getCurrentManualDate(),
});

const buildManualBoatDefaults = () => ({
  ...withManualStation(emptyBoat, DEFAULT_MANUAL_STATION),
  operacional: DEFAULT_MANUAL_BOAT_OPERATIONAL,
  operacional_cedula: findOfficerByName(DEFAULT_MANUAL_BOAT_OPERATIONAL)?.identificacion || "",
  ...getCurrentManualDate(),
});

const addMissing = (missing: string[], label: string, value: unknown) => {
  if (isEmptyReportValue(value)) missing.push(label);
};

const addMissingList = (missing: string[], label: string, items: unknown[]) => {
  if (items.length === 0 || items.some((item) => isEmptyReportValue(item))) {
    missing.push(label);
  }
};

const getVehicleManualMissingFields = (data: VehicleFormData, fuelLoadEnabled: boolean) => {
  const missing: string[] = [];
  addMissing(missing, "N. Reporte", data.no_reporte);
  addMissing(missing, "Bitacora", data.bitacora);
  addMissing(missing, "Fecha", data.fecha);
  addMissing(missing, "Hora Salida", data.hora_salida);
  addMissing(missing, "Hora Regreso", data.hora_regreso);
  addMissing(missing, "Estacion", data.estacion);
  addMissing(missing, "Vehiculo", data.vehiculo);
  addMissing(missing, "Destino", data.destino);
  addMissingList(missing, "Motivos", data.motivos);
  addMissing(missing, "Chofer", data.chofer);
  addMissing(missing, "Cedula Chofer", data.chofer_cedula);
  addMissingList(missing, "Acompanantes", data.acompanantes);
  addMissing(missing, "Oficial a Cargo", data.oficial_a_cargo);
  addMissing(missing, "Cedula Oficial", data.oficial_a_cargo_cedula);
  addMissingList(missing, "Sitios Visitados", data.sitios_visitados);
  addMissing(missing, "Novedades", data.novedades);
  addMissing(missing, "Kilometros", data.kilometros_recorridos);
  addMissing(missing, "Combustible Gastado (L)", data.combustible_gastado);

  if (fuelLoadEnabled) {
    addMissing(missing, "Estacion de Combustible", data.estacion_combustible);
    addMissing(missing, "Lugar", data.lugar_combustible);
    addMissing(missing, "Cedula Juridica", data.cedula_juridica_combustible);
    addMissing(missing, "N. Factura", data.no_factura);
    addMissing(missing, "Trasegado Bomba (L)", data.combustible_trasegado_bomba);
    addMissing(missing, "Total Antes Viaje (L)", data.total_combustible_antes_viaje);
    addMissing(missing, "Saldo Despues (L)", data.saldo_combustible_despues_viaje);
  }

  return missing;
};

const getBoatManualMissingFields = (data: BoatFormData, fuelLoadEnabled: boolean) => {
  const missing: string[] = [];
  addMissing(missing, "Estacion", data.estacion);
  addMissing(missing, "Embarcacion", data.embarcacion);
  addMissing(missing, "Bitacora", data.bitacora);
  addMissing(missing, "Folios", data.folios);
  addMissing(missing, "N. Reporte", data.no_reporte);
  addMissing(missing, "Fecha", data.fecha);
  addMissing(missing, "N. Cierre OS", data.no_cierre_os);
  addMissing(missing, "Hora Salida", data.hora_salida);
  addMissing(missing, "Hora Regreso", data.hora_regreso);
  addMissing(missing, "Motor Babor", data.horas_motor_babor);
  addMissing(missing, "Motor Centro", data.horas_motor_centro);
  addMissing(missing, "Motor Estribor", data.horas_motor_estribor);
  addMissing(missing, "Destino", data.destino);
  addMissingList(missing, "Motivos", data.motivos);
  addMissing(missing, "Capitan", data.capitan);
  addMissing(missing, "Cedula Capitan", data.capitan_cedula);
  addMissing(missing, "Encargado de Mision", data.encargado_mision);
  addMissing(missing, "Cedula Encargado", data.encargado_mision_cedula);
  addMissing(missing, "Operacional", data.operacional);
  addMissing(missing, "Cedula Operacional", data.operacional_cedula);
  addMissingList(missing, "Tripulantes", data.tripulantes);
  addMissingList(missing, "Personas Particulares", data.personas_particulares);
  addMissing(missing, "Novedades", data.novedades);
  addMissingList(missing, "Sitios / Posiciones", data.sitios_visitados);
  addMissingList(missing, "Embarcaciones Inspeccionadas", data.embarcaciones_inspeccionadas);
  addMissing(missing, "Total Antes Viaje", data.total_antes_viaje);
  addMissing(missing, "Gastado", data.combustible_gastado);
  addMissing(missing, "Saldo Despues", data.saldo_despues);
  addMissing(missing, "Millas Nauticas", data.millas_nauticas);

  if (fuelLoadEnabled) {
    addMissing(missing, "Saldo Anterior", data.saldo_anterior);
    addMissing(missing, "Trasegado Bodega", data.combustible_trasegado_bodega);
    addMissing(missing, "Trasegado Durante", data.combustible_trasegado_durante);
    addMissing(missing, "Tipo Combustible", data.tipo_combustible);
    addMissing(missing, "Estacion de Combustible", data.estacion_combustible);
    addMissing(missing, "Lugar", data.lugar_combustible);
    addMissing(missing, "Cedula Juridica", data.cedula_juridica_combustible);
    addMissing(missing, "N. Factura", data.no_factura);
  }

  return missing;
};

const isMotivesSchemaError = (message: string) =>
  message.includes("motivo_original") ||
  message.includes("motivo_key") ||
  message.includes("Could not find");

interface ReportesTabProps {
  subtabRequest?: SubtabRequest<ReportesSubtab> | null;
  onSubtabRequestConsumed?: (nonce: number) => void;
}

const ReportesTab = ({ subtabRequest, onSubtabRequestConsumed }: ReportesTabProps) => {
  const [reportType, setReportType] = useState<ReportType | null>(null);
  const [activeReportsTab, setActiveReportsTab] = useState<ReportesSubtab>("manual");
  const [vehicleData, setVehicleData] = useState<VehicleFormData>(emptyVehicle);
  const [boatData, setBoatData] = useState<BoatFormData>(emptyBoat);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [manualType, setManualType] = useState<ReportType | null>(null);
  const [manageInitialSelection, setManageInitialSelection] = useState<(ReportEditTarget & { nonce: number }) | null>(null);
  const [manualVehicleData, setManualVehicleData] = useState<VehicleFormData>(buildManualVehicleDefaults);
  const [manualBoatData, setManualBoatData] = useState<BoatFormData>(buildManualBoatDefaults);
  const [manualUnitOptions, setManualUnitOptions] = useState<string[]>([]);
  const [manualPeopleOptions, setManualPeopleOptions] = useState<string[]>([]);
  const [motiveOptions, setMotiveOptions] = useState<string[]>([]);
  const [siteOptions, setSiteOptions] = useState<ReportSiteOption[]>([]);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualGenerating, setManualGenerating] = useState(false);
  const [manualSavedReport, setManualSavedReport] = useState<{ tipo: ReportType; reportId: string } | null>(null);
  const [manualShowPendingState, setManualShowPendingState] = useState(false);
  const [manualPendingFields, setManualPendingFields] = useState<string[]>([]);
  const [manualPendingDialogOpen, setManualPendingDialogOpen] = useState(false);
  const [manualVehicleFuelLoadEnabled, setManualVehicleFuelLoadEnabled] = useState(false);
  const [manualBoatFuelLoadEnabled, setManualBoatFuelLoadEnabled] = useState(false);
  const optionType = showForm && reportType ? reportType : manualType;

  useEffect(() => {
    if (!subtabRequest) return;
    setActiveReportsTab(subtabRequest.value);
    if (subtabRequest.value === "gestionar" && subtabRequest.editTarget) {
      setShowForm(false);
      setReportType(null);
      setManageInitialSelection({ ...subtabRequest.editTarget, nonce: subtabRequest.nonce });
      onSubtabRequestConsumed?.(subtabRequest.nonce);
    }
    if (subtabRequest.value === "manual") {
      setShowForm(false);
      setReportType(null);
      setManageInitialSelection(null);
      onSubtabRequestConsumed?.(subtabRequest.nonce);
    }
  }, [onSubtabRequestConsumed, subtabRequest]);

  const handleReportsTabChange = (value: string) => {
    const nextValue = value as ReportesSubtab;
    setActiveReportsTab(nextValue);
    if (nextValue !== "gestionar") {
      setManageInitialSelection(null);
    }
  };

  useEffect(() => {
    let active = true;

    const loadManualOptions = async () => {
      if (!optionType) return;

      let unitOptions: string[] = [];
      if (optionType === "vehiculo") {
        const { data, error } = await supabase.from("reportes_vehiculo").select("vehiculo");
        if (error) throw error;
        unitOptions = [...new Set((data || []).map((row) => row.vehiculo?.trim()).filter(Boolean) as string[])].sort();
      } else {
        const { data, error } = await supabase.from("reportes_embarcacion").select("embarcacion");
        if (error) throw error;
        unitOptions = [...new Set((data || []).map((row) => row.embarcacion?.trim()).filter(Boolean) as string[])].sort();
      }

      const [peopleOptions, loadedMotiveOptions, loadedSiteOptions] = await Promise.all([
        loadPeopleNameOptions([], optionType),
        loadMotiveOptions(),
        loadSiteOptions(),
      ]);
      if (!active) return;

      setManualUnitOptions(unitOptions);
      setManualPeopleOptions(mergeOfficerOptions(peopleOptions));
      setMotiveOptions(loadedMotiveOptions);
      setSiteOptions(loadedSiteOptions);
    };

    loadManualOptions().catch((error) => {
      if (!active) return;
      setManualUnitOptions([]);
      setManualPeopleOptions(mergeOfficerOptions([]));
      setMotiveOptions([]);
      setSiteOptions([]);
      toast.error("No se pudieron cargar las opciones del formulario", {
        description: getErrorMessage(error),
      });
    });

    return () => {
      active = false;
    };
  }, [optionType]);

  const saveMotives = async (
    reportId: string,
    tipoReporte: ReportType,
    motives: string[],
  ): Promise<string | null> => {
    const motivosInsert = buildReportMotiveRows(reportId, tipoReporte, motives);
    if (motivosInsert.length === 0) return null;

    const { error } = await supabase.from("reporte_motivos").insert(motivosInsert);
    if (!error) return null;
    if (!isMotivesSchemaError(error.message)) return error.message;

    const { error: fallbackError } = await supabase
      .from("reporte_motivos")
      .insert(buildLegacyReportMotiveRows(reportId, tipoReporte, motives));
    return fallbackError?.message || null;
  };

  const handleExtracted = (data: ExtractedReportData) => {
    if (data.tipo === "vehiculo") {
      setReportType("vehiculo");
      setVehicleData(mapToVehicleFormData(data));
    } else {
      setReportType("embarcacion");
      setBoatData(mapToBoatFormData(data));
    }
    setShowForm(true);
  };

  const saveVehicleData = async (vd: VehicleFormData): Promise<SaveReportResult> => {
    const noReporte = normalizeReportNumber(vd.no_reporte);
    if (!noReporte) return { error: "N. de reporte obligatorio" };
    const anio = vd.fecha ? parseInt(vd.fecha.split("-")[0]) : new Date().getFullYear();
    const unitKey = normalizeReportUnit(vd.vehiculo);

    const { data: matches, error: duplicateError } = await supabase
      .from("reportes_vehiculo")
      .select("id, no_reporte, vehiculo")
      .eq("anio", anio);
    if (duplicateError) return { error: duplicateError.message };

    const existing = (matches || []).find(
      (report) =>
        normalizeReportNumber(report.no_reporte) === noReporte &&
        normalizeReportUnit(report.vehiculo) === unitKey,
    );
    if (existing) {
      return { error: `Duplicado: reporte ${noReporte} ya existe para ${vd.vehiculo || "sin unidad"} en ${anio}` };
    }

    const totalHoras = calcTotalHours(vd.hora_salida, vd.hora_regreso);
    const { data: inserted, error } = await supabase.from("reportes_vehiculo").insert({
      no_reporte: noReporte, anio, fecha: vd.fecha || null,
      bitacora: vd.bitacora || null,
      hora_salida: vd.hora_salida || null, hora_regreso: vd.hora_regreso || null,
      total_horas: totalHoras, estacion: vd.estacion || null, vehiculo: vd.vehiculo || null,
      destino: vd.destino || null,
      estacion_combustible: vd.estacion_combustible || null,
      lugar_combustible: vd.lugar_combustible || null,
      cedula_juridica_combustible: vd.cedula_juridica_combustible || null,
      no_factura: vd.no_factura || null,
      combustible_trasegado_bomba: vd.combustible_trasegado_bomba,
      total_combustible_antes_viaje: vd.total_combustible_antes_viaje,
      combustible_gastado: vd.combustible_gastado,
      saldo_combustible_despues_viaje: vd.saldo_combustible_despues_viaje,
      kilometros_recorridos: vd.kilometros_recorridos, novedades: vd.novedades || null,
    }).select().single();
    if (error) return { error: error.message };

    const reportId = inserted.id;
    await replaceReportPeople(reportId, "vehiculo", [
      ...(vd.chofer ? [{ nombre: normalizeName(vd.chofer), cedula: vd.chofer_cedula || null, roles: ["chofer"] }] : []),
      ...(vd.oficial_a_cargo
        ? [{ nombre: normalizeName(vd.oficial_a_cargo), cedula: vd.oficial_a_cargo_cedula || null, roles: ["oficial"] }]
        : []),
      ...vd.acompanantes
        .filter(Boolean)
        .map((name) => ({ nombre: normalizeName(name), roles: ["acompanante"] })),
    ]);

    const motiveError = await saveMotives(reportId, "vehiculo", vd.motivos);
    if (motiveError) return { error: motiveError };

    const sitiosInsert = vd.sitios_visitados
      .filter((s) => s.nombre_sitio)
      .map((s) => ({
        reporte_id: reportId,
        nombre_sitio: s.nombre_sitio,
        zona: s.zona || null,
        posicion: s.posicion || null,
      }));
    if (sitiosInsert.length > 0) await supabase.from("reporte_sitios").insert(sitiosInsert);

    return { reportId };
  };

  const saveBoatData = async (bd: BoatFormData): Promise<SaveReportResult> => {
    const noReporte = normalizeReportNumber(bd.no_reporte);
    if (!noReporte) return { error: "N. de reporte obligatorio" };
    const anio = bd.fecha ? parseInt(bd.fecha.split("-")[0]) : new Date().getFullYear();
    const unitKey = normalizeReportUnit(bd.embarcacion);

    const { data: matches, error: duplicateError } = await supabase
      .from("reportes_embarcacion")
      .select("id, no_reporte, embarcacion")
      .eq("anio", anio);
    if (duplicateError) return { error: duplicateError.message };

    const existing = (matches || []).find(
      (report) =>
        normalizeReportNumber(report.no_reporte) === noReporte &&
        normalizeReportUnit(report.embarcacion) === unitKey,
    );
    if (existing) {
      return { error: `Duplicado: reporte ${noReporte} ya existe para ${bd.embarcacion || "sin unidad"} en ${anio}` };
    }

    const horasNavegadas = calcTotalHours(bd.hora_salida, bd.hora_regreso);
    const totalTripulantes = countUniqueNormalizedNames([
      bd.capitan,
      ...bd.tripulantes.map((person) => person.nombre),
    ].filter(Boolean));
    const horasHombre = horasNavegadas != null ? horasNavegadas * totalTripulantes : null;

    const { data: inserted, error } = await supabase.from("reportes_embarcacion").insert({
      no_reporte: noReporte, anio, fecha: bd.fecha || null,
      bitacora: bd.bitacora || null, folios: bd.folios || null,
      estacion: bd.estacion || null, embarcacion: bd.embarcacion || null,
      no_cierre_os: bd.no_cierre_os || null, hora_salida: bd.hora_salida || null,
      hora_regreso: bd.hora_regreso || null, horas_navegadas: horasNavegadas,
      horas_motor_babor: bd.horas_motor_babor, horas_motor_centro: bd.horas_motor_centro,
      horas_motor_estribor: bd.horas_motor_estribor, horas_hombre: horasHombre,
      destino: bd.destino || null, saldo_anterior: bd.saldo_anterior,
      combustible_trasegado_bodega: bd.combustible_trasegado_bodega,
      total_antes_viaje: bd.total_antes_viaje, combustible_trasegado_durante: bd.combustible_trasegado_durante,
      combustible_gastado: bd.combustible_gastado, saldo_despues: bd.saldo_despues,
      tipo_combustible: bd.tipo_combustible || null,
      estacion_combustible: bd.estacion_combustible || null,
      lugar_combustible: bd.lugar_combustible || null,
      cedula_juridica_combustible: bd.cedula_juridica_combustible || null,
      no_factura: bd.no_factura || null,
      millas_nauticas: bd.millas_nauticas,
      novedades: bd.novedades || null,
    }).select().single();
    if (error) return { error: error.message };

    const reportId = inserted.id;
    await replaceReportPeople(reportId, "embarcacion", [
      ...(bd.capitan ? [{ nombre: normalizeName(bd.capitan), cedula: bd.capitan_cedula || null, roles: ["capitan"] }] : []),
      ...(bd.encargado_mision
        ? [{ nombre: normalizeName(bd.encargado_mision), cedula: bd.encargado_mision_cedula || null, roles: ["encargado_mision"] }]
        : []),
      ...(bd.operacional
        ? [{ nombre: normalizeName(bd.operacional), cedula: bd.operacional_cedula || null, roles: ["operacional"] }]
        : []),
      ...bd.tripulantes
        .filter((person) => person.nombre)
        .map((person) => ({ nombre: normalizeName(person.nombre), roles: ["tripulante"] })),
      ...bd.personas_particulares
        .filter(Boolean)
        .map((name) => ({ nombre: normalizeName(name), roles: ["particular"] })),
    ]);

    const motiveError = await saveMotives(reportId, "embarcacion", bd.motivos);
    if (motiveError) return { error: motiveError };

    const sitiosInsert = bd.sitios_visitados
      .filter((s) => s.nombre_sitio)
      .map((s) => ({
        reporte_id: reportId,
        nombre_sitio: s.nombre_sitio,
        zona: s.zona || null,
        posicion: s.posicion || null,
      }));
    if (sitiosInsert.length > 0) await supabase.from("reporte_sitios").insert(sitiosInsert);

    const inspectedInsert = bd.embarcaciones_inspeccionadas
      .filter((item) => item.nombre || item.matricula || item.no_inspeccion || item.zona || item.posicion)
      .map((item) => ({
        reporte_id: reportId,
        nombre: item.nombre || "",
        matricula: item.matricula || null,
        no_inspeccion: item.no_inspeccion || null,
        zona: item.zona || null,
        posicion: item.posicion || null,
      }));
    if (inspectedInsert.length > 0) {
      await supabase.from("reporte_embarcaciones_inspeccionadas").insert(inspectedInsert);
    }

    return { reportId };
  };

  const handleBatchSave = async (items: BatchItem[]): Promise<{ saved: number; errors: { index: number; reason: string }[] }> => {
    let saved = 0;
    const errors: { index: number; reason: string }[] = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        let errorMsg: string | null = null;
        if (item.tipo === "vehiculo" && item.vehicleData) {
          errorMsg = (await saveVehicleData(item.vehicleData)).error || null;
        } else if (item.tipo === "embarcacion" && item.boatData) {
          errorMsg = (await saveBoatData(item.boatData)).error || null;
        } else {
          errorMsg = "Tipo de reporte no reconocido";
        }

        if (errorMsg) {
          errors.push({ index: i, reason: errorMsg });
        } else {
          saved += 1;
        }
      } catch (err) {
        errors.push({ index: i, reason: err instanceof Error ? err.message : "Error desconocido" });
      }
    }

    return { saved, errors };
  };

  const saveVehicle = async () => {
    setSaving(true);
    const result = await saveVehicleData(vehicleData);
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Reporte de vehiculo guardado");
    setShowForm(false);
    setReportType(null);
    setVehicleData(emptyVehicle);
  };

  const saveBoat = async () => {
    setSaving(true);
    const result = await saveBoatData(boatData);
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Reporte de embarcacion guardado");
    setShowForm(false);
    setReportType(null);
    setBoatData(emptyBoat);
  };

  const cancelForm = () => {
    setShowForm(false);
    setReportType(null);
    setVehicleData(emptyVehicle);
    setBoatData(emptyBoat);
  };

  const resetManualForm = () => {
    setManualVehicleData(buildManualVehicleDefaults());
    setManualBoatData(buildManualBoatDefaults());
    setManualType(null);
    setManualSavedReport(null);
    setManualShowPendingState(false);
    setManualPendingFields([]);
    setManualPendingDialogOpen(false);
    setManualVehicleFuelLoadEnabled(false);
    setManualBoatFuelLoadEnabled(false);
  };

  const saveManualReport = async () => {
    if (!manualType) {
      toast.error("Seleccione el tipo de reporte");
      return;
    }

    setManualSaving(true);
    const result = manualType === "vehiculo"
      ? await saveVehicleData(manualVehicleData)
      : await saveBoatData(manualBoatData);
    setManualSaving(false);

    if (result.error || !result.reportId) {
      toast.error(result.error || "No se pudo guardar el reporte");
      return;
    }

    setManualSavedReport({ tipo: manualType, reportId: result.reportId });
    toast.success("Reporte guardado correctamente");
  };

  const getManualMissingFields = () => {
    if (manualType === "vehiculo") {
      return getVehicleManualMissingFields(manualVehicleData, manualVehicleFuelLoadEnabled);
    }
    if (manualType === "embarcacion") {
      return getBoatManualMissingFields(manualBoatData, manualBoatFuelLoadEnabled);
    }
    return [];
  };

  const reviewManualReport = async () => {
    if (!manualType) {
      toast.error("Seleccione el tipo de reporte");
      return;
    }

    const missingFields = getManualMissingFields();
    if (missingFields.length === 0) {
      await saveManualReport();
      return;
    }

    setManualShowPendingState(true);
    setManualPendingFields(missingFields);
    setManualPendingDialogOpen(true);
  };

  const confirmSaveWithMissingFields = async () => {
    setManualPendingDialogOpen(false);
    await saveManualReport();
  };

  const generateManualExcel = async () => {
    if (!manualSavedReport) return;
    setManualGenerating(true);
    try {
      await downloadReportExcel(manualSavedReport.tipo, manualSavedReport.reportId);
      toast.success("Excel generado correctamente");
    } catch {
      toast.error("No se pudo generar el Excel");
    } finally {
      setManualGenerating(false);
    }
  };

  const selectManualType = (type: ReportType) => {
    if (!manualType) {
      if (type === "vehiculo") {
        setManualVehicleData(buildManualVehicleDefaults());
        setManualVehicleFuelLoadEnabled(false);
      } else {
        setManualBoatData(buildManualBoatDefaults());
        setManualBoatFuelLoadEnabled(false);
      }
    }
    setManualType(type);
    setManualSavedReport(null);
    setManualShowPendingState(false);
    setManualPendingFields([]);
    setManualPendingDialogOpen(false);
  };

  const manualTypeChoices: Array<{
    type: ReportType;
    title: string;
    description: string;
    Icon: typeof Car;
  }> = [
    {
      type: "vehiculo",
      title: "Vehiculo",
      description: "Reporte terrestre con chofer, acompanantes, sitios, combustible y kilometraje.",
      Icon: Car,
    },
    {
      type: "embarcacion",
      title: "Embarcacion",
      description: "Reporte maritimo con tripulacion, posiciones, inspecciones, combustible y millas.",
      Icon: Ship,
    },
  ];

  const manualTypePicker = (
    <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 lg:p-4">
      {manualTypeChoices.map(({ type, title, description, Icon }) => {
        const active = manualType === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => selectManualType(type)}
            className={cn(
              "group flex min-h-[6.4rem] w-full items-start gap-3 rounded-[calc(var(--radius)-0.08rem)] border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary/70 bg-primary/5 shadow-[0_14px_30px_-24px_rgba(15,23,42,0.4)]"
                : "border-border/80 bg-background/55 hover:border-primary/40 hover:bg-muted/45",
            )}
            aria-pressed={active}
          >
            <span className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-[calc(var(--radius)-0.16rem)] border",
              active
                ? "border-primary/25 bg-primary text-primary-foreground"
                : "border-border/70 bg-card text-primary group-hover:bg-primary/10",
            )}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 space-y-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                {title}
                {active && <CheckCircle2 className="h-4 w-4 text-primary" />}
              </span>
              <span className="block text-xs leading-5 text-muted-foreground">{description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );

  const manualForm = manualSavedReport ? (
    <Card className="space-y-4 p-5 sm:p-6 lg:p-4">
      <div className="flex items-start gap-3">
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h3 className="font-semibold text-foreground">Reporte guardado correctamente</h3>
          <p className="section-copy">
            Puede descargar el Excel con los datos guardados o limpiar el formulario para agregar otro reporte.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={generateManualExcel} disabled={manualGenerating} size="sm">
          {manualGenerating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
          Generar Excel
        </Button>
        <Button variant="outline" onClick={resetManualForm} size="sm">
          <FilePlus2 className="mr-1 h-4 w-4" />
          Agregar otro reporte
        </Button>
      </div>
    </Card>
  ) : manualType === "vehiculo" ? (
    <VehicleReportForm
      data={manualVehicleData}
      onChange={setManualVehicleData}
      onSave={reviewManualReport}
      onCancel={resetManualForm}
      saving={manualSaving}
      stationOptions={MANUAL_STATIONS}
      unitOptions={manualUnitOptions}
      peopleOptions={manualPeopleOptions}
      motiveOptions={motiveOptions}
      siteOptions={siteOptions}
      useFuelLoadToggle
      fuelLoadEnabled={manualVehicleFuelLoadEnabled}
      onFuelLoadEnabledChange={setManualVehicleFuelLoadEnabled}
      showPendingState={manualShowPendingState}
      saveLabel="Revisar y Guardar"
    />
  ) : manualType === "embarcacion" ? (
    <BoatReportForm
      data={manualBoatData}
      onChange={setManualBoatData}
      onSave={reviewManualReport}
      onCancel={resetManualForm}
      saving={manualSaving}
      stationOptions={MANUAL_STATIONS}
      unitOptions={manualUnitOptions}
      peopleOptions={manualPeopleOptions}
      motiveOptions={motiveOptions}
      siteOptions={siteOptions}
      autoCalculateMotorHours
      autoFillBoatBitacora
      useFuelLoadToggle
      fuelLoadEnabled={manualBoatFuelLoadEnabled}
      onFuelLoadEnabledChange={setManualBoatFuelLoadEnabled}
      showPendingState={manualShowPendingState}
      saveLabel="Revisar y Guardar"
    />
  ) : null;

  const manualPendingDialog = (
    <AlertDialog open={manualPendingDialogOpen} onOpenChange={setManualPendingDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Datos sin llenar</AlertDialogTitle>
          <AlertDialogDescription>
            Desea dejar en blanco los datos de:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="max-h-72 overflow-y-auto rounded-[calc(var(--radius)-0.08rem)] border border-border/70 bg-muted/45 p-3">
          <ul className="grid gap-1 text-sm text-foreground sm:grid-cols-2">
            {manualPendingFields.map((field) => (
              <li key={field} className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{field}</span>
              </li>
            ))}
          </ul>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Editar</AlertDialogCancel>
          <AlertDialogAction onClick={confirmSaveWithMissingFields}>Si, guardar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {showForm && reportType === "vehiculo" && (
        <VehicleReportForm
          data={vehicleData}
          onChange={setVehicleData}
          onSave={saveVehicle}
          onCancel={cancelForm}
          saving={saving}
          stationOptions={MANUAL_STATIONS}
          unitOptions={manualUnitOptions}
          peopleOptions={manualPeopleOptions}
          motiveOptions={motiveOptions}
          siteOptions={siteOptions}
        />
      )}

      {showForm && reportType === "embarcacion" && (
        <BoatReportForm
          data={boatData}
          onChange={setBoatData}
          onSave={saveBoat}
          onCancel={cancelForm}
          saving={saving}
          stationOptions={MANUAL_STATIONS}
          unitOptions={manualUnitOptions}
          peopleOptions={manualPeopleOptions}
          motiveOptions={motiveOptions}
          siteOptions={siteOptions}
        />
      )}

      {!showForm && (
        <>
          <Card className="w-full overflow-hidden">
            <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
              <div className="flex items-start gap-3">
                <div className="flex shrink-0 items-center justify-center text-primary">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="section-eyebrow">Modulo de reportes</div>
                  <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">Subir, gestionar y exportar reportes</h3>
                  <p className="section-copy">
                    Centralice la carga de archivos Excel, revise o edite registros guardados y exporte la informacion para analisis o respaldo.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Tabs value={activeReportsTab} onValueChange={handleReportsTabChange} className="space-y-5">
            <TabsList>
              <TabsTrigger value="manual">
                <FilePlus2 className="h-4 w-4" />
                Manual
              </TabsTrigger>
              <TabsTrigger value="subir">
                <Upload className="h-4 w-4" />
                Subir
              </TabsTrigger>
              <TabsTrigger value="gestionar">
                <Settings2 className="h-4 w-4" />
                Gestionar
              </TabsTrigger>
              <TabsTrigger value="exportar">
                <FileOutput className="h-4 w-4" />
                Exportar
              </TabsTrigger>
            </TabsList>
            <TabsContent value="subir">
              <ReportUploader
                onExtracted={handleExtracted}
                onBatchSave={handleBatchSave}
                headerEyebrow="Carga de archivos"
                headerTitle="Seleccionar reportes Excel"
                headerDescription="Suba archivos XLSX o XLS para extraer datos y revisar cada reporte antes de guardarlo."
              />
            </TabsContent>
            <TabsContent value="manual">
              <Card className="mb-4 overflow-hidden">
                <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
                  <div className="flex items-start gap-3">
                    <div className="flex shrink-0 items-center justify-center text-primary">
                      <FilePlus2 className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="section-eyebrow">Ingreso manual</div>
                      <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">Crear reporte desde cero</h3>
                      <p className="section-copy">
                        Seleccione el tipo de reporte, complete los datos disponibles y guarde para poder generar el Excel.
                      </p>
                    </div>
                  </div>
                </div>
                {manualTypePicker}
              </Card>
              {manualForm}
              {manualPendingDialog}
            </TabsContent>
            <TabsContent value="gestionar">
              <ManageReport initialSelection={manageInitialSelection} />
            </TabsContent>
            <TabsContent value="exportar">
              <ExportSection />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};

export default ReportesTab;

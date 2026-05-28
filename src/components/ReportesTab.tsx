import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { mapToBoatFormData, mapToVehicleFormData, type ExtractedReportData } from "@/lib/report-utils";
import { loadPeopleNameOptions } from "@/lib/reportPeople";
import { loadMotiveOptions } from "@/lib/motives";
import { createBoatReport, createVehicleReport, type SaveReportResult } from "@/lib/reportPersistence";
import { downloadReportExcel } from "@/lib/reportExcelExport";
import { DEFAULT_REPORT_SITE_OPTIONS, loadSiteOptions, type ReportSiteOption } from "@/lib/reportSites";
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
import ReportImportV2 from "@/components/estadisticas/ReportImportV2";
import ReportCatalogAdmin from "@/components/estadisticas/ReportCatalogAdmin";
import VehicleReportForm, { type VehicleFormData } from "@/components/estadisticas/VehicleReportForm";
import BoatReportForm, { type BoatFormData } from "@/components/estadisticas/BoatReportForm";
import ManageReport from "@/components/estadisticas/ManageReport";
import ExportSection from "@/components/estadisticas/ExportSection";
import { Car, CheckCircle2, Database, FileOutput, FilePlus2, FileSpreadsheet, Loader2, Settings2, ShieldCheck, Ship, Upload } from "lucide-react";

type ReportType = "vehiculo" | "embarcacion";
type ReportesSubtab = "manual" | "subir" | "importar" | "catalogos" | "gestionar" | "exportar";
type ReportEditTarget = { tipo: ReportType; reportId: string };
type SubtabRequest<T extends string> = { value: T; nonce: number; editTarget?: ReportEditTarget };

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
  capitan_cedula: "", encargado_mision_cedula: "", oficial_director: "", oficial_director_cedula: "",
  operacional: "", operacional_cedula: "",
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

const uniqueUnitOptions = (values: Array<string | null | undefined>) =>
  [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])].sort();

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
  addMissing(missing, "Oficial Director / Ambiental", data.oficial_director);
  addMissing(missing, "Cedula Oficial Director", data.oficial_director_cedula);
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
  const [vehicleUnitOptions, setVehicleUnitOptions] = useState<string[]>([]);
  const [boatUnitOptions, setBoatUnitOptions] = useState<string[]>([]);
  const [manualPeopleOptions, setManualPeopleOptions] = useState<string[]>(() => mergeOfficerOptions([]));
  const [motiveOptions, setMotiveOptions] = useState<string[]>([]);
  const [siteOptions, setSiteOptions] = useState<ReportSiteOption[]>(DEFAULT_REPORT_SITE_OPTIONS);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualGenerating, setManualGenerating] = useState(false);
  const [manualSavedReport, setManualSavedReport] = useState<{ tipo: ReportType; reportId: string } | null>(null);
  const [manualSavedDialogOpen, setManualSavedDialogOpen] = useState(false);
  const [manualShowPendingState, setManualShowPendingState] = useState(false);
  const [manualPendingFields, setManualPendingFields] = useState<string[]>([]);
  const [manualPendingDialogOpen, setManualPendingDialogOpen] = useState(false);
  const [manualVehicleFuelLoadEnabled, setManualVehicleFuelLoadEnabled] = useState(false);
  const [manualBoatFuelLoadEnabled, setManualBoatFuelLoadEnabled] = useState(false);
  const optionType = showForm && reportType ? reportType : manualType;

  const loadCommonOptions = useCallback(async () => {
    const [vehicleUnits, boatUnits, peopleOptions, loadedMotiveOptions, loadedSiteOptions] = await Promise.all([
      supabase.from("reportes_vehiculo").select("vehiculo"),
      supabase.from("reportes_embarcacion").select("embarcacion"),
      loadPeopleNameOptions(["particular", "persona_particular"]),
      loadMotiveOptions(),
      loadSiteOptions(),
    ]);

    if (vehicleUnits.error) throw vehicleUnits.error;
    if (boatUnits.error) throw boatUnits.error;

    setVehicleUnitOptions(uniqueUnitOptions((vehicleUnits.data || []).map((row) => row.vehiculo)));
    setBoatUnitOptions(uniqueUnitOptions((boatUnits.data || []).map((row) => row.embarcacion)));
    setManualPeopleOptions(mergeOfficerOptions(peopleOptions));
    setMotiveOptions(loadedMotiveOptions);
    setSiteOptions(loadedSiteOptions);
  }, []);

  useEffect(() => {
    let active = true;

    loadCommonOptions().catch((error) => {
      if (!active) return;
      setVehicleUnitOptions([]);
      setBoatUnitOptions([]);
      setManualPeopleOptions(mergeOfficerOptions([]));
      setMotiveOptions([]);
      setSiteOptions(DEFAULT_REPORT_SITE_OPTIONS);
      toast.error("No se pudieron cargar las listas base", {
        description: getErrorMessage(error),
      });
    });

    return () => {
      active = false;
    };
  }, [loadCommonOptions]);

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
        unitOptions = uniqueUnitOptions((data || []).map((row) => row.vehiculo));
      } else {
        const { data, error } = await supabase.from("reportes_embarcacion").select("embarcacion");
        if (error) throw error;
        unitOptions = uniqueUnitOptions((data || []).map((row) => row.embarcacion));
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
      setSiteOptions(DEFAULT_REPORT_SITE_OPTIONS);
      toast.error("No se pudieron cargar las opciones del formulario", {
        description: getErrorMessage(error),
      });
    });

    return () => {
      active = false;
    };
  }, [optionType]);

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

  const saveVehicleData = (data: VehicleFormData): Promise<SaveReportResult> => createVehicleReport(data);
  const saveBoatData = (data: BoatFormData): Promise<SaveReportResult> => createBoatReport(data);

  const handleBatchSave = async (
    items: BatchItem[],
  ): Promise<{ saved: number; errors: { index: number; reason: string }[]; savedReports: { index: number; reportId: string; tipo: ReportType }[] }> => {
    let saved = 0;
    const errors: { index: number; reason: string }[] = [];
    const savedReports: { index: number; reportId: string; tipo: ReportType }[] = [];

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      try {
        let result: SaveReportResult = {};
        if (item.tipo === "vehiculo" && item.vehicleData) {
          result = await saveVehicleData(item.vehicleData);
        } else if (item.tipo === "embarcacion" && item.boatData) {
          result = await saveBoatData(item.boatData);
        } else {
          result = { error: "Tipo de reporte no reconocido" };
        }

        if (result.error || !result.reportId || !item.tipo) {
          errors.push({ index: i, reason: result.error || "No se pudo guardar el reporte" });
        } else {
          saved += 1;
          savedReports.push({ index: i, reportId: result.reportId, tipo: item.tipo });
        }
      } catch (err) {
        errors.push({ index: i, reason: err instanceof Error ? err.message : "Error desconocido" });
      }
    }

    return { saved, errors, savedReports };
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
    setManualGenerating(false);
    setManualSavedReport(null);
    setManualSavedDialogOpen(false);
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

    const identityMissingFields = getManualIdentityMissingFields();
    if (identityMissingFields.length > 0) {
      showManualIdentityError(identityMissingFields);
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
    setManualSavedDialogOpen(true);
    toast.success("Reporte guardado correctamente");
  };

  const getManualIdentityMissingFields = () => {
    if (manualType === "vehiculo") {
      const missing: string[] = [];
      addMissing(missing, "N. Reporte", manualVehicleData.no_reporte);
      addMissing(missing, "Fecha", manualVehicleData.fecha);
      addMissing(missing, "Vehiculo", manualVehicleData.vehiculo);
      return missing;
    }

    if (manualType === "embarcacion") {
      const missing: string[] = [];
      addMissing(missing, "N. Reporte", manualBoatData.no_reporte);
      addMissing(missing, "Fecha", manualBoatData.fecha);
      addMissing(missing, "Embarcacion", manualBoatData.embarcacion);
      return missing;
    }

    return [];
  };

  const showManualIdentityError = (missingFields: string[]) => {
    setManualShowPendingState(true);
    toast.error("Complete los datos clave del reporte", {
      description: missingFields.join(", "),
    });
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

    const identityMissingFields = getManualIdentityMissingFields();
    if (identityMissingFields.length > 0) {
      showManualIdentityError(identityMissingFields);
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
    if (!manualSavedReport) return false;
    setManualGenerating(true);
    try {
      await downloadReportExcel(manualSavedReport.tipo, manualSavedReport.reportId);
      toast.success("Excel generado correctamente");
      return true;
    } catch {
      toast.error("No se pudo generar el Excel");
      return false;
    } finally {
      setManualGenerating(false);
    }
  };

  const generateManualExcelAndClose = async () => {
    const generated = await generateManualExcel();
    if (generated) {
      resetManualForm();
    }
  };

  const handleManualSavedDialogOpenChange = (open: boolean) => {
    if (!open && manualGenerating) return;
    setManualSavedDialogOpen(open);
    if (!open) {
      resetManualForm();
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
    setManualSavedDialogOpen(false);
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

  const manualForm = manualSavedReport ? null : manualType === "vehiculo" ? (
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

  const manualSavedDialog = (
    <AlertDialog open={manualSavedDialogOpen && Boolean(manualSavedReport)} onOpenChange={handleManualSavedDialogOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[calc(var(--radius)-0.16rem)] bg-primary/10 text-primary sm:mx-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <AlertDialogTitle>Reporte guardado correctamente</AlertDialogTitle>
          <AlertDialogDescription>
            Puede generar el Excel de este reporte ahora o cerrar este dialogo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={manualGenerating}>Cerrar</AlertDialogCancel>
          <Button onClick={generateManualExcelAndClose} disabled={manualGenerating}>
            {manualGenerating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1 h-4 w-4" />}
            Generar Excel
          </Button>
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
              <TabsTrigger value="importar">
                <ShieldCheck className="h-4 w-4" />
                V2
              </TabsTrigger>
              <TabsTrigger value="catalogos">
                <Database className="h-4 w-4" />
                Catalogos
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
                stationOptions={MANUAL_STATIONS}
                vehicleUnitOptions={vehicleUnitOptions}
                boatUnitOptions={boatUnitOptions}
                peopleOptions={manualPeopleOptions}
                motiveOptions={motiveOptions}
                siteOptions={siteOptions}
              />
            </TabsContent>
            <TabsContent value="importar">
              <ReportImportV2
                stationOptions={MANUAL_STATIONS}
                vehicleUnitOptions={vehicleUnitOptions}
                boatUnitOptions={boatUnitOptions}
                peopleOptions={manualPeopleOptions}
                motiveOptions={motiveOptions}
                siteOptions={siteOptions}
                onCatalogsChanged={loadCommonOptions}
              />
            </TabsContent>
            <TabsContent value="catalogos">
              <ReportCatalogAdmin onCatalogsChanged={loadCommonOptions} />
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
              {manualSavedDialog}
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

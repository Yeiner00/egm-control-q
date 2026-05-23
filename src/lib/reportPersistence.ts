import type { BoatFormData, InspectedBoatData } from "@/components/estadisticas/BoatReportForm";
import type { VehicleFormData, VehicleSiteData } from "@/components/estadisticas/VehicleReportForm";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { getErrorMessage } from "@/lib/errorMessage";
import { buildLegacyReportMotiveRows, buildReportMotiveRows, loadMotiveOptions } from "@/lib/motives";
import { normalizeName } from "@/lib/normalizeName";
import { findOfficerByName } from "@/lib/officers";
import {
  countUniqueNormalizedNames,
  deleteReportPeople,
  loadPeopleNameOptions,
  loadReportPeopleByIds,
  replaceReportPeople,
  type ReportPersonWithRoles,
} from "@/lib/reportPeople";
import { calcTotalHours } from "@/lib/report-utils";
import { normalizeReportNumber, normalizeReportUnit } from "@/lib/reportNumber";
import { DEFAULT_REPORT_SITE_OPTIONS, findSiteOption, loadSiteOptions, type ReportSiteOption } from "@/lib/reportSites";
import { normalizeReportText, normalizedReportTextOrNull } from "@/lib/reportText";

export type ReportType = "vehiculo" | "embarcacion";
export type VehicleReport = Tables<"reportes_vehiculo">;
export type BoatReport = Tables<"reportes_embarcacion">;
export type SavedReport = VehicleReport | BoatReport;

export interface SaveReportResult {
  reportId?: string;
  error?: string;
}

export interface ReportFormOptions {
  unitOptions: string[];
  peopleOptions: string[];
  motiveOptions: string[];
  siteOptions: ReportSiteOption[];
}

export interface SavedReportEditorData {
  preview: SavedReport;
  vehicleData?: VehicleFormData;
  boatData?: BoatFormData;
}

const parseReportYear = (date: string | null | undefined) => {
  const value = String(date ?? "").trim();
  if (!value) return null;

  const year = Number.parseInt(value.split("-")[0], 10);
  return Number.isFinite(year) ? year : null;
};

const isMotivesSchemaError = (message: string) =>
  message.includes("motivo_original") ||
  message.includes("motivo_key") ||
  message.includes("Could not find");

const VEHICLE_DRIVER_ROLES = new Set(["chofer"]);
const VEHICLE_OFFICIAL_ROLES = new Set(["oficial"]);
const VEHICLE_COMPANION_ROLES = new Set(["acompanante"]);
const BOAT_CAPTAIN_ROLES = new Set(["capitan"]);
const BOAT_MISSION_LEAD_ROLES = new Set(["encargado_mision"]);
const BOAT_OFFICIAL_DIRECTOR_ROLES = new Set(["oficial_director", "oficial_director_ambiental", "oficial_ambiental", "oficial"]);
const BOAT_OPERATIONAL_ROLES = new Set(["operacional"]);
const BOAT_CREW_ROLES = new Set(["tripulante"]);
const BOAT_PRIVATE_PERSON_ROLES = new Set(["particular", "persona_particular"]);

const normalizeReportRole = (role: string) => {
  const normalized = role
    .trim()
    .toLowerCase()
    .replace(/\u00c3\u00b1/g, "\u00f1")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  return normalized === "acompaa_ante" ? "acompanante" : normalized;
};

const hasAnyRole = (person: ReportPersonWithRoles, roles: Set<string>) =>
  person.roles.some((role) => roles.has(normalizeReportRole(role)));

const knownCedulaFor = (name: string | null | undefined, currentValue: string | number | null | undefined) => {
  const current = typeof currentValue === "number" && Number.isFinite(currentValue)
    ? String(currentValue)
    : typeof currentValue === "string"
      ? currentValue.trim()
      : "";

  return findOfficerByName(name || "")?.identificacion || current;
};

const knownCedulaOrNull = (name: string | null | undefined, currentValue: string | number | null | undefined) =>
  knownCedulaFor(name, currentValue) || null;

const personCedula = (person: ReportPersonWithRoles | undefined) =>
  person ? knownCedulaFor(person.nombre, person.cedula) : "";

const fillKnownSiteData = (site: VehicleSiteData): VehicleSiteData => {
  const siteName = normalizeReportText(site.nombre_sitio);
  const knownSite = findSiteOption(DEFAULT_REPORT_SITE_OPTIONS, siteName);

  return {
    nombre_sitio: siteName,
    zona: site.zona || knownSite?.zona || "",
    posicion: site.posicion || knownSite?.posicion || "",
  };
};

export const saveReportMotives = async (
  reportId: string,
  reportType: ReportType,
  motives: string[],
) => {
  const motiveRows = buildReportMotiveRows(reportId, reportType, motives);
  if (motiveRows.length === 0) return null;

  const { error } = await supabase.from("reporte_motivos").insert(motiveRows);
  if (!error) return null;
  if (!isMotivesSchemaError(error.message)) return error.message;

  const { error: fallbackError } = await supabase
    .from("reporte_motivos")
    .insert(buildLegacyReportMotiveRows(reportId, reportType, motives));

  return fallbackError?.message || null;
};

const loadVehicleUnitOptions = async () => {
  const { data, error } = await supabase.from("reportes_vehiculo").select("vehiculo");
  if (error) throw error;

  return [...new Set((data || []).map((row) => row.vehiculo?.trim()).filter(Boolean) as string[])].sort();
};

const loadBoatUnitOptions = async () => {
  const { data, error } = await supabase.from("reportes_embarcacion").select("embarcacion");
  if (error) throw error;

  return [...new Set((data || []).map((row) => row.embarcacion?.trim()).filter(Boolean) as string[])].sort();
};

export const loadReportFormOptions = async (reportType: ReportType): Promise<ReportFormOptions> => {
  const [unitOptions, peopleOptions, motiveOptions, siteOptions] = await Promise.all([
    reportType === "vehiculo" ? loadVehicleUnitOptions() : loadBoatUnitOptions(),
    loadPeopleNameOptions([], reportType),
    loadMotiveOptions(),
    loadSiteOptions(),
  ]);

  return {
    unitOptions,
    peopleOptions,
    motiveOptions,
    siteOptions: siteOptions.length > 0 ? siteOptions : DEFAULT_REPORT_SITE_OPTIONS,
  };
};

export const createVehicleReport = async (data: VehicleFormData): Promise<SaveReportResult> => {
  try {
    const noReporte = normalizeReportNumber(data.no_reporte);
    if (!noReporte) return { error: "N. de reporte obligatorio" };

    const anio = parseReportYear(data.fecha);
    if (anio == null) return { error: "Fecha obligatoria para definir el anio del reporte" };

    const unitKey = normalizeReportUnit(data.vehiculo);
    if (!unitKey) return { error: "Vehiculo obligatorio" };

    const { data: matches, error: duplicateError } = await supabase
      .from("reportes_vehiculo")
      .select("id, no_reporte, vehiculo")
      .eq("anio", anio);
    if (duplicateError) throw duplicateError;

    const duplicate = (matches || []).find(
      (report) =>
        normalizeReportNumber(report.no_reporte) === noReporte &&
        normalizeReportUnit(report.vehiculo) === unitKey,
    );
    if (duplicate) {
      return { error: `Duplicado: reporte ${noReporte} ya existe para ${data.vehiculo || "sin unidad"} en ${anio}` };
    }

    const totalHoras = calcTotalHours(data.hora_salida, data.hora_regreso);
    const { data: inserted, error } = await supabase.from("reportes_vehiculo").insert({
      no_reporte: noReporte,
      anio,
      fecha: data.fecha || null,
      bitacora: data.bitacora || null,
      hora_salida: data.hora_salida || null,
      hora_regreso: data.hora_regreso || null,
      total_horas: totalHoras,
      estacion: normalizedReportTextOrNull(data.estacion),
      vehiculo: data.vehiculo || null,
      destino: normalizedReportTextOrNull(data.destino),
      estacion_combustible: normalizedReportTextOrNull(data.estacion_combustible),
      lugar_combustible: normalizedReportTextOrNull(data.lugar_combustible),
      cedula_juridica_combustible: data.cedula_juridica_combustible || null,
      no_factura: data.no_factura || null,
      combustible_trasegado_bomba: data.combustible_trasegado_bomba,
      total_combustible_antes_viaje: data.total_combustible_antes_viaje,
      combustible_gastado: data.combustible_gastado,
      saldo_combustible_despues_viaje: data.saldo_combustible_despues_viaje,
      kilometros_recorridos: data.kilometros_recorridos,
      novedades: data.novedades || null,
    }).select().single();
    if (error) throw error;

    const reportId = inserted.id;
    await replaceReportPeople(reportId, "vehiculo", [
      ...(data.chofer
        ? [{
            nombre: normalizeName(data.chofer),
            cedula: knownCedulaOrNull(data.chofer, data.chofer_cedula),
            roles: ["chofer"],
          }]
        : []),
      ...(data.oficial_a_cargo
        ? [{
            nombre: normalizeName(data.oficial_a_cargo),
            cedula: knownCedulaOrNull(data.oficial_a_cargo, data.oficial_a_cargo_cedula),
            roles: ["oficial"],
          }]
        : []),
      ...data.acompanantes
        .filter(Boolean)
        .map((name) => ({ nombre: normalizeName(name), roles: ["acompanante"] })),
    ]);

    const motiveError = await saveReportMotives(reportId, "vehiculo", data.motivos);
    if (motiveError) return { error: motiveError };

    const siteRows = data.sitios_visitados
      .map(fillKnownSiteData)
      .map((site) => ({
        reporte_id: reportId,
        nombre_sitio: site.nombre_sitio,
        zona: site.zona || null,
        posicion: site.posicion || null,
      }))
      .filter((site) => site.nombre_sitio);
    if (siteRows.length > 0) {
      const { error: sitesError } = await supabase.from("reporte_sitios").insert(siteRows);
      if (sitesError) throw sitesError;
    }

    return { reportId };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
};

export const createBoatReport = async (data: BoatFormData): Promise<SaveReportResult> => {
  try {
    const noReporte = normalizeReportNumber(data.no_reporte);
    if (!noReporte) return { error: "N. de reporte obligatorio" };

    const anio = parseReportYear(data.fecha);
    if (anio == null) return { error: "Fecha obligatoria para definir el anio del reporte" };

    const unitKey = normalizeReportUnit(data.embarcacion);
    if (!unitKey) return { error: "Embarcacion obligatoria" };

    const { data: matches, error: duplicateError } = await supabase
      .from("reportes_embarcacion")
      .select("id, no_reporte, embarcacion")
      .eq("anio", anio);
    if (duplicateError) throw duplicateError;

    const duplicate = (matches || []).find(
      (report) =>
        normalizeReportNumber(report.no_reporte) === noReporte &&
        normalizeReportUnit(report.embarcacion) === unitKey,
    );
    if (duplicate) {
      return { error: `Duplicado: reporte ${noReporte} ya existe para ${data.embarcacion || "sin unidad"} en ${anio}` };
    }

    const horasNavegadas = calcTotalHours(data.hora_salida, data.hora_regreso);
    const totalTripulantes = countUniqueNormalizedNames([
      data.capitan,
      data.encargado_mision,
      ...data.tripulantes.map((person) => person.nombre),
    ].filter(Boolean));
    const horasHombre = horasNavegadas != null ? horasNavegadas * totalTripulantes : null;

    const { data: inserted, error } = await supabase.from("reportes_embarcacion").insert({
      no_reporte: noReporte,
      anio,
      fecha: data.fecha || null,
      bitacora: data.bitacora || null,
      folios: data.folios || null,
      estacion: normalizedReportTextOrNull(data.estacion),
      embarcacion: data.embarcacion || null,
      no_cierre_os: data.no_cierre_os || null,
      hora_salida: data.hora_salida || null,
      hora_regreso: data.hora_regreso || null,
      horas_navegadas: horasNavegadas,
      horas_motor_babor: data.horas_motor_babor,
      horas_motor_centro: data.horas_motor_centro,
      horas_motor_estribor: data.horas_motor_estribor,
      horas_hombre: horasHombre,
      destino: normalizedReportTextOrNull(data.destino),
      saldo_anterior: data.saldo_anterior,
      combustible_trasegado_bodega: data.combustible_trasegado_bodega,
      total_antes_viaje: data.total_antes_viaje,
      combustible_trasegado_durante: data.combustible_trasegado_durante,
      combustible_gastado: data.combustible_gastado,
      saldo_despues: data.saldo_despues,
      tipo_combustible: normalizedReportTextOrNull(data.tipo_combustible),
      estacion_combustible: normalizedReportTextOrNull(data.estacion_combustible),
      lugar_combustible: normalizedReportTextOrNull(data.lugar_combustible),
      cedula_juridica_combustible: data.cedula_juridica_combustible || null,
      no_factura: data.no_factura || null,
      millas_nauticas: data.millas_nauticas,
      novedades: data.novedades || null,
    }).select().single();
    if (error) throw error;

    const reportId = inserted.id;
    await replaceReportPeople(reportId, "embarcacion", [
      ...(data.capitan
        ? [{
            nombre: normalizeName(data.capitan),
            cedula: knownCedulaOrNull(data.capitan, data.capitan_cedula),
            roles: ["capitan"],
          }]
        : []),
      ...(data.encargado_mision
        ? [{
            nombre: normalizeName(data.encargado_mision),
            cedula: knownCedulaOrNull(data.encargado_mision, data.encargado_mision_cedula),
            roles: ["encargado_mision"],
          }]
        : []),
      ...(data.oficial_director
        ? [{
            nombre: normalizeName(data.oficial_director),
            cedula: knownCedulaOrNull(data.oficial_director, data.oficial_director_cedula),
            roles: ["oficial_director"],
          }]
        : []),
      ...(data.operacional
        ? [{
            nombre: normalizeName(data.operacional),
            cedula: knownCedulaOrNull(data.operacional, data.operacional_cedula),
            roles: ["operacional"],
          }]
        : []),
      ...data.tripulantes
        .filter((person) => person.nombre)
        .map((person) => {
          const nombre = normalizeName(person.nombre);
          return { nombre, cedula: knownCedulaOrNull(nombre, person.cedula), roles: ["tripulante"] };
        }),
      ...data.personas_particulares
        .filter(Boolean)
        .map((name) => ({ nombre: normalizeName(name), roles: ["particular"] })),
    ]);

    const motiveError = await saveReportMotives(reportId, "embarcacion", data.motivos);
    if (motiveError) return { error: motiveError };

    const siteRows = data.sitios_visitados
      .map(fillKnownSiteData)
      .map((site) => ({
        reporte_id: reportId,
        nombre_sitio: site.nombre_sitio,
        zona: site.zona || null,
        posicion: site.posicion || null,
      }))
      .filter((site) => site.nombre_sitio);
    if (siteRows.length > 0) {
      const { error: sitesError } = await supabase.from("reporte_sitios").insert(siteRows);
      if (sitesError) throw sitesError;
    }

    const inspectedRows = data.embarcaciones_inspeccionadas
      .filter((item) => item.nombre || item.matricula || item.no_inspeccion || item.zona)
      .map((item) => ({
        reporte_id: reportId,
        nombre: item.nombre || "",
        matricula: item.matricula || null,
        no_inspeccion: item.no_inspeccion || null,
        zona: item.zona || null,
      }));
    if (inspectedRows.length > 0) {
      const { error: inspectedError } = await supabase
        .from("reporte_embarcaciones_inspeccionadas")
        .insert(inspectedRows);
      if (inspectedError) throw inspectedError;
    }

    return { reportId };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
};

export const createSavedReport = (reportType: ReportType, data: VehicleFormData | BoatFormData) =>
  reportType === "vehiculo"
    ? createVehicleReport(data as VehicleFormData)
    : createBoatReport(data as BoatFormData);

const vehicleReportToFormData = (
  report: VehicleReport,
  motives: string[],
  sites: VehicleSiteData[],
  people: ReportPersonWithRoles[],
): VehicleFormData => {
  const peopleList = people;
  const driver = peopleList.find((person) => hasAnyRole(person, VEHICLE_DRIVER_ROLES));
  const officer = peopleList.find((person) => hasAnyRole(person, VEHICLE_OFFICIAL_ROLES));
  const companions = peopleList
    .filter((person) => hasAnyRole(person, VEHICLE_COMPANION_ROLES))
    .map((person) => person.nombre);

  return {
    no_reporte: report.no_reporte || "",
    bitacora: report.bitacora || "",
    fecha: report.fecha || "",
    hora_salida: report.hora_salida || "",
    hora_regreso: report.hora_regreso || "",
    estacion: report.estacion || "",
    vehiculo: report.vehiculo || "",
    destino: report.destino || "",
    motivos: motives,
    chofer: driver?.nombre || "",
    chofer_cedula: personCedula(driver),
    acompanantes: companions,
    oficial_a_cargo: officer?.nombre || "",
    oficial_a_cargo_cedula: personCedula(officer),
    sitios_visitados: sites,
    estacion_combustible: report.estacion_combustible || "",
    lugar_combustible: report.lugar_combustible || "",
    cedula_juridica_combustible: report.cedula_juridica_combustible || "",
    no_factura: report.no_factura || "",
    combustible_trasegado_bomba: report.combustible_trasegado_bomba,
    total_combustible_antes_viaje: report.total_combustible_antes_viaje,
    combustible_gastado: report.combustible_gastado,
    saldo_combustible_despues_viaje: report.saldo_combustible_despues_viaje,
    kilometros_recorridos: report.kilometros_recorridos,
    novedades: report.novedades || "",
  };
};

const boatReportToFormData = (
  report: BoatReport,
  motives: string[],
  sites: VehicleSiteData[],
  inspectedBoats: InspectedBoatData[],
  people: ReportPersonWithRoles[],
): BoatFormData => {
  const peopleList = people;
  const captain = peopleList.find((person) => hasAnyRole(person, BOAT_CAPTAIN_ROLES));
  const missionLead = peopleList.find((person) => hasAnyRole(person, BOAT_MISSION_LEAD_ROLES));
  const officialDirector = peopleList.find((person) => hasAnyRole(person, BOAT_OFFICIAL_DIRECTOR_ROLES)) ?? missionLead;
  const operational = peopleList.find((person) => hasAnyRole(person, BOAT_OPERATIONAL_ROLES));
  const crew = peopleList
    .filter((person) => hasAnyRole(person, BOAT_CREW_ROLES))
    .map((person) => ({ nombre: person.nombre, cedula: personCedula(person) }));
  const privatePeople = peopleList
    .filter((person) => hasAnyRole(person, BOAT_PRIVATE_PERSON_ROLES))
    .map((person) => person.nombre);

  return {
    no_reporte: report.no_reporte || "",
    bitacora: report.bitacora || "",
    folios: report.folios || "",
    fecha: report.fecha || "",
    estacion: report.estacion || "",
    embarcacion: report.embarcacion || "",
    no_cierre_os: report.no_cierre_os || "",
    hora_salida: report.hora_salida || "",
    hora_regreso: report.hora_regreso || "",
    horas_motor_babor: report.horas_motor_babor,
    horas_motor_centro: report.horas_motor_centro,
    horas_motor_estribor: report.horas_motor_estribor,
    destino: report.destino || "",
    motivos: motives,
    capitan: captain?.nombre || "",
    capitan_cedula: personCedula(captain),
    encargado_mision: missionLead?.nombre || "",
    encargado_mision_cedula: personCedula(missionLead),
    oficial_director: officialDirector?.nombre || "",
    oficial_director_cedula: personCedula(officialDirector),
    operacional: operational?.nombre || "",
    operacional_cedula: personCedula(operational),
    tripulantes: crew,
    personas_particulares: privatePeople,
    sitios_visitados: sites,
    embarcaciones_inspeccionadas: inspectedBoats,
    saldo_anterior: report.saldo_anterior,
    combustible_trasegado_bodega: report.combustible_trasegado_bodega,
    total_antes_viaje: report.total_antes_viaje,
    combustible_trasegado_durante: report.combustible_trasegado_durante,
    combustible_gastado: report.combustible_gastado,
    saldo_despues: report.saldo_despues,
    tipo_combustible: report.tipo_combustible || "",
    estacion_combustible: report.estacion_combustible || "",
    lugar_combustible: report.lugar_combustible || "",
    cedula_juridica_combustible: report.cedula_juridica_combustible || "",
    no_factura: report.no_factura || "",
    millas_nauticas: report.millas_nauticas,
    novedades: report.novedades || "",
  };
};

export const loadSavedReportEditorData = async (
  reportType: ReportType,
  reportId: string,
): Promise<SavedReportEditorData> => {
  const [motivesResult, sitesResult, peopleMap] = await Promise.all([
    supabase
      .from("reporte_motivos")
      .select("motivo")
      .eq("reporte_id", reportId)
      .eq("tipo_reporte", reportType),
    supabase
      .from("reporte_sitios")
      .select("nombre_sitio, zona, posicion")
      .eq("reporte_id", reportId),
    loadReportPeopleByIds([reportId], reportType),
  ]);

  if (motivesResult.error) throw motivesResult.error;
  if (sitesResult.error) throw sitesResult.error;

  const motives = (motivesResult.data || []).map((motive) => motive.motivo);
  const sites = (sitesResult.data || []).map((site) =>
    fillKnownSiteData({
      nombre_sitio: site.nombre_sitio,
      zona: site.zona || "",
      posicion: site.posicion || "",
    }),
  );
  const people = peopleMap.get(reportId) || [];

  if (reportType === "vehiculo") {
    const { data: report, error } = await supabase
      .from("reportes_vehiculo")
      .select("*")
      .eq("id", reportId)
      .single();
    if (error) throw error;

    return {
      preview: report,
      vehicleData: vehicleReportToFormData(report, motives, sites, people),
    };
  }

  const [reportResult, inspectedResult] = await Promise.all([
    supabase
      .from("reportes_embarcacion")
      .select("*")
      .eq("id", reportId)
      .single(),
    supabase
      .from("reporte_embarcaciones_inspeccionadas")
      .select("nombre, matricula, no_inspeccion, zona")
      .eq("reporte_id", reportId),
  ]);
  if (reportResult.error) throw reportResult.error;
  if (inspectedResult.error) throw inspectedResult.error;

  const inspectedBoats = (inspectedResult.data || []).map((item) => ({
    nombre: item.nombre || "",
    matricula: item.matricula || "",
    no_inspeccion: item.no_inspeccion || "",
    zona: item.zona || "",
  }));

  return {
    preview: reportResult.data,
    boatData: boatReportToFormData(reportResult.data, motives, sites, inspectedBoats, people),
  };
};

const clearSavedReportRelations = async (reportType: ReportType, reportId: string) => {
  await Promise.all([
    supabase.from("reporte_motivos").delete().eq("reporte_id", reportId).eq("tipo_reporte", reportType),
    supabase.from("reporte_sitios").delete().eq("reporte_id", reportId),
    supabase.from("reporte_embarcaciones_inspeccionadas").delete().eq("reporte_id", reportId),
  ]);
  await deleteReportPeople(reportId, reportType);
};

export const updateVehicleReport = async (
  reportId: string,
  data: VehicleFormData,
  fallbackYear: number,
): Promise<SaveReportResult> => {
  try {
    const normalizedNoReporte = normalizeReportNumber(data.no_reporte);
    if (!normalizedNoReporte) return { error: "N. de reporte obligatorio" };

    const normalizedYear = parseReportYear(data.fecha);
    if (normalizedYear == null) return { error: "Fecha obligatoria para definir el anio del reporte" };

    const unitKey = normalizeReportUnit(data.vehiculo);
    if (!unitKey) return { error: "Vehiculo obligatorio" };

    const { data: matches, error: duplicateError } = await supabase
      .from("reportes_vehiculo")
      .select("id, no_reporte, vehiculo")
      .eq("anio", normalizedYear);
    if (duplicateError) throw duplicateError;

    const duplicate = (matches || []).find(
      (report) =>
        report.id !== reportId &&
        normalizeReportNumber(report.no_reporte) === normalizedNoReporte &&
        normalizeReportUnit(report.vehiculo) === unitKey,
    );
    if (duplicate) {
      return { error: `Duplicado: reporte ${normalizedNoReporte} ya existe para ${data.vehiculo || "sin unidad"} en ${normalizedYear}` };
    }

    await clearSavedReportRelations("vehiculo", reportId);
    const totalHoras = calcTotalHours(data.hora_salida, data.hora_regreso);

    const { error: updateError } = await supabase
      .from("reportes_vehiculo")
      .update({
        no_reporte: normalizedNoReporte,
        anio: normalizedYear,
        fecha: data.fecha || null,
        bitacora: data.bitacora || null,
        hora_salida: data.hora_salida || null,
        hora_regreso: data.hora_regreso || null,
        total_horas: totalHoras,
        estacion: normalizedReportTextOrNull(data.estacion),
        vehiculo: data.vehiculo || null,
        destino: normalizedReportTextOrNull(data.destino),
        estacion_combustible: normalizedReportTextOrNull(data.estacion_combustible),
        lugar_combustible: normalizedReportTextOrNull(data.lugar_combustible),
        cedula_juridica_combustible: data.cedula_juridica_combustible || null,
        no_factura: data.no_factura || null,
        combustible_trasegado_bomba: data.combustible_trasegado_bomba,
        total_combustible_antes_viaje: data.total_combustible_antes_viaje,
        combustible_gastado: data.combustible_gastado,
        saldo_combustible_despues_viaje: data.saldo_combustible_despues_viaje,
        kilometros_recorridos: data.kilometros_recorridos,
        novedades: data.novedades || null,
      })
      .eq("id", reportId);
    if (updateError) throw updateError;

    await replaceReportPeople(reportId, "vehiculo", [
      ...(data.chofer
        ? [{
            nombre: normalizeName(data.chofer),
            cedula: knownCedulaOrNull(data.chofer, data.chofer_cedula),
            roles: ["chofer"],
          }]
        : []),
      ...(data.oficial_a_cargo
        ? [{
            nombre: normalizeName(data.oficial_a_cargo),
            cedula: knownCedulaOrNull(data.oficial_a_cargo, data.oficial_a_cargo_cedula),
            roles: ["oficial"],
          }]
        : []),
      ...data.acompanantes
        .filter(Boolean)
        .map((name) => ({ nombre: normalizeName(name), roles: ["acompanante"] })),
    ]);

    const motiveError = await saveReportMotives(reportId, "vehiculo", data.motivos);
    if (motiveError) return { error: motiveError };

    const siteRows = data.sitios_visitados
      .map(fillKnownSiteData)
      .map((site) => ({
        reporte_id: reportId,
        nombre_sitio: site.nombre_sitio,
        zona: site.zona || null,
        posicion: site.posicion || null,
      }))
      .filter((site) => site.nombre_sitio);
    if (siteRows.length > 0) {
      const { error: sitesError } = await supabase.from("reporte_sitios").insert(siteRows);
      if (sitesError) throw sitesError;
    }

    return { reportId };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
};

export const updateBoatReport = async (
  reportId: string,
  data: BoatFormData,
  fallbackYear: number,
): Promise<SaveReportResult> => {
  try {
    const normalizedNoReporte = normalizeReportNumber(data.no_reporte);
    if (!normalizedNoReporte) return { error: "N. de reporte obligatorio" };

    const normalizedYear = parseReportYear(data.fecha);
    if (normalizedYear == null) return { error: "Fecha obligatoria para definir el anio del reporte" };

    const unitKey = normalizeReportUnit(data.embarcacion);
    if (!unitKey) return { error: "Embarcacion obligatoria" };

    const { data: matches, error: duplicateError } = await supabase
      .from("reportes_embarcacion")
      .select("id, no_reporte, embarcacion")
      .eq("anio", normalizedYear);
    if (duplicateError) throw duplicateError;

    const duplicate = (matches || []).find(
      (report) =>
        report.id !== reportId &&
        normalizeReportNumber(report.no_reporte) === normalizedNoReporte &&
        normalizeReportUnit(report.embarcacion) === unitKey,
    );
    if (duplicate) {
      return { error: `Duplicado: reporte ${normalizedNoReporte} ya existe para ${data.embarcacion || "sin unidad"} en ${normalizedYear}` };
    }

    await clearSavedReportRelations("embarcacion", reportId);
    const horasNavegadas = calcTotalHours(data.hora_salida, data.hora_regreso);
    const totalTripulantes = countUniqueNormalizedNames([
      data.capitan,
      data.encargado_mision,
      ...data.tripulantes.map((person) => person.nombre),
    ].filter(Boolean));
    const horasHombre = horasNavegadas != null ? horasNavegadas * totalTripulantes : null;

    const { error: updateError } = await supabase
      .from("reportes_embarcacion")
      .update({
        no_reporte: normalizedNoReporte,
        anio: normalizedYear,
        fecha: data.fecha || null,
        bitacora: data.bitacora || null,
        folios: data.folios || null,
        estacion: normalizedReportTextOrNull(data.estacion),
        embarcacion: data.embarcacion || null,
        no_cierre_os: data.no_cierre_os || null,
        hora_salida: data.hora_salida || null,
        hora_regreso: data.hora_regreso || null,
        horas_navegadas: horasNavegadas,
        horas_motor_babor: data.horas_motor_babor,
        horas_motor_centro: data.horas_motor_centro,
        horas_motor_estribor: data.horas_motor_estribor,
        horas_hombre: horasHombre,
        destino: normalizedReportTextOrNull(data.destino),
        saldo_anterior: data.saldo_anterior,
        combustible_trasegado_bodega: data.combustible_trasegado_bodega,
        total_antes_viaje: data.total_antes_viaje,
        combustible_trasegado_durante: data.combustible_trasegado_durante,
        combustible_gastado: data.combustible_gastado,
        saldo_despues: data.saldo_despues,
        tipo_combustible: normalizedReportTextOrNull(data.tipo_combustible),
        estacion_combustible: normalizedReportTextOrNull(data.estacion_combustible),
        lugar_combustible: normalizedReportTextOrNull(data.lugar_combustible),
        cedula_juridica_combustible: data.cedula_juridica_combustible || null,
        no_factura: data.no_factura || null,
        millas_nauticas: data.millas_nauticas,
        novedades: data.novedades || null,
      })
      .eq("id", reportId);
    if (updateError) throw updateError;

    await replaceReportPeople(reportId, "embarcacion", [
      ...(data.capitan
        ? [{
            nombre: normalizeName(data.capitan),
            cedula: knownCedulaOrNull(data.capitan, data.capitan_cedula),
            roles: ["capitan"],
          }]
        : []),
      ...(data.encargado_mision
        ? [{
            nombre: normalizeName(data.encargado_mision),
            cedula: knownCedulaOrNull(data.encargado_mision, data.encargado_mision_cedula),
            roles: ["encargado_mision"],
          }]
        : []),
      ...(data.oficial_director
        ? [{
            nombre: normalizeName(data.oficial_director),
            cedula: knownCedulaOrNull(data.oficial_director, data.oficial_director_cedula),
            roles: ["oficial_director"],
          }]
        : []),
      ...(data.operacional
        ? [{
            nombre: normalizeName(data.operacional),
            cedula: knownCedulaOrNull(data.operacional, data.operacional_cedula),
            roles: ["operacional"],
          }]
        : []),
      ...data.tripulantes
        .filter((person) => person.nombre)
        .map((person) => {
          const nombre = normalizeName(person.nombre);
          return { nombre, cedula: knownCedulaOrNull(nombre, person.cedula), roles: ["tripulante"] };
        }),
      ...data.personas_particulares
        .filter(Boolean)
        .map((name) => ({ nombre: normalizeName(name), roles: ["particular"] })),
    ]);

    const motiveError = await saveReportMotives(reportId, "embarcacion", data.motivos);
    if (motiveError) return { error: motiveError };

    const siteRows = data.sitios_visitados
      .map(fillKnownSiteData)
      .map((site) => ({
        reporte_id: reportId,
        nombre_sitio: site.nombre_sitio,
        zona: site.zona || null,
        posicion: site.posicion || null,
      }))
      .filter((site) => site.nombre_sitio);
    if (siteRows.length > 0) {
      const { error: sitesError } = await supabase.from("reporte_sitios").insert(siteRows);
      if (sitesError) throw sitesError;
    }

    const inspectedRows = data.embarcaciones_inspeccionadas
      .filter((item) => item.nombre || item.matricula || item.no_inspeccion || item.zona)
      .map((item) => ({
        reporte_id: reportId,
        nombre: item.nombre || "",
        matricula: item.matricula || null,
        no_inspeccion: item.no_inspeccion || null,
        zona: item.zona || null,
      }));
    if (inspectedRows.length > 0) {
      const { error: inspectedError } = await supabase
        .from("reporte_embarcaciones_inspeccionadas")
        .insert(inspectedRows);
      if (inspectedError) throw inspectedError;
    }

    return { reportId };
  } catch (error) {
    return { error: getErrorMessage(error) };
  }
};

export const updateSavedReport = (
  reportType: ReportType,
  reportId: string,
  data: VehicleFormData | BoatFormData,
  fallbackYear: number,
) =>
  reportType === "vehiculo"
    ? updateVehicleReport(reportId, data as VehicleFormData, fallbackYear)
    : updateBoatReport(reportId, data as BoatFormData, fallbackYear);

export const deleteSavedReport = async (reportType: ReportType, reportId: string) => {
  await clearSavedReportRelations(reportType, reportId);

  if (reportType === "vehiculo") {
    const { error } = await supabase.from("reportes_vehiculo").delete().eq("id", reportId);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("reportes_embarcacion").delete().eq("id", reportId);
  if (error) throw error;
};

import type { BoatFormData } from "@/components/estadisticas/BoatReportForm";
import type { VehicleFormData } from "@/components/estadisticas/VehicleReportForm";
import { normalizeMotives } from "@/lib/motives";
import { findOfficerByName, normalizeKnownPersonName, normalizeKnownPersonNames } from "@/lib/officers";
import { normalizeReportNumber } from "@/lib/reportNumber";
import { DEFAULT_REPORT_SITE_OPTIONS, findSiteOption } from "@/lib/reportSites";
import { normalizeReportText } from "@/lib/reportText";

export type ExtractedReportType = "vehiculo" | "embarcacion";

export interface ExtractedReportData extends Record<string, unknown> {
  tipo?: ExtractedReportType | string;
}

export const calcTotalHours = (salida: string, regreso: string): number | null => {
  if (!salida || !regreso) return null;
  const [h1, m1] = salida.split(":").map(Number);
  const [h2, m2] = regreso.split(":").map(Number);
  let diff = h2 * 60 + m2 - (h1 * 60 + m1);
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
};

const mapExtractedMotives = (data: ExtractedReportData): string[] => {
  const raw = data.motivos ?? data.motivo;
  const values = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(/\n|;|,/)
      : [];

  return normalizeMotives(values.map(String)).map((motivo) => motivo.motivo);
};

const mapPersonNameList = (value: unknown) => {
  const values = Array.isArray(value)
    ? value.map(String)
    : typeof value === "string"
      ? [value]
      : [];

  return normalizeKnownPersonNames(values);
};

const knownCedulaFor = (name: string, currentValue: unknown) => {
  const current = typeof currentValue === "number" && Number.isFinite(currentValue)
    ? String(currentValue)
    : typeof currentValue === "string"
      ? currentValue.trim()
      : "";
  return findOfficerByName(name)?.identificacion || current;
};

const mapBoatCrewMember = (value: unknown) => {
  if (typeof value === "string") {
    return normalizeKnownPersonNames([value]).map((nombre) => ({
      nombre,
      cedula: knownCedulaFor(nombre, ""),
    }));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const names = normalizeKnownPersonNames([(record.nombre as string) || ""]);
    return names.map((nombre) => ({
      nombre,
      cedula: knownCedulaFor(nombre, names.length === 1 ? record.cedula : ""),
    }));
  }
  return [];
};

const mapSiteWithPosition = (value: unknown) => {
  let site = { nombre_sitio: "", zona: "", posicion: "" };
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    site = {
      nombre_sitio: normalizeReportText(record.nombre_sitio as string),
      zona: (record.zona as string) || "",
      posicion: (record.posicion as string) || "",
    };
  }

  const knownSite = findSiteOption(DEFAULT_REPORT_SITE_OPTIONS, site.nombre_sitio);
  if (!knownSite) return site;
  return {
    nombre_sitio: site.nombre_sitio,
    zona: site.zona || knownSite.zona,
    posicion: site.posicion || knownSite.posicion,
  };
};

const normalizeRoleName = (value: unknown) => normalizeKnownPersonName((value as string) || "");

export const mapToVehicleFormData = (data: ExtractedReportData): VehicleFormData => ({
  no_reporte: normalizeReportNumber(data.no_reporte as string),
  bitacora: (data.bitacora as string) || "",
  fecha: (data.fecha as string) || "",
  hora_salida: (data.hora_salida as string) || "",
  hora_regreso: (data.hora_regreso as string) || "",
  estacion: normalizeReportText(data.estacion as string),
  vehiculo: (data.vehiculo as string) || "",
  destino: normalizeReportText(data.destino as string),
  motivos: mapExtractedMotives(data),
  chofer: normalizeRoleName(data.chofer),
  chofer_cedula: knownCedulaFor(normalizeRoleName(data.chofer), data.chofer_cedula),
  acompanantes: mapPersonNameList(data.acompanantes),
  oficial_a_cargo: normalizeRoleName(data.oficial_a_cargo),
  oficial_a_cargo_cedula: knownCedulaFor(normalizeRoleName(data.oficial_a_cargo), data.oficial_a_cargo_cedula),
  sitios_visitados: Array.isArray(data.sitios_visitados) ? data.sitios_visitados.map(mapSiteWithPosition) : [],
  estacion_combustible: normalizeReportText(data.estacion_combustible as string),
  lugar_combustible: normalizeReportText(data.lugar_combustible as string),
  cedula_juridica_combustible: (data.cedula_juridica_combustible as string) || "",
  no_factura: (data.no_factura as string) || "",
  combustible_trasegado_bomba: (data.combustible_trasegado_bomba as number) ?? null,
  total_combustible_antes_viaje: (data.total_combustible_antes_viaje as number) ?? null,
  combustible_gastado: (data.combustible_gastado as number) ?? null,
  saldo_combustible_despues_viaje: (data.saldo_combustible_despues_viaje as number) ?? null,
  kilometros_recorridos: (data.kilometros_recorridos as number) ?? null,
  novedades: (data.novedades as string) || "",
});

export const mapToBoatFormData = (data: ExtractedReportData): BoatFormData => ({
  no_reporte: normalizeReportNumber(data.no_reporte as string),
  bitacora: (data.bitacora as string) || "",
  folios: (data.folios as string) || "",
  fecha: (data.fecha as string) || "",
  estacion: normalizeReportText(data.estacion as string),
  embarcacion: (data.embarcacion as string) || "",
  no_cierre_os: (data.no_cierre_os as string) || "",
  hora_salida: (data.hora_salida as string) || "",
  hora_regreso: (data.hora_regreso as string) || "",
  horas_motor_babor: (data.horas_motor_babor as number) ?? null,
  horas_motor_centro: (data.horas_motor_centro as number) ?? null,
  horas_motor_estribor: (data.horas_motor_estribor as number) ?? null,
  destino: normalizeReportText(data.destino as string),
  motivos: mapExtractedMotives(data),
  capitan: normalizeRoleName(data.capitan),
  capitan_cedula: knownCedulaFor(normalizeRoleName(data.capitan), data.capitan_cedula),
  encargado_mision: normalizeRoleName(data.encargado_mision),
  encargado_mision_cedula: knownCedulaFor(normalizeRoleName(data.encargado_mision), data.encargado_mision_cedula),
  oficial_director: normalizeRoleName(data.oficial_director || data.oficial_director_ambiental || data.oficial_ambiental),
  oficial_director_cedula: knownCedulaFor(
    normalizeRoleName(data.oficial_director || data.oficial_director_ambiental || data.oficial_ambiental),
    data.oficial_director_cedula || data.oficial_director_ambiental_cedula || data.oficial_ambiental_cedula,
  ),
  operacional: normalizeRoleName(data.operacional),
  operacional_cedula: knownCedulaFor(normalizeRoleName(data.operacional), data.operacional_cedula),
  tripulantes: Array.isArray(data.tripulantes) ? data.tripulantes.flatMap(mapBoatCrewMember) : [],
  personas_particulares: mapPersonNameList(data.personas_particulares),
  sitios_visitados: Array.isArray(data.sitios_visitados) ? data.sitios_visitados.map(mapSiteWithPosition) : [],
  embarcaciones_inspeccionadas: Array.isArray(data.embarcaciones_inspeccionadas)
    ? data.embarcaciones_inspeccionadas.map((value) => {
      const record = (value || {}) as Record<string, unknown>;
      return {
        nombre: (record.nombre as string) || "",
        matricula: (record.matricula as string) || "",
        no_inspeccion: (record.no_inspeccion as string) || "",
        zona: (record.zona as string) || "",
      };
    })
    : [],
  saldo_anterior: (data.saldo_anterior as number) ?? null,
  combustible_trasegado_bodega: (data.combustible_trasegado_bodega as number) ?? null,
  total_antes_viaje: (data.total_antes_viaje as number) ?? null,
  combustible_trasegado_durante: (data.combustible_trasegado_durante as number) ?? null,
  combustible_gastado: (data.combustible_gastado as number) ?? null,
  saldo_despues: (data.saldo_despues as number) ?? null,
  tipo_combustible: normalizeReportText(data.tipo_combustible as string),
  estacion_combustible: normalizeReportText(data.estacion_combustible as string),
  lugar_combustible: normalizeReportText(data.lugar_combustible as string),
  cedula_juridica_combustible: (data.cedula_juridica_combustible as string) || "",
  no_factura: (data.no_factura as string) || "",
  millas_nauticas: (data.millas_nauticas as number) ?? null,
  novedades: (data.novedades as string) || "",
});

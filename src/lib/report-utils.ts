import type { BoatFormData } from "@/components/estadisticas/BoatReportForm";
import type { VehicleFormData } from "@/components/estadisticas/VehicleReportForm";
import { normalizeMotives } from "@/lib/motives";
import { normalizeKnownPersonName, normalizeKnownPersonNames } from "@/lib/officers";
import { normalizeReportNumber } from "@/lib/reportNumber";

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

const mapBoatCrewMember = (value: unknown) => {
  if (typeof value === "string") {
    return normalizeKnownPersonNames([value]).map((nombre) => ({ nombre, cedula: "" }));
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const names = normalizeKnownPersonNames([(record.nombre as string) || ""]);
    return names.map((nombre) => ({
      nombre,
      cedula: "",
    }));
  }
  return [];
};

const mapSiteWithPosition = (value: unknown) => {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return {
      nombre_sitio: (record.nombre_sitio as string) || "",
      zona: (record.zona as string) || "",
      posicion: (record.posicion as string) || "",
    };
  }
  return { nombre_sitio: "", zona: "", posicion: "" };
};

export const mapToVehicleFormData = (data: ExtractedReportData): VehicleFormData => ({
  no_reporte: normalizeReportNumber(data.no_reporte as string),
  bitacora: (data.bitacora as string) || "",
  fecha: (data.fecha as string) || "",
  hora_salida: (data.hora_salida as string) || "",
  hora_regreso: (data.hora_regreso as string) || "",
  estacion: (data.estacion as string) || "",
  vehiculo: (data.vehiculo as string) || "",
  destino: (data.destino as string) || "",
  motivos: mapExtractedMotives(data),
  chofer: normalizeKnownPersonName((data.chofer as string) || ""),
  chofer_cedula: (data.chofer_cedula as string) || "",
  acompanantes: mapPersonNameList(data.acompanantes),
  oficial_a_cargo: normalizeKnownPersonName((data.oficial_a_cargo as string) || ""),
  oficial_a_cargo_cedula: (data.oficial_a_cargo_cedula as string) || "",
  sitios_visitados: Array.isArray(data.sitios_visitados) ? data.sitios_visitados.map(mapSiteWithPosition) : [],
  estacion_combustible: (data.estacion_combustible as string) || "",
  lugar_combustible: (data.lugar_combustible as string) || "",
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
  estacion: (data.estacion as string) || "",
  embarcacion: (data.embarcacion as string) || "",
  no_cierre_os: (data.no_cierre_os as string) || "",
  hora_salida: (data.hora_salida as string) || "",
  hora_regreso: (data.hora_regreso as string) || "",
  horas_motor_babor: (data.horas_motor_babor as number) ?? null,
  horas_motor_centro: (data.horas_motor_centro as number) ?? null,
  horas_motor_estribor: (data.horas_motor_estribor as number) ?? null,
  destino: (data.destino as string) || "",
  motivos: mapExtractedMotives(data),
  capitan: normalizeKnownPersonName((data.capitan as string) || ""),
  capitan_cedula: (data.capitan_cedula as string) || "",
  encargado_mision: normalizeKnownPersonName((data.encargado_mision as string) || ""),
  encargado_mision_cedula: (data.encargado_mision_cedula as string) || "",
  operacional: normalizeKnownPersonName((data.operacional as string) || ""),
  operacional_cedula: (data.operacional_cedula as string) || "",
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
        posicion: (record.posicion as string) || "",
      };
    })
    : [],
  saldo_anterior: (data.saldo_anterior as number) ?? null,
  combustible_trasegado_bodega: (data.combustible_trasegado_bodega as number) ?? null,
  total_antes_viaje: (data.total_antes_viaje as number) ?? null,
  combustible_trasegado_durante: (data.combustible_trasegado_durante as number) ?? null,
  combustible_gastado: (data.combustible_gastado as number) ?? null,
  saldo_despues: (data.saldo_despues as number) ?? null,
  tipo_combustible: (data.tipo_combustible as string) || "",
  estacion_combustible: (data.estacion_combustible as string) || "",
  lugar_combustible: (data.lugar_combustible as string) || "",
  cedula_juridica_combustible: (data.cedula_juridica_combustible as string) || "",
  no_factura: (data.no_factura as string) || "",
  millas_nauticas: (data.millas_nauticas as number) ?? null,
  novedades: (data.novedades as string) || "",
});

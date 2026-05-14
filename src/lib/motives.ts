import { supabase } from "@/integrations/supabase/client";

const removeAccents = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const normalizeMotiveKey = (raw: string | null | undefined): string =>
  removeAccents(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export interface NormalizedMotive {
  motivo: string;
  motivo_original: string;
  motivo_key: string;
}

const CATEGORIES: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: "Control migratorio",
    patterns: [/\bmigratori[oa]\b/, /\bmigracion\b/, /\bmigracion ilegal\b/],
  },
  {
    label: "Control de narcotráfico",
    patterns: [/\bnarcotrafico\b/, /\bnarco trafico\b/],
  },
  {
    label: "Pesca ilegal",
    patterns: [/\bpesca ilegal\b/, /\bcontrol de pesca\b/],
  },
  {
    label: "Seguridad ciudadana",
    patterns: [/\bseguridad ciudadana\b/, /\bseguridad cuidadana\b/, /\bpatrullaje seguridad\b/],
  },
  {
    label: "Protección a bañistas",
    patterns: [/\bproteccion a banistas\b/, /\bproteccion de banistas\b/, /\bseguridad de banistas\b/, /\bbanistas\b/],
  },
  {
    label: "Control de contrabando",
    patterns: [/\bcontrabando\b/],
  },
  {
    label: "Reafirmación de soberanía",
    patterns: [/\breafirmacion\b/, /\bsoberania\b/, /\bsobernia\b/, /\bsoberania nacional\b/],
  },
  {
    label: "Pirateria",
    patterns: [/\bpirateria\b/],
  },
  {
    label: "Cacería ilegal",
    patterns: [/\bcaceria\b/, /\bcazeria\b/],
  },
  {
    label: "Seguridad ambiental",
    patterns: [/\bseguridad ambiental\b/],
  },
  {
    label: "Operativo Verano Seguro",
    patterns: [/\bverano seguro\b/, /\borden de operaciones verano\b/],
  },
  {
    label: "Operativo Semana Santa",
    patterns: [/\bsemana santa\b/],
  },
  {
    label: "Protección de bosques",
    patterns: [/\bproteccion de bosques\b/, /\bbosques\b/],
  },
  {
    label: "Alteración de humedales",
    patterns: [/\balteracion de humedales\b/, /\bhumedales\b/],
  },
  {
    label: "Inspección de embarcación",
    patterns: [/\binspeccion\b.*\bembarcacion\b/, /\bgrupo nacional de buzos\b/, /\bbuzos\b/],
  },
  {
    label: "Apoyo operativo",
    patterns: [/\btraslado\b/, /\bextintores\b/, /\bincendio\b/, /\btrabajo conjunto\b/, /\bpolicia fronteras\b/],
  },
];

const canonicalize = (raw: string): NormalizedMotive[] => {
  const original = raw.trim();
  const key = normalizeMotiveKey(original);
  if (!key) return [];

  const matches = CATEGORIES.filter((category) =>
    category.patterns.some((pattern) => pattern.test(key)),
  );

  if (matches.length === 0) {
    return [{ motivo: original, motivo_original: original, motivo_key: key }];
  }

  return matches.map((category) => ({
    motivo: category.label,
    motivo_original: original,
    motivo_key: normalizeMotiveKey(category.label),
  }));
};

export const normalizeMotives = (motives: string[]): NormalizedMotive[] => {
  const grouped = new Map<string, NormalizedMotive>();

  motives
    .filter((motivo) => motivo && motivo.trim())
    .flatMap(canonicalize)
    .forEach((motivo) => {
      if (!grouped.has(motivo.motivo_key)) {
        grouped.set(motivo.motivo_key, motivo);
      }
    });

  return [...grouped.values()];
};

export const buildReportMotiveRows = (
  reporteId: string,
  tipoReporte: "vehiculo" | "embarcacion",
  motives: string[],
) =>
  normalizeMotives(motives).map((motivo) => ({
    reporte_id: reporteId,
    tipo_reporte: tipoReporte,
    motivo: motivo.motivo,
    motivo_original: motivo.motivo_original,
    motivo_key: motivo.motivo_key,
  }));

export const buildLegacyReportMotiveRows = (
  reporteId: string,
  tipoReporte: "vehiculo" | "embarcacion",
  motives: string[],
) =>
  normalizeMotives(motives).map((motivo) => ({
    reporte_id: reporteId,
    tipo_reporte: tipoReporte,
    motivo: motivo.motivo,
  }));

export const loadMotiveOptions = async () => {
  const { data, error } = await supabase.from("reporte_motivos").select("motivo");
  if (error) {
    throw error;
  }

  return [...new Set((data || []).map((row) => row.motivo?.trim()).filter(Boolean) as string[])].sort();
};

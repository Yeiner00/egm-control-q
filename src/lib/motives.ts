const removeAccents = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const normalizeMotiveKey = (raw: string | null | undefined): string =>
  removeAccents(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const BLOCKED_MOTIVE_CATALOG_KEYS = new Set(["inspeccion de embarcacion"]);

export const isBlockedMotiveCatalogValue = (value: string | null | undefined) =>
  BLOCKED_MOTIVE_CATALOG_KEYS.has(normalizeMotiveKey(value));

export interface NormalizedMotive {
  motivo: string;
  motivo_original: string;
  motivo_key: string;
}

export interface VehicleMotiveCounts {
  controlNarcotrafico: number;
  controlMigracionIlegal: number;
  seguridadCiudadana: number;
  proteccionBanistas: number;
  pescaIlegal: number;
}

interface ReportMotiveForCounts {
  reporte_id: string;
  motivo?: string | null;
  motivo_key?: string | null;
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
    label: "Apoyo operativo",
    patterns: [/\btraslado\b/, /\bextintores\b/, /\bincendio\b/, /\btrabajo conjunto\b/, /\bpolicia fronteras\b/],
  },
];

export const DEFAULT_MOTIVE_CATALOG_LABELS = CATEGORIES.map((category) => category.label);

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

const VEHICLE_MOTIVE_COUNT_KEYS: Record<keyof VehicleMotiveCounts, string[]> = {
  controlNarcotrafico: ["control de narcotrafico"],
  controlMigracionIlegal: ["control migratorio", "control migracion ilegal"],
  seguridadCiudadana: ["seguridad ciudadana"],
  proteccionBanistas: ["proteccion a banistas", "proteccion de banistas"],
  pescaIlegal: ["pesca ilegal"],
};

const getMotiveKeysForCount = (motive: ReportMotiveForCounts) => {
  const keys = new Set<string>();

  [motive.motivo_key, motive.motivo].forEach((value) => {
    const key = normalizeMotiveKey(value);
    if (key) keys.add(key);
  });

  if (motive.motivo) {
    normalizeMotives([motive.motivo]).forEach((normalized) => {
      keys.add(normalized.motivo_key);
    });
  }

  return keys;
};

export const countVehicleMotiveReports = (motives: ReportMotiveForCounts[]): VehicleMotiveCounts => {
  const reportIdsByCount = Object.fromEntries(
    Object.keys(VEHICLE_MOTIVE_COUNT_KEYS).map((key) => [key, new Set<string>()]),
  ) as Record<keyof VehicleMotiveCounts, Set<string>>;

  motives.forEach((motive) => {
    if (!motive.reporte_id) return;

    const motiveKeys = getMotiveKeysForCount(motive);

    Object.entries(VEHICLE_MOTIVE_COUNT_KEYS).forEach(([countKey, matchingKeys]) => {
      if (matchingKeys.some((matchingKey) => motiveKeys.has(matchingKey))) {
        reportIdsByCount[countKey as keyof VehicleMotiveCounts].add(motive.reporte_id);
      }
    });
  });

  return {
    controlNarcotrafico: reportIdsByCount.controlNarcotrafico.size,
    controlMigracionIlegal: reportIdsByCount.controlMigracionIlegal.size,
    seguridadCiudadana: reportIdsByCount.seguridadCiudadana.size,
    proteccionBanistas: reportIdsByCount.proteccionBanistas.size,
    pescaIlegal: reportIdsByCount.pescaIlegal.size,
  };
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
  const { supabase } = await import("@/integrations/supabase/client");

  try {
    const { data, error } = await supabase
      .from("report_motive_catalog")
      .select("motivo")
      .eq("active", true);
    if (!error && data && data.length > 0) {
      return [...new Set(
        (data.map((row) => row.motivo?.trim()).filter(Boolean) as string[])
          .filter((motivo) => !isBlockedMotiveCatalogValue(motivo)),
      )].sort();
    }
  } catch {
    // Older deployments without the V2.2 catalog tables fall back to saved report motives.
  }

  const { data, error } = await supabase.from("reporte_motivos").select("motivo");
  if (error) throw error;

  return [...new Set([
    ...DEFAULT_MOTIVE_CATALOG_LABELS,
    ...(data || []).map((row) => row.motivo?.trim()).filter(Boolean) as string[],
  ].filter((motivo) => !isBlockedMotiveCatalogValue(motivo)))].sort();
};

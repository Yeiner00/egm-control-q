import { buildPeriodDays, type SquadPeriod } from "@/lib/squadCalendar";
import { STATISTIC_AI_ROW_CATALOG, isStatisticAiRowAllowed } from "@/lib/statisticAiRows";
import {
  normalizeStatisticSheetKey,
  type StatisticBoatReport,
  type StatisticMotiveRecord,
  type StatisticReportType,
  type StatisticVehicleReport,
  type StatisticWorkbookAiCell,
} from "@/lib/statisticWorkbook";

export interface StatisticSiteRecord {
  reporte_id: string;
  nombre_sitio: string;
  zona: string | null;
  posicion: string | null;
}

export interface StatisticAiPackageReport {
  id: string;
  tipo: StatisticReportType;
  fecha: string | null;
  no_reporte: string;
  unidad: string | null;
  hoja_excel: string | null;
  novedades: string;
  motivos: string[];
  sitios: Array<{ nombre_sitio: string; zona: string | null; posicion: string | null }>;
}

export interface StatisticAiPackage {
  version: 1;
  tipo: "estadistica_novedades_guardacostas";
  periodo: {
    escuadra: SquadPeriod["squad"];
    fecha_inicio: string;
    fecha_final: string;
  };
  instrucciones: string[];
  respuesta_esperada: {
    version: 1;
    celdas: Array<{
      hoja: string;
      fecha: string;
      fila: number;
      valor: number;
      fuente: string;
    }>;
  };
  filas_permitidas: typeof STATISTIC_AI_ROW_CATALOG;
  resumen: {
    total_reportes: number;
    reportes_con_novedades: number;
    filas_permitidas: number;
  };
  reportes: StatisticAiPackageReport[];
}

export type StatisticAiRejectReason =
  | "invalid_shape"
  | "missing_sheet"
  | "date_out_of_range"
  | "row_not_allowed"
  | "invalid_value";

export interface StatisticAiRejectedCell {
  index: number;
  reason: StatisticAiRejectReason;
  message: string;
}

export interface StatisticAiParseResult {
  cells: StatisticWorkbookAiCell[];
  rejected: StatisticAiRejectedCell[];
}

interface BuildStatisticAiPackageInput {
  period: SquadPeriod;
  vehicleReports: StatisticVehicleReport[];
  boatReports: StatisticBoatReport[];
  motives: StatisticMotiveRecord[];
  sites: StatisticSiteRecord[];
  sheetNames: string[];
}

interface ParseStatisticAiCellsContext {
  startDate: string;
  sheetNames: string[];
}

const buildRowsByReport = <TRow extends { reporte_id: string }>(rows: TRow[]) => {
  const map = new Map<string, TRow[]>();
  rows.forEach((row) => {
    map.set(row.reporte_id, [...(map.get(row.reporte_id) || []), row]);
  });
  return map;
};

const buildSheetNameMap = (sheetNames: string[]) =>
  new Map(sheetNames.map((sheetName) => [normalizeStatisticSheetKey(sheetName), sheetName]));

const resolveSheetName = (sheetNameByKey: Map<string, string>, unit: string | null | undefined) =>
  sheetNameByKey.get(normalizeStatisticSheetKey(unit)) || null;

export const buildStatisticAiPackage = ({
  period,
  vehicleReports,
  boatReports,
  motives,
  sites,
  sheetNames,
}: BuildStatisticAiPackageInput): StatisticAiPackage => {
  const motivesByReport = buildRowsByReport(motives);
  const sitesByReport = buildRowsByReport(sites);
  const sheetNameByKey = buildSheetNameMap(sheetNames);

  const reportEntries: StatisticAiPackageReport[] = [
    ...vehicleReports.map((report) => ({
      id: report.id,
      tipo: "vehiculo" as const,
      fecha: report.fecha,
      no_reporte: report.no_reporte,
      unidad: report.vehiculo,
      hoja_excel: resolveSheetName(sheetNameByKey, report.vehiculo),
      novedades: report.novedades || "",
      motivos: (motivesByReport.get(report.id) || []).map((motivo) => motivo.motivo),
      sitios: (sitesByReport.get(report.id) || []).map(({ nombre_sitio, zona, posicion }) => ({ nombre_sitio, zona, posicion })),
    })),
    ...boatReports.map((report) => ({
      id: report.id,
      tipo: "embarcacion" as const,
      fecha: report.fecha,
      no_reporte: report.no_reporte,
      unidad: report.embarcacion,
      hoja_excel: resolveSheetName(sheetNameByKey, report.embarcacion),
      novedades: report.novedades || "",
      motivos: (motivesByReport.get(report.id) || []).map((motivo) => motivo.motivo),
      sitios: (sitesByReport.get(report.id) || []).map(({ nombre_sitio, zona, posicion }) => ({ nombre_sitio, zona, posicion })),
    })),
  ].sort((a, b) => (a.fecha || "").localeCompare(b.fecha || "") || a.no_reporte.localeCompare(b.no_reporte));

  return {
    version: 1,
    tipo: "estadistica_novedades_guardacostas",
    periodo: {
      escuadra: period.squad,
      fecha_inicio: period.startDate,
      fecha_final: period.endDate,
    },
    instrucciones: [
      "Extraiga solo datos mencionados explicitamente en novedades.",
      "Use solamente las filas_permitidas y las hojas indicadas en hoja_excel.",
      "Devuelva valores por celda: hoja, fecha, fila, valor y fuente.",
      "No incluya ceros, valores nulos ni datos dudosos.",
    ],
    respuesta_esperada: {
      version: 1,
      celdas: [
        {
          hoja: "SNG-16",
          fecha: period.startDate,
          fila: 108,
          valor: 2,
          fuente: "Reportes 123/321",
        },
      ],
    },
    filas_permitidas: STATISTIC_AI_ROW_CATALOG,
    resumen: {
      total_reportes: reportEntries.length,
      reportes_con_novedades: reportEntries.filter((report) => report.novedades.trim()).length,
      filas_permitidas: STATISTIC_AI_ROW_CATALOG.length,
    },
    reportes: reportEntries,
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === "object" && !Array.isArray(value);

const toPositiveNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }
  return null;
};

const pushRejected = (
  rejected: StatisticAiRejectedCell[],
  index: number,
  reason: StatisticAiRejectReason,
  message: string,
) => {
  rejected.push({ index, reason, message });
};

export const parseStatisticAiCells = (jsonText: string, context: ParseStatisticAiCellsContext): StatisticAiParseResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("La respuesta de IA no es un JSON valido");
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.celdas)) {
    throw new Error("La respuesta de IA debe tener un arreglo llamado celdas");
  }

  const daySet = new Set(buildPeriodDays(context.startDate));
  const sheetNameByKey = buildSheetNameMap(context.sheetNames);
  const acceptedByKey = new Map<string, StatisticWorkbookAiCell>();
  const rejected: StatisticAiRejectedCell[] = [];

  parsed.celdas.forEach((entry, index) => {
    if (!isRecord(entry)) {
      pushRejected(rejected, index, "invalid_shape", "La entrada no es un objeto");
      return;
    }

    const rawSheetName = entry.hoja ?? entry.unidad;
    const sheetName = typeof rawSheetName === "string" ? sheetNameByKey.get(normalizeStatisticSheetKey(rawSheetName)) : null;
    if (!sheetName) {
      pushRejected(rejected, index, "missing_sheet", "La hoja no existe en la plantilla");
      return;
    }

    const date = typeof entry.fecha === "string" ? entry.fecha : "";
    if (!daySet.has(date)) {
      pushRejected(rejected, index, "date_out_of_range", "La fecha no pertenece al periodo seleccionado");
      return;
    }

    const row = typeof entry.fila === "number" ? entry.fila : Number(entry.fila);
    if (!Number.isInteger(row) || !isStatisticAiRowAllowed(row)) {
      pushRejected(rejected, index, "row_not_allowed", "La fila no esta permitida para datos de IA");
      return;
    }

    const value = toPositiveNumber(entry.valor);
    if (value == null) {
      pushRejected(rejected, index, "invalid_value", "El valor debe ser numerico y positivo");
      return;
    }

    const source = typeof entry.fuente === "string" ? entry.fuente.trim() : undefined;
    const key = `${sheetName}|${date}|${row}`;
    const current = acceptedByKey.get(key);

    if (current) {
      current.value += value;
      if (source && current.source && current.source !== source) {
        current.source = `${current.source}; ${source}`;
      } else if (source && !current.source) {
        current.source = source;
      }
      return;
    }

    acceptedByKey.set(key, {
      sheetName,
      date,
      row,
      value,
      source,
    });
  });

  return {
    cells: Array.from(acceptedByKey.values()),
    rejected,
  };
};

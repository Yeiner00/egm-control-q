import type { WorkBook, WorkSheet } from "xlsx";
import { normalizeReportNumber } from "./reportNumber";
import { normalizeReportText } from "./reportText";
import {
  DEFAULT_IMPORT_OFFICER_CATALOG,
  matchImportOfficer,
  normalizeImportText,
  splitImportPersonNamesDetailed,
  type ImportOfficerCatalog,
} from "./reportImportMatching";
import {
  DEFAULT_IMPORT_REPORT_CATALOGS,
  matchImportCatalogValue,
  normalizeCatalogValue,
  type ImportCatalogType,
  type ImportReportCatalogs,
  type ReportImportCatalogMatch,
} from "./reportImportCatalogMatching";
import {
  reportImportDraftSchema,
  type ReportImportDraft,
  type ReportImportField,
  type ReportImportJobStatus,
  type ReportImportType,
} from "./reportImportSchema";

type XlsxModule = typeof import("xlsx");

const MONTHS: Record<string, string> = {
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  setiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
};

const SCAN_COLUMNS = ["B", "C", "D", "E", "F", "G", "H", "I"];

const MOTIVE_PREFIX_PATTERNS = [
  /^(?:control\s+de\s+)?narcotr[aá]fico\b/i,
  /^narco\s+tr[aá]fico\b/i,
  /^pesca\s+ilegal\b/i,
  /^control\s+de\s+pesca\b/i,
  /^migraci[oó]n\s+ilegal\b/i,
  /^control\s+migratori[oa]\b/i,
  /^seguridad\s+ciudadana\b/i,
  /^seguridad\s+cuidadana\b/i,
  /^protecci[oó]n\s+(?:a|de)\s+ba[nñ]istas\b/i,
  /^seguridad\s+de\s+ba[nñ]istas\b/i,
  /^contrabando\b/i,
  /^soberan[ií]a\b/i,
  /^sobernia\b/i,
  /^reafirmaci[oó]n\b/i,
  /^pirater[ií]a\b/i,
  /^cacer[ií]a\s+ilegal\b/i,
  /^cazeria\s+ilegal\b/i,
  /^seguridad\s+ambiental\b/i,
  /^verano\s+seguro\b/i,
  /^semana\s+santa\b/i,
  /^protecci[oó]n\s+de\s+bosques\b/i,
  /^alteraci[oó]n\s+de\s+humedales\b/i,
  /^buzos\b/i,
  /^traslado\b/i,
  /^apoyo\s+operativo\b/i,
];

const MOTIVE_NOISE_KEYS = new Set(["", "motivo", "realizar", "de", "la", "el", "las", "los"]);

const looksLikeMotiveNoise = (value: string) => {
  const key = normalizeImportText(value);
  if (MOTIVE_NOISE_KEYS.has(key)) return true;
  return /^[a-z]{1,2}\d{1,3}(?:\s*\d+)?$/.test(key) || /^[\d\s-]+$/.test(key);
};

const splitKnownPrefixMotive = (value: string): string[] => {
  const cleanValue = normalizeReportText(value);
  if (!cleanValue) return [];

  const match = MOTIVE_PREFIX_PATTERNS
    .map((pattern) => cleanValue.match(pattern))
    .find((candidate): candidate is RegExpMatchArray => Boolean(candidate?.[0]));
  if (!match?.[0]) return [cleanValue];

  const knownPart = normalizeReportText(match[0]);
  const rest = normalizeReportText(cleanValue.slice(match[0].length));
  if (!rest || looksLikeMotiveNoise(rest)) return [cleanValue];

  return [knownPart, ...splitKnownPrefixMotive(rest)].filter(Boolean);
};

const splitMotives = (raw: string) =>
  raw
    .replace(/^motivo:\s*/i, "")
    .split(/[,;\n]+|\s+y\s+|\.\s+/i)
    .flatMap(splitKnownPrefixMotive)
    .map((item) => normalizeReportText(item))
    .filter(Boolean);

const cellValue = (sheet: WorkSheet, ref: string) => sheet[ref]?.v;

const cellText = (sheet: WorkSheet, ref: string) => {
  const value = cellValue(sheet, ref);
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
};

const cellNumber = (sheet: WorkSheet, ref: string) => {
  const value = cellValue(sheet, ref);
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const afterColon = (value: string) => value.split(":").slice(1).join(":").trim();

const isoDate = (year: number, month: number, day: number) => {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }

  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const parseNumericDateText = (value: string) => {
  const match = value.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (!match) return "";

  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const month = second > 12 && first <= 12 ? first : second;
  const day = second > 12 && first <= 12 ? second : first;
  return isoDate(year, month, day);
};

const parseExcelSerialDate = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "";
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86_400_000);
  return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

const parseSpanishDate = (value: string) => {
  const clean = value
    .replace(/^Fecha:\s*/i, "")
    .replace(/\bDEL\b/i, "de")
    .replace(/\bDE\b/gi, "de")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  const match = clean.match(/(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+(?:de\s+)?(\d{4})/i);
  const flexibleMatch = match || clean.match(/\b(\d{1,2})\s+([a-z]+)\s+(\d{4})\b/i);
  if (!flexibleMatch) return "";

  const month = MONTHS[flexibleMatch[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
  if (!month) return "";
  return `${flexibleMatch[3]}-${month}-${flexibleMatch[1].padStart(2, "0")}`;
};

export const parseImportExcelDate = (value: unknown) => {
  if (typeof value === "number") return parseExcelSerialDate(value);
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === "string") {
    return parseNumericDateText(value) || parseSpanishDate(value);
  }
  return "";
};

export const parseImportExcelTime = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }

  if (typeof value === "string") {
    const match = value.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  }

  return "";
};

const excelHoursToNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 24 * 100) / 100;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return Math.round((value.getHours() + value.getMinutes() / 60) * 100) / 100;
  }
  if (typeof value === "string") {
    const match = value.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
    if (match) return Math.round((Number(match[1]) + Number(match[2]) / 60) * 100) / 100;
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const findRowWhere = (
  sheet: WorkSheet,
  fromRow: number,
  toRow: number,
  predicate: (value: string) => boolean,
) => {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (const column of SCAN_COLUMNS) {
      if (predicate(cellText(sheet, `${column}${row}`))) return row;
    }
  }
  return null;
};

const findRowContaining = (sheet: WorkSheet, fromRow: number, toRow: number, terms: string[]) =>
  findRowWhere(sheet, fromRow, toRow, (value) => {
    const normalized = normalizeImportText(value);
    return terms.every((term) => normalized.includes(term));
  });

const extractReportNumber = (...values: string[]) => {
  for (const value of values) {
    const match = value.match(/(?:No\.?|N°|#|No:)?\s*0*(\d{1,5})(?:-\d{4})?/i);
    if (match) return normalizeReportNumber(match[1]);
  }
  return "";
};

const fieldStatus = (confidence: number, forceReview = false): ReportImportField["status"] => {
  if (forceReview || confidence < 0.8) return confidence > 0 ? "needs_review" : "rejected";
  if (confidence < 0.95) return "needs_review";
  return "accepted";
};

const addField = (
  fields: ReportImportField[],
  field: Omit<ReportImportField, "metadata"> & { metadata?: Record<string, unknown> },
) => {
  const next: ReportImportField = {
    ...field,
    metadata: field.metadata || {},
  };
  fields.push(next);
  return next;
};

const addDeterministicField = (
  fields: ReportImportField[],
  fieldKey: string,
  label: string,
  rawValue: unknown,
  finalValue: string | number | null | undefined,
  cellAddress: string | null,
) => {
  const raw = rawValue == null ? "" : String(rawValue);
  const finalText = finalValue == null ? "" : String(finalValue);
  const confidence = finalText ? 0.99 : 0;
  return addField(fields, {
    fieldKey,
    label,
    kind: "deterministic",
    rawValue: raw,
    normalizedValue: normalizeImportText(finalText || raw),
    finalValue: finalText || null,
    cellAddress,
    source: "local",
    confidence,
    status: fieldStatus(confidence),
  });
};

const addTextField = (
  fields: ReportImportField[],
  fieldKey: string,
  label: string,
  rawValue: string,
  cellAddress: string,
) =>
  addField(fields, {
    fieldKey,
    label,
    kind: "text",
    rawValue,
    normalizedValue: null,
    finalValue: rawValue,
    cellAddress,
    source: "local",
    confidence: 1,
    status: "accepted",
    metadata: { preserveRaw: true },
  });

const addDuplicateWarningField = (
  fields: ReportImportField[],
  groupKey: "acompanantes" | "tripulantes",
  label: string,
  duplicates: string[],
  rawGroup: string,
  cellAddress: string,
) => {
  if (duplicates.length === 0) return null;
  const finalValue = `Se usara una sola vez: ${duplicates.join(", ")}`;
  return addField(fields, {
    fieldKey: `${groupKey}_duplicates`,
    label: `${label} duplicado`,
    kind: "deterministic",
    rawValue: rawGroup,
    normalizedValue: normalizeImportText(duplicates.join(" ")),
    finalValue,
    cellAddress,
    source: "local",
    confidence: 0.8,
    status: "needs_review",
    metadata: {
      warningType: "duplicate_person",
      groupKey,
      duplicateNames: duplicates,
    },
  });
};

const addPersonField = (
  fields: ReportImportField[],
  fieldKey: string,
  label: string,
  rawName: string,
  cellAddress: string,
  catalog: ImportOfficerCatalog,
  cedula?: string | null,
  cedulaCellAddress?: string | null,
  metadata?: Record<string, unknown>,
) => {
  const { match, candidates } = matchImportOfficer(rawName, catalog, cedula);
  const confidence = match?.confidence ?? 0;
  const resolutionType = match
    ? match.level === "fuzzy" || match.level === "gemini"
      ? "probable_catalog_officer"
      : "catalog_officer"
    : "unknown_person";
  return addField(fields, {
    fieldKey,
    label,
    kind: "person",
    rawValue: rawName,
    normalizedValue: normalizeImportText(rawName),
    finalValue: match?.nombre ?? null,
    cellAddress,
    source: "local",
    confidence,
    status: fieldStatus(confidence, match?.needsReview ?? true),
    metadata: {
      cedula: cedula || null,
      cedulaCellAddress: cedulaCellAddress || null,
      match,
      candidates,
      officerCedula: match?.cedula ?? null,
      resolutionType,
      ...(metadata || {}),
    },
  });
};

const looksLikeUnsplitPersonGroup = (names: string[]) => {
  if (names.length !== 1) return false;
  return normalizeImportText(names[0]).split(" ").filter(Boolean).length >= 4;
};

const addPersonGroupFields = (
  fields: ReportImportField[],
  groupKey: "acompanantes" | "tripulantes",
  label: string,
  rawGroup: string,
  cellAddress: string,
  catalog: ImportOfficerCatalog,
) => {
  const splitResult = splitImportPersonNamesDetailed(rawGroup, catalog);
  const names = splitResult.names;
  const needsAiSegmentation = looksLikeUnsplitPersonGroup(names);
  const personFields = names.map((name, index) =>
    addPersonField(fields, `${groupKey}.${index}`, label, name, cellAddress, catalog, null, null, {
      groupKey,
      groupRawValue: rawGroup,
      groupCellAddress: cellAddress,
      groupNeedsSegmentation: needsAiSegmentation,
      groupLocalSplitCount: names.length,
    }),
  );
  addDuplicateWarningField(fields, groupKey, label, splitResult.duplicates, rawGroup, cellAddress);
  return personFields;
};

const catalogTypeLabel: Record<ImportCatalogType, string> = {
  motive: "Motivo",
  site: "Sitio visitado",
};

const addCatalogField = (
  fields: ReportImportField[],
  fieldKey: string,
  label: string,
  catalogType: ImportCatalogType,
  rawValue: string,
  cellAddress: string,
  catalogs: ImportReportCatalogs,
  metadata?: Record<string, unknown>,
) => {
  const { match, candidates } = matchImportCatalogValue(catalogType, rawValue, catalogs);
  const confidence = match?.confidence ?? 0;
  return addField(fields, {
    fieldKey,
    label,
    kind: "catalog",
    rawValue,
    normalizedValue: normalizeCatalogValue(catalogType, rawValue),
    finalValue: match?.label ?? null,
    cellAddress,
    source: "local",
    confidence,
    status: fieldStatus(confidence, match?.needsReview ?? true),
    metadata: {
      catalogType,
      match,
      candidates,
      catalogItemId: match?.itemId ?? null,
      catalogLabel: match?.label ?? null,
      ...(metadata || {}),
    },
  });
};

const matchSiteMetadata = (match: ReportImportCatalogMatch | null | undefined) => ({
  matchZona: match?.zona || null,
  matchPosicion: match?.posicion || null,
});

const addMotiveFields = (
  fields: ReportImportField[],
  motives: string[],
  cellAddress: string,
  catalogs: ImportReportCatalogs,
) =>
  motives.map((motive, index) => {
    const field = addCatalogField(
      fields,
      `motivos.${index}`,
      catalogTypeLabel.motive,
      "motive",
      motive,
      cellAddress,
      catalogs,
      { listIndex: index },
    );
    return field.finalValue || motive;
  });

const readSites = (
  sheet: WorkSheet,
  fromRow: number,
  toRow: number,
  columns: { nombre: string; zona: string; posicion: string },
) => {
  const sites = [];
  for (let row = fromRow; row <= toRow; row += 1) {
    const nombre_sitio = cellText(sheet, `${columns.nombre}${row}`);
    const zona = cellText(sheet, `${columns.zona}${row}`);
    const posicion = cellText(sheet, `${columns.posicion}${row}`);
    const normalized = [nombre_sitio, zona, posicion].map(normalizeImportText).join(" ");
    const isLabel = normalized.includes("nombre matricula") ||
      normalized.includes("saldo combustible") ||
      normalized.includes("combustible gastado");
    if ((nombre_sitio || zona || posicion) && !isLabel) {
      sites.push({
        nombre_sitio: normalizeReportText(nombre_sitio),
        zona,
        posicion,
        row,
        cellAddress: `${columns.nombre}${row}`,
        zonaCellAddress: `${columns.zona}${row}`,
        posicionCellAddress: `${columns.posicion}${row}`,
      });
    }
  }
  return sites;
};

const addSiteFields = (
  fields: ReportImportField[],
  sites: ReturnType<typeof readSites>,
  catalogs: ImportReportCatalogs,
) =>
  sites.map((site, index) => {
    const field = addCatalogField(
      fields,
      `sitios_visitados.${index}`,
      catalogTypeLabel.site,
      "site",
      site.nombre_sitio,
      site.cellAddress,
      catalogs,
      {
        listIndex: index,
        siteZona: site.zona,
        sitePosicion: site.posicion,
        siteZonaCellAddress: site.zonaCellAddress,
        sitePosicionCellAddress: site.posicionCellAddress,
        ...matchSiteMetadata(fieldlessCatalogMatch("site", site.nombre_sitio, catalogs)),
      },
    );
    const match = field.metadata.match as ReportImportCatalogMatch | null | undefined;
    return {
      nombre_sitio: field.finalValue || site.nombre_sitio,
      zona: site.zona || match?.zona || "",
      posicion: site.posicion || match?.posicion || "",
    };
  });

const fieldlessCatalogMatch = (
  catalogType: ImportCatalogType,
  rawValue: string,
  catalogs: ImportReportCatalogs,
) => matchImportCatalogValue(catalogType, rawValue, catalogs).match;

const readInspectedBoats = (sheet: WorkSheet, fromRow: number, toRow: number) => {
  const boats = [];
  for (let row = fromRow; row <= toRow; row += 1) {
    const nombre = cellText(sheet, `F${row}`);
    const matricula = cellText(sheet, `G${row}`);
    const no_inspeccion = cellText(sheet, `H${row}`);
    const zona = cellText(sheet, `I${row}`);
    const normalized = normalizeImportText([nombre, matricula, no_inspeccion, zona].join(" "));
    if ((nombre || matricula || no_inspeccion || zona) && !normalized.includes("nombre matricula")) {
      boats.push({ nombre, matricula, no_inspeccion, zona, posicion: "" });
    }
  }
  return boats;
};

const extractVehicle = (
  sheet: WorkSheet,
  catalog: ImportOfficerCatalog,
  reportCatalogs: ImportReportCatalogs,
) => {
  const fields: ReportImportField[] = [];
  const rawCompanions = cellText(sheet, "B15");
  const companionFields = addPersonGroupFields(fields, "acompanantes", "Acompanante", rawCompanions, "B15", catalog);

  const chofer = addPersonField(fields, "chofer", "Chofer", cellText(sheet, "C25") || afterColon(cellText(sheet, "B13")), "C25", catalog, cellText(sheet, "L25"), "L25");
  const oficial = addPersonField(fields, "oficial_a_cargo", "Oficial a cargo", cellText(sheet, "C26"), "C26", catalog, cellText(sheet, "L26"), "L26");

  const reportNumber = extractReportNumber(cellText(sheet, "B7"), cellText(sheet, "M3"));
  const fecha = parseImportExcelDate(cellValue(sheet, "H3"));
  const horaSalida = parseImportExcelTime(cellValue(sheet, "K5"));
  const horaRegreso = parseImportExcelTime(cellValue(sheet, "N5"));
  const motivos = addMotiveFields(fields, splitMotives(afterColon(cellText(sheet, "D12"))), "D12", reportCatalogs);
  const sitios = addSiteFields(fields, readSites(sheet, 9, 21, { nombre: "I", zona: "H", posicion: "L" }), reportCatalogs);
  const novedades = afterColon(cellText(sheet, "B17"));

  addDeterministicField(fields, "no_reporte", "N. Reporte", cellText(sheet, "B7") || cellText(sheet, "M3"), reportNumber, "B7");
  addDeterministicField(fields, "fecha", "Fecha", cellText(sheet, "H3"), fecha, "H3");
  addDeterministicField(fields, "hora_salida", "Hora salida", cellValue(sheet, "K5"), horaSalida, "K5");
  addDeterministicField(fields, "hora_regreso", "Hora regreso", cellValue(sheet, "N5"), horaRegreso, "N5");
  addDeterministicField(fields, "vehiculo", "Vehiculo", cellText(sheet, "B11"), afterColon(cellText(sheet, "B11")), "B11");
  addTextField(fields, "novedades", "Novedades", novedades, "B17");

  return {
    fields,
    extractedData: {
      tipo: "vehiculo",
      no_reporte: reportNumber,
      bitacora: afterColon(cellText(sheet, "B12")),
      fecha,
      hora_salida: horaSalida,
      hora_regreso: horaRegreso,
      estacion: normalizeReportText(afterColon(cellText(sheet, "B9"))),
      vehiculo: afterColon(cellText(sheet, "B11")),
      destino: normalizeReportText(afterColon(cellText(sheet, "D7")).replace(/,\s*$/, "")),
      motivos,
      chofer: chofer.finalValue || "",
      chofer_cedula: chofer.metadata.officerCedula || cellText(sheet, "L25"),
      acompanantes: companionFields.map((field) => field.finalValue).filter(Boolean),
      oficial_a_cargo: oficial.finalValue || "",
      oficial_a_cargo_cedula: oficial.metadata.officerCedula || cellText(sheet, "L26"),
      sitios_visitados: sitios,
      estacion_combustible: normalizeReportText(cellText(sheet, "C22")),
      lugar_combustible: normalizeReportText(cellText(sheet, "F22")),
      cedula_juridica_combustible: cellText(sheet, "I22"),
      no_factura: cellText(sheet, "L23"),
      combustible_trasegado_bomba: cellNumber(sheet, "B24"),
      total_combustible_antes_viaje: cellNumber(sheet, "C24"),
      combustible_gastado: cellNumber(sheet, "D24"),
      saldo_combustible_despues_viaje: cellNumber(sheet, "F24"),
      kilometros_recorridos: cellNumber(sheet, "I24"),
      novedades,
    },
  };
};

const personFromSignature = (
  sheet: WorkSheet,
  label: string,
  row: number,
  catalog: ImportOfficerCatalog,
  fieldKey: string,
  fields: ReportImportField[],
) => addPersonField(fields, fieldKey, label, cellText(sheet, `C${row}`), `C${row}`, catalog, cellText(sheet, `H${row}`), `H${row}`);

const extractBoat = (
  sheet: WorkSheet,
  catalog: ImportOfficerCatalog,
  reportCatalogs: ImportReportCatalogs,
) => {
  const fields: ReportImportField[] = [];
  const inspectionSectionRow = findRowContaining(sheet, 13, 30, ["embarcaciones", "inspeccionadas"]) ?? 24;
  const inspectionHeaderRow = findRowContaining(sheet, inspectionSectionRow, inspectionSectionRow + 3, ["matricula"]) ?? inspectionSectionRow + 1;
  const fuelHeaderRow = findRowContaining(sheet, 24, 34, ["saldo", "combustible", "viaje", "anterior"]) ?? 30;
  const fuelValuesRow = fuelHeaderRow + 1;
  const fuelDetailsHeaderRow = findRowContaining(sheet, fuelValuesRow, fuelValuesRow + 5, ["millas", "nauticas"]) ?? 32;
  const fuelDetailsRow = fuelDetailsHeaderRow + 1;
  const signatureStartRow = fuelDetailsRow + 1;
  const signatureEndRow = signatureStartRow + 8;
  const oficialDirectorRow = findRowContaining(sheet, signatureStartRow, signatureEndRow, ["oficial", "director"]) ??
    findRowContaining(sheet, signatureStartRow, signatureEndRow, ["ambiental"]) ??
    35;
  const operacionalRow = findRowContaining(sheet, signatureStartRow, signatureEndRow, ["operacional"]) ?? 36;
  const capitanRow = findRowWhere(sheet, signatureStartRow, signatureEndRow, (value) => {
    const normalized = normalizeImportText(value);
    return normalized.includes("capitan") || (normalized.includes("operador") && normalized.includes("mando"));
  }) ?? 37;
  const encargadoRow = findRowContaining(sheet, signatureStartRow, signatureEndRow, ["encargado", "mision"]) ?? 38;

  const oficialDirector = personFromSignature(sheet, "Oficial director", oficialDirectorRow, catalog, "oficial_director", fields);
  const operacional = personFromSignature(sheet, "Operacional", operacionalRow, catalog, "operacional", fields);
  const capitan = personFromSignature(sheet, "Capitan", capitanRow, catalog, "capitan", fields);
  const encargado = personFromSignature(sheet, "Encargado de mision", encargadoRow, catalog, "encargado_mision", fields);
  const assigned = new Set([oficialDirector.finalValue, operacional.finalValue, capitan.finalValue, encargado.finalValue].filter(Boolean));
  const tripulantes = addPersonGroupFields(fields, "tripulantes", "Tripulante", cellText(sheet, "C9"), "C9", catalog)
    .filter((field) => field.finalValue && !assigned.has(field.finalValue));

  const reportNumber = extractReportNumber(cellText(sheet, "B4"), cellText(sheet, "I4"));
  const fecha = parseImportExcelDate(cellValue(sheet, "C4"));
  const horaSalida = parseImportExcelTime(cellValue(sheet, "C5"));
  const horaRegreso = parseImportExcelTime(cellValue(sheet, "E5"));
  const motivos = addMotiveFields(fields, splitMotives(cellText(sheet, "F8")), "F8", reportCatalogs);
  const novedades = afterColon(cellText(sheet, "B13"));
  const sitiosVisitados = addSiteFields(
    fields,
    readSites(sheet, 15, inspectionSectionRow - 1, { nombre: "F", zona: "G", posicion: "H" }),
    reportCatalogs,
  );

  addDeterministicField(fields, "no_reporte", "N. Reporte", cellText(sheet, "B4") || cellText(sheet, "I4"), reportNumber, "B4");
  addDeterministicField(fields, "fecha", "Fecha", cellText(sheet, "C4"), fecha, "C4");
  addDeterministicField(fields, "hora_salida", "Hora salida", cellValue(sheet, "C5"), horaSalida, "C5");
  addDeterministicField(fields, "hora_regreso", "Hora regreso", cellValue(sheet, "E5"), horaRegreso, "E5");
  addDeterministicField(fields, "embarcacion", "Embarcacion", cellText(sheet, "E2"), cellText(sheet, "E2"), "E2");
  addTextField(fields, "novedades", "Novedades", novedades, "B13");

  return {
    fields,
    extractedData: {
      tipo: "embarcacion",
      no_reporte: reportNumber,
      bitacora: cellText(sheet, "G2"),
      folios: cellText(sheet, "I2"),
      fecha,
      estacion: normalizeReportText(cellText(sheet, "C2")),
      embarcacion: cellText(sheet, "E2"),
      no_cierre_os: cellText(sheet, "I5").replace(/^N°\s*/i, ""),
      hora_salida: horaSalida,
      hora_regreso: horaRegreso,
      horas_motor_babor: excelHoursToNumber(cellValue(sheet, "C6")),
      horas_motor_centro: excelHoursToNumber(cellValue(sheet, "E6")),
      horas_motor_estribor: excelHoursToNumber(cellValue(sheet, "G6")),
      destino: normalizeReportText(cellText(sheet, "C8")),
      motivos,
      capitan: capitan.finalValue || "",
      capitan_cedula: capitan.metadata.officerCedula || cellText(sheet, `H${capitanRow}`),
      encargado_mision: encargado.finalValue || "",
      encargado_mision_cedula: encargado.metadata.officerCedula || cellText(sheet, `H${encargadoRow}`),
      oficial_director: oficialDirector.finalValue || "",
      oficial_director_cedula: oficialDirector.metadata.officerCedula || cellText(sheet, `H${oficialDirectorRow}`),
      operacional: operacional.finalValue || "",
      operacional_cedula: operacional.metadata.officerCedula || cellText(sheet, `H${operacionalRow}`),
      tripulantes: tripulantes.map((field) => ({
        nombre: field.finalValue,
        cedula: field.metadata.officerCedula || "",
      })),
      personas_particulares: [],
      sitios_visitados: sitiosVisitados,
      embarcaciones_inspeccionadas: readInspectedBoats(sheet, inspectionHeaderRow + 1, fuelHeaderRow - 1),
      saldo_anterior: cellNumber(sheet, `B${fuelValuesRow}`),
      combustible_trasegado_bodega: cellNumber(sheet, `C${fuelValuesRow}`),
      total_antes_viaje: cellNumber(sheet, `D${fuelValuesRow}`),
      combustible_trasegado_durante: cellNumber(sheet, `E${fuelValuesRow}`),
      combustible_gastado: cellNumber(sheet, `F${fuelValuesRow}`),
      saldo_despues: cellNumber(sheet, `H${fuelValuesRow}`),
      tipo_combustible: normalizeReportText(cellText(sheet, `I${fuelValuesRow}`)),
      estacion_combustible: normalizeReportText(cellText(sheet, `B${fuelDetailsRow}`)),
      cedula_juridica_combustible: cellText(sheet, `C${fuelDetailsRow}`),
      lugar_combustible: normalizeReportText(cellText(sheet, `D${fuelDetailsRow}`)),
      no_factura: cellText(sheet, `F${fuelDetailsRow}`),
      millas_nauticas: cellNumber(sheet, `H${fuelDetailsRow}`),
      novedades,
    },
  };
};

const resolveReportType = (workbook: WorkBook, XLSX: XlsxModule): { reportType: ReportImportType; sheet: WorkSheet } | null => {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).toLowerCase();
    if (csv.includes("reporte de viaje de vehículos") || csv.includes("reporte de viaje de vehiculos") || csv.includes("vehiculo  sng")) {
      return { reportType: "vehiculo", sheet };
    }
    if (csv.includes("embarcación") || csv.includes("embarcacion") || csv.includes("horas motor babor")) {
      return { reportType: "embarcacion", sheet };
    }
  }
  return null;
};

export const buildReportImportDraftFromWorkbook = (
  workbook: WorkBook,
  XLSX: XlsxModule,
  options: {
    jobId: string;
    fileName: string;
    storagePath?: string | null;
    catalog?: ImportOfficerCatalog;
    reportCatalogs?: ImportReportCatalogs;
    geminiError?: string | null;
  },
): ReportImportDraft => {
  const resolved = resolveReportType(workbook, XLSX);
  if (!resolved) {
    throw new Error("No se pudo detectar si el archivo es de vehiculo o embarcacion");
  }

  const catalog = options.catalog || DEFAULT_IMPORT_OFFICER_CATALOG;
  const reportCatalogs = options.reportCatalogs || DEFAULT_IMPORT_REPORT_CATALOGS;
  const extracted = resolved.reportType === "vehiculo"
    ? extractVehicle(resolved.sheet, catalog, reportCatalogs)
    : extractBoat(resolved.sheet, catalog, reportCatalogs);
  const hasReviewFields = extracted.fields.some((field) => field.status !== "accepted");
  const status: ReportImportJobStatus = options.geminiError
    ? "gemini_failed"
    : hasReviewFields
      ? "review_required"
      : "ready";

  return reportImportDraftSchema.parse({
    jobId: options.jobId,
    fileName: options.fileName,
    reportType: resolved.reportType,
    status,
    storagePath: options.storagePath || null,
    geminiError: options.geminiError || null,
    fields: extracted.fields,
    extractedData: extracted.extractedData,
  });
};

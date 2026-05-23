import type { WorkBook, WorkSheet } from "xlsx";
import type { ExtractedReportData } from "@/lib/report-utils";

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

const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const SCAN_COLUMNS = ["B", "C", "D", "E", "F", "G", "H", "I"];

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
    const normalized = normalizeText(value);
    return terms.every((term) => normalized.includes(term));
  });

const extractReportNumber = (...values: string[]) => {
  for (const value of values) {
    const match = value.match(/(?:No\.?|N°|#|No:)?\s*0*(\d{1,5})(?:-\d{4})?/i);
    if (match) return match[1].padStart(value.includes("010") ? 3 : 0, "0");
  }
  return "";
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
  if (!match) return "";

  const month = MONTHS[match[2].normalize("NFD").replace(/[\u0300-\u036f]/g, "")];
  if (!month) return "";
  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
};

const excelTimeToText = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const totalMinutes = Math.round(value * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }
  if (typeof value === "string") {
    const match = value.match(/(\d{1,2}):(\d{2})/);
    if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  }
  return "";
};

const excelHoursToNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 24 * 100) / 100;
  return null;
};

const stripPeopleLabel = (value: string) => {
  const labels = ["acompanantes", "personas particulares a bordo", "personas particulares"];
  const normalized = normalizeText(value);
  if (labels.includes(normalized)) return "";

  const colonIndex = value.indexOf(":");
  if (colonIndex === -1) return value;

  const label = normalizeText(value.slice(0, colonIndex));
  return labels.some((knownLabel) => label.includes(knownLabel)) ? value.slice(colonIndex + 1).trim() : value;
};

const isPlaceholderPerson = (value: string) => {
  const normalized = normalizeText(value);
  return ["", "n a", "na", "no aplica", "ninguno", "ninguna", "sin datos"].includes(normalized);
};

const splitPeople = (value: string) =>
  stripPeopleLabel(value)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter((item) => !isPlaceholderPerson(item));

const isTableLabel = (value: string) => {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return (
    ["nombre", "matricula", "no inspeccion", "no zona", "posicion", "pocision"].includes(normalized) ||
    normalized.includes("embarcaciones inspeccionadas") ||
    normalized.includes("saldo del combustible") ||
    normalized.includes("combustible gastado") ||
    normalized.includes("combustible trasegado") ||
    normalized.includes("total de combustible")
  );
};

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
    if ((nombre_sitio || zona || posicion) && ![nombre_sitio, zona, posicion].some(isTableLabel)) {
      sites.push({ nombre_sitio, zona, posicion });
    }
  }
  return sites;
};

const readInspectedBoats = (sheet: WorkSheet, fromRow: number, toRow: number) => {
  const boats = [];
  for (let row = fromRow; row <= toRow; row += 1) {
    const nombre = cellText(sheet, `F${row}`);
    const matricula = cellText(sheet, `G${row}`);
    const no_inspeccion = cellText(sheet, `H${row}`);
    const zona = cellText(sheet, `I${row}`);
    if ((nombre || matricula || no_inspeccion || zona) && ![nombre, matricula, no_inspeccion, zona].some(isTableLabel)) {
      boats.push({ nombre, matricula, no_inspeccion, zona, posicion: "" });
    }
  }
  return boats;
};

const extractVehicleReport = (sheet: WorkSheet): ExtractedReportData => ({
  tipo: "vehiculo",
  no_reporte: extractReportNumber(cellText(sheet, "B7"), cellText(sheet, "M3")),
  bitacora: afterColon(cellText(sheet, "B12")),
  fecha: parseSpanishDate(cellText(sheet, "H3")),
  hora_salida: excelTimeToText(cellValue(sheet, "K5")),
  hora_regreso: excelTimeToText(cellValue(sheet, "N5")),
  estacion: afterColon(cellText(sheet, "B9")),
  vehiculo: afterColon(cellText(sheet, "B11")),
  destino: afterColon(cellText(sheet, "D7")).replace(/,\s*$/, ""),
  motivos: [afterColon(cellText(sheet, "D12"))].filter(Boolean),
  chofer: cellText(sheet, "C25") || afterColon(cellText(sheet, "B13")),
  chofer_cedula: cellText(sheet, "L25"),
  acompanantes: splitPeople(cellText(sheet, "B15")),
  oficial_a_cargo: cellText(sheet, "C26"),
  oficial_a_cargo_cedula: cellText(sheet, "L26"),
  sitios_visitados: readSites(sheet, 9, 21, { nombre: "I", zona: "H", posicion: "L" }),
  estacion_combustible: cellText(sheet, "C22"),
  lugar_combustible: cellText(sheet, "F22"),
  cedula_juridica_combustible: cellText(sheet, "I22"),
  no_factura: cellText(sheet, "L23"),
  combustible_trasegado_bomba: cellNumber(sheet, "B24"),
  total_combustible_antes_viaje: cellNumber(sheet, "C24"),
  combustible_gastado: cellNumber(sheet, "D24"),
  saldo_combustible_despues_viaje: cellNumber(sheet, "F24"),
  kilometros_recorridos: cellNumber(sheet, "I24"),
  novedades: afterColon(cellText(sheet, "B17")),
});

const extractBoatReport = (sheet: WorkSheet): ExtractedReportData => {
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
    const normalized = normalizeText(value);
    return normalized.includes("capitan") || (normalized.includes("operador") && normalized.includes("mando"));
  }) ?? 37;
  const encargadoRow = findRowContaining(sheet, signatureStartRow, signatureEndRow, ["encargado", "mision"]) ?? 38;

  return {
    tipo: "embarcacion",
    no_reporte: extractReportNumber(cellText(sheet, "B4"), cellText(sheet, "I4")),
    bitacora: cellText(sheet, "G2"),
    folios: cellText(sheet, "I2"),
    fecha: parseSpanishDate(cellText(sheet, "C4")),
    estacion: cellText(sheet, "C2"),
    embarcacion: cellText(sheet, "E2"),
    no_cierre_os: cellText(sheet, "I5").replace(/^N°\s*/i, ""),
    hora_salida: excelTimeToText(cellValue(sheet, "C5")),
    hora_regreso: excelTimeToText(cellValue(sheet, "E5")),
    horas_motor_babor: excelHoursToNumber(cellValue(sheet, "C6")),
    horas_motor_centro: excelHoursToNumber(cellValue(sheet, "E6")),
    horas_motor_estribor: excelHoursToNumber(cellValue(sheet, "G6")),
    destino: cellText(sheet, "C8"),
    motivos: [cellText(sheet, "F8")].filter(Boolean),
    capitan: cellText(sheet, `C${capitanRow}`),
    capitan_cedula: cellText(sheet, `H${capitanRow}`),
    encargado_mision: cellText(sheet, `C${encargadoRow}`),
    encargado_mision_cedula: cellText(sheet, `H${encargadoRow}`),
    oficial_director: cellText(sheet, `C${oficialDirectorRow}`),
    oficial_director_cedula: cellText(sheet, `H${oficialDirectorRow}`),
    operacional: cellText(sheet, `C${operacionalRow}`),
    operacional_cedula: cellText(sheet, `H${operacionalRow}`),
    tripulantes: [],
    personas_particulares: splitPeople(cellText(sheet, "B11")),
    sitios_visitados: readSites(sheet, 15, inspectionSectionRow - 1, { nombre: "F", zona: "G", posicion: "H" }),
    embarcaciones_inspeccionadas: readInspectedBoats(sheet, inspectionHeaderRow + 1, fuelHeaderRow - 1),
    saldo_anterior: cellNumber(sheet, `B${fuelValuesRow}`),
    combustible_trasegado_bodega: cellNumber(sheet, `C${fuelValuesRow}`),
    total_antes_viaje: cellNumber(sheet, `D${fuelValuesRow}`),
    combustible_trasegado_durante: cellNumber(sheet, `E${fuelValuesRow}`),
    combustible_gastado: cellNumber(sheet, `F${fuelValuesRow}`),
    saldo_despues: cellNumber(sheet, `H${fuelValuesRow}`),
    tipo_combustible: cellText(sheet, `I${fuelValuesRow}`),
    estacion_combustible: cellText(sheet, `B${fuelDetailsRow}`),
    cedula_juridica_combustible: cellText(sheet, `C${fuelDetailsRow}`),
    lugar_combustible: cellText(sheet, `D${fuelDetailsRow}`),
    no_factura: cellText(sheet, `F${fuelDetailsRow}`),
    millas_nauticas: cellNumber(sheet, `H${fuelDetailsRow}`),
    novedades: afterColon(cellText(sheet, "B13")),
  };
};

export const extractReportFromWorkbook = (workbook: WorkBook, XLSX: XlsxModule): ExtractedReportData | null => {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).toLowerCase();
    if (csv.includes("reporte de viaje de vehículos") || csv.includes("vehiculo  sng")) {
      return extractVehicleReport(sheet);
    }
    if (csv.includes("embarcación") || csv.includes("embarcacion") || csv.includes("horas motor babor")) {
      return extractBoatReport(sheet);
    }
  }
  return null;
};

export const mergeExtractedReportData = (
  aiData: ExtractedReportData | null | undefined,
  workbookData: ExtractedReportData | null,
) => {
  if (!aiData) return workbookData;
  if (!workbookData) return aiData;
  const emptyArrayWorkbookOverrides = new Set(["acompanantes", "personas_particulares"]);
  return {
    ...aiData,
    ...Object.fromEntries(
      Object.entries(workbookData).filter(([key, value]) => {
        if (Array.isArray(value)) return value.length > 0 || emptyArrayWorkbookOverrides.has(key);
        return value !== "" && value != null;
      }),
    ),
  };
};

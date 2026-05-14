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

const splitPeople = (value: string) =>
  value
    .replace(/^ACOMPAÑANTES?:/i, "")
    .split(/,\s*/)
    .map((item) => item.trim())
    .filter(Boolean);

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
    if (nombre_sitio || zona || posicion) {
      sites.push({ nombre_sitio, zona, posicion });
    }
  }
  return sites;
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

const extractBoatReport = (sheet: WorkSheet): ExtractedReportData => ({
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
  capitan: cellText(sheet, "C37"),
  capitan_cedula: cellText(sheet, "H37"),
  encargado_mision: cellText(sheet, "C38"),
  encargado_mision_cedula: cellText(sheet, "H38"),
  operacional: cellText(sheet, "C36"),
  operacional_cedula: cellText(sheet, "H36"),
  tripulantes: [],
  personas_particulares: splitPeople(cellText(sheet, "B11")),
  sitios_visitados: readSites(sheet, 15, 23, { nombre: "F", zona: "G", posicion: "H" }),
  embarcaciones_inspeccionadas: Array.from({ length: 4 }, (_, index) => {
    const row = 26 + index;
    return {
      nombre: cellText(sheet, `F${row}`),
      matricula: cellText(sheet, `G${row}`),
      no_inspeccion: cellText(sheet, `H${row}`),
      zona: cellText(sheet, `I${row}`),
      posicion: "",
    };
  }).filter((item) => item.nombre || item.matricula || item.no_inspeccion || item.zona),
  saldo_anterior: cellNumber(sheet, "B31"),
  combustible_trasegado_bodega: cellNumber(sheet, "C31"),
  total_antes_viaje: cellNumber(sheet, "D31"),
  combustible_trasegado_durante: cellNumber(sheet, "E31"),
  combustible_gastado: cellNumber(sheet, "F31"),
  saldo_despues: cellNumber(sheet, "H31"),
  tipo_combustible: cellText(sheet, "I31"),
  estacion_combustible: cellText(sheet, "B33"),
  cedula_juridica_combustible: cellText(sheet, "C33"),
  lugar_combustible: cellText(sheet, "D33"),
  no_factura: cellText(sheet, "F33"),
  millas_nauticas: cellNumber(sheet, "H33"),
  novedades: afterColon(cellText(sheet, "B13")),
});

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
  return {
    ...aiData,
    ...Object.fromEntries(
      Object.entries(workbookData).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        return value !== "" && value != null;
      }),
    ),
  };
};

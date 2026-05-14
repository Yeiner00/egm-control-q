import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { calcTotalHours } from "@/lib/report-utils";
import { loadReportPeopleByIds, type ReportPersonWithRoles } from "@/lib/reportPeople";

type ReportType = "vehiculo" | "embarcacion";
type VehicleReport = Tables<"reportes_vehiculo">;
type BoatReport = Tables<"reportes_embarcacion">;
type MotivoRecord = Tables<"reporte_motivos">;
type SitioRecord = Tables<"reporte_sitios">;
type InspectedBoatRecord = Tables<"reporte_embarcaciones_inspeccionadas">;
type CellValue = string | number | null | undefined;

interface ReportExcelData<TReport> {
  report: TReport;
  people: ReportPersonWithRoles[];
  motivos: string[];
  sitios: SitioRecord[];
  inspectedBoats: InspectedBoatRecord[];
}

const TEMPLATE_PATHS: Record<ReportType, string> = {
  vehiculo: "/templates/reporte-vehiculo-template.xlsx",
  embarcacion: "/templates/reporte-embarcacion-template.xlsx",
};

const SPANISH_MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const SPANISH_WEEKDAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

export const formatVehicleReportDate = (date: string | null | undefined) => {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";

  const day = String(parsed.getDate()).padStart(2, "0");
  return `${SPANISH_WEEKDAYS[parsed.getDay()]} ${day} de ${SPANISH_MONTHS[parsed.getMonth()]} ${parsed.getFullYear()}`;
};

export const formatBoatReportDate = (date: string | null | undefined) => {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";

  const day = String(parsed.getDate()).padStart(2, "0");
  return `${day}  DE ${SPANISH_MONTHS[parsed.getMonth()].toUpperCase()} DEL ${parsed.getFullYear()}`;
};

export const buildReportConsecutive = (reportNumber: string | null | undefined, year: number | null | undefined) =>
  [reportNumber, year].filter(Boolean).join("-");

export const excelTimeFraction = (time: string | null | undefined) => {
  if (!time) return null;
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return (hours * 60 + minutes) / 1440;
};

export const excelHoursFraction = (hours: number | null | undefined) =>
  typeof hours === "number" && Number.isFinite(hours) ? hours / 24 : null;

export const joinReportValues = (values: Array<string | null | undefined>) =>
  values.map((value) => value?.trim()).filter(Boolean).join(", ");

export const sanitizeExcelFileName = (value: string) =>
  value.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();

export const buildVehicleExcelFileName = (
  reportNumber: string | null | undefined,
  driverName: string | null | undefined,
) => {
  const numberPart = reportNumber?.trim() || "";
  const driverPart = driverName?.trim() || "";
  const baseName = ["Reporte de viaje #", numberPart, driverPart].filter(Boolean).join(" ");
  return `${sanitizeExcelFileName(baseName)}.xlsx`;
};

export const buildBoatExcelFileName = (
  reportNumber: string | null | undefined,
  captainName: string | null | undefined,
) => {
  const numberPart = reportNumber?.trim() || "";
  const captainPart = captainName?.trim() || "";
  const baseName = ["Reporte de viaje #", numberPart, captainPart].filter(Boolean).join(" ");
  return `${sanitizeExcelFileName(baseName)}.xlsx`;
};

const toOptionalNumber = (value: string | number | null | undefined) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const peopleByRole = (people: ReportPersonWithRoles[], roleNames: string[]) => {
  const roleSet = new Set(roleNames);
  return people
    .filter((person) => person.roles.some((role) => roleSet.has(role)))
    .map((person) => person.nombre);
};

const firstPersonByRole = (people: ReportPersonWithRoles[], roleNames: string[]) => {
  const roleSet = new Set(roleNames);
  return people.find((person) => person.roles.some((role) => roleSet.has(role)));
};

const getFirstSheetPath = (zip: Record<string, Uint8Array>) => {
  const sheetPath = Object.keys(zip)
    .filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path))
    .sort()[0];

  if (!sheetPath) {
    throw new Error("No se encontró una hoja en la plantilla Excel");
  }

  return sheetPath;
};

const getCellColumn = (cellRef: string) => cellRef.match(/[A-Z]+/)?.[0] || "";
const getCellRow = (cellRef: string) => Number(cellRef.match(/\d+/)?.[0] || 0);
const columnToNumber = (column: string) =>
  column.split("").reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0);

const compareCellRefs = (a: string, b: string) => {
  const rowDiff = getCellRow(a) - getCellRow(b);
  if (rowDiff !== 0) return rowDiff;
  return columnToNumber(getCellColumn(a)) - columnToNumber(getCellColumn(b));
};

const ensureCell = (document: XMLDocument, cellRef: string) => {
  const worksheet = document.documentElement;
  const sheetData = worksheet.getElementsByTagName("sheetData")[0];
  const rowNumber = getCellRow(cellRef);
  const existing = worksheet.querySelector(`c[r="${cellRef}"]`);
  if (existing) return existing;

  let row = Array.from(sheetData.getElementsByTagName("row")).find((item) => item.getAttribute("r") === String(rowNumber));
  if (!row) {
    row = document.createElementNS(worksheet.namespaceURI, "row");
    row.setAttribute("r", String(rowNumber));
    const rows = Array.from(sheetData.getElementsByTagName("row"));
    const beforeRow = rows.find((item) => Number(item.getAttribute("r")) > rowNumber);
    sheetData.insertBefore(row, beforeRow || null);
  }

  const cell = document.createElementNS(worksheet.namespaceURI, "c");
  cell.setAttribute("r", cellRef);
  const cells = Array.from(row.getElementsByTagName("c"));
  const beforeCell = cells.find((item) => compareCellRefs(item.getAttribute("r") || "", cellRef) > 0);
  row.insertBefore(cell, beforeCell || null);
  return cell;
};

const clearCellChildren = (cell: Element) => {
  while (cell.firstChild) {
    cell.removeChild(cell.firstChild);
  }
};

const setTextCell = (document: XMLDocument, cellRef: string, value: CellValue) => {
  const cell = ensureCell(document, cellRef);
  clearCellChildren(cell);
  cell.setAttribute("t", "inlineStr");

  const inlineString = document.createElementNS(document.documentElement.namespaceURI, "is");
  const text = document.createElementNS(document.documentElement.namespaceURI, "t");
  text.setAttribute("xml:space", "preserve");
  text.textContent = value == null ? "" : String(value);
  inlineString.appendChild(text);
  cell.appendChild(inlineString);
};

const setNumberCell = (document: XMLDocument, cellRef: string, value: number | null | undefined) => {
  const cell = ensureCell(document, cellRef);
  clearCellChildren(cell);
  cell.removeAttribute("t");
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return;
  }

  const node = document.createElementNS(document.documentElement.namespaceURI, "v");
  node.textContent = String(value);
  cell.appendChild(node);
};

export const patchXlsxTemplateBytes = (
  templateBytes: Uint8Array,
  patches: Record<string, CellValue>,
  numericPatches: Record<string, number | null | undefined>,
) => {
  const zip = unzipSync(templateBytes);
  const sheetPath = getFirstSheetPath(zip);
  const xml = strFromU8(zip[sheetPath]);
  const document = new DOMParser().parseFromString(xml, "application/xml");

  Object.entries(patches).forEach(([cellRef, value]) => setTextCell(document, cellRef, value));
  Object.entries(numericPatches).forEach(([cellRef, value]) => setNumberCell(document, cellRef, value));

  zip[sheetPath] = new Uint8Array(strToU8(new XMLSerializer().serializeToString(document)));
  return zipSync(zip);
};

const patchWorkbook = async (templatePath: string, patches: Record<string, CellValue>, numericPatches: Record<string, number | null | undefined>) => {
  const response = await fetch(templatePath);
  if (!response.ok) {
    throw new Error("No se pudo cargar la plantilla Excel");
  }

  return patchXlsxTemplateBytes(new Uint8Array(await response.arrayBuffer()), patches, numericPatches);
};

const downloadBytes = (bytes: Uint8Array, fileName: string) => {
  const blob = new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const loadReportExcelData = async <TReport extends VehicleReport | BoatReport>(
  tipo: ReportType,
  reportId: string,
): Promise<ReportExcelData<TReport>> => {
  const table = tipo === "vehiculo" ? "reportes_vehiculo" : "reportes_embarcacion";
  const { data: report, error: reportError } = await supabase.from(table).select("*").eq("id", reportId).single();
  if (reportError) throw reportError;

  const [
    { data: motivos, error: motivosError },
    { data: sitios, error: sitiosError },
    { data: inspectedBoats, error: inspectedBoatsError },
    peopleMap,
  ] = await Promise.all([
    supabase.from("reporte_motivos").select("*").eq("reporte_id", reportId).eq("tipo_reporte", tipo),
    supabase.from("reporte_sitios").select("*").eq("reporte_id", reportId),
    tipo === "embarcacion"
      ? supabase.from("reporte_embarcaciones_inspeccionadas").select("*").eq("reporte_id", reportId)
      : Promise.resolve({ data: [], error: null }),
    loadReportPeopleByIds([reportId], tipo),
  ]);

  if (motivosError) throw motivosError;
  if (sitiosError) throw sitiosError;
  if (inspectedBoatsError) throw inspectedBoatsError;

  return {
    report: report as TReport,
    people: peopleMap.get(reportId) || [],
    motivos: ((motivos || []) as MotivoRecord[]).map((motivo) => motivo.motivo),
    sitios: (sitios || []) as SitioRecord[],
    inspectedBoats: (inspectedBoats || []) as InspectedBoatRecord[],
  };
};

const buildVehiclePatches = ({ report, people, motivos, sitios }: ReportExcelData<VehicleReport>) => {
  const choferPerson = firstPersonByRole(people, ["chofer"]);
  const oficialPerson = firstPersonByRole(people, ["oficial"]);
  const chofer = choferPerson?.nombre || "";
  const oficial = oficialPerson?.nombre || "";
  const acompanantes = peopleByRole(people, ["acompañante", "acompanante"]);
  const sitePatches = Object.fromEntries(
    Array.from({ length: 13 }, (_, index) => {
      const row = 9 + index;
      const site = sitios[index];
      return [
        [`H${row}`, site?.zona || ""],
        [`I${row}`, site?.nombre_sitio || ""],
        [`L${row}`, site?.posicion || ""],
      ];
    }).flat(),
  );

  return {
    text: {
      B2: `REPORTE DE VIAJE DE VEHÍCULOS\nAño ${report.anio}`,
      H3: `Fecha: ${formatVehicleReportDate(report.fecha)}`,
      M3: `Consecutivo N°${buildReportConsecutive(report.no_reporte, report.anio)}`,
      B7: `REPORTE DE VIAJE No: ${report.no_reporte || ""}`,
      D7: `DESTINO: ${report.destino || ""}`,
      B9: `ESTACIÓN DE GUARDACOSTAS: ${report.estacion || ""}`,
      B11: `VEHICULO  SNG: ${report.vehiculo || ""}`,
      B12: `BITACORA: ${report.bitacora || ""}`,
      B13: `CHOFER: ${chofer}`,
      B15: `ACOMPAÑANTES: ${joinReportValues(acompanantes)}`,
      D12: `MOTIVO: ${joinReportValues(motivos)}`,
      B17: `NOVEDADES Y ACTIVIDADES DURANTE EL VIAJE: ${report.novedades || ""}`,
      C22: report.estacion_combustible || "",
      F22: report.lugar_combustible || "",
      I22: report.cedula_juridica_combustible || "",
      C25: chofer,
      C26: oficial,
      ...sitePatches,
    },
    numbers: {
      K5: excelTimeFraction(report.hora_salida),
      N5: excelTimeFraction(report.hora_regreso),
      B24: report.combustible_trasegado_bomba,
      C24: report.total_combustible_antes_viaje,
      D24: report.combustible_gastado,
      F24: report.saldo_combustible_despues_viaje,
      I24: report.kilometros_recorridos,
      L23: toOptionalNumber(report.no_factura),
      L25: toOptionalNumber(choferPerson?.cedula),
      L26: toOptionalNumber(oficialPerson?.cedula),
    },
  };
};

const buildBoatPatches = ({ report, people, motivos, sitios, inspectedBoats }: ReportExcelData<BoatReport>) => {
  const capitanPerson = firstPersonByRole(people, ["capitan"]);
  const encargadoPerson = firstPersonByRole(people, ["encargado_mision"]);
  const operacionalPerson = firstPersonByRole(people, ["operacional"]);
  const capitan = capitanPerson?.nombre || "";
  const encargado = encargadoPerson?.nombre || "";
  const operacional = operacionalPerson?.nombre || "";
  const tripulantes = peopleByRole(people, ["tripulante"]);
  const particulares = peopleByRole(people, ["particular", "persona_particular"]);
  const horasNavegadas = report.horas_navegadas ?? calcTotalHours(report.hora_salida || "", report.hora_regreso || "");
  const sitePatches = Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => {
      const row = 15 + index;
      const site = sitios[index];
      return [
        [`F${row}`, site?.nombre_sitio || ""],
        [`G${row}`, site?.zona || ""],
        [`H${row}`, site?.posicion || ""],
      ];
    }).flat(),
  );
  const inspectedBoatPatches = Object.fromEntries(
    Array.from({ length: 4 }, (_, index) => {
      const row = 26 + index;
      const item = inspectedBoats[index];
      return [
        [`F${row}`, item?.nombre || ""],
        [`G${row}`, item?.matricula || ""],
        [`H${row}`, item?.no_inspeccion || ""],
        [`I${row}`, item?.zona || ""],
      ];
    }).flat(),
  );

  return {
    text: {
      C2: report.estacion || "",
      E2: report.embarcacion || "",
      G2: report.bitacora || "",
      I2: report.folios || "",
      B4: `REPORTE VIAJE #: ${report.no_reporte || ""}     FECHA:`,
      C4: formatBoatReportDate(report.fecha),
      I4: buildReportConsecutive(report.no_reporte, report.anio),
      I5: report.no_cierre_os ? `N° ${report.no_cierre_os}` : "",
      C7: "",
      C8: report.destino || "",
      F8: joinReportValues(motivos),
      C9: joinReportValues([capitan, encargado, ...tripulantes]),
      C11: joinReportValues(particulares),
      B13: `NOVEDADES DURANTE EL VIAJE:  ${report.novedades || ""}`,
      B33: report.estacion_combustible || "",
      C33: report.cedula_juridica_combustible || "",
      D33: report.lugar_combustible || "",
      C35: encargado,
      C36: operacional,
      C37: capitan,
      C38: tripulantes[0] || "",
      I31: report.tipo_combustible || "",
      ...sitePatches,
      ...inspectedBoatPatches,
    },
    numbers: {
      C5: excelTimeFraction(report.hora_salida),
      E5: excelTimeFraction(report.hora_regreso),
      G5: excelHoursFraction(horasNavegadas),
      C6: excelHoursFraction(report.horas_motor_babor),
      E6: excelHoursFraction(report.horas_motor_centro),
      G6: excelHoursFraction(report.horas_motor_estribor),
      B31: report.saldo_anterior,
      C31: report.combustible_trasegado_bodega,
      D31: report.total_antes_viaje,
      E31: report.combustible_trasegado_durante,
      F31: report.combustible_gastado,
      H31: report.saldo_despues,
      H33: report.millas_nauticas,
      F33: toOptionalNumber(report.no_factura),
      H35: toOptionalNumber(encargadoPerson?.cedula),
      H36: toOptionalNumber(operacionalPerson?.cedula),
      H37: toOptionalNumber(capitanPerson?.cedula),
      H38: toOptionalNumber(firstPersonByRole(people, ["tripulante"])?.cedula),
    },
  };
};

export const buildReportExcelBytes = async (tipo: ReportType, reportId: string) => {
  if (tipo === "vehiculo") {
    const data = await loadReportExcelData<VehicleReport>(tipo, reportId);
    const patches = buildVehiclePatches(data);
    const chofer = firstPersonByRole(data.people, ["chofer"])?.nombre;
    return {
      bytes: await patchWorkbook(TEMPLATE_PATHS[tipo], patches.text, patches.numbers),
      fileName: buildVehicleExcelFileName(data.report.no_reporte, chofer),
    };
  }

  const data = await loadReportExcelData<BoatReport>(tipo, reportId);
  const patches = buildBoatPatches(data);
  const capitan = firstPersonByRole(data.people, ["capitan"])?.nombre;
  return {
    bytes: await patchWorkbook(TEMPLATE_PATHS[tipo], patches.text, patches.numbers),
    fileName: buildBoatExcelFileName(data.report.no_reporte, capitan),
  };
};

export const downloadReportExcel = async (tipo: ReportType, reportId: string) => {
  const { bytes, fileName } = await buildReportExcelBytes(tipo, reportId);
  downloadBytes(bytes, fileName);
};

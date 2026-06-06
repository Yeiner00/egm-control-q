import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { dateKeyToExcelSerial, buildPeriodDays, parseDateKey, type SquadType } from "@/lib/squadCalendar";
import { STATISTIC_AI_ROW_NUMBERS, isStatisticAiRowAllowed } from "@/lib/statisticAiRows";
import { yieldToMain } from "@/lib/scheduler";

export type StatisticReportType = "vehiculo" | "embarcacion";

export interface StatisticVehicleReport {
  id: string;
  fecha: string | null;
  no_reporte: string;
  vehiculo: string | null;
  hora_salida?: string | null;
  hora_regreso?: string | null;
  total_horas?: number | null;
  kilometros_recorridos: number | null;
  combustible_trasegado_bomba: number | null;
  combustible_gastado: number | null;
  novedades: string | null;
}

export interface StatisticBoatReport {
  id: string;
  fecha: string | null;
  no_reporte: string;
  embarcacion: string | null;
  hora_salida?: string | null;
  hora_regreso?: string | null;
  millas_nauticas: number | null;
  horas_navegadas: number | null;
  horas_motor_babor: number | null;
  horas_motor_centro: number | null;
  horas_motor_estribor: number | null;
  combustible_trasegado_bodega: number | null;
  combustible_gastado: number | null;
  novedades: string | null;
}

export interface StatisticMotiveRecord {
  reporte_id: string;
  tipo_reporte: StatisticReportType;
  motivo: string;
  motivo_key: string | null;
  motivo_original?: string | null;
}

export interface StatisticReportPersonRecord {
  reporte_id: string;
  tipo_reporte: StatisticReportType;
  nombre_normalizado: string;
  roles: string[];
}

export interface StatisticWorkbookAiCell {
  sheetName: string;
  date: string;
  row: number;
  value: number;
  source?: string;
}

export interface StatisticWorkbookInput {
  startDate: string;
  endDate: string;
  squad: SquadType;
  vehicleReports: StatisticVehicleReport[];
  boatReports: StatisticBoatReport[];
  motives?: StatisticMotiveRecord[];
  people?: StatisticReportPersonRecord[];
  aiCells?: StatisticWorkbookAiCell[];
}

export interface StatisticWorkbookSummary {
  usedReports: number;
  pendingReports: Array<{
    id: string;
    tipo: StatisticReportType;
    no_reporte: string;
    fecha: string | null;
    unidad: string | null;
    reason: "missing_unit" | "missing_sheet" | "missing_date";
  }>;
  pendingMotives: Array<{
    reporte_id: string;
    tipo_reporte: StatisticReportType;
    motivo: string;
    motivo_key: string;
  }>;
  omittedData: string[];
  sheetNames: string[];
}

type CellValue = string | number | null | undefined;
type ZipEntries = Record<string, Uint8Array>;
type CellPatchMap = Record<string, CellValue>;
interface SheetPatchContext {
  document: XMLDocument;
  worksheet: Element;
  sheetData: Element;
  rowsByNumber: Map<number, Element>;
  cellsByRef: Map<string, Element>;
}

const ESTACION_SHEET_NAME = "ESTACIÓN";
const IGNORED_SHEETS = new Set(["GLOSARIO", "ESTACIÓN", "HOJA1"]);
const DAY_COLUMNS = ["B", "C", "D", "E", "F", "G", "H", "I"];
const RESOURCE_ROWS = [10, 11, 12, 13, 14, 15, 16, 17, 18];
const HUMAN_HOURS_ROW = 24;
const PATROL_ROWS = [44, 46, 52, 53];
const VEHICLE_HUMAN_HOURS_ROLES = new Set(["chofer", "acompanante", "acompaa_ante"]);
const BOAT_HUMAN_HOURS_ROLES = new Set(["capitan", "encargado_mision", "tripulante"]);
const MOTIVE_ROW_BY_KEY: Record<string, number> = {
  "reafirmacion de soberania": 77,
  "control de narcotrafico": 78,
  "control migratorio": 80,
  "control migracion ilegal": 80,
  "control de contrabando": 81,
  "seguridad ciudadana": 93,
  "proteccion a banistas": 94,
  "proteccion de banistas": 94,
  "pesca ilegal": 95,
  "caceria ilegal": 96,
  "alteracion de humedales": 97,
  "proteccion de bosques": 99,
};
const AUTO_CLEAR_ROWS = [
  ...RESOURCE_ROWS,
  HUMAN_HOURS_ROW,
  ...PATROL_ROWS,
  ...Array.from(new Set(Object.values(MOTIVE_ROW_BY_KEY))),
  ...STATISTIC_AI_ROW_NUMBERS,
];
const OMITTED_DATA_ITEMS = [
  "Filas 26-41 de apoyo, proyeccion social y otras horas quedan vacias por falta de dato estructurado.",
  "Filas 45, 47-51 y 55-75 quedan vacias por falta de dato estructurado de patrullajes caminando, aereos, conjuntos y entidades participantes.",
  "Filas 108-277 no se llenan desde base; solo se completan con la respuesta JSON de IA pegada.",
];
const FILE_NAME_MONTHS = [
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

export const normalizeStatisticSheetKey = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const normalizeMotiveKey = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeRoleKey = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const parseTimeToMinutes = (value: string | null | undefined) => {
  const match = (value || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null;
  }

  return hours * 60 + minutes;
};

const calculateHoursBetween = (start: string | null | undefined, end: string | null | undefined) => {
  const startMinutes = parseTimeToMinutes(start);
  const endMinutes = parseTimeToMinutes(end);
  if (startMinutes == null || endMinutes == null) return null;

  let diff = endMinutes - startMinutes;
  if (diff < 0) diff += 24 * 60;
  return Math.round((diff / 60) * 100) / 100;
};

const toOptionalNumber = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const decimalHoursToExcelFraction = (value: number | null | undefined) => {
  const number = toOptionalNumber(value);
  return number == null ? null : number / 24;
};

const addNullable = (current: number | undefined, value: number | null | undefined) => {
  const number = toOptionalNumber(value);
  if (number == null) return current;
  return (current ?? 0) + number;
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

const parseXml = (xml: string) => new DOMParser().parseFromString(xml, "application/xml");

const serializeXml = (document: XMLDocument) => new XMLSerializer().serializeToString(document);

const buildSheetPatchContext = (document: XMLDocument): SheetPatchContext => {
  const worksheet = document.documentElement;
  const sheetData = worksheet.getElementsByTagName("sheetData")[0];
  const rows = Array.from(sheetData.getElementsByTagName("row"));
  const rowsByNumber = new Map(rows.map((row) => [Number(row.getAttribute("r")), row]));
  const cellsByRef = new Map(
    rows
      .flatMap((row) => Array.from(row.getElementsByTagName("c")))
      .map((cell) => [cell.getAttribute("r") || "", cell]),
  );

  return { document, worksheet, sheetData, rowsByNumber, cellsByRef };
};

const ensureCell = (context: SheetPatchContext, cellRef: string) => {
  const { document, worksheet, sheetData, rowsByNumber, cellsByRef } = context;
  const rowNumber = getCellRow(cellRef);
  const existing = cellsByRef.get(cellRef);
  if (existing) return existing;

  let row = rowsByNumber.get(rowNumber);
  if (!row) {
    row = document.createElementNS(worksheet.namespaceURI, "row");
    row.setAttribute("r", String(rowNumber));
    const beforeRow = Array.from(rowsByNumber.entries())
      .sort(([a], [b]) => a - b)
      .find(([number]) => number > rowNumber)?.[1];
    sheetData.insertBefore(row, beforeRow || null);
    rowsByNumber.set(rowNumber, row);
  }

  const cell = document.createElementNS(worksheet.namespaceURI, "c");
  cell.setAttribute("r", cellRef);
  const cells = Array.from(row.getElementsByTagName("c"));
  const beforeCell = cells.find((item) => compareCellRefs(item.getAttribute("r") || "", cellRef) > 0);
  row.insertBefore(cell, beforeCell || null);
  cellsByRef.set(cellRef, cell);
  return cell;
};

const clearCellChildren = (cell: Element) => {
  while (cell.firstChild) {
    cell.removeChild(cell.firstChild);
  }
};

const clearCell = (context: SheetPatchContext, cellRef: string) => {
  const cell = ensureCell(context, cellRef);
  clearCellChildren(cell);
  cell.removeAttribute("t");
};

const setTextCell = (context: SheetPatchContext, cellRef: string, value: CellValue) => {
  if (value == null || value === "") {
    clearCell(context, cellRef);
    return;
  }

  const cell = ensureCell(context, cellRef);
  clearCellChildren(cell);
  cell.setAttribute("t", "inlineStr");

  const inlineString = context.document.createElementNS(context.document.documentElement.namespaceURI, "is");
  const text = context.document.createElementNS(context.document.documentElement.namespaceURI, "t");
  text.setAttribute("xml:space", "preserve");
  text.textContent = String(value);
  inlineString.appendChild(text);
  cell.appendChild(inlineString);
};

const setNumberCell = (context: SheetPatchContext, cellRef: string, value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) {
    clearCell(context, cellRef);
    return;
  }

  const cell = ensureCell(context, cellRef);
  clearCellChildren(cell);
  cell.removeAttribute("t");

  const node = context.document.createElementNS(context.document.documentElement.namespaceURI, "v");
  node.textContent = String(value);
  cell.appendChild(node);
};

const getWorkbookSheets = (zip: ZipEntries) => {
  const workbook = parseXml(strFromU8(zip["xl/workbook.xml"]));
  const rels = parseXml(strFromU8(zip["xl/_rels/workbook.xml.rels"]));
  const relTargetById = new Map(
    Array.from(rels.getElementsByTagName("Relationship")).map((relationship) => [
      relationship.getAttribute("Id") || "",
      relationship.getAttribute("Target") || "",
    ]),
  );

  return Array.from(workbook.getElementsByTagName("sheet")).map((sheet) => {
    const relationshipId = sheet.getAttribute("r:id") || "";
    const target = relTargetById.get(relationshipId) || "";
    const normalizedTarget = target.startsWith("/") ? target.slice(1) : `xl/${target}`;

    return {
      name: sheet.getAttribute("name") || "",
      path: normalizedTarget.replace(/\\/g, "/"),
    };
  });
};

const markWorkbookForRecalculation = (zip: ZipEntries) => {
  const document = parseXml(strFromU8(zip["xl/workbook.xml"]));
  let calcPr = document.getElementsByTagName("calcPr")[0];

  if (!calcPr) {
    calcPr = document.createElementNS(document.documentElement.namespaceURI, "calcPr");
    document.documentElement.appendChild(calcPr);
  }

  calcPr.setAttribute("calcMode", "auto");
  calcPr.setAttribute("fullCalcOnLoad", "1");
  calcPr.setAttribute("forceFullCalc", "1");
  zip["xl/workbook.xml"] = new Uint8Array(strToU8(serializeXml(document)));
};

const applySheetPatches = (zip: ZipEntries, sheetPath: string, textPatches: CellPatchMap, numberPatches: CellPatchMap) => {
  const document = parseXml(strFromU8(zip[sheetPath]));
  const context = buildSheetPatchContext(document);

  Object.entries(textPatches).forEach(([cellRef, value]) => setTextCell(context, cellRef, value));
  Object.entries(numberPatches).forEach(([cellRef, value]) => setNumberCell(context, cellRef, value as number | null | undefined));

  zip[sheetPath] = new Uint8Array(strToU8(serializeXml(document)));
};

const buildBlankUnitPatches = () => {
  const text: CellPatchMap = {};
  const numbers: CellPatchMap = {};

  DAY_COLUMNS.forEach((column) => {
    text[`${column}7`] = "";
    AUTO_CLEAR_ROWS.forEach((row) => {
      numbers[`${column}${row}`] = null;
    });
  });

  return { text, numbers };
};

interface SheetAccumulator {
  reportNumbers: Record<string, string[]>;
  numbers: Record<string, number | undefined>;
}

interface MappedReportContext {
  column: string;
  sheetName: string;
}

const getOrCreateAccumulator = (map: Map<string, SheetAccumulator>, sheetName: string) => {
  const current = map.get(sheetName);
  if (current) return current;

  const next: SheetAccumulator = { reportNumbers: {}, numbers: {} };
  map.set(sheetName, next);
  return next;
};

const addReportNumber = (accumulator: SheetAccumulator, column: string, reportNumber: string) => {
  accumulator.reportNumbers[column] = accumulator.reportNumbers[column] || [];
  if (reportNumber && !accumulator.reportNumbers[column].includes(reportNumber)) {
    accumulator.reportNumbers[column].push(reportNumber);
  }
};

const buildPeopleByReport = (people: StatisticReportPersonRecord[] = []) => {
  const map = new Map<string, StatisticReportPersonRecord[]>();
  people.forEach((person) => {
    const current = map.get(person.reporte_id) || [];
    current.push(person);
    map.set(person.reporte_id, current);
  });
  return map;
};

const countOperationalPeople = (people: StatisticReportPersonRecord[] | undefined, allowedRoles: Set<string>) => {
  const names = new Set<string>();

  (people || []).forEach((person) => {
    const hasOperationalRole = person.roles
      .map(normalizeRoleKey)
      .some((role) => allowedRoles.has(role));

    const normalizedName = person.nombre_normalizado?.trim();
    if (hasOperationalRole && normalizedName) {
      names.add(normalizedName);
    }
  });

  return names.size;
};

const calculateVehicleHumanHours = (
  report: StatisticVehicleReport,
  peopleByReport: Map<string, StatisticReportPersonRecord[]>,
) => {
  const durationHours = toOptionalNumber(report.total_horas) ?? calculateHoursBetween(report.hora_salida, report.hora_regreso);
  const operationalPeople = countOperationalPeople(peopleByReport.get(report.id), VEHICLE_HUMAN_HOURS_ROLES);

  return durationHours == null || operationalPeople === 0 ? null : durationHours * operationalPeople;
};

const calculateBoatHumanHours = (
  report: StatisticBoatReport,
  peopleByReport: Map<string, StatisticReportPersonRecord[]>,
) => {
  const durationHours = toOptionalNumber(report.horas_navegadas) ?? calculateHoursBetween(report.hora_salida, report.hora_regreso);
  const operationalPeople = countOperationalPeople(peopleByReport.get(report.id), BOAT_HUMAN_HOURS_ROLES);

  return durationHours == null || operationalPeople === 0 ? null : durationHours * operationalPeople;
};

const buildSheetPatches = (accumulator: SheetAccumulator) => {
  const patches = buildBlankUnitPatches();

  DAY_COLUMNS.forEach((column) => {
    patches.text[`${column}7`] = (accumulator.reportNumbers[column] || []).join("/");
    AUTO_CLEAR_ROWS.forEach((row) => {
      patches.numbers[`${column}${row}`] = accumulator.numbers[`${column}${row}`] ?? null;
    });
  });

  return patches;
};

const buildWorkbookPatches = async (input: StatisticWorkbookInput, sheetNames: string[]) => {
  const dayColumnsByDate = new Map(buildPeriodDays(input.startDate).map((date, index) => [date, DAY_COLUMNS[index]]));
  const sheetNameByKey = new Map(
    sheetNames
      .filter((name) => !IGNORED_SHEETS.has(name.trim().toUpperCase()))
      .map((name) => [normalizeStatisticSheetKey(name), name]),
  );
  const accumulators = new Map<string, SheetAccumulator>();
  const mappedReports = new Map<string, MappedReportContext>();
  const peopleByReport = buildPeopleByReport(input.people);
  const pendingReports: StatisticWorkbookSummary["pendingReports"] = [];
  const pendingMotivesByKey = new Map<string, StatisticWorkbookSummary["pendingMotives"][number]>();
  let usedReports = 0;

  let deadline = performance.now() + 50;
  for (const report of input.vehicleReports) {
    const column = report.fecha ? dayColumnsByDate.get(report.fecha) : undefined;
    const sheetName = sheetNameByKey.get(normalizeStatisticSheetKey(report.vehiculo));

    if (!column) {
      pendingReports.push({ id: report.id, tipo: "vehiculo", no_reporte: report.no_reporte, fecha: report.fecha, unidad: report.vehiculo, reason: "missing_date" });
      if (performance.now() >= deadline) { await yieldToMain(); deadline = performance.now() + 50; }
      continue;
    }

    if (!report.vehiculo?.trim()) {
      pendingReports.push({ id: report.id, tipo: "vehiculo", no_reporte: report.no_reporte, fecha: report.fecha, unidad: report.vehiculo, reason: "missing_unit" });
      if (performance.now() >= deadline) { await yieldToMain(); deadline = performance.now() + 50; }
      continue;
    }

    if (!sheetName) {
      pendingReports.push({ id: report.id, tipo: "vehiculo", no_reporte: report.no_reporte, fecha: report.fecha, unidad: report.vehiculo, reason: "missing_sheet" });
      if (performance.now() >= deadline) { await yieldToMain(); deadline = performance.now() + 50; }
      continue;
    }

    const accumulator = getOrCreateAccumulator(accumulators, sheetName);
    addReportNumber(accumulator, column, report.no_reporte);
    accumulator.numbers[`${column}11`] = addNullable(accumulator.numbers[`${column}11`], report.kilometros_recorridos);
    accumulator.numbers[`${column}17`] = addNullable(accumulator.numbers[`${column}17`], report.combustible_trasegado_bomba);
    accumulator.numbers[`${column}18`] = addNullable(accumulator.numbers[`${column}18`], report.combustible_gastado);
    accumulator.numbers[`${column}${HUMAN_HOURS_ROW}`] = addNullable(
      accumulator.numbers[`${column}${HUMAN_HOURS_ROW}`],
      decimalHoursToExcelFraction(calculateVehicleHumanHours(report, peopleByReport)),
    );
    accumulator.numbers[`${column}44`] = addNullable(accumulator.numbers[`${column}44`], 1);
    accumulator.numbers[`${column}52`] = addNullable(accumulator.numbers[`${column}52`], 1);
    accumulator.numbers[`${column}53`] = addNullable(accumulator.numbers[`${column}53`], 1);
    mappedReports.set(report.id, { column, sheetName });
    usedReports += 1;
    if (performance.now() >= deadline) { await yieldToMain(); deadline = performance.now() + 50; }
  }

  for (const report of input.boatReports) {
    const column = report.fecha ? dayColumnsByDate.get(report.fecha) : undefined;
    const sheetName = sheetNameByKey.get(normalizeStatisticSheetKey(report.embarcacion));

    if (!column) {
      pendingReports.push({ id: report.id, tipo: "embarcacion", no_reporte: report.no_reporte, fecha: report.fecha, unidad: report.embarcacion, reason: "missing_date" });
      if (performance.now() >= deadline) { await yieldToMain(); deadline = performance.now() + 50; }
      continue;
    }

    if (!report.embarcacion?.trim()) {
      pendingReports.push({ id: report.id, tipo: "embarcacion", no_reporte: report.no_reporte, fecha: report.fecha, unidad: report.embarcacion, reason: "missing_unit" });
      if (performance.now() >= deadline) { await yieldToMain(); deadline = performance.now() + 50; }
      continue;
    }

    if (!sheetName) {
      pendingReports.push({ id: report.id, tipo: "embarcacion", no_reporte: report.no_reporte, fecha: report.fecha, unidad: report.embarcacion, reason: "missing_sheet" });
      if (performance.now() >= deadline) { await yieldToMain(); deadline = performance.now() + 50; }
      continue;
    }

    const motorHours = [report.horas_motor_babor, report.horas_motor_centro, report.horas_motor_estribor]
      .reduce((total, value) => addNullable(total, value), undefined as number | undefined);
    const accumulator = getOrCreateAccumulator(accumulators, sheetName);

    addReportNumber(accumulator, column, report.no_reporte);
    accumulator.numbers[`${column}10`] = addNullable(accumulator.numbers[`${column}10`], report.millas_nauticas);
    accumulator.numbers[`${column}13`] = addNullable(accumulator.numbers[`${column}13`], decimalHoursToExcelFraction(report.horas_navegadas));
    accumulator.numbers[`${column}14`] = addNullable(accumulator.numbers[`${column}14`], decimalHoursToExcelFraction(motorHours));
    accumulator.numbers[`${column}15`] = addNullable(accumulator.numbers[`${column}15`], report.combustible_trasegado_bodega);
    accumulator.numbers[`${column}16`] = addNullable(accumulator.numbers[`${column}16`], report.combustible_gastado);
    accumulator.numbers[`${column}${HUMAN_HOURS_ROW}`] = addNullable(
      accumulator.numbers[`${column}${HUMAN_HOURS_ROW}`],
      decimalHoursToExcelFraction(calculateBoatHumanHours(report, peopleByReport)),
    );
    accumulator.numbers[`${column}46`] = addNullable(accumulator.numbers[`${column}46`], 1);
    accumulator.numbers[`${column}52`] = addNullable(accumulator.numbers[`${column}52`], 1);
    accumulator.numbers[`${column}53`] = addNullable(accumulator.numbers[`${column}53`], 1);
    mappedReports.set(report.id, { column, sheetName });
    usedReports += 1;
    if (performance.now() >= deadline) { await yieldToMain(); deadline = performance.now() + 50; }
  }

  (input.motives || []).forEach((motive) => {
    const reportContext = mappedReports.get(motive.reporte_id);
    if (!reportContext) return;

    const motiveKey = normalizeMotiveKey(motive.motivo_key || motive.motivo);
    const row = MOTIVE_ROW_BY_KEY[motiveKey];
    if (!row) {
      const pendingKey = `${motive.reporte_id}:${motiveKey}`;
      if (motiveKey && !pendingMotivesByKey.has(pendingKey)) {
        pendingMotivesByKey.set(pendingKey, {
          reporte_id: motive.reporte_id,
          tipo_reporte: motive.tipo_reporte,
          motivo: motive.motivo,
          motivo_key: motiveKey,
        });
      }
      return;
    }

    const accumulator = getOrCreateAccumulator(accumulators, reportContext.sheetName);
    accumulator.numbers[`${reportContext.column}${row}`] = addNullable(
      accumulator.numbers[`${reportContext.column}${row}`],
      1,
    );
  });

  (input.aiCells || []).forEach((cell) => {
    const column = dayColumnsByDate.get(cell.date);
    const sheetName = sheetNameByKey.get(normalizeStatisticSheetKey(cell.sheetName));

    if (!column || !sheetName || !isStatisticAiRowAllowed(cell.row)) return;

    const accumulator = getOrCreateAccumulator(accumulators, sheetName);
    accumulator.numbers[`${column}${cell.row}`] = addNullable(
      accumulator.numbers[`${column}${cell.row}`],
      cell.value,
    );
  });

  return {
    accumulators,
    pendingReports,
    pendingMotives: Array.from(pendingMotivesByKey.values()),
    usedReports,
    sheetNames: Array.from(sheetNameByKey.values()),
  };
};

export const patchStatisticWorkbookBytes = async (templateBytes: Uint8Array, input: StatisticWorkbookInput) => {
  const zip = unzipSync(templateBytes);
  const sheets = getWorkbookSheets(zip);
  const stationSheet = sheets.find((sheet) => sheet.name === ESTACION_SHEET_NAME);

  if (!stationSheet) {
    throw new Error("No se encontro la hoja ESTACIÓN en la plantilla de estadistica");
  }

  const patchResult = await buildWorkbookPatches(input, sheets.map((sheet) => sheet.name));
  const stationStartSerial = dateKeyToExcelSerial(input.startDate);
  const stationEndSerial = dateKeyToExcelSerial(input.endDate);

  applySheetPatches(zip, stationSheet.path, {}, { D5: stationStartSerial, I5: stationEndSerial });

  sheets
    .filter((sheet) => patchResult.sheetNames.includes(sheet.name))
    .forEach((sheet) => {
      const patches = buildSheetPatches(patchResult.accumulators.get(sheet.name) || { reportNumbers: {}, numbers: {} });
      patches.numbers.B5 = stationStartSerial;
      patches.numbers.G5 = stationEndSerial;
      applySheetPatches(zip, sheet.path, patches.text, patches.numbers);
    });

  markWorkbookForRecalculation(zip);

  return {
    bytes: zipSync(zip),
    summary: {
      usedReports: patchResult.usedReports,
      pendingReports: patchResult.pendingReports,
      pendingMotives: patchResult.pendingMotives,
      omittedData: OMITTED_DATA_ITEMS,
      sheetNames: patchResult.sheetNames,
    } satisfies StatisticWorkbookSummary,
  };
};

const capitalizeSquad = (squad: SquadType) => squad.charAt(0).toUpperCase() + squad.slice(1);

const sanitizeFileName = (value: string) =>
  value.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();

export const buildStatisticFileName = (squad: SquadType, startDate: string, endDate: string) => {
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = FILE_NAME_MONTHS[start.getMonth()];
  const endMonth = FILE_NAME_MONTHS[end.getMonth()];
  const startYear = start.getFullYear();
  const endYear = end.getFullYear();
  const squadLabel = capitalizeSquad(squad);

  if (startYear !== endYear) {
    return sanitizeFileName(
      `Estadistica del ${startDay} de ${startMonth} ${startYear} al ${endDay} de ${endMonth} ${endYear} Esc ${squadLabel}.xlsx`,
    );
  }

  if (startMonth !== endMonth) {
    return sanitizeFileName(
      `Estadistica del ${startDay} de ${startMonth} al ${endDay} de ${endMonth} ${startYear} Esc ${squadLabel}.xlsx`,
    );
  }

  return sanitizeFileName(
    `Estadistica del ${startDay} al ${endDay} de ${startMonth} ${startYear} Esc ${squadLabel}.xlsx`,
  );
};

export const downloadBytes = (bytes: Uint8Array, fileName: string) => {
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

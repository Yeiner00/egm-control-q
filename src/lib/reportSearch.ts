import { normalizeReportNumber } from "./reportNumber";

export type SearchableReportOption = {
  no_reporte: string | number | null;
  fecha?: string | null;
  unidad?: string | null;
};

const normalizeText = (value: string | number | null | undefined): string =>
  String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const digitsOnly = (value: string | number | null | undefined): string =>
  String(value ?? "").replace(/\D/g, "");

export const matchesReportSearch = (report: SearchableReportOption, search: string): boolean => {
  const normalizedSearch = normalizeText(search);
  if (!normalizedSearch) return true;

  const searchDigits = digitsOnly(search);
  const hasLetters = /[a-zA-ZÀ-ž]/.test(search);
  if (searchDigits && !hasLetters) {
    const normalizedReportNumber = normalizeReportNumber(report.no_reporte);
    const reportDigits = digitsOnly(report.no_reporte);
    const normalizedSearchNumber = normalizeReportNumber(searchDigits);

    return normalizedReportNumber === normalizedSearchNumber || reportDigits.includes(searchDigits);
  }

  return [report.no_reporte, report.unidad, report.fecha]
    .map(normalizeText)
    .some((value) => value.includes(normalizedSearch));
};

export const filterReportOptions = <T extends SearchableReportOption>(reports: T[], search: string): T[] =>
  reports.filter((report) => matchesReportSearch(report, search));

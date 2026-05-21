export type ReportMonthRange = {
  endDateExclusive: string;
  month: number;
  startDate: string;
};

const toDateKey = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

export const buildReportMonthRanges = (year: number, monthValues: string[]) =>
  Array.from(
    new Set(
      monthValues
        .map((value) => Number(value))
        .filter((month) => Number.isInteger(month) && month >= 1 && month <= 12),
    ),
  )
    .sort((a, b) => a - b)
    .map<ReportMonthRange>((month) => ({
      month,
      startDate: toDateKey(year, month, 1),
      endDateExclusive: month === 12 ? toDateKey(year + 1, 1, 1) : toDateKey(year, month + 1, 1),
    }));

export const getReportMonthBounds = (ranges: ReportMonthRange[]) => {
  if (ranges.length === 0) return null;
  return {
    startDate: ranges[0].startDate,
    endDateExclusive: ranges[ranges.length - 1].endDateExclusive,
  };
};

export const isDateInReportMonthRanges = (date: string | null | undefined, ranges: ReportMonthRange[]) =>
  !!date && ranges.some((range) => date >= range.startDate && date < range.endDateExclusive);

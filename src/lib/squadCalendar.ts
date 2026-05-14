export type SquadType = "alfa" | "bravo";

export interface SquadPeriod {
  squad: SquadType;
  startDate: string;
  endDate: string;
}

const FULL_CYCLE_LENGTH = 16;
const ALFA_BLOCK_LENGTH = 8;
const SHIFT_ANCHOR = new Date(2026, 0, 27);

export const stripTime = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

export const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const parseDateKey = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const getSquadType = (date: Date): SquadType => {
  const targetDate = stripTime(date);
  const anchorDate = stripTime(SHIFT_ANCHOR);
  const diffInDays = Math.floor((targetDate.getTime() - anchorDate.getTime()) / 86_400_000);
  const cycleIndex = ((diffInDays % FULL_CYCLE_LENGTH) + FULL_CYCLE_LENGTH) % FULL_CYCLE_LENGTH;

  return cycleIndex < ALFA_BLOCK_LENGTH ? "alfa" : "bravo";
};

export const buildPeriodDays = (startDate: string) =>
  Array.from({ length: ALFA_BLOCK_LENGTH }, (_, index) => toDateKey(addDays(parseDateKey(startDate), index)));

export const dateKeyCompare = (left: string, right: string) => left.localeCompare(right);

export const isDateKeyWithinPeriod = (dateKey: string, period: SquadPeriod) =>
  dateKeyCompare(period.startDate, dateKey) <= 0 && dateKeyCompare(dateKey, period.endDate) <= 0;

export const buildSquadPeriodsForYear = (year: number, squad: SquadType): SquadPeriod[] => {
  const periods: SquadPeriod[] = [];
  const cursor = new Date(year, 0, 1);
  const lastDay = new Date(year, 11, 31);

  while (cursor <= lastDay) {
    const currentSquad = getSquadType(cursor);
    const previousSquad = getSquadType(addDays(cursor, -1));

    if (currentSquad === squad && previousSquad !== squad) {
      const startDate = toDateKey(cursor);
      periods.push({
        squad,
        startDate,
        endDate: toDateKey(addDays(cursor, ALFA_BLOCK_LENGTH - 1)),
      });
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return periods;
};

export const buildSquadPeriodsOverlappingYear = (year: number, squad: SquadType): SquadPeriod[] => {
  const yearStart = toDateKey(new Date(year, 0, 1));
  const yearEnd = toDateKey(new Date(year, 11, 31));
  const byStartDate = new Map<string, SquadPeriod>();

  [year - 1, year, year + 1].forEach((targetYear) => {
    buildSquadPeriodsForYear(targetYear, squad).forEach((period) => {
      const overlapsYear = dateKeyCompare(period.startDate, yearEnd) <= 0 && dateKeyCompare(period.endDate, yearStart) >= 0;
      if (overlapsYear) byStartDate.set(period.startDate, period);
    });
  });

  return Array.from(byStartDate.values()).sort((a, b) => dateKeyCompare(a.startDate, b.startDate));
};

export const getSquadPeriodForDate = (date: Date, squad: SquadType = getSquadType(date)) => {
  const dateKey = toDateKey(date);
  const year = date.getFullYear();
  return buildSquadPeriodsOverlappingYear(year, squad).find((period) => isDateKeyWithinPeriod(dateKey, period)) || null;
};

export const dateKeyToExcelSerial = (value: string) => {
  const date = parseDateKey(value);
  const epoch = Date.UTC(1899, 11, 30);
  const utcDate = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((utcDate - epoch) / 86_400_000);
};

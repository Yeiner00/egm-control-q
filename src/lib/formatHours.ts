/**
 * Convert decimal hours to hh:mm format
 * e.g. 0.83 → "0:50", 1.5 → "1:30", null → "—"
 */
export const decimalToHHMM = (val: number | null | undefined): string => {
  if (val == null) return "—";
  const h = Math.floor(val);
  const m = Math.round((val - h) * 60);
  return `${h}:${m.toString().padStart(2, "0")}`;
};

/**
 * Sum decimal hours and return hh:mm
 */
export const sumHoursToHHMM = (values: (number | null | undefined)[]): string => {
  const total = values.reduce((s: number, v) => s + (v || 0), 0);
  return decimalToHHMM(total);
};

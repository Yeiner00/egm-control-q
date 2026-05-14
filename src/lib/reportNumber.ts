export const normalizeReportNumber = (raw: string | number | null | undefined): string => {
  const value = String(raw ?? "").trim();
  const match = value.match(/\d+/);
  if (!match) return "";

  return match[0].padStart(4, "0");
};

export const normalizeReportUnit = (raw: string | null | undefined): string =>
  String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();


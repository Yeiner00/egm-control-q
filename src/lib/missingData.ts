export const isEmptyReportValue = (value: unknown): boolean => {
  if (value == null) return true;

  if (typeof value === "string") return value.trim().length === 0;

  if (typeof value === "number") return Number.isNaN(value);

  if (Array.isArray(value)) {
    return value.length === 0 || value.every((item) => isEmptyReportValue(item));
  }

  if (typeof value === "object") {
    const entries = Object.values(value as Record<string, unknown>);
    return entries.length === 0 || entries.every((entry) => isEmptyReportValue(entry));
  }

  return false;
};

export const hasEmptyReportValue = (values: unknown[]): boolean =>
  values.some((value) => isEmptyReportValue(value));

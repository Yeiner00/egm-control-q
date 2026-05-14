let xlsxModulePromise: Promise<typeof import("xlsx")> | null = null;

export const loadXlsx = () => {
  if (!xlsxModulePromise) {
    xlsxModulePromise = import("xlsx");
  }
  return xlsxModulePromise;
};

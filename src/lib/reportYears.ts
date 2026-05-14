import { supabase } from "@/integrations/supabase/client";

type ReportYearTable = "reportes_vehiculo" | "reportes_embarcacion";

export const loadAvailableReportYears = async (table: ReportYearTable) => {
  const { data, error } = await supabase.from(table).select("anio").not("anio", "is", null);
  if (error) throw error;

  return Array.from(
    new Set(
      (data || [])
        .map((row) => row.anio)
        .filter((year): year is number => typeof year === "number"),
    ),
  )
    .sort((a, b) => b - a)
    .map(String);
};

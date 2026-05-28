import { supabase } from "@/integrations/supabase/client";
import { normalizeCatalogValue } from "@/lib/reportImportCatalogMatching";
import { normalizeImportText } from "@/lib/reportImportMatching";
import {
  reportImportDraftSchema,
  type ReportImportAliasSuggestion,
  type ReportImportCatalogSuggestion,
  type ReportImportCatalogSuggestionAction,
  type ReportImportCatalogType,
  type ReportImportDraft,
  type ReportImportField,
  type ReportImportPersonSuggestion,
  type ReportImportType,
} from "@/lib/reportImportSchema";

const parseApiJson = async (response: Response) => {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    const looksLikeViteModule = text.includes("import ") && text.includes("reportImport");
    throw new Error(
      looksLikeViteModule
        ? "El endpoint V2 no esta activo en el servidor local. Reinicie npm run dev para cargar la ruta /api/report-imports."
        : "El importador V2 no devolvio una respuesta JSON valida.",
    );
  }
  return response.json();
};

export const uploadReportImportFile = async (file: File): Promise<ReportImportDraft> => {
  const { data: sessionData, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Debe iniciar sesion para importar reportes");

  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/report-imports", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  const payload = await parseApiJson(response).catch((parseError) => {
    if (response.ok) throw parseError;
    return null;
  });
  if (!response.ok) {
    throw new Error(payload?.error || "No se pudo importar el reporte");
  }
  if (!payload?.data) {
    throw new Error("El importador V2 respondio sin datos de reporte");
  }

  return reportImportDraftSchema.parse(payload.data);
};

export interface PersistReportImportCatalogDecisionInput {
  catalogType: ReportImportCatalogType;
  rawValue: string;
  finalValue: string | null;
  action: ReportImportCatalogSuggestionAction;
  catalogItemId?: string | null;
  zona?: string | null;
  posicion?: string | null;
}

export interface PersistReportImportCatalogDecisionResult {
  catalogItemId: string | null;
  catalogLabel: string | null;
  aliasSaved: boolean;
}

interface CatalogItemRecord {
  id: string;
  label: string;
  active: boolean;
}

const currentUserId = async () => {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id || null;
};

const isUniqueViolation = (error: { code?: string; message?: string } | null | undefined) => {
  const message = error?.message?.toLowerCase() || "";
  return error?.code === "23505" || message.includes("duplicate") || message.includes("unique");
};

const findCatalogItemById = async (
  catalogType: ReportImportCatalogType,
  id: string | null | undefined,
): Promise<CatalogItemRecord | null> => {
  if (!id) return null;

  if (catalogType === "motive") {
    const { data, error } = await supabase
      .from("report_motive_catalog")
      .select("id,motivo,active")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, label: data.motivo, active: data.active } : null;
  }

  const { data, error } = await supabase
    .from("report_site_catalog")
    .select("id,nombre_sitio,active")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, label: data.nombre_sitio, active: data.active } : null;
};

const findCatalogItemByKey = async (
  catalogType: ReportImportCatalogType,
  key: string,
): Promise<CatalogItemRecord | null> => {
  if (!key) return null;

  if (catalogType === "motive") {
    const { data, error } = await supabase
      .from("report_motive_catalog")
      .select("id,motivo,active")
      .eq("motivo_key", key)
      .maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, label: data.motivo, active: data.active } : null;
  }

  const { data, error } = await supabase
    .from("report_site_catalog")
    .select("id,nombre_sitio,active")
    .eq("site_key", key)
    .maybeSingle();
  if (error) throw error;
  return data ? { id: data.id, label: data.nombre_sitio, active: data.active } : null;
};

const activateCatalogItem = async (
  catalogType: ReportImportCatalogType,
  item: CatalogItemRecord,
) => {
  if (item.active) return item;

  const request = catalogType === "motive"
    ? supabase.from("report_motive_catalog").update({ active: true }).eq("id", item.id)
    : supabase.from("report_site_catalog").update({ active: true }).eq("id", item.id);
  const { error } = await request;
  if (error) throw error;
  return { ...item, active: true };
};

const createCatalogItem = async (
  input: PersistReportImportCatalogDecisionInput,
  label: string,
  key: string,
): Promise<CatalogItemRecord> => {
  const userId = await currentUserId();

  if (input.catalogType === "motive") {
    const { data, error } = await supabase
      .from("report_motive_catalog")
      .insert({
        motivo: label,
        motivo_key: key,
        active: true,
        created_by: userId,
      })
      .select("id,motivo,active")
      .maybeSingle();

    if (error) {
      if (isUniqueViolation(error)) {
        const existing = await findCatalogItemByKey(input.catalogType, key);
        if (existing) return activateCatalogItem(input.catalogType, existing);
      }
      throw error;
    }
    if (!data) throw new Error("No se pudo guardar el motivo en el catalogo");
    return { id: data.id, label: data.motivo, active: data.active };
  }

  const { data, error } = await supabase
    .from("report_site_catalog")
    .insert({
      nombre_sitio: label,
      site_key: key,
      zona: input.zona?.trim() || null,
      posicion: input.posicion?.trim() || null,
      active: true,
      created_by: userId,
    })
    .select("id,nombre_sitio,active")
    .maybeSingle();

  if (error) {
    if (isUniqueViolation(error)) {
      const existing = await findCatalogItemByKey(input.catalogType, key);
      if (existing) return activateCatalogItem(input.catalogType, existing);
    }
    throw error;
  }
  if (!data) throw new Error("No se pudo guardar el sitio en el catalogo");
  return { id: data.id, label: data.nombre_sitio, active: data.active };
};

const findOrCreateCatalogItem = async (
  input: PersistReportImportCatalogDecisionInput,
): Promise<CatalogItemRecord | null> => {
  const label = String(input.action === "created_new" ? input.rawValue : input.finalValue || input.rawValue).trim();
  const key = normalizeCatalogValue(input.catalogType, label);
  if (!label || !key) return null;

  const byId = await findCatalogItemById(input.catalogType, input.catalogItemId);
  if (byId) return activateCatalogItem(input.catalogType, byId);

  const byKey = await findCatalogItemByKey(input.catalogType, key);
  if (byKey) return activateCatalogItem(input.catalogType, byKey);

  return createCatalogItem(input, label, key);
};

const ensureCatalogAlias = async (
  input: PersistReportImportCatalogDecisionInput,
  catalogItem: CatalogItemRecord,
) => {
  const rawAlias = input.rawValue.trim();
  const aliasKey = normalizeCatalogValue(input.catalogType, rawAlias);
  const itemKey = normalizeCatalogValue(input.catalogType, catalogItem.label);
  if (!rawAlias || !aliasKey || aliasKey === itemKey) return false;

  const userId = await currentUserId();
  if (input.catalogType === "motive") {
    const { data, error } = await supabase
      .from("report_motive_aliases")
      .select("id,status")
      .eq("alias_key", aliasKey)
      .eq("motive_id", catalogItem.id)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      if (data.status !== "active") {
        const { error: updateError } = await supabase
          .from("report_motive_aliases")
          .update({ status: "active" })
          .eq("id", data.id);
        if (updateError) throw updateError;
        return true;
      }
      return false;
    }

    const { error: insertError } = await supabase.from("report_motive_aliases").insert({
      motive_id: catalogItem.id,
      alias: rawAlias,
      alias_key: aliasKey,
      status: "active",
      source: "import_review",
      created_by: userId,
    });
    if (insertError && !isUniqueViolation(insertError)) throw insertError;
    return !insertError;
  }

  const { data, error } = await supabase
    .from("report_site_aliases")
    .select("id,status")
    .eq("alias_key", aliasKey)
    .eq("site_id", catalogItem.id)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    if (data.status !== "active") {
      const { error: updateError } = await supabase
        .from("report_site_aliases")
        .update({ status: "active" })
        .eq("id", data.id);
      if (updateError) throw updateError;
      return true;
    }
    return false;
  }

  const { error: insertError } = await supabase.from("report_site_aliases").insert({
    site_id: catalogItem.id,
    alias: rawAlias,
    alias_key: aliasKey,
    status: "active",
    source: "import_review",
    created_by: userId,
  });
  if (insertError && !isUniqueViolation(insertError)) throw insertError;
  return !insertError;
};

export const persistReportImportCatalogDecision = async (
  input: PersistReportImportCatalogDecisionInput,
): Promise<PersistReportImportCatalogDecisionResult> => {
  if (input.action === "saved_for_report" || input.action === "omitted") {
    return { catalogItemId: null, catalogLabel: null, aliasSaved: false };
  }

  const catalogItem = await findOrCreateCatalogItem(input);
  if (!catalogItem) {
    throw new Error("No se pudo identificar el valor final del catalogo");
  }

  const shouldSaveAlias = input.action === "accepted_suggestion" || input.action === "linked_existing";
  const aliasSaved = shouldSaveAlias ? await ensureCatalogAlias(input, catalogItem) : false;
  return {
    catalogItemId: catalogItem.id,
    catalogLabel: catalogItem.label,
    aliasSaved,
  };
};

export const buildAliasSuggestionsFromFields = (fields: ReportImportField[]): ReportImportAliasSuggestion[] => {
  const suggestions = new Map<string, ReportImportAliasSuggestion>();

  fields
    .filter((field) => field.kind === "person" && field.finalValue && field.rawValue)
    .forEach((field) => {
      const officerCedula = typeof field.metadata.officerCedula === "string" ? field.metadata.officerCedula : "";
      const rawAlias = field.rawValue || "";
      const normalizedAlias = normalizeImportText(rawAlias);
      const normalizedFinal = normalizeImportText(field.finalValue || "");
      const matchLevel = typeof field.metadata.match === "object" && field.metadata.match
        ? (field.metadata.match as { level?: unknown }).level
        : null;
      const personAction = typeof field.metadata.personAction === "string" ? field.metadata.personAction : null;

      if (!officerCedula || !normalizedAlias || normalizedAlias === normalizedFinal) return;
      if (matchLevel !== "fuzzy" && matchLevel !== "gemini" && personAction !== "linked_existing") return;

      suggestions.set(`${officerCedula}:${normalizedAlias}`, {
        rawAlias,
        normalizedAlias,
        officerCedula,
        fieldKey: field.fieldKey,
      });
    });

  return Array.from(suggestions.values());
};

export const buildPersonSuggestionsFromFields = (fields: ReportImportField[]): ReportImportPersonSuggestion[] => {
  const suggestions = new Map<string, ReportImportPersonSuggestion>();

  fields
    .filter((field) => field.kind === "person" && field.rawValue)
    .forEach((field) => {
      const action = typeof field.metadata.personAction === "string" ? field.metadata.personAction : "";
      if (
        action !== "saved_without_cedula" &&
        action !== "possible_new_officer" &&
        action !== "created_new_officer" &&
        action !== "linked_existing" &&
        action !== "omitted"
      ) {
        return;
      }

      const rawName = field.rawValue || "";
      const normalizedName = normalizeImportText(rawName);
      if (!normalizedName) return;

      suggestions.set(`${field.fieldKey}:${action}:${normalizedName}`, {
        rawName,
        normalizedName,
        finalName: field.finalValue || null,
        officerCedula: typeof field.metadata.officerCedula === "string" ? field.metadata.officerCedula : null,
        fieldKey: field.fieldKey,
        action,
      });
    });

  return Array.from(suggestions.values());
};

export const buildCatalogSuggestionsFromFields = (fields: ReportImportField[]): ReportImportCatalogSuggestion[] => {
  const suggestions = new Map<string, ReportImportCatalogSuggestion>();

  fields
    .filter((field) => field.kind === "catalog" && field.rawValue)
    .forEach((field) => {
      const catalogType = field.metadata.catalogType === "motive" || field.metadata.catalogType === "site"
        ? field.metadata.catalogType
        : null;
      const action = typeof field.metadata.catalogAction === "string" ? field.metadata.catalogAction : "";
      if (
        !catalogType ||
        (
          action !== "accepted_suggestion" &&
          action !== "linked_existing" &&
          action !== "created_new" &&
          action !== "saved_for_report" &&
          action !== "omitted"
        )
      ) {
        return;
      }

      const rawValue = field.rawValue || "";
      const normalizedValue = normalizeImportText(rawValue);
      if (!normalizedValue) return;

      const match = field.metadata.match as { zona?: unknown; posicion?: unknown } | null | undefined;
      const zona = typeof field.metadata.siteZona === "string"
        ? field.metadata.siteZona
        : typeof match?.zona === "string"
          ? match.zona
          : null;
      const posicion = typeof field.metadata.sitePosicion === "string"
        ? field.metadata.sitePosicion
        : typeof match?.posicion === "string"
          ? match.posicion
          : null;

      suggestions.set(`${catalogType}:${field.fieldKey}:${action}:${normalizedValue}`, {
        catalogType,
        rawValue,
        normalizedValue,
        finalValue: field.finalValue || null,
        fieldKey: field.fieldKey,
        action,
        zona,
        posicion,
      });
    });

  return Array.from(suggestions.values());
};

export const confirmReportImportJob = async (
  jobId: string,
  reportType: ReportImportType,
  reportId: string,
  aliasSuggestions: ReportImportAliasSuggestion[],
  personSuggestions: ReportImportPersonSuggestion[] = [],
  catalogSuggestions: ReportImportCatalogSuggestion[] = [],
) => {
  const { data: sessionData, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = sessionData.session?.access_token;
  if (!token) return;

  const response = await fetch(`/api/report-imports/${jobId}/confirm`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      reportId,
      reportType,
      aliasSuggestions,
      personSuggestions,
      catalogSuggestions,
    }),
  });
  if (!response.ok) {
    const payload = await parseApiJson(response).catch(() => null);
    throw new Error(payload?.error || "No se pudo confirmar el job de importacion");
  }
};

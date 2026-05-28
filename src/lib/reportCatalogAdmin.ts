import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { normalizeMotiveKey } from "@/lib/motives";
import { normalizeSiteKey } from "@/lib/reportSites";
import { normalizeImportText } from "@/lib/reportImportMatching";

type OfficerRow = Tables<"officers">;
type OfficerAliasRow = Tables<"officer_aliases">;
type MotiveRow = Tables<"report_motive_catalog">;
type MotiveAliasRow = Tables<"report_motive_aliases">;
type SiteRow = Tables<"report_site_catalog">;
type SiteAliasRow = Tables<"report_site_aliases">;
type AliasSuggestionRow = Tables<"report_import_alias_suggestions">;
type PersonSuggestionRow = Tables<"report_import_person_suggestions">;
type CatalogSuggestionRow = Tables<"report_import_catalog_suggestions">;
type AuditRow = Tables<"report_catalog_admin_audit">;

export type CatalogStatusFilter = "active" | "inactive" | "all";

export interface CatalogOfficer extends OfficerRow {
  aliases: OfficerAliasRow[];
}

export interface CatalogMotive extends MotiveRow {
  aliases: MotiveAliasRow[];
}

export interface CatalogSite extends SiteRow {
  aliases: SiteAliasRow[];
}

export interface CatalogAliasSuggestion extends AliasSuggestionRow {
  officerName: string;
  officerCedula: string;
}

export interface CatalogPersonSuggestion extends PersonSuggestionRow {
  officerName: string | null;
  officerCedula: string | null;
}

export interface CatalogHistorySuggestion extends CatalogSuggestionRow {
  catalogLabel: string | null;
}

export interface ReportCatalogAdminData {
  officers: CatalogOfficer[];
  motives: CatalogMotive[];
  sites: CatalogSite[];
  aliasSuggestions: CatalogAliasSuggestion[];
  personSuggestions: CatalogPersonSuggestion[];
  catalogSuggestions: CatalogHistorySuggestion[];
  audit: AuditRow[];
}

export type CatalogEntityType = "officer" | "motive" | "site";
export type CatalogAliasType = "officer" | "motive" | "site";

const normalizeCedula = (value: string) => value.replace(/\D/g, "");

const throwIfError = (error: { message?: string } | null | undefined) => {
  if (error) throw new Error(error.message || "No se pudo actualizar el catalogo");
};

const currentUserId = async () => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
};

const getReviewedPatch = async () => ({
  reviewed_at: new Date().toISOString(),
  reviewed_by: await currentUserId(),
});

const groupBy = <T,>(items: T[], getKey: (item: T) => string | null | undefined) => {
  const grouped = new Map<string, T[]>();
  items.forEach((item) => {
    const key = getKey(item);
    if (!key) return;
    grouped.set(key, [...(grouped.get(key) || []), item]);
  });
  return grouped;
};

const mapOfficerLabels = (officers: OfficerRow[]) =>
  new Map(officers.map((officer) => [officer.id, officer]));

const mapMotiveLabels = (motives: MotiveRow[]) =>
  new Map(motives.map((motive) => [motive.id, motive.motivo]));

const mapSiteLabels = (sites: SiteRow[]) =>
  new Map(sites.map((site) => [site.id, site.nombre_sitio]));

export const loadReportCatalogAdminData = async (): Promise<ReportCatalogAdminData> => {
  const [
    officersResult,
    officerAliasesResult,
    motivesResult,
    motiveAliasesResult,
    sitesResult,
    siteAliasesResult,
    aliasSuggestionsResult,
    personSuggestionsResult,
    catalogSuggestionsResult,
    auditResult,
  ] = await Promise.all([
    supabase.from("officers").select("*").order("nombre", { ascending: true }),
    supabase.from("officer_aliases").select("*").order("alias", { ascending: true }),
    supabase.from("report_motive_catalog").select("*").order("motivo", { ascending: true }),
    supabase.from("report_motive_aliases").select("*").order("alias", { ascending: true }),
    supabase.from("report_site_catalog").select("*").order("nombre_sitio", { ascending: true }),
    supabase.from("report_site_aliases").select("*").order("alias", { ascending: true }),
    supabase.from("report_import_alias_suggestions").select("*").order("created_at", { ascending: false }).limit(80),
    supabase.from("report_import_person_suggestions").select("*").order("created_at", { ascending: false }).limit(80),
    supabase.from("report_import_catalog_suggestions").select("*").order("created_at", { ascending: false }).limit(120),
    supabase.from("report_catalog_admin_audit").select("*").order("created_at", { ascending: false }).limit(80),
  ]);

  [
    officersResult.error,
    officerAliasesResult.error,
    motivesResult.error,
    motiveAliasesResult.error,
    sitesResult.error,
    siteAliasesResult.error,
    aliasSuggestionsResult.error,
    personSuggestionsResult.error,
    catalogSuggestionsResult.error,
    auditResult.error,
  ].forEach(throwIfError);

  const officers = officersResult.data || [];
  const officerAliases = officerAliasesResult.data || [];
  const motives = motivesResult.data || [];
  const motiveAliases = motiveAliasesResult.data || [];
  const sites = sitesResult.data || [];
  const siteAliases = siteAliasesResult.data || [];
  const officersById = mapOfficerLabels(officers);
  const motivesById = mapMotiveLabels(motives);
  const sitesById = mapSiteLabels(sites);
  const officerAliasesByOfficer = groupBy(officerAliases, (alias) => alias.officer_id);
  const motiveAliasesByMotive = groupBy(motiveAliases, (alias) => alias.motive_id);
  const siteAliasesBySite = groupBy(siteAliases, (alias) => alias.site_id);

  return {
    officers: officers.map((officer) => ({
      ...officer,
      aliases: officerAliasesByOfficer.get(officer.id) || [],
    })),
    motives: motives.map((motive) => ({
      ...motive,
      aliases: motiveAliasesByMotive.get(motive.id) || [],
    })),
    sites: sites.map((site) => ({
      ...site,
      aliases: siteAliasesBySite.get(site.id) || [],
    })),
    aliasSuggestions: (aliasSuggestionsResult.data || []).map((suggestion) => {
      const officer = officersById.get(suggestion.officer_id);
      return {
        ...suggestion,
        officerName: officer?.nombre || "Oficial no disponible",
        officerCedula: officer?.cedula || "",
      };
    }),
    personSuggestions: (personSuggestionsResult.data || []).map((suggestion) => {
      const officer = suggestion.officer_id ? officersById.get(suggestion.officer_id) : null;
      return {
        ...suggestion,
        officerName: officer?.nombre || null,
        officerCedula: officer?.cedula || null,
      };
    }),
    catalogSuggestions: (catalogSuggestionsResult.data || []).map((suggestion) => ({
      ...suggestion,
      catalogLabel: suggestion.catalog_type === "motive"
        ? motivesById.get(suggestion.catalog_item_id || "")
        : sitesById.get(suggestion.catalog_item_id || ""),
    })),
    audit: auditResult.data || [],
  };
};

export const saveCatalogOfficer = async (input: { id?: string; nombre: string; cedula: string; active?: boolean }) => {
  const nombre = input.nombre.trim();
  const cedula = normalizeCedula(input.cedula);
  if (!nombre) throw new Error("El nombre del oficial es requerido");
  if (!cedula) throw new Error("La cedula del oficial es requerida");

  const payload = {
    nombre,
    cedula,
    nombre_normalizado: normalizeImportText(nombre),
    active: input.active ?? true,
  };

  if (input.id) {
    const { error } = await supabase.from("officers").update(payload).eq("id", input.id);
    throwIfError(error);
    return;
  }

  const { error } = await supabase.from("officers").insert(payload);
  throwIfError(error);
};

export const setCatalogOfficerActive = async (id: string, active: boolean) => {
  const { error } = await supabase.from("officers").update({ active }).eq("id", id);
  throwIfError(error);
};

export const saveCatalogMotive = async (input: { id?: string; motivo: string; active?: boolean }) => {
  const userId = await currentUserId();
  const motivo = input.motivo.trim();
  const motivoKey = normalizeMotiveKey(motivo);
  if (!motivo || !motivoKey) throw new Error("El motivo es requerido");

  const payload = {
    motivo,
    motivo_key: motivoKey,
    active: input.active ?? true,
    ...(input.id ? {} : { created_by: userId }),
  };

  if (input.id) {
    const { error } = await supabase.from("report_motive_catalog").update(payload).eq("id", input.id);
    throwIfError(error);
    return;
  }

  const { error } = await supabase.from("report_motive_catalog").insert(payload);
  throwIfError(error);
};

export const setCatalogMotiveActive = async (id: string, active: boolean) => {
  const { error } = await supabase.from("report_motive_catalog").update({ active }).eq("id", id);
  throwIfError(error);
};

export const saveCatalogSite = async (input: {
  id?: string;
  nombre_sitio: string;
  zona?: string | null;
  posicion?: string | null;
  active?: boolean;
}) => {
  const userId = await currentUserId();
  const nombreSitio = input.nombre_sitio.trim();
  const siteKey = normalizeSiteKey(nombreSitio);
  if (!nombreSitio || !siteKey) throw new Error("El sitio es requerido");

  const payload = {
    nombre_sitio: nombreSitio,
    site_key: siteKey,
    zona: input.zona?.trim() || null,
    posicion: input.posicion?.trim() || null,
    active: input.active ?? true,
    ...(input.id ? {} : { created_by: userId }),
  };

  if (input.id) {
    const { error } = await supabase.from("report_site_catalog").update(payload).eq("id", input.id);
    throwIfError(error);
    return;
  }

  const { error } = await supabase.from("report_site_catalog").insert(payload);
  throwIfError(error);
};

export const setCatalogSiteActive = async (id: string, active: boolean) => {
  const { error } = await supabase.from("report_site_catalog").update({ active }).eq("id", id);
  throwIfError(error);
};

export const saveCatalogAlias = async (input: {
  type: CatalogAliasType;
  id?: string;
  targetId: string;
  alias: string;
  status?: string;
}) => {
  const userId = await currentUserId();
  const alias = input.alias.trim();
  if (!input.targetId) throw new Error("Seleccione el catalogo destino");
  if (!alias) throw new Error("El alias es requerido");

  if (input.type === "officer") {
    const payload = {
      officer_id: input.targetId,
      alias,
      alias_normalizado: normalizeImportText(alias),
      status: input.status || "active",
      source: "manual",
    };
    const request = input.id
      ? supabase.from("officer_aliases").update(payload).eq("id", input.id)
      : supabase.from("officer_aliases").insert(payload);
    const { error } = await request;
    throwIfError(error);
    return;
  }

  if (input.type === "motive") {
    const payload = {
      motive_id: input.targetId,
      alias,
      alias_key: normalizeMotiveKey(alias),
      status: input.status || "active",
      source: "manual",
      ...(input.id ? {} : { created_by: userId }),
    };
    const request = input.id
      ? supabase.from("report_motive_aliases").update(payload).eq("id", input.id)
      : supabase.from("report_motive_aliases").insert(payload);
    const { error } = await request;
    throwIfError(error);
    return;
  }

  const payload = {
    site_id: input.targetId,
    alias,
    alias_key: normalizeSiteKey(alias),
    status: input.status || "active",
    source: "manual",
    ...(input.id ? {} : { created_by: userId }),
  };
  const request = input.id
    ? supabase.from("report_site_aliases").update(payload).eq("id", input.id)
    : supabase.from("report_site_aliases").insert(payload);
  const { error } = await request;
  throwIfError(error);
};

export const setCatalogAliasStatus = async (type: CatalogAliasType, id: string, status: "active" | "inactive") => {
  const table = type === "officer"
    ? "officer_aliases"
    : type === "motive"
      ? "report_motive_aliases"
      : "report_site_aliases";
  const { error } = await supabase.from(table).update({ status }).eq("id", id);
  throwIfError(error);
};

export const approveOfficerAliasSuggestion = async (suggestion: CatalogAliasSuggestion) => {
  await saveCatalogAlias({
    type: "officer",
    targetId: suggestion.officer_id,
    alias: suggestion.raw_alias,
    status: "active",
  });
  const patch = await getReviewedPatch();
  const { error } = await supabase
    .from("report_import_alias_suggestions")
    .update({ status: "approved", ...patch })
    .eq("id", suggestion.id);
  throwIfError(error);
};

export const rejectOfficerAliasSuggestion = async (suggestionId: string) => {
  const patch = await getReviewedPatch();
  const { error } = await supabase
    .from("report_import_alias_suggestions")
    .update({ status: "rejected", ...patch })
    .eq("id", suggestionId);
  throwIfError(error);
};

export const updatePersonSuggestionStatus = async (suggestionId: string, status: "reviewed" | "dismissed") => {
  const patch = await getReviewedPatch();
  const { error } = await supabase
    .from("report_import_person_suggestions")
    .update({ status, ...patch })
    .eq("id", suggestionId);
  throwIfError(error);
};

export const updateCatalogSuggestionStatus = async (suggestionId: string, status: "reviewed" | "dismissed") => {
  const patch = await getReviewedPatch();
  const { error } = await supabase
    .from("report_import_catalog_suggestions")
    .update({ status, ...patch })
    .eq("id", suggestionId);
  throwIfError(error);
};

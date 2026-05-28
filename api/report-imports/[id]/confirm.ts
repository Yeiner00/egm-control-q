import { normalizeImportText } from "../../../src/lib/reportImportMatching";
import { normalizeCatalogValue } from "../../../src/lib/reportImportCatalogMatching";
import {
  reportImportConfirmSchema,
  type ReportImportCatalogSuggestion,
  type ReportImportPersonSuggestion,
} from "../../../src/lib/reportImportSchema";

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status });

const getEnv = (name: string) => process.env[name] || "";

const getSupabaseConfig = () => {
  const url = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const key = getEnv("SUPABASE_PUBLISHABLE_KEY") || getEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) throw new Error("Missing Supabase environment variables");
  return { url: url.replace(/\/$/, ""), key };
};

const authHeaders = (authHeader: string, apiKey: string, contentType = "application/json") => ({
  "apikey": apiKey,
  "Authorization": authHeader,
  "Content-Type": contentType,
});

const getJobIdFromRequest = (request: Request) => {
  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/\/api\/report-imports\/([^/]+)\/confirm$/);
  return match?.[1] || "";
};

const parseUserId = (authHeader: string) => {
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const [, payload] = token.split(".");
  if (!payload) return "";
  try {
    const decoded = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as { sub?: string };
    return parsed.sub || "";
  } catch {
    return "";
  }
};

const normalizeCedula = (value: string | null | undefined) => String(value || "").replace(/\D/g, "");

const catalogConfig = {
  motive: {
    itemTable: "report_motive_catalog",
    aliasTable: "report_motive_aliases",
    itemNameColumn: "motivo",
    itemKeyColumn: "motivo_key",
    aliasTargetColumn: "motive_id",
  },
  site: {
    itemTable: "report_site_catalog",
    aliasTable: "report_site_aliases",
    itemNameColumn: "nombre_sitio",
    itemKeyColumn: "site_key",
    aliasTargetColumn: "site_id",
  },
} as const;

const supabaseFetch = async (
  path: string,
  init: RequestInit,
  authHeader: string,
) => {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      ...authHeaders(authHeader, key),
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${text}`);
  }
  return response;
};

const findOfficerIdsByCedula = async (cedulas: string[], authHeader: string) => {
  const cleanedCedulas = [...new Set(cedulas.map(normalizeCedula).filter(Boolean))];
  if (cleanedCedulas.length === 0) return new Map<string, string>();
  const query = cleanedCedulas.map((cedula) => `"${cedula}"`).join(",");
  const response = await supabaseFetch(
    `/rest/v1/officers?select=id,cedula&cedula=in.(${query})`,
    { method: "GET" },
    authHeader,
  );
  const rows = await response.json() as Array<{ id: string; cedula: string }>;
  return new Map(rows.map((row) => [row.cedula, row.id]));
};

const createOrFindOfficerFromSuggestion = async (
  suggestion: ReportImportPersonSuggestion,
  authHeader: string,
) => {
  const cedula = normalizeCedula(suggestion.officerCedula);
  const nombre = String(suggestion.finalName || suggestion.rawName || "").trim();
  if (!cedula || !nombre) return null;

  const existing = await findOfficerIdsByCedula([cedula], authHeader);
  const existingId = existing.get(cedula);
  if (existingId) return existingId;

  try {
    const response = await supabaseFetch(
      "/rest/v1/officers?select=id,cedula",
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          nombre,
          cedula,
          nombre_normalizado: normalizeImportText(nombre),
          active: true,
        }),
      },
      authHeader,
    );
    const rows = await response.json() as Array<{ id: string; cedula: string }>;
    return rows[0]?.id || null;
  } catch (error) {
    const racedExisting = await findOfficerIdsByCedula([cedula], authHeader);
    const racedExistingId = racedExisting.get(cedula);
    if (racedExistingId) return racedExistingId;
    throw error;
  }
};

const findCatalogItemByKey = async (
  suggestion: Pick<ReportImportCatalogSuggestion, "catalogType">,
  normalizedKey: string,
  authHeader: string,
) => {
  if (!normalizedKey) return null;
  const config = catalogConfig[suggestion.catalogType];
  const response = await supabaseFetch(
    `/rest/v1/${config.itemTable}?select=id,${config.itemNameColumn},${config.itemKeyColumn}&${config.itemKeyColumn}=eq.${encodeURIComponent(normalizedKey)}&limit=1`,
    { method: "GET" },
    authHeader,
  );
  const rows = await response.json() as Array<Record<string, unknown>>;
  return rows[0] ? {
    id: String(rows[0].id || ""),
    label: String(rows[0][config.itemNameColumn] || ""),
  } : null;
};

const createOrFindCatalogItem = async (
  suggestion: ReportImportCatalogSuggestion,
  authHeader: string,
) => {
  const finalValue = String(suggestion.finalValue || suggestion.rawValue || "").trim();
  const normalizedKey = normalizeCatalogValue(suggestion.catalogType, finalValue);
  if (!finalValue || !normalizedKey) return null;

  const existing = await findCatalogItemByKey(suggestion, normalizedKey, authHeader);
  if (existing?.id) return existing;

  const config = catalogConfig[suggestion.catalogType];
  const payload: Record<string, unknown> = {
    [config.itemNameColumn]: finalValue,
    [config.itemKeyColumn]: normalizedKey,
    active: true,
  };
  if (suggestion.catalogType === "site") {
    payload.zona = suggestion.zona || null;
    payload.posicion = suggestion.posicion || null;
  }

  try {
    const response = await supabaseFetch(
      `/rest/v1/${config.itemTable}?select=id,${config.itemNameColumn}`,
      {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(payload),
      },
      authHeader,
    );
    const rows = await response.json() as Array<Record<string, unknown>>;
    return rows[0] ? {
      id: String(rows[0].id || ""),
      label: String(rows[0][config.itemNameColumn] || finalValue),
    } : null;
  } catch (error) {
    const racedExisting = await findCatalogItemByKey(suggestion, normalizedKey, authHeader);
    if (racedExisting?.id) return racedExisting;
    throw error;
  }
};

const ensureCatalogAlias = async (
  suggestion: ReportImportCatalogSuggestion,
  catalogItemId: string | null,
  authHeader: string,
) => {
  const rawAlias = String(suggestion.rawValue || "").trim();
  const finalValue = String(suggestion.finalValue || "").trim();
  const aliasKey = normalizeCatalogValue(suggestion.catalogType, rawAlias);
  const finalKey = normalizeCatalogValue(suggestion.catalogType, finalValue);
  if (!catalogItemId || !rawAlias || !aliasKey || aliasKey === finalKey) return;

  const config = catalogConfig[suggestion.catalogType];
  const response = await supabaseFetch(
    `/rest/v1/${config.aliasTable}?select=id&alias_key=eq.${encodeURIComponent(aliasKey)}&${config.aliasTargetColumn}=eq.${encodeURIComponent(catalogItemId)}&limit=1`,
    { method: "GET" },
    authHeader,
  );
  const existing = await response.json() as Array<{ id: string }>;
  if (existing.length > 0) return;

  try {
    await supabaseFetch(
      `/rest/v1/${config.aliasTable}`,
      {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          [config.aliasTargetColumn]: catalogItemId,
          alias: rawAlias,
          alias_key: aliasKey,
          status: "active",
          source: "import_confirmation",
        }),
      },
      authHeader,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("duplicate") && !message.includes("unique")) throw error;
  }
};

export default {
  async fetch(request: Request) {
    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      const authHeader = request.headers.get("authorization") || "";
      const userId = parseUserId(authHeader);
      if (!authHeader || !userId) return jsonResponse({ error: "Unauthorized" }, 401);

      const jobId = getJobIdFromRequest(request);
      if (!jobId) return jsonResponse({ error: "Missing import job id" }, 400);

      const parsed = reportImportConfirmSchema.parse(await request.json());
      const cedulas = [
        ...new Set(parsed.aliasSuggestions.map((item) => normalizeCedula(item.officerCedula)).filter(Boolean)),
      ];
      const personCedulas = parsed.personSuggestions.map((item) => normalizeCedula(item.officerCedula)).filter(Boolean);
      const officerIdsByCedula = await findOfficerIdsByCedula([...new Set([...cedulas, ...personCedulas])], authHeader);

      for (const suggestion of parsed.personSuggestions) {
        if (suggestion.action !== "created_new_officer") continue;
        const cedula = normalizeCedula(suggestion.officerCedula);
        const officerId = await createOrFindOfficerFromSuggestion(suggestion, authHeader);
        if (cedula && officerId) officerIdsByCedula.set(cedula, officerId);
      }

      const suggestions = parsed.aliasSuggestions
        .map((suggestion) => ({
          job_id: jobId,
          raw_alias: suggestion.rawAlias,
          normalized_alias: suggestion.normalizedAlias || normalizeImportText(suggestion.rawAlias),
          officer_id: suggestion.officerCedula ? officerIdsByCedula.get(normalizeCedula(suggestion.officerCedula)) : null,
          field_key: suggestion.fieldKey || null,
          suggested_by: userId,
          status: "pending",
        }))
        .filter((suggestion) => suggestion.raw_alias && suggestion.officer_id);

      if (suggestions.length > 0) {
        await supabaseFetch(
          "/rest/v1/report_import_alias_suggestions",
          {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(suggestions),
          },
          authHeader,
        );
      }

      const personSuggestions = parsed.personSuggestions
        .map((suggestion) => ({
          job_id: jobId,
          raw_name: suggestion.rawName,
          normalized_name: suggestion.normalizedName || normalizeImportText(suggestion.rawName),
          final_name: suggestion.finalName || null,
          officer_id: suggestion.officerCedula ? officerIdsByCedula.get(normalizeCedula(suggestion.officerCedula)) || null : null,
          field_key: suggestion.fieldKey || null,
          action_taken: suggestion.action,
          suggested_by: userId,
          status: "pending",
        }))
        .filter((suggestion) => suggestion.raw_name && suggestion.normalized_name);

      if (personSuggestions.length > 0) {
        await supabaseFetch(
          "/rest/v1/report_import_person_suggestions",
          {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(personSuggestions),
          },
          authHeader,
        );
      }

      const catalogAuditRows = [];
      for (const suggestion of parsed.catalogSuggestions) {
        let catalogItem = null as { id: string; label: string } | null;
        if (
          suggestion.action === "created_new" ||
          suggestion.action === "linked_existing" ||
          suggestion.action === "accepted_suggestion"
        ) {
          catalogItem = await createOrFindCatalogItem(suggestion, authHeader);
        }
        if (
          catalogItem?.id &&
          (suggestion.action === "linked_existing" || suggestion.action === "accepted_suggestion")
        ) {
          await ensureCatalogAlias(suggestion, catalogItem.id, authHeader);
        }

        catalogAuditRows.push({
          job_id: jobId,
          field_key: suggestion.fieldKey || null,
          catalog_type: suggestion.catalogType,
          catalog_item_id: catalogItem?.id || null,
          raw_value: suggestion.rawValue,
          normalized_value: suggestion.normalizedValue || normalizeCatalogValue(suggestion.catalogType, suggestion.rawValue),
          final_value: suggestion.finalValue || null,
          action_taken: suggestion.action,
          suggested_by: userId,
          status: "active",
          metadata: {
            zona: suggestion.zona || null,
            posicion: suggestion.posicion || null,
          },
        });
      }

      if (catalogAuditRows.length > 0) {
        await supabaseFetch(
          "/rest/v1/report_import_catalog_suggestions",
          {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(catalogAuditRows),
          },
          authHeader,
        );
      }

      await supabaseFetch(
        `/rest/v1/report_import_jobs?id=eq.${encodeURIComponent(jobId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            status: "confirmed",
            confirmed_report_id: parsed.reportId,
            confirmed_report_type: parsed.reportType,
          }),
        },
        authHeader,
      );

      return jsonResponse({
        ok: true,
        suggestions: suggestions.length,
        personSuggestions: personSuggestions.length,
        catalogSuggestions: catalogAuditRows.length,
      });
    } catch (error) {
      return jsonResponse({
        error: error instanceof Error ? error.message : "Error al confirmar importacion",
      }, 500);
    }
  },
};

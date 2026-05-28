import * as XLSX from "xlsx";
import { buildReportImportDraftFromWorkbook } from "../src/lib/reportImportExtractor";
import {
  DEFAULT_IMPORT_OFFICER_CATALOG,
  normalizeImportText,
  type ImportOfficerCatalog,
  type ImportOfficerRecord,
} from "../src/lib/reportImportMatching";
import {
  DEFAULT_IMPORT_REPORT_CATALOGS,
  normalizeCatalogValue,
  type ImportCatalogAlias,
  type ImportCatalogItem,
  type ImportReportCatalogs,
} from "../src/lib/reportImportCatalogMatching";
import { reportImportDraftSchema, type ReportImportDraft, type ReportImportField } from "../src/lib/reportImportSchema";

const MAX_UPLOAD_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["xlsx", "xls"]);
const RATE_LIMIT_WINDOW_MS = 60_000;
// V2 stays below the Gemini 3.1 Flash Lite free-tier limit of 15 RPM.
const RATE_LIMIT_MAX_UPLOADS = 8;
const SNAPSHOT_BUCKET = "report-import-snapshots";
const RESOLVE_IMPORT_NAMES_FUNCTION = "resolve-import-names";

const counters = new Map<string, { count: number; resetAt: number }>();

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

const checkRateLimit = (key: string) => {
  const now = Date.now();
  const current = counters.get(key);
  if (!current || current.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }
  if (current.count >= RATE_LIMIT_MAX_UPLOADS) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  }
  current.count += 1;
  return null;
};

const sanitizeFileName = (fileName: string) =>
  fileName.replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim() || "reporte.xlsx";

const validateFile = (file: File) => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !ALLOWED_EXTENSIONS.has(extension)) {
    return "Solo se permiten archivos Excel .xlsx o .xls";
  }
  if (file.size <= 0) return "Archivo vacio";
  if (file.size > MAX_UPLOAD_SIZE_BYTES) return "El archivo supera el limite de 5 MB";
  return null;
};

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

const loadOfficerCatalog = async (authHeader: string): Promise<ImportOfficerCatalog> => {
  try {
    const officersResponse = await supabaseFetch(
      "/rest/v1/officers?select=id,nombre,cedula,nombre_normalizado,active&active=eq.true",
      { method: "GET" },
      authHeader,
    );
    const aliasesResponse = await supabaseFetch(
      "/rest/v1/officer_aliases?select=alias,alias_normalizado,officer_id,officers(id,nombre,cedula)&status=eq.active",
      { method: "GET" },
      authHeader,
    );

    const officers = await officersResponse.json() as Array<ImportOfficerRecord & { active?: boolean }>;
    const aliases = await aliasesResponse.json() as Array<{
      alias: string;
      alias_normalizado: string | null;
      officer_id: string | null;
      officers?: { id?: string; nombre?: string; cedula?: string | null } | null;
    }>;

    if (officers.length === 0) return DEFAULT_IMPORT_OFFICER_CATALOG;

    return {
      officers: officers.map((officer) => ({
        id: officer.id,
        nombre: officer.nombre,
        cedula: officer.cedula,
        nombre_normalizado: officer.nombre_normalizado,
      })),
      aliases: aliases.map((alias) => ({
        alias: alias.alias,
        alias_normalizado: alias.alias_normalizado,
        officer_id: alias.officer_id,
        officer_nombre: alias.officers?.nombre || null,
        officer_cedula: alias.officers?.cedula || null,
      })),
    };
  } catch {
    return DEFAULT_IMPORT_OFFICER_CATALOG;
  }
};

const loadReportCatalogs = async (authHeader: string): Promise<ImportReportCatalogs> => {
  try {
    const [
      motiveItemsResponse,
      motiveAliasesResponse,
      siteItemsResponse,
      siteAliasesResponse,
    ] = await Promise.all([
      supabaseFetch(
        "/rest/v1/report_motive_catalog?select=id,motivo,motivo_key,active&active=eq.true",
        { method: "GET" },
        authHeader,
      ),
      supabaseFetch(
        "/rest/v1/report_motive_aliases?select=id,motive_id,alias,alias_key,status&status=eq.active",
        { method: "GET" },
        authHeader,
      ),
      supabaseFetch(
        "/rest/v1/report_site_catalog?select=id,nombre_sitio,site_key,zona,posicion,active&active=eq.true",
        { method: "GET" },
        authHeader,
      ),
      supabaseFetch(
        "/rest/v1/report_site_aliases?select=id,site_id,alias,alias_key,status&status=eq.active",
        { method: "GET" },
        authHeader,
      ),
    ]);

    const motiveRows = await motiveItemsResponse.json() as Array<{
      id: string;
      motivo: string;
      motivo_key: string | null;
    }>;
    const motiveAliasRows = await motiveAliasesResponse.json() as Array<{
      id: string;
      motive_id: string | null;
      alias: string;
      alias_key: string | null;
    }>;
    const siteRows = await siteItemsResponse.json() as Array<{
      id: string;
      nombre_sitio: string;
      site_key: string | null;
      zona: string | null;
      posicion: string | null;
    }>;
    const siteAliasRows = await siteAliasesResponse.json() as Array<{
      id: string;
      site_id: string | null;
      alias: string;
      alias_key: string | null;
    }>;
    let catalogSuggestionRows: Array<{
      id: string;
      catalog_type: "motive" | "site";
      catalog_item_id: string | null;
      raw_value: string;
      normalized_value: string | null;
      final_value: string | null;
    }> = [];

    try {
      const catalogSuggestionsResponse = await supabaseFetch(
        "/rest/v1/report_import_catalog_suggestions?select=id,catalog_type,catalog_item_id,raw_value,normalized_value,final_value,action_taken,status&status=in.(active,reviewed)&action_taken=in.(accepted_suggestion,linked_existing)&final_value=not.is.null&order=created_at.desc&limit=500",
        { method: "GET" },
        authHeader,
      );
      catalogSuggestionRows = await catalogSuggestionsResponse.json() as typeof catalogSuggestionRows;
    } catch {
      catalogSuggestionRows = [];
    }

    const motives: ImportCatalogItem[] = motiveRows.map((item) => ({
      id: item.id,
      label: item.motivo,
      normalized: item.motivo_key || normalizeCatalogValue("motive", item.motivo),
    }));
    const sites: ImportCatalogItem[] = siteRows.map((item) => ({
      id: item.id,
      label: item.nombre_sitio,
      normalized: item.site_key || normalizeCatalogValue("site", item.nombre_sitio),
      zona: item.zona,
      posicion: item.posicion,
    }));
    const motiveLabels = new Map(motives.map((item) => [item.id, item.label]));
    const siteLabels = new Map(sites.map((item) => [item.id, item.label]));
    const motiveByKey = new Map(motives.map((item) => [item.normalized, item]));
    const siteByKey = new Map(sites.map((item) => [item.normalized, item]));
    const motiveAliases: ImportCatalogAlias[] = motiveAliasRows.map((alias) => ({
      id: alias.id,
      itemId: alias.motive_id,
      itemLabel: alias.motive_id ? motiveLabels.get(alias.motive_id) || null : null,
      alias: alias.alias,
      normalized: alias.alias_key || normalizeCatalogValue("motive", alias.alias),
    }));
    const siteAliases: ImportCatalogAlias[] = siteAliasRows.map((alias) => ({
      id: alias.id,
      itemId: alias.site_id,
      itemLabel: alias.site_id ? siteLabels.get(alias.site_id) || null : null,
      alias: alias.alias,
      normalized: alias.alias_key || normalizeCatalogValue("site", alias.alias),
    }));
    const buildLearnedAliases = (catalogType: "motive" | "site"): ImportCatalogAlias[] =>
      catalogSuggestionRows.flatMap((suggestion) => {
        if (suggestion.catalog_type !== catalogType) return [];
        const finalValue = suggestion.final_value?.trim() || "";
        const rawValue = suggestion.raw_value?.trim() || "";
        const aliasKey = suggestion.normalized_value || normalizeCatalogValue(catalogType, rawValue);
        const finalKey = normalizeCatalogValue(catalogType, finalValue);
        if (!rawValue || !finalValue || !aliasKey || aliasKey === finalKey) return [];

        const catalogItem = suggestion.catalog_item_id
          ? catalogType === "motive"
            ? motives.find((item) => item.id === suggestion.catalog_item_id)
            : sites.find((item) => item.id === suggestion.catalog_item_id)
          : catalogType === "motive"
            ? motiveByKey.get(finalKey)
            : siteByKey.get(finalKey);

        return [{
          id: `suggestion-${suggestion.id}`,
          itemId: catalogItem?.id || suggestion.catalog_item_id || null,
          itemLabel: catalogItem?.label || finalValue,
          alias: rawValue,
          normalized: aliasKey,
        }];
      });
    const learnedMotiveAliases = buildLearnedAliases("motive").filter((alias) =>
      motives.some((item) => item.id === alias.itemId || item.label === alias.itemLabel),
    );
    const learnedSiteAliases = buildLearnedAliases("site").filter((alias) =>
      sites.some((item) => item.id === alias.itemId || item.label === alias.itemLabel),
    );

    return {
      motives: motives.length > 0 ? { items: motives, aliases: [...learnedMotiveAliases, ...motiveAliases] } : DEFAULT_IMPORT_REPORT_CATALOGS.motives,
      sites: sites.length > 0 ? { items: sites, aliases: [...learnedSiteAliases, ...siteAliases] } : DEFAULT_IMPORT_REPORT_CATALOGS.sites,
    };
  } catch {
    return DEFAULT_IMPORT_REPORT_CATALOGS;
  }
};

const uploadSnapshot = async (
  bytes: Uint8Array,
  file: File,
  storagePath: string,
  authHeader: string,
) => {
  const { url, key } = getSupabaseConfig();
  const response = await fetch(`${url}/storage/v1/object/${SNAPSHOT_BUCKET}/${storagePath}`, {
    method: "PUT",
    headers: {
      "apikey": key,
      "Authorization": authHeader,
      "Content-Type": file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "x-upsert": "false",
    },
    body: bytes,
  });
  if (!response.ok) {
    const text = await response.text();
    if (response.status === 400 && text.toLowerCase().includes("bucket not found")) {
      throw new Error(`Falta el bucket privado ${SNAPSHOT_BUCKET}. Aplique la migracion V2 de importacion antes de subir reportes.`);
    }
    throw new Error(`No se pudo guardar snapshot raw (${response.status}): ${text}`);
  }
};

type ImportNameCandidatePayload = {
  nombre: string;
  cedula: string | null;
  confidence: number | null;
  level: string | null;
};

type ImportNameResolutionPayload = {
  fieldKey: string;
  officerCedula: string | null;
  rawName: string | null;
  resolutionType: ImportPersonResolutionType;
  confidence: number;
  needsReview: boolean;
};

type ImportPersonResolutionType =
  | "catalog_officer"
  | "probable_catalog_officer"
  | "unknown_person"
  | "possible_new_officer"
  | "non_person";

type ImportNameSegmentationPersonPayload = {
  officerCedula: string | null;
  rawName: string;
  raw: string | null;
  resolutionType: ImportPersonResolutionType;
  confidence: number;
  needsReview: boolean;
};

type ImportNameSegmentationPayload = {
  fieldKey: string;
  people: ImportNameSegmentationPersonPayload[];
};

const toImportNameCandidatePayload = (candidate: unknown): ImportNameCandidatePayload | null => {
  if (!candidate || typeof candidate !== "object") return null;
  const item = candidate as Record<string, unknown>;
  const nombre = typeof item.nombre === "string" ? item.nombre : "";
  const cedula = typeof item.cedula === "string" ? item.cedula : null;
  if (!nombre || !cedula) return null;

  return {
    nombre,
    cedula,
    confidence: typeof item.confidence === "number" ? item.confidence : null,
    level: typeof item.level === "string" ? item.level : null,
  };
};

const getImportNameCandidatePayloads = (field: ReportImportField) =>
  (Array.isArray(field.metadata.candidates) ? field.metadata.candidates : [])
    .map(toImportNameCandidatePayload)
    .filter((candidate): candidate is ImportNameCandidatePayload => Boolean(candidate));

const getMetadataString = (field: ReportImportField, key: string) => {
  const value = field.metadata[key];
  return typeof value === "string" ? value : "";
};

const IMPORT_PERSON_RESOLUTION_TYPES = new Set<ImportPersonResolutionType>([
  "catalog_officer",
  "probable_catalog_officer",
  "unknown_person",
  "possible_new_officer",
  "non_person",
]);

const parseImportPersonResolutionType = (value: unknown): ImportPersonResolutionType =>
  typeof value === "string" && IMPORT_PERSON_RESOLUTION_TYPES.has(value as ImportPersonResolutionType)
    ? value as ImportPersonResolutionType
    : "unknown_person";

const getCatalogCandidatePayloads = (catalog: ImportOfficerCatalog): ImportNameCandidatePayload[] =>
  catalog.officers
    .map((officer) => ({
      nombre: officer.nombre,
      cedula: officer.cedula,
      confidence: null,
      level: "catalog",
    }))
    .filter((candidate): candidate is ImportNameCandidatePayload => Boolean(candidate.nombre && candidate.cedula));

const getSegmentationGroupPayloads = (
  fields: ReportImportField[],
  catalog: ImportOfficerCatalog,
) => {
  const catalogCandidates = getCatalogCandidatePayloads(catalog);
  return fields
    .filter((field) =>
      field.kind === "person" &&
      field.status !== "accepted" &&
      field.metadata.groupNeedsSegmentation === true &&
      Boolean(getMetadataString(field, "groupRawValue") || field.rawValue) &&
      catalogCandidates.length > 0,
    )
    .map((field) => {
      const raw = getMetadataString(field, "groupRawValue") || field.rawValue || "";
      return {
        fieldKey: field.fieldKey,
        groupKey: getMetadataString(field, "groupKey") || field.fieldKey.split(".")[0],
        label: field.label,
        raw,
        normalized: normalizeImportText(raw),
        allowUnknownPeople: true,
        candidates: catalogCandidates,
      };
    });
};

const parseResolutionPayloads = (value: unknown): ImportNameResolutionPayload[] =>
  Array.isArray(value)
    ? value.flatMap((resolution) => {
      if (!resolution || typeof resolution !== "object") return [];
      const item = resolution as Record<string, unknown>;
      if (
        typeof item.fieldKey !== "string" ||
        !(typeof item.officerCedula === "string" || item.officerCedula == null) ||
        typeof item.confidence !== "number" ||
        typeof item.needsReview !== "boolean"
      ) {
        return [];
      }
      return [{
        fieldKey: item.fieldKey,
        officerCedula: item.officerCedula || null,
        rawName: typeof item.rawName === "string" ? item.rawName : null,
        resolutionType: parseImportPersonResolutionType(item.resolutionType),
        confidence: item.confidence,
        needsReview: item.needsReview,
      }];
    })
    : [];

const parseSegmentationPayloads = (value: unknown): ImportNameSegmentationPayload[] =>
  Array.isArray(value)
    ? value.flatMap((segmentation) => {
      if (!segmentation || typeof segmentation !== "object") return [];
      const item = segmentation as Record<string, unknown>;
      if (typeof item.fieldKey !== "string" || !Array.isArray(item.people)) return [];

      const people = item.people.flatMap((person) => {
        if (!person || typeof person !== "object") return [];
        const personItem = person as Record<string, unknown>;
        if (
          !(typeof personItem.officerCedula === "string" || personItem.officerCedula == null) ||
          typeof personItem.confidence !== "number" ||
          typeof personItem.needsReview !== "boolean"
        ) {
          return [];
        }

        const rawName = typeof personItem.rawName === "string"
          ? personItem.rawName
          : typeof personItem.raw === "string"
            ? personItem.raw
            : "";

        return [{
          officerCedula: personItem.officerCedula || null,
          rawName,
          raw: typeof personItem.raw === "string" ? personItem.raw : null,
          resolutionType: parseImportPersonResolutionType(personItem.resolutionType),
          confidence: personItem.confidence,
          needsReview: personItem.needsReview,
        }];
      });

      return [{ fieldKey: item.fieldKey, people }];
    })
    : [];

const resolveImportNamesWithEdgeFunction = async (
  fields: ReportImportField[],
  segmentationFields: ReportImportField[],
  catalog: ImportOfficerCatalog,
  authHeader: string,
) => {
  const { url, key } = getSupabaseConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(`${url}/functions/v1/${RESOLVE_IMPORT_NAMES_FUNCTION}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "apikey": key,
        "Authorization": authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: fields.map((field) => ({
          fieldKey: field.fieldKey,
          label: field.label,
          raw: field.rawValue,
          normalized: field.normalizedValue,
          allowUnknownPeople: true,
          candidates: getImportNameCandidatePayloads(field),
        })),
        segmentGroups: getSegmentationGroupPayloads(segmentationFields, catalog),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${RESOLVE_IMPORT_NAMES_FUNCTION} failed (${response.status}): ${text}`);
    }

    const payload = await response.json() as { resolutions?: unknown; segmentations?: unknown };
    return {
      resolutions: parseResolutionPayloads(payload.resolutions),
      segmentations: parseSegmentationPayloads(payload.segmentations),
    };
  } finally {
    clearTimeout(timeout);
  }
};

const geminiStatusForConfidence = (confidence: number) =>
  confidence >= 0.8 ? "needs_review" as const : "rejected" as const;

const findOfficerByCedula = (catalog: ImportOfficerCatalog, cedula: string) =>
  catalog.officers.find((item) => item.cedula === cedula) ?? null;

const buildGeminiPersonField = (
  field: ReportImportField,
  officer: ImportOfficerRecord,
  confidenceValue: number,
  rawValue: string | null,
  metadata: Record<string, unknown> = {},
) => {
  const confidence = Math.min(Math.max(Number(confidenceValue) || 0, 0), 0.94);
  return {
    ...field,
    source: "gemini" as const,
    rawValue: rawValue || field.rawValue,
    normalizedValue: normalizeImportText(rawValue || field.rawValue || officer.nombre),
    finalValue: officer.nombre,
    confidence,
    status: geminiStatusForConfidence(confidence),
    metadata: {
      ...field.metadata,
      ...metadata,
      officerCedula: officer.cedula,
      geminiFunction: RESOLVE_IMPORT_NAMES_FUNCTION,
      resolutionType: metadata.resolutionType || "probable_catalog_officer",
      match: {
        officerId: officer.id || null,
        nombre: officer.nombre,
        cedula: officer.cedula,
        confidence,
        level: "gemini",
        needsReview: true,
      },
    },
  };
};

const buildGeminiUnknownPersonField = (
  field: ReportImportField,
  rawName: string | null,
  confidenceValue: number,
  resolutionType: ImportPersonResolutionType,
  metadata: Record<string, unknown> = {},
) => {
  const cleanRaw = rawName || field.rawValue || "";
  const confidence = Math.min(Math.max(Number(confidenceValue) || 0, 0), 0.79);
  return {
    ...field,
    source: "gemini" as const,
    rawValue: cleanRaw,
    normalizedValue: normalizeImportText(cleanRaw),
    finalValue: null,
    confidence,
    status: "rejected" as const,
    metadata: {
      ...field.metadata,
      ...metadata,
      officerCedula: null,
      resolutionType,
      geminiFunction: RESOLVE_IMPORT_NAMES_FUNCTION,
      match: {
        nombre: cleanRaw,
        cedula: null,
        confidence,
        level: "none",
        needsReview: true,
      },
    },
  };
};

const indexedPersonFields = (fields: ReportImportField[], groupKey: string) =>
  fields
    .filter((field) => field.kind === "person" && field.fieldKey.startsWith(`${groupKey}.`))
    .sort((left, right) => {
      const leftIndex = Number(left.fieldKey.split(".").at(-1));
      const rightIndex = Number(right.fieldKey.split(".").at(-1));
      return (Number.isFinite(leftIndex) ? leftIndex : 0) - (Number.isFinite(rightIndex) ? rightIndex : 0);
    });

const reindexGroupedPersonFields = (fields: ReportImportField[]) => {
  const counters = new Map<string, number>();
  return fields.map((field) => {
    if (field.kind !== "person") return field;
    const groupKey = getMetadataString(field, "groupKey");
    if (groupKey !== "acompanantes" && groupKey !== "tripulantes") return field;
    const index = counters.get(groupKey) || 0;
    counters.set(groupKey, index + 1);
    return {
      ...field,
      fieldKey: `${groupKey}.${index}`,
    };
  });
};

const fieldFinalValue = (
  fields: ReportImportField[],
  fieldKey: string,
  fallback: unknown,
) => {
  const field = fields.find((item) => item.fieldKey === fieldKey);
  return field ? field.finalValue || "" : fallback;
};

const fieldCedula = (
  fields: ReportImportField[],
  fieldKey: string,
  fallback: unknown,
) => {
  const field = fields.find((item) => item.fieldKey === fieldKey);
  return field ? field.metadata.officerCedula || field.metadata.cedula || "" : fallback;
};

const syncExtractedPeopleFromFields = (
  draft: ReportImportDraft,
  fields: ReportImportField[],
) => {
  const extractedData = { ...draft.extractedData };
  if (draft.reportType === "vehiculo") {
    return {
      ...extractedData,
      chofer: fieldFinalValue(fields, "chofer", extractedData.chofer),
      chofer_cedula: fieldCedula(fields, "chofer", extractedData.chofer_cedula),
      oficial_a_cargo: fieldFinalValue(fields, "oficial_a_cargo", extractedData.oficial_a_cargo),
      oficial_a_cargo_cedula: fieldCedula(fields, "oficial_a_cargo", extractedData.oficial_a_cargo_cedula),
      acompanantes: indexedPersonFields(fields, "acompanantes")
        .map((field) => field.finalValue)
        .filter(Boolean),
    };
  }

  return {
    ...extractedData,
    capitan: fieldFinalValue(fields, "capitan", extractedData.capitan),
    capitan_cedula: fieldCedula(fields, "capitan", extractedData.capitan_cedula),
    encargado_mision: fieldFinalValue(fields, "encargado_mision", extractedData.encargado_mision),
    encargado_mision_cedula: fieldCedula(fields, "encargado_mision", extractedData.encargado_mision_cedula),
    oficial_director: fieldFinalValue(fields, "oficial_director", extractedData.oficial_director),
    oficial_director_cedula: fieldCedula(fields, "oficial_director", extractedData.oficial_director_cedula),
    operacional: fieldFinalValue(fields, "operacional", extractedData.operacional),
    operacional_cedula: fieldCedula(fields, "operacional", extractedData.operacional_cedula),
    tripulantes: indexedPersonFields(fields, "tripulantes")
      .map((field) => ({
        nombre: field.finalValue,
        cedula: field.metadata.officerCedula || "",
      }))
      .filter((person) => person.nombre),
  };
};

const applyGeminiResolutions = async (
  draft: ReportImportDraft,
  catalog: ImportOfficerCatalog,
  authHeader: string,
) => {
  const personReviewFields = draft.fields.filter((field) => {
    if (field.kind !== "person" || field.status === "accepted") return false;
    const hasRawName = Boolean(normalizeImportText(field.rawValue || ""));
    const candidates = getImportNameCandidatePayloads(field);
    return hasRawName || candidates.length > 0;
  });
  const segmentationFields = personReviewFields.filter((field) => field.metadata.groupNeedsSegmentation === true);
  const unresolved = personReviewFields.filter((field) =>
    field.metadata.groupNeedsSegmentation === true ||
    field.status === "rejected" ||
    field.confidence < 0.8 ||
    !normalizeImportText(field.finalValue || ""),
  );
  if (unresolved.length === 0 && segmentationFields.length === 0) return draft;

  try {
    const { resolutions, segmentations } = await resolveImportNamesWithEdgeFunction(
      unresolved,
      segmentationFields,
      catalog,
      authHeader,
    );
    const byField = new Map(resolutions.map((resolution) => [resolution.fieldKey, resolution]));
    const segmentationsByField = new Map(segmentations.map((segmentation) => [segmentation.fieldKey, segmentation]));
    const fieldsBeforeReindex = draft.fields.flatMap((field) => {
      const segmentation = segmentationsByField.get(field.fieldKey);
      const segmentedPeople = segmentation?.people.filter((person) => person.resolutionType !== "non_person");
      if (segmentedPeople && segmentedPeople.length > 0) {
        const groupKey = getMetadataString(field, "groupKey") || field.fieldKey.split(".")[0];
        return segmentedPeople
          .map((person, index) => {
            const officer = person.officerCedula ? findOfficerByCedula(catalog, person.officerCedula) : null;
            const nextField = officer
              ? buildGeminiPersonField(field, officer, person.confidence, person.rawName || person.raw, {
                  fieldKeyBeforeSegmentation: field.fieldKey,
                  groupAiSegmented: true,
                  groupAiSegmentIndex: index,
                  geminiNeedsReview: person.needsReview,
                  resolutionType: person.resolutionType,
                })
              : buildGeminiUnknownPersonField(field, person.rawName || person.raw, person.confidence, person.resolutionType, {
                  fieldKeyBeforeSegmentation: field.fieldKey,
                  groupAiSegmented: true,
                  groupAiSegmentIndex: index,
                  geminiNeedsReview: person.needsReview,
                });
            return {
              ...nextField,
              fieldKey: `${groupKey}.${index}`,
            };
          });
      }

      const resolution = byField.get(field.fieldKey);
      if (!resolution) return [field];
      if (resolution.resolutionType === "non_person") return [field];
      const officer = resolution.officerCedula ? findOfficerByCedula(catalog, resolution.officerCedula) : null;
      if (!officer) {
        return [buildGeminiUnknownPersonField(field, resolution.rawName || field.rawValue, resolution.confidence, resolution.resolutionType, {
          geminiNeedsReview: resolution.needsReview,
        })];
      }
      return [buildGeminiPersonField(field, officer, resolution.confidence, resolution.rawName || field.rawValue, {
        geminiNeedsReview: resolution.needsReview,
        resolutionType: resolution.resolutionType,
      })];
    });
    const fields = reindexGroupedPersonFields(fieldsBeforeReindex);

    return reportImportDraftSchema.parse({
      ...draft,
      fields,
      extractedData: syncExtractedPeopleFromFields(draft, fields),
      status: fields.some((field) => field.status !== "accepted") ? "review_required" : "ready",
    });
  } catch (error) {
    return reportImportDraftSchema.parse({
      ...draft,
      status: "gemini_failed",
      geminiError: error instanceof Error ? error.message : "Gemini failed",
    });
  }
};

const insertImportRows = async (
  draft: ReportImportDraft,
  file: File,
  authHeader: string,
) => {
  await supabaseFetch(
    "/rest/v1/report_import_jobs",
    {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: draft.jobId,
        status: draft.status,
        report_type: draft.reportType,
        original_filename: draft.fileName,
        storage_bucket: SNAPSHOT_BUCKET,
        storage_path: draft.storagePath,
        file_size_bytes: file.size,
        mime_type: file.type || null,
        gemini_error: draft.geminiError || null,
      }),
    },
    authHeader,
  );

  await supabaseFetch(
    "/rest/v1/report_import_fields",
    {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(draft.fields.map((field) => ({
        job_id: draft.jobId,
        field_key: field.fieldKey,
        field_label: field.label,
        field_kind: field.kind,
        raw_value: field.rawValue,
        normalized_value: field.normalizedValue,
        final_value: field.finalValue,
        cell_address: field.cellAddress,
        source: field.source,
        confidence: field.confidence,
        status: field.status,
        metadata: field.metadata,
      }))),
    },
    authHeader,
  );
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

      const retryAfter = checkRateLimit(userId || request.headers.get("x-forwarded-for") || "anonymous");
      if (retryAfter) {
        return jsonResponse({ error: "Demasiadas cargas. Intente de nuevo en unos segundos.", retryAfter }, 429);
      }

      const formData = await request.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return jsonResponse({ error: "No se recibio archivo" }, 400);
      }

      const validationError = validateFile(file);
      if (validationError) return jsonResponse({ error: validationError }, 400);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const workbook = XLSX.read(bytes, { type: "array", cellDates: false });
      const catalog = await loadOfficerCatalog(authHeader);
      const reportCatalogs = await loadReportCatalogs(authHeader);
      const jobId = crypto.randomUUID();
      const storagePath = `${userId}/${jobId}/${sanitizeFileName(file.name)}`;

      await uploadSnapshot(bytes, file, storagePath, authHeader);

      const baseDraft = buildReportImportDraftFromWorkbook(workbook, XLSX, {
        jobId,
        fileName: file.name,
        storagePath,
        catalog,
        reportCatalogs,
      });
      const draft = await applyGeminiResolutions(baseDraft, catalog, authHeader);
      await insertImportRows(draft, file, authHeader);

      return jsonResponse({ data: draft });
    } catch (error) {
      return jsonResponse({
        error: error instanceof Error ? error.message : "Error al importar reporte",
      }, 500);
    }
  },
};

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const geminiChatCompletionsUrl = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

type ImportNameCandidate = {
  nombre: string;
  cedula: string;
  confidence: number | null;
  level: string | null;
};

type ImportNameField = {
  fieldKey: string;
  label: string | null;
  raw: string | null;
  normalized: string | null;
  allowUnknownPeople: boolean;
  candidates: ImportNameCandidate[];
};

type ImportNameSegmentGroup = ImportNameField & {
  groupKey: string | null;
};

type ImportNameResolution = {
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

type ImportNameSegmentation = {
  fieldKey: string;
  people: Array<{
    officerCedula: string | null;
    rawName: string;
    raw: string | null;
    resolutionType: ImportPersonResolutionType;
    confidence: number;
    needsReview: boolean;
  }>;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const getRetryAfterMs = (response: Response) => {
  const retryAfter = response.headers.get("Retry-After");
  if (!retryAfter) return 15000;

  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) return Math.max(1000, seconds * 1000);

  const retryDate = Date.parse(retryAfter);
  if (Number.isFinite(retryDate)) return Math.max(1000, retryDate - Date.now());

  return 15000;
};

const aiRateLimitResponse = (response: Response) =>
  jsonResponse({
    error: "Se alcanzo el limite temporal de IA. Intente continuar en unos minutos.",
    code: "AI_RATE_LIMITED",
    retryAfterMs: getRetryAfterMs(response),
    retryable: true,
  }, 429);

const aiCreditsResponse = () =>
  jsonResponse({
    error: "Creditos insuficientes para usar IA.",
    code: "AI_CREDITS_REQUIRED",
    retryable: false,
  }, 402);

const getGeminiApiKey = () => {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");
  return apiKey;
};

const getGeminiTextModel = () =>
  Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-3.1-flash-lite";

const asString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const asNullableString = (value: unknown) => {
  const text = asString(value);
  return text || null;
};

const IMPORT_PERSON_RESOLUTION_TYPES = new Set<ImportPersonResolutionType>([
  "catalog_officer",
  "probable_catalog_officer",
  "unknown_person",
  "possible_new_officer",
  "non_person",
]);

const parseResolutionType = (value: unknown): ImportPersonResolutionType =>
  typeof value === "string" && IMPORT_PERSON_RESOLUTION_TYPES.has(value as ImportPersonResolutionType)
    ? value as ImportPersonResolutionType
    : "unknown_person";

const parseCandidate = (value: unknown): ImportNameCandidate | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const nombre = asString(item.nombre);
  const cedula = asString(item.cedula);
  if (!nombre || !cedula) return null;

  return {
    nombre,
    cedula,
    confidence: typeof item.confidence === "number" ? item.confidence : null,
    level: asNullableString(item.level),
  };
};

const parseField = (value: unknown): ImportNameField | null => {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const fieldKey = asString(item.fieldKey);
  if (!fieldKey) return null;

  const candidates = Array.isArray(item.candidates)
    ? item.candidates.map(parseCandidate).filter((candidate): candidate is ImportNameCandidate => Boolean(candidate))
    : [];

  return {
    fieldKey,
    label: asNullableString(item.label),
    raw: asNullableString(item.raw),
    normalized: asNullableString(item.normalized),
    allowUnknownPeople: item.allowUnknownPeople !== false,
    candidates,
  };
};

const parseFields = (body: unknown) => {
  if (!body || typeof body !== "object") return [];
  const fields = (body as Record<string, unknown>).fields;
  return Array.isArray(fields)
    ? fields.map(parseField).filter((field): field is ImportNameField => Boolean(field))
    : [];
};

const parseSegmentGroup = (value: unknown): ImportNameSegmentGroup | null => {
  const field = parseField(value);
  if (!field || !value || typeof value !== "object") return null;

  return {
    ...field,
    groupKey: asNullableString((value as Record<string, unknown>).groupKey),
  };
};

const parseSegmentGroups = (body: unknown) => {
  if (!body || typeof body !== "object") return [];
  const groups = (body as Record<string, unknown>).segmentGroups;
  return Array.isArray(groups)
    ? groups.map(parseSegmentGroup).filter((group): group is ImportNameSegmentGroup => Boolean(group))
    : [];
};

const parseToolArguments = (value: unknown) => {
  if (!value) return { resolutions: [], segmentations: [] };
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return { resolutions: [], segmentations: [] };
    }
  }
  return typeof value === "object" ? value as Record<string, unknown> : { resolutions: [], segmentations: [] };
};

const clampConfidence = (value: unknown) => {
  const confidence = typeof value === "number" ? value : Number(value);
  return Number.isFinite(confidence) ? Math.max(0, Math.min(confidence, 1)) : 0;
};

const sanitizeResolutions = (
  rawResolutions: unknown,
  fields: ImportNameField[],
): ImportNameResolution[] => {
  if (!Array.isArray(rawResolutions)) return [];

  const allowedByField = new Map(
    fields.map((field) => [
      field.fieldKey,
      new Set(field.candidates.map((candidate) => candidate.cedula)),
    ]),
  );
  const seen = new Set<string>();
  const resolutions: ImportNameResolution[] = [];

  rawResolutions.forEach((value) => {
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    const fieldKey = asString(item.fieldKey);
    const officerCedula = asString(item.officerCedula) || null;
    const allowedCedulas = allowedByField.get(fieldKey);
    const resolutionType = parseResolutionType(item.resolutionType);
    const rawName = asNullableString(item.rawName) || asNullableString(item.raw);
    if (!fieldKey || seen.has(fieldKey)) return;
    if (officerCedula && !allowedCedulas?.has(officerCedula)) return;
    if (!officerCedula && !rawName && resolutionType !== "non_person") return;

    const confidence = clampConfidence(item.confidence);
    resolutions.push({
      fieldKey,
      officerCedula,
      rawName,
      resolutionType: officerCedula && resolutionType === "unknown_person" ? "probable_catalog_officer" : resolutionType,
      confidence,
      needsReview: Boolean(item.needsReview) || confidence < 0.95 || !officerCedula,
    });
    seen.add(fieldKey);
  });

  return resolutions;
};

const sanitizeSegmentations = (
  rawSegmentations: unknown,
  groups: ImportNameSegmentGroup[],
): ImportNameSegmentation[] => {
  if (!Array.isArray(rawSegmentations)) return [];

  const allowedByField = new Map(
    groups.map((group) => [
      group.fieldKey,
      new Set(group.candidates.map((candidate) => candidate.cedula)),
    ]),
  );
  const seenFields = new Set<string>();
  const segmentations: ImportNameSegmentation[] = [];

  rawSegmentations.forEach((value) => {
    if (!value || typeof value !== "object") return;
    const item = value as Record<string, unknown>;
    const fieldKey = asString(item.fieldKey);
    const allowedCedulas = allowedByField.get(fieldKey);
    if (!fieldKey || seenFields.has(fieldKey) || !Array.isArray(item.people)) return;

    const seenPeople = new Set<string>();
    const people = item.people.flatMap((person) => {
      if (!person || typeof person !== "object") return [];
      const personItem = person as Record<string, unknown>;
      const officerCedula = asString(personItem.officerCedula) || null;
      const rawName = asString(personItem.rawName) || asString(personItem.raw);
      const resolutionType = parseResolutionType(personItem.resolutionType);
      if (officerCedula && !allowedCedulas?.has(officerCedula)) return [];
      if (!officerCedula && !rawName && resolutionType !== "non_person") return [];

      const confidence = clampConfidence(personItem.confidence);
      const personKey = officerCedula || `${resolutionType}:${rawName.toLowerCase()}`;
      if (seenPeople.has(personKey)) return [];
      seenPeople.add(personKey);
      return [{
        officerCedula,
        rawName,
        raw: asNullableString(personItem.raw),
        resolutionType: officerCedula && resolutionType === "unknown_person" ? "probable_catalog_officer" : resolutionType,
        confidence,
        needsReview: Boolean(personItem.needsReview) || confidence < 0.95 || !officerCedula,
      }];
    }).slice(0, 8);

    if (people.length > 0) {
      segmentations.push({ fieldKey, people });
      seenFields.add(fieldKey);
    }
  });

  return segmentations;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const fields = parseFields(body);
    const segmentGroups = parseSegmentGroups(body);
    const resolvableFields = fields.filter((field) => field.candidates.length > 0 || field.allowUnknownPeople);
    const resolvableSegmentGroups = segmentGroups.filter((group) => group.candidates.length > 0 || group.allowUnknownPeople);
    if (fields.length === 0 && segmentGroups.length === 0) return jsonResponse({ error: "No fields provided" }, 400);
    if (resolvableFields.length === 0 && resolvableSegmentGroups.length === 0) {
      return jsonResponse({ resolutions: [], segmentations: [] });
    }

    const systemPrompt = [
      "Eres un asistente para segmentar y resolver nombres de personas en reportes.",
      "Recibiras texto raw, texto normalizado y candidatos del catalogo por cada campo.",
      "No inventes oficiales ni cedulas.",
      "Para cada campo, solo puedes devolver una cedula incluida en candidates de ese mismo fieldKey.",
      "Cuando no haya cedula o rawName, usa cadena vacia en vez de inventar datos.",
      "Si el texto contiene una persona que no esta en candidates, conservala como rawName y usa resolutionType unknown_person o possible_new_officer.",
      "Usa possible_new_officer cuando el fragmento parece nombre completo de funcionario nuevo; usa unknown_person para persona externa o no confirmada.",
      "Usa non_person solo para ruido, rangos, etiquetas o texto que claramente no sea persona.",
      "Algunos segmentGroups pueden contener dos o mas personas pegadas sin coma; si es claro, devuelve segmentations con todas las personas separadas, incluyendo desconocidas.",
      "Si no hay un candidato claro pero el texto parece persona, devuelve una resolucion unknown_person o possible_new_officer en vez de descartar el nombre.",
      "Si no estas seguro de que un segmentGroup contiene varias personas, no devuelvas segmentacion.",
      "Marca needsReview true cuando sea una correccion por typo, variante de apellido o cualquier duda.",
    ].join(" ");

    const response = await fetch(geminiChatCompletionsUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getGeminiApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getGeminiTextModel(),
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: JSON.stringify({
              fields: resolvableFields.map((field) => ({
                fieldKey: field.fieldKey,
                label: field.label,
                raw: field.raw,
                normalized: field.normalized,
                allowUnknownPeople: field.allowUnknownPeople,
                candidates: field.candidates,
              })),
              segmentGroups: resolvableSegmentGroups.map((group) => ({
                fieldKey: group.fieldKey,
                groupKey: group.groupKey,
                label: group.label,
                raw: group.raw,
                normalized: group.normalized,
                allowUnknownPeople: group.allowUnknownPeople,
                candidates: group.candidates,
              })),
            }),
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_name_resolutions",
              parameters: {
                type: "object",
                properties: {
                  resolutions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        fieldKey: { type: "string" },
                        officerCedula: { type: "string" },
                        rawName: { type: "string" },
                        resolutionType: {
                          type: "string",
                          enum: ["catalog_officer", "probable_catalog_officer", "unknown_person", "possible_new_officer", "non_person"],
                        },
                        confidence: { type: "number" },
                        needsReview: { type: "boolean" },
                      },
                      required: ["fieldKey", "officerCedula", "rawName", "resolutionType", "confidence", "needsReview"],
                    },
                  },
                  segmentations: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        fieldKey: { type: "string" },
                        people: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              officerCedula: { type: "string" },
                              rawName: { type: "string" },
                              raw: { type: "string" },
                              resolutionType: {
                                type: "string",
                                enum: ["catalog_officer", "probable_catalog_officer", "unknown_person", "possible_new_officer", "non_person"],
                              },
                              confidence: { type: "number" },
                              needsReview: { type: "boolean" },
                            },
                            required: ["officerCedula", "rawName", "resolutionType", "confidence", "needsReview"],
                          },
                        },
                      },
                      required: ["fieldKey", "people"],
                    },
                  },
                },
                required: ["resolutions", "segmentations"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_name_resolutions" } },
      }),
    });

    if (response.status === 429) return aiRateLimitResponse(response);
    if (response.status === 402) return aiCreditsResponse();
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${errorBody}`);
    }

    const payload = await response.json();
    const toolArguments = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = parseToolArguments(toolArguments);

    return jsonResponse({
      resolutions: sanitizeResolutions(parsed.resolutions, resolvableFields),
      segmentations: sanitizeSegmentations(parsed.segmentations, resolvableSegmentGroups),
    });
  } catch (error) {
    console.error("resolve-import-names error:", error);
    return jsonResponse({
      error: error instanceof Error ? error.message : "Error resolving import names",
    }, 500);
  }
});

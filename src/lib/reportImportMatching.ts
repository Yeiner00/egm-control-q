import { BASE_OFFICER_ALIASES, BASE_OFFICERS } from "./officerCatalog";
import { normalizeName, normalizeNameKey, removeAccents } from "./normalizeName";
import type { ReportImportCandidate, ReportImportOfficerMatch } from "./reportImportSchema";

export interface ImportOfficerRecord {
  id?: string | null;
  nombre: string;
  cedula: string | null;
  nombre_normalizado?: string | null;
}

export interface ImportOfficerAliasRecord {
  alias: string;
  alias_normalizado?: string | null;
  officer_nombre?: string | null;
  officer_cedula?: string | null;
  officer_id?: string | null;
}

export interface ImportOfficerCatalog {
  officers: ImportOfficerRecord[];
  aliases: ImportOfficerAliasRecord[];
}

export interface SplitImportPersonNamesResult {
  names: string[];
  duplicates: string[];
}

export const DEFAULT_IMPORT_OFFICER_CATALOG: ImportOfficerCatalog = {
  officers: BASE_OFFICERS.map((officer) => ({
    nombre: officer.nombre,
    cedula: officer.identificacion,
    nombre_normalizado: normalizeNameKey(officer.nombre),
  })),
  aliases: BASE_OFFICER_ALIASES.map((alias) => ({
    alias: alias.alias,
    alias_normalizado: normalizeNameKey(alias.alias),
    officer_nombre: alias.officerName,
  })),
};

const ROLE_PHRASES = [
  "acompanantes",
  "acompañantes",
  "personas particulares a bordo",
  "personas particulares",
  "operador",
  "operadora",
  "jefe de mision",
  "jefe mision",
  "encargado de la mision",
  "marineros",
  "marinaos",
  "marineras",
  "tripulacion",
  "supervisando",
];

const NON_PERSON_KEYS = new Set([
  "",
  "acompanantes",
  "personas particulares a bordo",
  "personas particulares",
  "operador",
  "jefe de mision",
  "jefe mision",
  "marineros",
  "marinaos",
  "agentes",
  "agente",
  "tripulacion",
  "supervisando",
]);

const RANK_WORD_REGEX = /\b(?:agentes?|agte|agt|s\s*\.?\s*int|sint|subintendent|subintendente|inspector|insp|comandante|cmdt|cmdte|cmte|capitan|cap|teniente|tenienete)\.?\b/gi;
const CONCATENATED_NAME_MIN_CONFIDENCE = 0.86;

export const normalizeImportText = (value: string | null | undefined) =>
  removeAccents(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripFieldLabel = (value: string) =>
  value
    .replace(/^\s*(?:acompa(?:ñ|n)antes|personas particulares a bordo|personas particulares)\s*:\s*/i, "")
    .trim();

const stripRolePhrases = (value: string) => {
  let next = value;
  ROLE_PHRASES.forEach((phrase) => {
    next = next.replace(new RegExp(`\\b${phrase}\\b\\s*:?`, "gi"), " ");
  });
  return next.replace(/\s+/g, " ").trim();
};

export const cleanImportPersonName = (value: string) => {
  const withoutLabel = stripFieldLabel(value)
    .replace(/\bdel\s+sinac\b/gi, "")
    .replace(/\bsinac\b/gi, "")
    .replace(/\bjm\b(?=\s+joel\b)/gi, "")
    .replace(/\bsupervisando\b/gi, "")
    .replace(/\btripulaci(?:o|ó)n\b/gi, "");
  const withoutRoles = stripRolePhrases(withoutLabel).replace(RANK_WORD_REGEX, " ");
  return normalizeName(withoutRoles);
};

const levenshteinDistance = (left: string, right: string) => {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const current = new Array<number>(right.length + 1);

  for (let i = 0; i < left.length; i += 1) {
    current[0] = i + 1;
    for (let j = 0; j < right.length; j += 1) {
      current[j + 1] = Math.min(
        previous[j + 1] + 1,
        current[j] + 1,
        previous[j] + (left[i] === right[j] ? 0 : 1),
      );
    }
    for (let j = 0; j <= right.length; j += 1) {
      previous[j] = current[j];
    }
  }

  return previous[right.length];
};

const trigrams = (value: string) => {
  const padded = `  ${value} `;
  const items = new Set<string>();
  for (let index = 0; index < padded.length - 2; index += 1) {
    items.add(padded.slice(index, index + 3));
  }
  return items;
};

const trigramSimilarity = (left: string, right: string) => {
  const leftSet = trigrams(left);
  const rightSet = trigrams(right);
  if (leftSet.size === 0 || rightSet.size === 0) return 0;
  const shared = [...leftSet].filter((item) => rightSet.has(item)).length;
  return (2 * shared) / (leftSet.size + rightSet.size);
};

const getOfficerKey = (officer: ImportOfficerRecord) =>
  officer.nombre_normalizado || normalizeNameKey(officer.nombre);

const getOfficerFromAlias = (catalog: ImportOfficerCatalog, normalizedAlias: string) => {
  const alias = catalog.aliases.find((item) =>
    (item.alias_normalizado || normalizeNameKey(item.alias)) === normalizedAlias,
  );
  if (!alias) return null;

  return catalog.officers.find((officer) =>
    (alias.officer_id && officer.id === alias.officer_id) ||
    (alias.officer_cedula && officer.cedula === alias.officer_cedula) ||
    (alias.officer_nombre && officer.nombre === alias.officer_nombre),
  ) ?? null;
};

const toMatch = (
  officer: ImportOfficerRecord,
  confidence: number,
  level: ReportImportOfficerMatch["level"],
): ReportImportOfficerMatch => ({
  officerId: officer.id ?? null,
  nombre: officer.nombre,
  cedula: officer.cedula,
  confidence,
  level,
  needsReview: confidence < 0.95 || level === "fuzzy" || level === "gemini",
});

const buildFuzzyCandidates = (catalog: ImportOfficerCatalog, normalizedName: string): ReportImportCandidate[] =>
  catalog.officers
    .map((officer) => {
      const officerKey = getOfficerKey(officer);
      const distance = levenshteinDistance(normalizedName, officerKey);
      const maxLength = Math.max(normalizedName.length, officerKey.length, 1);
      const editScore = 1 - distance / maxLength;
      const trigramScore = trigramSimilarity(normalizedName, officerKey);
      const tokens = normalizedName.split(" ").filter(Boolean);
      const officerTokens = officerKey.split(" ").filter(Boolean);
      const sameFirst = tokens[0] && tokens[0] === officerTokens[0];
      const sameLast = tokens.at(-1) && tokens.at(-1) === officerTokens.at(-1);
      const tokenGuard = sameFirst || sameLast;
      const confidence = tokenGuard ? Math.max(editScore, trigramScore) : trigramScore * 0.8;

      return {
        officerId: officer.id ?? null,
        nombre: officer.nombre,
        cedula: officer.cedula,
        confidence: Math.max(0, Math.min(confidence, 0.9)),
        level: "fuzzy",
      };
    })
    .filter((candidate) => candidate.confidence >= 0.72)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5);

const getOfficerFromCandidate = (catalog: ImportOfficerCatalog, candidate: ReportImportCandidate) =>
  catalog.officers.find((officer) =>
    (candidate.officerId && officer.id === candidate.officerId) ||
    (candidate.cedula && officer.cedula === candidate.cedula) ||
    officer.nombre === candidate.nombre,
  ) ?? null;

const getCatalogSegmentLengths = (catalog: ImportOfficerCatalog) =>
  Array.from(new Set([
    2,
    ...catalog.officers.map((officer) => getOfficerKey(officer).split(" ").filter(Boolean).length),
    ...catalog.aliases.map((alias) => (alias.alias_normalizado || normalizeNameKey(alias.alias)).split(" ").filter(Boolean).length),
  ]))
    .filter((length) => length >= 2 && length <= 5)
    .sort((left, right) => right - left);

const matchCatalogNameSegment = (catalog: ImportOfficerCatalog, normalizedSegment: string) => {
  const aliasOfficer = getOfficerFromAlias(catalog, normalizedSegment);
  if (aliasOfficer) return { confidence: 1 };

  const exactOfficer = catalog.officers.find((officer) => getOfficerKey(officer) === normalizedSegment);
  if (exactOfficer) return { confidence: 0.98 };

  const segmentTokens = normalizedSegment.split(" ").filter(Boolean);
  const prefixOfficer = segmentTokens.length >= 2
    ? catalog.officers.find((officer) => {
        const officerTokens = getOfficerKey(officer).split(" ").filter(Boolean);
        return officerTokens.length > segmentTokens.length &&
          officerTokens.slice(0, segmentTokens.length).join(" ") === normalizedSegment;
      })
    : null;
  if (prefixOfficer) return { confidence: 0.86 };

  const bestCandidate = buildFuzzyCandidates(catalog, normalizedSegment)[0];
  const bestOfficer = bestCandidate ? getOfficerFromCandidate(catalog, bestCandidate) : null;
  if (bestCandidate && bestOfficer && bestCandidate.confidence >= CONCATENATED_NAME_MIN_CONFIDENCE) {
    return { confidence: bestCandidate.confidence };
  }

  return null;
};

const splitConcatenatedPeoplePreservingUnknowns = (
  cleaned: string,
  catalog: ImportOfficerCatalog,
) => {
  const normalized = normalizeNameKey(cleaned);
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < 4) return [cleaned];

  const lengths = getCatalogSegmentLengths(catalog);
  const segments: string[] = [];
  let unknownTokens: string[] = [];
  let index = 0;
  const flushUnknown = () => {
    if (unknownTokens.length >= 2) {
      const unknownName = normalizeName(unknownTokens.join(" "));
      const key = normalizeNameKey(unknownName);
      if (key && !NON_PERSON_KEYS.has(key)) segments.push(unknownName);
    }
    unknownTokens = [];
  };

  while (index < tokens.length) {
    const best = lengths
      .filter((length) => index + length <= tokens.length)
      .map((length) => {
        const segment = tokens.slice(index, index + length).join(" ");
        const match = matchCatalogNameSegment(catalog, segment);
        return match ? { start: index, length, confidence: match.confidence } : null;
      })
      .filter((match): match is { start: number; length: number; confidence: number } => Boolean(match))
      .sort((left, right) => right.confidence - left.confidence || right.length - left.length)[0];

    if (best) {
      flushUnknown();
      segments.push(normalizeName(tokens.slice(best.start, best.start + best.length).join(" ")));
      index += best.length;
    } else {
      unknownTokens.push(tokens[index]);
      index += 1;
    }
  }
  flushUnknown();

  if (segments.length === 0) return [cleaned];
  if (segments.length === 1 && normalizeNameKey(segments[0]) === normalized) return [cleaned];

  return segments;
};

export const splitImportPersonNamesDetailed = (
  raw: string | null | undefined,
  catalog: ImportOfficerCatalog = DEFAULT_IMPORT_OFFICER_CATALOG,
): SplitImportPersonNamesResult => {
  if (!raw) return { names: [], duplicates: [] };

  const prepared = stripFieldLabel(raw)
    .replace(/\b(?:operador|operadora|jefe\s+de\s+mision|jefe\s+mision|marineros|marinaos|tripulacion)\b\s*:?/gi, ";")
    .replace(/\s+(?:y|e)\s+/gi, ";")
    .replace(/\s+(?=(?:agentes?|agte|agt|s\s*\.?\s*int|sint|subintendent|subintendente|inspector|insp|comandante|cmdt|cmdte|cmte|capitan|cap)\.?\s+)/gi, ";");

  const people = new Map<string, string>();
  const duplicates = new Map<string, string>();
  prepared.split(/[,;\n]+/).forEach((item) => {
    const cleaned = cleanImportPersonName(item);
    splitConcatenatedPeoplePreservingUnknowns(cleaned, catalog).forEach((name) => {
      const key = normalizeNameKey(name);
      if (!NON_PERSON_KEYS.has(key) && key) {
        if (people.has(key)) {
          duplicates.set(key, people.get(key) || name);
          return;
        }
        people.set(key, name);
      }
    });
  });

  return {
    names: Array.from(people.values()),
    duplicates: Array.from(duplicates.values()),
  };
};

export const splitImportPersonNames = (
  raw: string | null | undefined,
  catalog: ImportOfficerCatalog = DEFAULT_IMPORT_OFFICER_CATALOG,
) => splitImportPersonNamesDetailed(raw, catalog).names;

export const matchImportOfficer = (
  rawName: string | null | undefined,
  catalog: ImportOfficerCatalog = DEFAULT_IMPORT_OFFICER_CATALOG,
  cedula?: string | null,
) => {
  const cleanedCedula = String(cedula ?? "").replace(/\D/g, "");
  if (cleanedCedula) {
    const byCedula = catalog.officers.find((officer) => officer.cedula === cleanedCedula);
    if (byCedula) {
      return {
        match: toMatch(byCedula, 1, "cedula"),
        candidates: [toMatch(byCedula, 1, "cedula")],
      };
    }
  }

  const [candidateName] = splitImportPersonNames(rawName, catalog);
  const cleanedName = candidateName || cleanImportPersonName(String(rawName ?? ""));
  const normalizedName = normalizeNameKey(cleanedName);
  if (!normalizedName) {
    return { match: null, candidates: [] };
  }

  const aliasOfficer = getOfficerFromAlias(catalog, normalizedName);
  if (aliasOfficer) {
    return {
      match: toMatch(aliasOfficer, 1, "alias"),
      candidates: [toMatch(aliasOfficer, 1, "alias")],
    };
  }

  const exactOfficer = catalog.officers.find((officer) => getOfficerKey(officer) === normalizedName);
  if (exactOfficer) {
    return {
      match: toMatch(exactOfficer, 0.98, "normalized"),
      candidates: [toMatch(exactOfficer, 0.98, "normalized")],
    };
  }

  const candidates = buildFuzzyCandidates(catalog, normalizedName);
  const best = candidates[0];
  return {
    match: best
      ? {
          officerId: best.officerId,
          nombre: best.nombre,
          cedula: best.cedula,
          confidence: best.confidence,
          level: "fuzzy" as const,
          needsReview: true,
        }
      : null,
    candidates,
  };
};

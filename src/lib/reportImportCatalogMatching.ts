import {
  DEFAULT_MOTIVE_CATALOG_LABELS,
  isBlockedMotiveCatalogValue,
  normalizeMotiveKey,
  normalizeMotives,
} from "./motives";
import { DEFAULT_REPORT_SITE_OPTIONS, normalizeSiteKey } from "./reportSites";

export type ImportCatalogType = "motive" | "site";
export type ImportCatalogMatchLevel = "alias" | "normalized" | "rule" | "fuzzy" | "gemini" | "none";

export interface ImportCatalogItem {
  id?: string | null;
  label: string;
  normalized: string;
  zona?: string | null;
  posicion?: string | null;
}

export interface ImportCatalogAlias {
  id?: string | null;
  alias: string;
  normalized: string;
  itemId?: string | null;
  itemLabel?: string | null;
}

export interface ImportSingleCatalog {
  items: ImportCatalogItem[];
  aliases: ImportCatalogAlias[];
}

export interface ImportReportCatalogs {
  motives: ImportSingleCatalog;
  sites: ImportSingleCatalog;
}

export interface ReportImportCatalogCandidate {
  itemId?: string | null;
  label: string;
  confidence: number;
  level: ImportCatalogMatchLevel;
  zona?: string | null;
  posicion?: string | null;
}

export interface ReportImportCatalogMatch extends ReportImportCatalogCandidate {
  needsReview: boolean;
}

export const DEFAULT_IMPORT_REPORT_CATALOGS: ImportReportCatalogs = {
  motives: {
    items: DEFAULT_MOTIVE_CATALOG_LABELS.map((label) => ({
      label,
      normalized: normalizeMotiveKey(label),
    })),
    aliases: [],
  },
  sites: {
    items: DEFAULT_REPORT_SITE_OPTIONS.map((site) => ({
      id: site.id,
      label: site.nombre_sitio,
      normalized: normalizeSiteKey(site.nombre_sitio),
      zona: site.zona,
      posicion: site.posicion,
    })),
    aliases: [
      {
        alias: "Playa Rajada",
        normalized: normalizeSiteKey("Playa Rajada"),
        itemLabel: "Rajada",
      },
      {
        alias: "Playa Soley",
        normalized: normalizeSiteKey("Playa Soley"),
        itemLabel: "Soley",
      },
    ],
  },
};

export const normalizeCatalogValue = (type: ImportCatalogType, value: string | null | undefined) =>
  type === "motive" ? normalizeMotiveKey(value) : normalizeSiteKey(value || "");

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
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
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

const tokenContainmentScore = (rawKey: string, itemKey: string) => {
  const rawTokens = rawKey.split(" ").filter(Boolean);
  const itemTokens = itemKey.split(" ").filter(Boolean);
  if (rawTokens.length === 0 || itemTokens.length === 0) return 0;

  const rawSet = new Set(rawTokens);
  const itemSet = new Set(itemTokens);
  const itemInsideRaw = itemTokens.every((token) => rawSet.has(token));
  const rawInsideItem = rawTokens.every((token) => itemSet.has(token));
  if (!itemInsideRaw && !rawInsideItem) return 0;

  const extraTokens = Math.abs(rawTokens.length - itemTokens.length);
  return Math.max(0.82, 0.9 - extraTokens * 0.03);
};

const toMatch = (
  item: ImportCatalogItem,
  confidence: number,
  level: ImportCatalogMatchLevel,
): ReportImportCatalogMatch => ({
  itemId: item.id ?? null,
  label: item.label,
  confidence,
  level,
  needsReview: confidence < 0.95 || level === "fuzzy" || level === "gemini",
  zona: item.zona ?? null,
  posicion: item.posicion ?? null,
});

const withoutBlockedMotives = (catalog: ImportSingleCatalog): ImportSingleCatalog => {
  const blockedIds = new Set(
    catalog.items
      .filter((item) => isBlockedMotiveCatalogValue(item.label) || isBlockedMotiveCatalogValue(item.normalized))
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    items: catalog.items.filter((item) =>
      !isBlockedMotiveCatalogValue(item.label) &&
      !isBlockedMotiveCatalogValue(item.normalized),
    ),
    aliases: catalog.aliases.filter((alias) =>
      !isBlockedMotiveCatalogValue(alias.itemLabel) &&
      !(alias.itemId && blockedIds.has(alias.itemId)),
    ),
  };
};

const getCatalogForType = (catalogs: ImportReportCatalogs, type: ImportCatalogType) =>
  type === "motive" ? withoutBlockedMotives(catalogs.motives) : catalogs.sites;

const findAliasItem = (catalog: ImportSingleCatalog, normalized: string) => {
  const aliases = catalog.aliases.filter((item) => item.normalized === normalized);
  for (const alias of aliases) {
    const item = catalog.items.find((catalogItem) =>
      (alias.itemId && catalogItem.id === alias.itemId) ||
      (alias.itemLabel && catalogItem.label === alias.itemLabel),
    );
    if (item) return item;
  }
  return null;
};

const findRuleMotives = (catalog: ImportSingleCatalog, rawValue: string) =>
  normalizeMotives([rawValue])
    .map((motive) => catalog.items.find((item) => item.normalized === motive.motivo_key))
    .filter((item): item is ImportCatalogItem => Boolean(item));

const buildFuzzyCandidates = (
  catalog: ImportSingleCatalog,
  normalized: string,
): ReportImportCatalogCandidate[] =>
  catalog.items
    .map((item) => {
      const distance = levenshteinDistance(normalized, item.normalized);
      const maxLength = Math.max(normalized.length, item.normalized.length, 1);
      const editScore = 1 - distance / maxLength;
      const trigramScore = trigramSimilarity(normalized, item.normalized);
      const containmentScore = tokenContainmentScore(normalized, item.normalized);
      const confidence = Math.max(editScore, trigramScore, containmentScore);

      return {
        itemId: item.id ?? null,
        label: item.label,
        confidence: Math.max(0, Math.min(confidence, 0.9)),
        level: "fuzzy" as const,
        zona: item.zona ?? null,
        posicion: item.posicion ?? null,
      };
    })
    .filter((candidate) => candidate.confidence >= 0.72)
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 5);

export const matchImportCatalogValue = (
  type: ImportCatalogType,
  rawValue: string | null | undefined,
  catalogs: ImportReportCatalogs = DEFAULT_IMPORT_REPORT_CATALOGS,
) => {
  const raw = String(rawValue || "").trim();
  const normalized = normalizeCatalogValue(type, raw);
  const catalog = getCatalogForType(catalogs, type);
  if (!normalized) return { match: null, candidates: [] };

  const aliasItem = findAliasItem(catalog, normalized);
  if (aliasItem) {
    const match = toMatch(aliasItem, 1, "alias");
    return { match, candidates: [match] };
  }

  const exactItem = catalog.items.find((item) => item.normalized === normalized);
  if (exactItem) {
    const match = toMatch(exactItem, 0.98, "normalized");
    return { match, candidates: [match] };
  }

  if (type === "motive") {
    const [ruleItem] = findRuleMotives(catalog, raw);
    if (ruleItem) {
      const match = toMatch(ruleItem, 0.98, "rule");
      return { match, candidates: [match] };
    }
  }

  const candidates = buildFuzzyCandidates(catalog, normalized);
  const best = candidates[0];
  return {
    match: best
      ? {
          ...best,
          needsReview: true,
        }
      : null,
    candidates,
  };
};

const RANK_TOKEN =
  "(?:s\\s*\\.?\\s*\\/?\\s*int(?:endente)?|sint|sub\\s*[-.]?\\s*int(?:endente)?|subintendente|sub\\s+oficial|suboficial|ag(?:ente|t|te)?|inspector|comandante|cmdt|cmdte|cmte|intendente|comisario|director|oficial|capitan|cap)";

const RANK_PREFIX_REGEX = new RegExp(`^${RANK_TOKEN}\\.?\\s+`, "i");
const MID_RANK_REGEX = new RegExp(`\\s+(?=${RANK_TOKEN}\\.?\\s+)`, "gi");

export const removeAccents = (str: string): string =>
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const toTitleCase = (str: string): string =>
  str
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

const stripRankPrefixes = (raw: string): string => {
  let name = raw;
  for (let i = 0; i < 5; i += 1) {
    const next = name.replace(RANK_PREFIX_REGEX, "").trim();
    if (next === name) break;
    name = next;
  }
  return name;
};

export const normalizeName = (raw: string): string => {
  if (!raw) return raw;
  let name = removeAccents(raw)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[\s.,;:-]+|[\s.,;:-]+$/g, "");

  name = stripRankPrefixes(name).replace(/\s+/g, " ").trim();
  return toTitleCase(name);
};

export const normalizeNameKey = (raw: string): string =>
  removeAccents(normalizeName(raw))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export const splitPersonNames = (raw: string): string[] => {
  if (!raw) return [];

  const separated = raw
    .replace(/\s+(?:y|e)\s+/gi, ";")
    .replace(MID_RANK_REGEX, ";")
    .split(/[,;\n]+/);

  const names = new Map<string, string>();
  separated.forEach((item) => {
    const cleanName = normalizeName(item);
    const key = normalizeNameKey(cleanName);
    if (key && !names.has(key)) {
      names.set(key, cleanName);
    }
  });

  return Array.from(names.values());
};

export const normalizeNameList = (values: string[]): string[] => {
  const names = new Map<string, string>();

  values.flatMap(splitPersonNames).forEach((name) => {
    const key = normalizeNameKey(name);
    if (key && !names.has(key)) {
      names.set(key, name);
    }
  });

  return Array.from(names.values());
};

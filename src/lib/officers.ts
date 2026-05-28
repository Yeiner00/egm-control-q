import { normalizeName, normalizeNameKey, splitPersonNames } from "@/lib/normalizeName";
import { BASE_OFFICER_ALIASES, BASE_OFFICERS } from "@/lib/officerCatalog";

const OFFICERS = BASE_OFFICERS;

export type OfficerRecord = {
  nombre: string;
  identificacion: string | null;
};

export const OFFICER_OPTIONS = OFFICERS.map((officer) => officer.nombre);

const normalizeOfficerKey = normalizeNameKey;

const KNOWN_PERSON_ALIASES = new Map<string, string>(
  BASE_OFFICER_ALIASES.map((alias) => [alias.alias, alias.officerName]),
);

const getNameTokens = (value: string) => normalizeOfficerKey(value).split(" ").filter(Boolean);

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

const getLooseOfficerDistance = (name: string, officerName: string) => {
  const nameKey = normalizeOfficerKey(name);
  const officerKey = normalizeOfficerKey(officerName);
  if (nameKey === officerKey) return 0;
  if (nameKey.length < 8) return Number.POSITIVE_INFINITY;

  const nameTokens = getNameTokens(name);
  const officerTokens = getNameTokens(officerName);
  if (nameTokens.length < 2 || officerTokens.length < 2) return Number.POSITIVE_INFINITY;
  if (nameTokens[0] !== officerTokens[0]) return Number.POSITIVE_INFINITY;
  if (nameTokens.at(-1) !== officerTokens.at(-1)) return Number.POSITIVE_INFINITY;

  const distance = levenshteinDistance(nameKey, officerKey);
  return distance <= 2 ? distance : Number.POSITIVE_INFINITY;
};

export const findOfficerByName = (name: string): OfficerRecord | undefined => {
  const [candidateName] = splitPersonNames(name);
  const normalizedName = normalizeOfficerKey(candidateName || name);
  if (!normalizedName) return undefined;
  const aliasName = KNOWN_PERSON_ALIASES.get(normalizedName);
  if (aliasName) {
    return OFFICERS.find((officer) => officer.nombre === aliasName);
  }
  const exactMatch = OFFICERS.find((officer) => normalizeOfficerKey(officer.nombre) === normalizedName);
  if (exactMatch) return exactMatch;

  const bestMatch = OFFICERS
    .map((officer) => ({
      officer,
      distance: getLooseOfficerDistance(candidateName || name, officer.nombre),
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  return bestMatch && bestMatch.distance < Number.POSITIVE_INFINITY ? bestMatch.officer : undefined;
};

export const normalizeKnownPersonName = (name: string) => {
  const cleanName = normalizeName(name);
  if (!cleanName) return "";
  return findOfficerByName(cleanName)?.nombre ?? cleanName;
};

export const normalizeKnownPersonNames = (options: string[]) => {
  const merged = new Map<string, string>();

  options.flatMap(splitPersonNames).forEach((option) => {
    const cleanOption = normalizeKnownPersonName(option);
    const key = normalizeOfficerKey(cleanOption);
    if (key && !merged.has(key)) {
      merged.set(key, cleanOption);
    }
  });

  return Array.from(merged.values());
};

export const mergeOfficerOptions = (options: string[]) => {
  const merged = new Map<string, string>();

  [...OFFICER_OPTIONS, ...normalizeKnownPersonNames(options)].forEach((option) => {
    const cleanOption = normalizeKnownPersonName(option);
    const key = normalizeOfficerKey(cleanOption);
    if (key && !merged.has(key)) {
      merged.set(key, cleanOption);
    }
  });

  return Array.from(merged.values()).sort((a, b) => a.localeCompare(b));
};

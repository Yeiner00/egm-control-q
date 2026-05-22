import { normalizeName, normalizeNameKey, splitPersonNames } from "@/lib/normalizeName";

const OFFICERS = [
  { nombre: "Josue Acevedo Rios", identificacion: "603290196" },
  { nombre: "Olman Alfaro Quiros", identificacion: "600930961" },
  { nombre: "Sergio Alpizar Carrillo", identificacion: "602690624" },
  { nombre: "Cesar Alvarez Martinez", identificacion: "700270843" },
  { nombre: "Jhonny Araya Chacon", identificacion: "206900634" },
  { nombre: "Pablo Barrantes Palma", identificacion: "603790678" },
  { nombre: "Minor Cambronero Campos", identificacion: "603460878" },
  { nombre: "Yeiner Castro Alvarez", identificacion: "603830474" },
  { nombre: "Dara Chavarria Hernandez", identificacion: "304310005" },
  { nombre: "Jorge Gonzalez Barrantes", identificacion: "501010643" },
  { nombre: "Luis Carlos Gonzalez Jarquin", identificacion: null },
  { nombre: "Landy Gonzalez Vargas", identificacion: "504250218" },
  { nombre: "Randall Mena Villavicencio", identificacion: "205200912" },
  { nombre: "Joel Mora Estrada", identificacion: "701520562" },
  { nombre: "Alfonso Noguera Corrales", identificacion: "604320632" },
  { nombre: "Bryan Obando Munoz", identificacion: "604560018" },
  { nombre: "Wilber Pena Pena", identificacion: "502550203" },
  { nombre: "Michael Rojas Brenes", identificacion: "207890270" },
  { nombre: "Roberth Sanchez Parra", identificacion: "503950054" },
  { nombre: "Obed Vasquez Chaves", identificacion: "702220098" },
  { nombre: "Griselda Ugarte Ruiz", identificacion: "206910650" },
] as const;

export type OfficerRecord = {
  nombre: string;
  identificacion: string | null;
};

export const OFFICER_OPTIONS = OFFICERS.map((officer) => officer.nombre);

const normalizeOfficerKey = normalizeNameKey;

const KNOWN_PERSON_ALIASES = new Map<string, string>([
  ["alfonso", "Alfonso Noguera Corrales"],
  ["brayan obando munoz", "Bryan Obando Munoz"],
  ["brayan obando quiros", "Bryan Obando Munoz"],
  ["bryan obando quiros", "Bryan Obando Munoz"],
  ["jprge gonzales barrantes", "Jorge Gonzalez Barrantes"],
  ["jprge gonzalez barrantes", "Jorge Gonzalez Barrantes"],
  ["luis c jarquin gonzales", "Luis Carlos Gonzalez Jarquin"],
  ["luis c jarquin gonzalez", "Luis Carlos Gonzalez Jarquin"],
  ["luis gonzales jarquin", "Luis Carlos Gonzalez Jarquin"],
  ["luis gonzalez jarquin", "Luis Carlos Gonzalez Jarquin"],
  ["micchael rojas brenes", "Michael Rojas Brenes"],
  ["obed vasques chavez", "Obed Vasquez Chaves"],
  ["obed vasques chaves", "Obed Vasquez Chaves"],
  ["obed vasquez chavez", "Obed Vasquez Chaves"],
  ["obed vazquez chavez", "Obed Vasquez Chaves"],
  ["obed vazquez chaves", "Obed Vasquez Chaves"],
  ["randall mena villavicencion", "Randall Mena Villavicencio"],
  ["yeiner castro alvares", "Yeiner Castro Alvarez"],
  ["yeiner castro anlvares", "Yeiner Castro Alvarez"],
  ["yeiner cstro alvares", "Yeiner Castro Alvarez"],
  ["yeiner cstro anlvares", "Yeiner Castro Alvarez"],
]);

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

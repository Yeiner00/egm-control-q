const RANK_PREFIXES = [
  "subintendente", "sub-int", "sub int", "agente", "inspector",
  "comandante", "intendente", "comisario", "director",
];

const removeAccents = (str: string): string =>
  str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const toTitleCase = (str: string): string =>
  str
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export const normalizeName = (raw: string): string => {
  if (!raw) return raw;
  let name = removeAccents(raw.trim());

  const lower = name.toLowerCase();
  for (const prefix of RANK_PREFIXES) {
    if (lower.startsWith(prefix + " ") || lower.startsWith(prefix + ".")) {
      name = name.slice(prefix.length).replace(/^[\s.]+/, "");
      break;
    }
    if (lower === prefix) {
      return "";
    }
  }

  name = name.replace(/\s+/g, " ").trim();
  return toTitleCase(name);
};

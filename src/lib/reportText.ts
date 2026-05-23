const LOWERCASE_WORDS = new Set([
  "a",
  "al",
  "con",
  "de",
  "del",
  "e",
  "el",
  "en",
  "la",
  "las",
  "los",
  "o",
  "para",
  "por",
  "u",
  "y",
]);

const LETTERS_REGEX = /\p{L}+(?:['’]\p{L}+)?/gu;

const titleWord = (word: string, index: number) => {
  const lower = word.toLocaleLowerCase("es-CR");
  if (index > 0 && LOWERCASE_WORDS.has(lower)) {
    return lower;
  }

  return lower.charAt(0).toLocaleUpperCase("es-CR") + lower.slice(1);
};

export const normalizeReportText = (value: string | null | undefined): string => {
  const clean = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";

  let wordIndex = 0;
  return clean.replace(LETTERS_REGEX, (word, offset) => {
    const previousChar = offset > 0 ? clean[offset - 1] : "";
    const nextChar = clean[offset + word.length] ?? "";
    if (word.length === 1 && (previousChar === "." || nextChar === ".")) {
      return word.toLocaleUpperCase("es-CR");
    }

    if (/\d/.test(previousChar) && /\d/.test(nextChar)) {
      return word.toLocaleLowerCase("es-CR");
    }

    const next = titleWord(word, wordIndex);
    wordIndex += 1;
    return next;
  });
};

export const normalizedReportTextOrNull = (value: string | null | undefined) =>
  normalizeReportText(value) || null;

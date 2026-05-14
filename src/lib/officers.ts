const OFFICERS = [
  { nombre: "Josué Acevedo Ríos", identificacion: "603290196" },
  { nombre: "Olman Alfaro Quirós", identificacion: "600930961" },
  { nombre: "Sergio Alpizar Carrillo", identificacion: "602690624" },
  { nombre: "César Álvarez Martínez", identificacion: "700270843" },
  { nombre: "Jhonny Araya Chacón", identificacion: "206900634" },
  { nombre: "Pablo Barrantes Palma", identificacion: "603790678" },
  { nombre: "Minor Cambronero Campos", identificacion: "603460878" },
  { nombre: "Yeiner Castro Álvarez", identificacion: "603830474" },
  { nombre: "Dara Chavarría Hernández", identificacion: "304310005" },
  { nombre: "Jorge González Barrantes", identificacion: "501010643" },
  { nombre: "Luis Carlos González Jarquin", identificacion: null },
  { nombre: "Landy González Vargas", identificacion: "504250218" },
  { nombre: "Randall Mena Villavicencio", identificacion: "205200912" },
  { nombre: "Joel Mora Estrada", identificacion: "701520562" },
  { nombre: "Alfonso Noguera Corrales", identificacion: "604320632" },
  { nombre: "Bryan Obando Muñoz", identificacion: "604560018" },
  { nombre: "Wilber Peña Peña", identificacion: "502550203" },
  { nombre: "Michael Rojas Brenes", identificacion: "207890270" },
  { nombre: "Roberth Sánchez Parra", identificacion: "503950054" },
  { nombre: "Obed Vásquez Chaves", identificacion: "702220098" },
  { nombre: "Griselda Ugarte Ruiz", identificacion: "206910650" },
] as const;

export type OfficerRecord = {
  nombre: string;
  identificacion: string | null;
};

export const OFFICER_OPTIONS = OFFICERS.map((officer) => officer.nombre);

const normalizeOfficerKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const findOfficerByName = (name: string): OfficerRecord | undefined => {
  const normalizedName = normalizeOfficerKey(name);
  if (!normalizedName) return undefined;
  return OFFICERS.find((officer) => normalizeOfficerKey(officer.nombre) === normalizedName);
};

export const mergeOfficerOptions = (options: string[]) => {
  const merged = new Map<string, string>();

  [...OFFICER_OPTIONS, ...options].forEach((option) => {
    const cleanOption = option.trim();
    const key = normalizeOfficerKey(cleanOption);
    if (key && !merged.has(key)) {
      merged.set(key, cleanOption);
    }
  });

  return Array.from(merged.values()).sort((a, b) => a.localeCompare(b));
};

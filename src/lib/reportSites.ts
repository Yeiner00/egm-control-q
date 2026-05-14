export interface ReportSiteOption {
  nombre_sitio: string;
  zona: string;
  posicion: string;
}

export const DEFAULT_REPORT_SITE_OPTIONS: ReportSiteOption[] = [
  {
    nombre_sitio: "Aguas Calientes",
    zona: "1B",
    posicion: "10°56'53\" N / 085°39'21\" W",
  },
  {
    nombre_sitio: "Bello Horizonte",
    zona: "1B",
    posicion: "10°58'50.9\" N / 085°39'55.4\" W",
  },
  {
    nombre_sitio: "Conventillos",
    zona: "1B",
    posicion: "11°04'47\" N / 085°41'32\" W",
  },
  {
    nombre_sitio: "Copal",
    zona: "1B",
    posicion: "11°01'42\" N / 085°42'18\" W",
  },
  {
    nombre_sitio: "Coquitos",
    zona: "1B",
    posicion: "11°02'45\" N / 085°43'53\" W",
  },
  {
    nombre_sitio: "Coyotera",
    zona: "1B",
    posicion: "11°02'37.3\" N / 085°43'22.3\" W",
  },
  {
    nombre_sitio: "Cuajiniquil",
    zona: "1B",
    posicion: "10°56'34\" N / 085°41'08\" W",
  },
  {
    nombre_sitio: "Ecoplaya",
    zona: "1B",
    posicion: "11°01'41.9\" N / 085°42'56.1\" W",
  },
  {
    nombre_sitio: "El Jobo",
    zona: "1B",
    posicion: "11°01'54\" N / 085°44'17\" W",
  },
  {
    nombre_sitio: "El Lorenzo",
    zona: "3A",
    posicion: "",
  },
  {
    nombre_sitio: "El Morro",
    zona: "1B",
    posicion: "11°09'35.31\" N / 085°45'08.85\" W",
  },
  {
    nombre_sitio: "Islita",
    zona: "1B",
    posicion: "10°57'50.43\" N / 085°41'46.03\" W",
  },
  {
    nombre_sitio: "Junquillal",
    zona: "1B",
    posicion: "10°58'07.56\" N / 085°41'15.72\" W",
  },
  {
    nombre_sitio: "La Cruz",
    zona: "1B",
    posicion: "11°04'14.8\" N / 085°37'46.9\" W",
  },
  {
    nombre_sitio: "Las Nubes",
    zona: "1B",
    posicion: "11°01'40\" N / 085°41'49.6\" W",
  },
  {
    nombre_sitio: "Manzanillo",
    zona: "1B",
    posicion: "11°01'28.31\" N / 085°43'57.52\" W",
  },
  {
    nombre_sitio: "Papaturro",
    zona: "1B",
    posicion: "11°01'54.6\" N / 085°41'16.4\" W",
  },
  {
    nombre_sitio: "Parque Santa Elena",
    zona: "1B",
    posicion: "10°52'56\" N / 085°42'09\" W",
  },
  {
    nombre_sitio: "Peñas Blancas",
    zona: "1B",
    posicion: "11°12'40.5\" N / 085°36'44.8\" W",
  },
  {
    nombre_sitio: "Pista Aterrizaje Murciélago",
    zona: "1B",
    posicion: "10°54'21.8\" N / 085°43'15.5\" W",
  },
  {
    nombre_sitio: "Playa 4x4",
    zona: "1B",
    posicion: "10°56'05\" N / 085°42'15\" W",
  },
  {
    nombre_sitio: "Pocosol",
    zona: "2C",
    posicion: "10°53'20\" N / 085°36'08\" W",
  },
  {
    nombre_sitio: "Quebrada Grande",
    zona: "2C",
    posicion: "11°50'37\" N / 085°29'30\" W",
  },
  {
    nombre_sitio: "Rajada",
    zona: "1B",
    posicion: "11°01'47.76\" N / 085°44'41.86\" W",
  },
  {
    nombre_sitio: "Ruta 1",
    zona: "1B",
    posicion: "10°57'06\" N / 085°36'48\" W",
  },
  {
    nombre_sitio: "San Dimas",
    zona: "1B",
    posicion: "11°10'45.6\" N / 085°36'37.8\" W",
  },
  {
    nombre_sitio: "Santa Elena",
    zona: "2C",
    posicion: "10°55'32\" N / 085°36'27\" W",
  },
  {
    nombre_sitio: "Santa Rosa",
    zona: "2C",
    posicion: "10°52'39\" N / 085°35'08\" W",
  },
  {
    nombre_sitio: "Soley",
    zona: "1B",
    posicion: "11°02'32.32\" N / 085°40'03.85\" W",
  },
];

const normalizeSiteKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const loadSiteOptions = async (): Promise<ReportSiteOption[]> => {
  return DEFAULT_REPORT_SITE_OPTIONS
    .map((site) => ({ ...site }))
    .sort((a, b) => a.nombre_sitio.localeCompare(b.nombre_sitio));
};

export const findSiteOption = (options: ReportSiteOption[], name: string) => {
  const key = normalizeSiteKey(name);
  return options.find((option) => normalizeSiteKey(option.nombre_sitio) === key);
};

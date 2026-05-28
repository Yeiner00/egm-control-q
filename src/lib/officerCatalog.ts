export interface BaseOfficerRecord {
  nombre: string;
  identificacion: string;
}

export interface BaseOfficerAliasRecord {
  alias: string;
  officerName: string;
}

export const BASE_OFFICERS: BaseOfficerRecord[] = [
  { nombre: "Josue Acevedo Rios", identificacion: "603290196" },
  { nombre: "Olman Alfaro Quiros", identificacion: "118150120" },
  { nombre: "Sergio Alpizar Carrillo", identificacion: "602690624" },
  { nombre: "Cesar Alvarez Martinez", identificacion: "208060620" },
  { nombre: "Jhonny Araya Chacon", identificacion: "206900634" },
  { nombre: "Pablo Barrantes Palma", identificacion: "603790678" },
  { nombre: "Minor Cambronero Campos", identificacion: "603460878" },
  { nombre: "Yeiner Castro Alvarez", identificacion: "603830474" },
  { nombre: "Dara Chavarria Hernandez", identificacion: "304310005" },
  { nombre: "Jorge Gonzalez Barrantes", identificacion: "603100467" },
  { nombre: "Luis Carlos Gonzalez Jarquin", identificacion: "503740662" },
  { nombre: "Landy Gonzalez Vargas", identificacion: "504250218" },
  { nombre: "Randall Mena Villavicencio", identificacion: "205200912" },
  { nombre: "Joel Mora Estrada", identificacion: "604640540" },
  { nombre: "Alfonso Noguera Corrales", identificacion: "604320632" },
  { nombre: "Bryan Obando Munoz", identificacion: "604560018" },
  { nombre: "Wilber Pena Pena", identificacion: "502550203" },
  { nombre: "Michael Rojas Brenes", identificacion: "603310561" },
  { nombre: "Roberth Sanchez Parra", identificacion: "503950054" },
  { nombre: "Obed Vasquez Chaves", identificacion: "702220098" },
  { nombre: "Griselda Ugarte Ruiz", identificacion: "206910650" },
];

export const BASE_OFFICER_ALIASES: BaseOfficerAliasRecord[] = [
  { alias: "alfonso", officerName: "Alfonso Noguera Corrales" },
  { alias: "brayan obando munoz", officerName: "Bryan Obando Munoz" },
  { alias: "brayan obando quiros", officerName: "Bryan Obando Munoz" },
  { alias: "bryan obando quiros", officerName: "Bryan Obando Munoz" },
  { alias: "cesar alvares martinez", officerName: "Cesar Alvarez Martinez" },
  { alias: "jprge gonzales barrantes", officerName: "Jorge Gonzalez Barrantes" },
  { alias: "jprge gonzalez barrantes", officerName: "Jorge Gonzalez Barrantes" },
  { alias: "jorga gonzalez barrantes", officerName: "Jorge Gonzalez Barrantes" },
  { alias: "luis c gonzalez jarquin", officerName: "Luis Carlos Gonzalez Jarquin" },
  { alias: "luis c jarquin gonzales", officerName: "Luis Carlos Gonzalez Jarquin" },
  { alias: "luis c jarquin gonzalez", officerName: "Luis Carlos Gonzalez Jarquin" },
  { alias: "luis gonzales jarquin", officerName: "Luis Carlos Gonzalez Jarquin" },
  { alias: "luis gonzalez jarquin", officerName: "Luis Carlos Gonzalez Jarquin" },
  { alias: "micchael rojas brenes", officerName: "Michael Rojas Brenes" },
  { alias: "obed vasques chavez", officerName: "Obed Vasquez Chaves" },
  { alias: "obed vasques chaves", officerName: "Obed Vasquez Chaves" },
  { alias: "obed vasquez chavez", officerName: "Obed Vasquez Chaves" },
  { alias: "obed vazquez chavez", officerName: "Obed Vasquez Chaves" },
  { alias: "obed vazquez chaves", officerName: "Obed Vasquez Chaves" },
  { alias: "randal mena villavicencio", officerName: "Randall Mena Villavicencio" },
  { alias: "randall mena villavicencion", officerName: "Randall Mena Villavicencio" },
  { alias: "roberth sanches parra", officerName: "Roberth Sanchez Parra" },
  { alias: "yeiner castro alvares", officerName: "Yeiner Castro Alvarez" },
  { alias: "yeiner castro anlvares", officerName: "Yeiner Castro Alvarez" },
  { alias: "yeiner cstro alvares", officerName: "Yeiner Castro Alvarez" },
  { alias: "yeiner cstro anlvares", officerName: "Yeiner Castro Alvarez" },
];

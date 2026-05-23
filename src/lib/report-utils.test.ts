import { describe, expect, it } from "vitest";
import { mapToBoatFormData, mapToVehicleFormData } from "./report-utils";

describe("report-utils person mapping", () => {
  it("normalizes vehicle driver, officer, and separates combined companion names", () => {
    const data = mapToVehicleFormData({
      no_reporte: "0563",
      estacion: "MURCIELAGO",
      destino: "SECTOR NORTE DE LA ESTACION",
      chofer: "S Int Michael Rojas Brenes",
      acompanantes: [
        "S Int Jorge Gonzales Barrantes Y Agente Luis Carlos Gonzalez Jarquin.",
        "Joel Mora Estrada",
      ],
      oficial_a_cargo: "S Int Jorge Gonzalez Barrantes",
      sitios_visitados: [{ nombre_sitio: "BAJOS DE RAJADA", zona: "3A", posicion: "11°01'40\" N / 085°45'54\" W" }],
    });

    expect(data.estacion).toBe("Murcielago");
    expect(data.destino).toBe("Sector Norte de la Estacion");
    expect(data.sitios_visitados[0].nombre_sitio).toBe("Bajos de Rajada");
    expect(data.chofer).toBe("Michael Rojas Brenes");
    expect(data.chofer_cedula).toBe("603310561");
    expect(data.acompanantes).toEqual([
      "Jorge Gonzalez Barrantes",
      "Luis Carlos Gonzalez Jarquin",
      "Joel Mora Estrada",
    ]);
    expect(data.oficial_a_cargo).toBe("Jorge Gonzalez Barrantes");
    expect(data.oficial_a_cargo_cedula).toBe("603100467");
  });

  it("normalizes boat roles and tripulantes with the same person rules", () => {
    const data = mapToBoatFormData({
      no_reporte: "0572",
      estacion: "MURCIELAGO",
      destino: "SECTOR NORTE",
      tipo_combustible: "GASOLINA",
      capitan: "Capitan Roberth Sanchez Parra",
      encargado_mision: "Agente Cesar Alvares Martinez",
      oficial_director: "Comandante Randall Mena Villavicencio",
      oficial_director_cedula: "205200912",
      operacional: "SInt Michael Rojas Brenes",
      sitios_visitados: [{ nombre_sitio: "MANZANILLO", zona: "1B", posicion: "" }],
      tripulantes: [
        { nombre: "Jorge Gonzales Barrantes y Agente Luis Carlos Gonzalez Jarquin", cedula: "123456789" },
      ],
    });

    expect(data.capitan).toBe("Roberth Sanchez Parra");
    expect(data.estacion).toBe("Murcielago");
    expect(data.destino).toBe("Sector Norte");
    expect(data.tipo_combustible).toBe("Gasolina");
    expect(data.encargado_mision).toBe("Cesar Alvarez Martinez");
    expect(data.encargado_mision_cedula).toBe("208060620");
    expect(data.oficial_director).toBe("Randall Mena Villavicencio");
    expect(data.oficial_director_cedula).toBe("205200912");
    expect(data.operacional).toBe("Michael Rojas Brenes");
    expect(data.operacional_cedula).toBe("603310561");
    expect(data.sitios_visitados[0]).toEqual({
      nombre_sitio: "Manzanillo",
      zona: "1B",
      posicion: "11\u00B001'28.31\" N / 085\u00B043'57.52\" W",
    });
    expect(data.tripulantes).toEqual([
      { nombre: "Jorge Gonzalez Barrantes", cedula: "603100467" },
      { nombre: "Luis Carlos Gonzalez Jarquin", cedula: "503740662" },
    ]);
  });
});

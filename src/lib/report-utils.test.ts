import { describe, expect, it } from "vitest";
import { mapToBoatFormData, mapToVehicleFormData } from "./report-utils";

describe("report-utils person mapping", () => {
  it("normalizes vehicle driver, officer, and separates combined companion names", () => {
    const data = mapToVehicleFormData({
      no_reporte: "0563",
      chofer: "S Int Michael Rojas Brenes",
      acompanantes: [
        "S Int Jorge Gonzales Barrantes Y Agente Luis Carlos Gonzalez Jarquin.",
        "Joel Mora Estrada",
      ],
      oficial_a_cargo: "S Int Jorge Gonzalez Barrantes",
    });

    expect(data.chofer).toBe("Michael Rojas Brenes");
    expect(data.acompanantes).toEqual([
      "Jorge Gonzalez Barrantes",
      "Luis Carlos Gonzalez Jarquin",
      "Joel Mora Estrada",
    ]);
    expect(data.oficial_a_cargo).toBe("Jorge Gonzalez Barrantes");
  });

  it("normalizes boat roles and tripulantes with the same person rules", () => {
    const data = mapToBoatFormData({
      no_reporte: "0572",
      capitan: "Capitan Roberth Sanchez Parra",
      encargado_mision: "Agente Cesar Alvares Martinez",
      operacional: "SInt Michael Rojas Brenes",
      tripulantes: [
        { nombre: "Jorge Gonzales Barrantes y Agente Luis Carlos Gonzalez Jarquin", cedula: "123456789" },
      ],
    });

    expect(data.capitan).toBe("Roberth Sanchez Parra");
    expect(data.encargado_mision).toBe("Cesar Alvarez Martinez");
    expect(data.operacional).toBe("Michael Rojas Brenes");
    expect(data.tripulantes).toEqual([
      { nombre: "Jorge Gonzalez Barrantes", cedula: "" },
      { nombre: "Luis Carlos Gonzalez Jarquin", cedula: "" },
    ]);
  });
});

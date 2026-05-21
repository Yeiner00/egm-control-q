import { describe, expect, it } from "vitest";
import { buildTopNauticalMiles, buildTopVehicleTrips, hasOperationalRole } from "./homePerformance";

const people = (items: Array<{ nombre: string; roles: string[] }>) => items;

describe("home performance helpers", () => {
  it("detects operational roles while excluding private passenger roles", () => {
    expect(hasOperationalRole(["particular"])).toBe(false);
    expect(hasOperationalRole(["persona_particular"])).toBe(false);
    expect(hasOperationalRole(["capitan"])).toBe(true);
    expect(hasOperationalRole(["particular", "operacional"])).toBe(true);
  });

  it("builds top nautical miles by operational person", () => {
    const top = buildTopNauticalMiles(
      [
        { id: "b1", millas_nauticas: 12 },
        { id: "b2", millas_nauticas: 8 },
        { id: "b3", millas_nauticas: 0 },
      ],
      new Map([
        ["b1", people([{ nombre: "Ana Ruiz", roles: ["capitan"] }, { nombre: "Visitante", roles: ["particular"] }])],
        ["b2", people([{ nombre: "Ana  Ruiz", roles: ["tripulante"] }, { nombre: "Luis Mora", roles: ["operacional"] }])],
        ["b3", people([{ nombre: "Luis Mora", roles: ["operacional"] }])],
      ]),
    );

    expect(top).toEqual([
      { name: "Ana Ruiz", value: 20 },
      { name: "Luis Mora", value: 8 },
    ]);
  });

  it("counts one vehicle trip per person per report", () => {
    const top = buildTopVehicleTrips(
      [{ id: "v1" }, { id: "v2" }],
      new Map([
        ["v1", people([{ nombre: "Ana Ruiz", roles: ["chofer"] }, { nombre: "Ana  Ruiz", roles: ["oficial"] }])],
        ["v2", people([{ nombre: "Ana Ruiz", roles: ["acompanante"] }, { nombre: "Luis Mora", roles: ["particular"] }])],
      ]),
    );

    expect(top).toEqual([{ name: "Ana Ruiz", value: 2 }]);
  });
});

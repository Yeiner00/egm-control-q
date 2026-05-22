import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPeopleNameOptions } from "@/lib/reportPeople";

type QueryCall = {
  table: string;
  eqFilters: Record<string, unknown>;
  inValues: unknown[];
  rangeFrom: number;
  rangeTo: number;
};

const peopleRows = Array.from({ length: 105 }, (_, index) => ({
  id: `person-${index}`,
  nombre: `Persona ${index}`,
}));

const roleRows = peopleRows.map((person, index) => ({
  reporte_persona_id: person.id,
  rol: index === 0 ? "particular" : "chofer",
}));

let queryCalls: QueryCall[] = [];

const getQueryResult = (call: QueryCall) => {
  if (call.table === "reporte_personas") {
    const from = call.rangeFrom ?? 0;
    const to = call.rangeTo ?? peopleRows.length - 1;
    return {
      data: peopleRows.slice(from, to + 1),
      error: null,
    };
  }

  if (call.table === "reporte_persona_roles") {
    return {
      data: roleRows.filter((role) => call.inValues.includes(role.reporte_persona_id)),
      error: null,
    };
  }

  return { data: [], error: null };
};

const createQuery = (table: string) => {
  const call: QueryCall = {
    table,
    eqFilters: {},
    inValues: [],
    rangeFrom: 0,
    rangeTo: Number.MAX_SAFE_INTEGER,
  };
  queryCalls.push(call);

  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn((from: number, to: number) => {
      call.rangeFrom = from;
      call.rangeTo = to;
      return query;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      call.eqFilters[column] = value;
      return query;
    }),
    in: vi.fn((_column: string, values: unknown[]) => {
      call.inValues = values;
      return query;
    }),
    then: (
      resolve: (value: { data: unknown[]; error: null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(getQueryResult(call)).then(resolve, reject),
  };

  return query;
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => createQuery(table)),
  },
}));

describe("reportPeople", () => {
  beforeEach(() => {
    queryCalls = [];
  });

  it("loads names while batching role lookups to avoid oversized Supabase in filters", async () => {
    const names = await loadPeopleNameOptions(["particular"]);

    expect(names).toHaveLength(104);
    expect(names).not.toContain("Persona 0");
    expect(names).toContain("Persona 104");

    const roleCalls = queryCalls.filter((call) => call.table === "reporte_persona_roles");
    expect(roleCalls).toHaveLength(2);
    expect(roleCalls[0].inValues).toHaveLength(100);
    expect(roleCalls[1].inValues).toHaveLength(5);
  });
});

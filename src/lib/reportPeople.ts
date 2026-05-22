import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { normalizeKnownPersonName, normalizeKnownPersonNames } from "@/lib/officers";
import { normalizeNameKey } from "@/lib/normalizeName";

export type ReportType = "vehiculo" | "embarcacion";

const SUPABASE_PAGE_SIZE = 1000;
const IN_FILTER_BATCH_SIZE = 100;

export interface ReportPersonWithRoles {
  cedula: string | null;
  id: string;
  reporte_id: string;
  tipo_reporte: ReportType;
  nombre: string;
  nombre_normalizado: string;
  roles: string[];
}

interface PersistReportPersonInput {
  nombre: string;
  cedula?: string | null;
  roles: string[];
}

type ReportPersonRoleRow = {
  reporte_persona_id: string;
  rol: string;
};

type ReportPersonBaseRow = {
  id: string;
  nombre: string;
};

type ReportPersonRow = {
  cedula: string | null;
  id: string;
  nombre: string;
  nombre_normalizado: string | null;
  reporte_id: string;
  tipo_reporte: string;
};

export const normalizePersonNameKey = (raw: string) =>
  normalizeNameKey(raw);

export const countUniqueNormalizedNames = (names: string[]) =>
  new Set(
    normalizeKnownPersonNames(names)
      .map(normalizePersonNameKey)
      .filter(Boolean),
  ).size;

const prepareParticipants = (participants: PersistReportPersonInput[]) => {
  const grouped = new Map<string, { nombre: string; cedula: string | null; roles: Set<string> }>();

  participants.forEach((participant) => {
    const participantNames = normalizeKnownPersonNames([participant.nombre]);

    participantNames.forEach((displayName) => {
      const normalizedName = normalizePersonNameKey(displayName);
      if (!normalizedName) {
        return;
      }

      const entry = grouped.get(normalizedName) ?? {
        nombre: displayName,
        cedula: participantNames.length === 1 ? participant.cedula?.trim() || null : null,
        roles: new Set<string>(),
      };
      if (participantNames.length === 1 && !entry.cedula && participant.cedula?.trim()) {
        entry.cedula = participant.cedula.trim();
      }

      participant.roles
        .map((role) => role.trim())
        .filter(Boolean)
        .forEach((role) => entry.roles.add(role));

      grouped.set(normalizedName, entry);
    });
  });

  return Array.from(grouped.entries())
    .map(([nombre_normalizado, entry]) => ({
      nombre: entry.nombre,
      cedula: entry.cedula,
      nombre_normalizado,
      roles: Array.from(entry.roles),
    }))
    .filter((entry) => entry.roles.length > 0);
};

const groupPeopleRowsByReport = (
  people: ReportPersonRow[],
  rolesByPerson: Map<string, string[]>,
) => {
  const grouped = new Map<string, Map<string, ReportPersonWithRoles>>();

  people.forEach((person) => {
    const displayName = normalizeKnownPersonName(person.nombre);
    const normalizedName = normalizePersonNameKey(displayName);
    if (!normalizedName) return;

    const personRoles = rolesByPerson.get(person.id) ?? [];
    const byName = grouped.get(person.reporte_id) ?? new Map<string, ReportPersonWithRoles>();
    const existing = byName.get(normalizedName);
    if (existing) {
      existing.roles = Array.from(new Set([...existing.roles, ...personRoles]));
      if (!existing.cedula && person.cedula) {
        existing.cedula = person.cedula;
      }
    } else {
      byName.set(normalizedName, {
        ...person,
        cedula: person.cedula,
        tipo_reporte: person.tipo_reporte as ReportType,
        nombre: displayName,
        nombre_normalizado: normalizedName,
        roles: Array.from(new Set(personRoles)),
      });
    }
    grouped.set(person.reporte_id, byName);
  });

  return new Map(
    Array.from(grouped.entries()).map(([reportId, byName]) => [reportId, Array.from(byName.values())]),
  );
};

const chunkArray = <T,>(values: T[], size: number) => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const loadRolesByPersonIds = async (personIds: string[]) => {
  const rolesByPerson = new Map<string, string[]>();

  for (const personIdBatch of chunkArray(Array.from(new Set(personIds)), IN_FILTER_BATCH_SIZE)) {
    if (personIdBatch.length === 0) continue;

    const { data: roles, error: rolesError } = await supabase
      .from("reporte_persona_roles")
      .select("reporte_persona_id, rol")
      .in("reporte_persona_id", personIdBatch);

    if (rolesError) {
      throw rolesError;
    }

    ((roles || []) as ReportPersonRoleRow[]).forEach((role) => {
      const current = rolesByPerson.get(role.reporte_persona_id) ?? [];
      current.push(role.rol);
      rolesByPerson.set(role.reporte_persona_id, current);
    });
  }

  return rolesByPerson;
};

const loadPeopleNameRows = async (tipoReporte?: ReportType) => {
  const allPeople: ReportPersonBaseRow[] = [];

  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    let query = supabase
      .from("reporte_personas")
      .select("id, nombre")
      .order("nombre", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + SUPABASE_PAGE_SIZE - 1);

    if (tipoReporte) {
      query = query.eq("tipo_reporte", tipoReporte);
    }

    const { data: people, error: peopleError } = await query;
    if (peopleError) {
      throw peopleError;
    }

    const page = (people || []) as ReportPersonBaseRow[];
    allPeople.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) {
      break;
    }
  }

  return allPeople;
};

const loadReportPersonRowsPage = async (
  tipoReporte: ReportType,
  from: number,
  reportIds?: string[],
) => {
  let query = supabase
    .from("reporte_personas")
    .select("id, reporte_id, tipo_reporte, nombre, nombre_normalizado, cedula")
    .eq("tipo_reporte", tipoReporte)
    .order("reporte_id", { ascending: true })
    .order("id", { ascending: true })
    .range(from, from + SUPABASE_PAGE_SIZE - 1);

  if (reportIds && reportIds.length > 0) {
    query = query.in("reporte_id", reportIds);
  }

  const { data: people, error: peopleError } = await query;
  if (peopleError) {
    throw peopleError;
  }

  return (people || []) as ReportPersonRow[];
};

const loadReportPersonRows = async (
  tipoReporte: ReportType,
  reportIds?: string[],
) => {
  const allPeople: ReportPersonRow[] = [];
  const reportIdBatches = reportIds && reportIds.length > 0
    ? chunkArray(Array.from(new Set(reportIds)), IN_FILTER_BATCH_SIZE)
    : [undefined];

  for (const reportIdBatch of reportIdBatches) {
    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
      const page = await loadReportPersonRowsPage(tipoReporte, from, reportIdBatch);
      allPeople.push(...page);

      if (page.length < SUPABASE_PAGE_SIZE) {
        break;
      }
    }
  }

  return allPeople;
};

export const replaceReportPeople = async (
  reporteId: string,
  tipoReporte: ReportType,
  participants: PersistReportPersonInput[],
) => {
  await deleteReportPeople(reporteId, tipoReporte);

  const prepared = prepareParticipants(participants);
  if (prepared.length === 0) {
    return;
  }

  const peopleRows: TablesInsert<"reporte_personas">[] = prepared.map((participant) => ({
    reporte_id: reporteId,
    tipo_reporte: tipoReporte,
    nombre: participant.nombre,
    cedula: participant.cedula,
    nombre_normalizado: participant.nombre_normalizado,
  }));

  const { data: insertedPeople, error: peopleError } = await supabase
    .from("reporte_personas")
    .insert(peopleRows)
    .select("*");

  if (peopleError) {
    throw peopleError;
  }

  const insertedMap = new Map(
    (insertedPeople || []).map((person) => [person.nombre_normalizado, person.id]),
  );

  const roleRows: TablesInsert<"reporte_persona_roles">[] = prepared.flatMap((participant) =>
    participant.roles
      .map((role) => role.trim())
      .filter(Boolean)
      .map((role) => ({
        reporte_persona_id: insertedMap.get(participant.nombre_normalizado) || "",
        rol: role,
      })),
  ).filter((row) => row.reporte_persona_id);

  if (roleRows.length === 0) {
    return;
  }

  const { error: rolesError } = await supabase.from("reporte_persona_roles").insert(roleRows);
  if (rolesError) {
    throw rolesError;
  }
};

export const deleteReportPeople = async (reporteId: string, tipoReporte: ReportType) => {
  const { data: people, error } = await supabase
    .from("reporte_personas")
    .select("id")
    .eq("reporte_id", reporteId)
    .eq("tipo_reporte", tipoReporte);

  if (error) {
    throw error;
  }

  const ids = (people || []).map((person) => person.id);
  if (ids.length > 0) {
    const { error: rolesError } = await supabase
      .from("reporte_persona_roles")
      .delete()
      .in("reporte_persona_id", ids);

    if (rolesError) {
      throw rolesError;
    }
  }

  const { error: peopleError } = await supabase
    .from("reporte_personas")
    .delete()
    .eq("reporte_id", reporteId)
    .eq("tipo_reporte", tipoReporte);

  if (peopleError) {
    throw peopleError;
  }
};

export const loadReportPeopleByIds = async (
  reportIds: string[],
  tipoReporte: ReportType,
) => {
  if (reportIds.length === 0) {
    return new Map<string, ReportPersonWithRoles[]>();
  }

  const people = await loadReportPersonRows(tipoReporte, reportIds);
  if (people.length === 0) {
    return new Map<string, ReportPersonWithRoles[]>();
  }

  const personIds = people.map((person) => person.id);
  const rolesByPerson = await loadRolesByPersonIds(personIds);

  return groupPeopleRowsByReport(people, rolesByPerson);
};

export const loadPeopleNameOptions = async (
  excludedRoles: string[] = [],
  tipoReporte?: ReportType,
) => {
  const people = await loadPeopleNameRows(tipoReporte);
  if (people.length === 0) {
    return [];
  }

  const personIds = people.map((person) => person.id);
  const excluded = new Set(excludedRoles);
  const allowedNames = new Map<string, string>();
  const rolesByPerson = await loadRolesByPersonIds(personIds);

  people.forEach((person) => {
    const personRoles = rolesByPerson.get(person.id) ?? [];
    if (personRoles.some((role) => !excluded.has(role))) {
      const displayName = normalizeKnownPersonName(person.nombre);
      const key = normalizePersonNameKey(displayName);
      if (key && !allowedNames.has(key)) {
        allowedNames.set(key, displayName);
      }
    }
  });

  return Array.from(allowedNames.values()).sort((a, b) => a.localeCompare(b));
};

export const loadProposalPeopleNameOptions = () =>
  loadPeopleNameOptions(["particular", "persona_particular"]);

export const searchPersonParticipations = async (
  personName: string,
  tipoReporte: ReportType,
  reportIds?: string[],
) => {
  const searchKey = normalizePersonNameKey(normalizeKnownPersonName(personName));
  if (!searchKey) return [];

  const people = await loadReportPersonRows(tipoReporte, reportIds);
  if (people.length === 0) {
    return [];
  }

  const filteredPeople = people.filter((person) => {
    const personKey = normalizePersonNameKey(normalizeKnownPersonName(person.nombre));
    return personKey === searchKey || personKey.includes(searchKey) || searchKey.includes(personKey);
  });

  if (filteredPeople.length === 0) {
    return [];
  }

  const ids = filteredPeople.map((person) => person.id);
  const rolesByPerson = await loadRolesByPersonIds(ids);

  return Array.from(groupPeopleRowsByReport(filteredPeople, rolesByPerson).values()).flat();
};

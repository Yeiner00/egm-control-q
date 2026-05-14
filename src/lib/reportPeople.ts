import { supabase } from "@/integrations/supabase/client";
import type { TablesInsert } from "@/integrations/supabase/types";
import { normalizeName } from "@/lib/normalizeName";

export type ReportType = "vehiculo" | "embarcacion";

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

const removeAccents = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export const normalizePersonNameKey = (raw: string) =>
  removeAccents(normalizeName(raw))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export const countUniqueNormalizedNames = (names: string[]) =>
  new Set(
    names
      .map((name) => normalizePersonNameKey(name))
      .filter(Boolean),
  ).size;

const prepareParticipants = (participants: PersistReportPersonInput[]) => {
  const grouped = new Map<string, { nombre: string; cedula: string | null; roles: Set<string> }>();

  participants.forEach((participant) => {
    const normalizedName = normalizePersonNameKey(participant.nombre);
    if (!normalizedName) {
      return;
    }

    const displayName = normalizeName(participant.nombre);
    const entry = grouped.get(normalizedName) ?? {
      nombre: displayName,
      cedula: participant.cedula?.trim() || null,
      roles: new Set<string>(),
    };
    if (!entry.cedula && participant.cedula?.trim()) {
      entry.cedula = participant.cedula.trim();
    }

    participant.roles
      .map((role) => role.trim())
      .filter(Boolean)
      .forEach((role) => entry.roles.add(role));

    grouped.set(normalizedName, entry);
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

  const { data: people, error: peopleError } = await supabase
    .from("reporte_personas")
    .select("*")
    .eq("tipo_reporte", tipoReporte)
    .in("reporte_id", reportIds);

  if (peopleError) {
    throw peopleError;
  }

  if (!people || people.length === 0) {
    return new Map<string, ReportPersonWithRoles[]>();
  }

  const personIds = people.map((person) => person.id);
  const { data: roles, error: rolesError } = await supabase
    .from("reporte_persona_roles")
    .select("*")
    .in("reporte_persona_id", personIds);

  if (rolesError) {
    throw rolesError;
  }

  const rolesByPerson = new Map<string, string[]>();
  (roles || []).forEach((role) => {
    const current = rolesByPerson.get(role.reporte_persona_id) ?? [];
    current.push(role.rol);
    rolesByPerson.set(role.reporte_persona_id, current);
  });

  const byReport = new Map<string, ReportPersonWithRoles[]>();
  people.forEach((person) => {
    const entry: ReportPersonWithRoles = {
      ...person,
      tipo_reporte: person.tipo_reporte as ReportType,
      roles: rolesByPerson.get(person.id) ?? [],
    };
    const current = byReport.get(person.reporte_id) ?? [];
    current.push(entry);
    byReport.set(person.reporte_id, current);
  });

  return byReport;
};

export const loadPeopleNameOptions = async (
  excludedRoles: string[] = [],
  tipoReporte?: ReportType,
) => {
  let query = supabase.from("reporte_personas").select("*");
  if (tipoReporte) {
    query = query.eq("tipo_reporte", tipoReporte);
  }

  const { data: people, error: peopleError } = await query;
  if (peopleError) {
    throw peopleError;
  }

  if (!people || people.length === 0) {
    return [];
  }

  const personIds = people.map((person) => person.id);
  const { data: roles, error: rolesError } = await supabase
    .from("reporte_persona_roles")
    .select("*")
    .in("reporte_persona_id", personIds);

  if (rolesError) {
    throw rolesError;
  }

  const excluded = new Set(excludedRoles);
  const allowedNames = new Set<string>();
  const rolesByPerson = new Map<string, string[]>();
  (roles || []).forEach((role) => {
    const current = rolesByPerson.get(role.reporte_persona_id) ?? [];
    current.push(role.rol);
    rolesByPerson.set(role.reporte_persona_id, current);
  });

  people.forEach((person) => {
    const personRoles = rolesByPerson.get(person.id) ?? [];
    if (personRoles.some((role) => !excluded.has(role))) {
      allowedNames.add(person.nombre);
    }
  });

  return Array.from(allowedNames).sort();
};

export const searchPersonParticipations = async (
  personName: string,
  tipoReporte: ReportType,
  reportIds?: string[],
) => {
  let query = supabase
    .from("reporte_personas")
    .select("*")
    .eq("tipo_reporte", tipoReporte)
    .ilike("nombre", `%${personName.trim()}%`);

  if (reportIds && reportIds.length > 0) {
    query = query.in("reporte_id", reportIds);
  }

  const { data: people, error: peopleError } = await query;
  if (peopleError) {
    throw peopleError;
  }

  if (!people || people.length === 0) {
    return [];
  }

  const ids = people.map((person) => person.id);
  const { data: roles, error: rolesError } = await supabase
    .from("reporte_persona_roles")
    .select("*")
    .in("reporte_persona_id", ids);

  if (rolesError) {
    throw rolesError;
  }

  const rolesByPerson = new Map<string, string[]>();
  (roles || []).forEach((role) => {
    const current = rolesByPerson.get(role.reporte_persona_id) ?? [];
    current.push(role.rol);
    rolesByPerson.set(role.reporte_persona_id, current);
  });

  return people.map((person) => ({
    ...person,
    tipo_reporte: person.tipo_reporte as ReportType,
    roles: rolesByPerson.get(person.id) ?? [],
  }));
};

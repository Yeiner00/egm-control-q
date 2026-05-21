export type PersonMetric = {
  name: string;
  value: number;
};

type PerformancePerson = {
  nombre: string;
  roles: string[];
};

type BoatPerformanceReport = {
  id: string;
  millas_nauticas: number | null;
};

type VehiclePerformanceReport = {
  id: string;
};

const normalizePersonKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const normalizeRoleKey = (value: string) =>
  normalizePersonKey(value).replace(/_/g, " ");

export const hasOperationalRole = (roles: string[]) => {
  const normalizedRoles = roles.map((role) => normalizeRoleKey(role));
  return normalizedRoles.some((role) => role !== "particular" && role !== "persona particular");
};

export const toTopPersonMetrics = (items: Map<string, PersonMetric>, limit = 5) =>
  Array.from(items.values())
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "es"))
    .slice(0, limit);

export const buildTopNauticalMiles = (
  boatReports: BoatPerformanceReport[],
  peopleByReport: Map<string, PerformancePerson[]>,
  limit = 5,
) => {
  const nauticalMilesByPerson = new Map<string, PersonMetric>();

  boatReports.forEach((report) => {
    const miles = Number(report.millas_nauticas ?? 0);
    if (miles <= 0) return;

    (peopleByReport.get(report.id) ?? [])
      .filter((person) => person.nombre?.trim() && hasOperationalRole(person.roles))
      .forEach((person) => {
        const key = normalizePersonKey(person.nombre);
        const current = nauticalMilesByPerson.get(key) ?? { name: person.nombre, value: 0 };
        current.value += miles;
        nauticalMilesByPerson.set(key, current);
      });
  });

  return toTopPersonMetrics(nauticalMilesByPerson, limit);
};

export const buildTopVehicleTrips = (
  vehicleReports: VehiclePerformanceReport[],
  peopleByReport: Map<string, PerformancePerson[]>,
  limit = 5,
) => {
  const vehicleTripsByPerson = new Map<string, PersonMetric>();
  const countedTrips = new Set<string>();

  vehicleReports.forEach((report) => {
    (peopleByReport.get(report.id) ?? [])
      .filter((person) => person.nombre?.trim() && hasOperationalRole(person.roles))
      .forEach((person) => {
        const key = normalizePersonKey(person.nombre);
        const tripKey = `${report.id}:${key}`;
        if (countedTrips.has(tripKey)) return;

        countedTrips.add(tripKey);
        const current = vehicleTripsByPerson.get(key) ?? { name: person.nombre, value: 0 };
        current.value += 1;
        vehicleTripsByPerson.set(key, current);
      });
  });

  return toTopPersonMetrics(vehicleTripsByPerson, limit);
};

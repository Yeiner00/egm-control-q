export interface ProposalTotalsGroup {
  name: string;
  reportNumbers: string[];
}

export interface ProposalRoleSummary {
  label: string;
  count: number;
  reportNumbers: string[];
}

const ROLE_LABELS: Record<string, string> = {
  capitan: "Capitan",
  chofer: "Chofer",
  encargado_mision: "Jefe de mision",
  jefe_mision: "Jefe de mision",
  oficial: "Operacional",
  operacional: "Operacional",
  sub_oficial: "Sub oficial",
  suboficial: "Sub oficial",
};

const normalizeRoleKey = (role?: string | null) =>
  (role || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

export const formatProposalRoleLabel = (role?: string | null) => {
  const normalized = normalizeRoleKey(role);

  if (!normalized) {
    return "Sin rol";
  }

  if (ROLE_LABELS[normalized]) {
    return ROLE_LABELS[normalized];
  }

  return normalized
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
};

export const buildProposalTotalsGroups = <T>(
  reports: T[],
  getUnit: (report: T) => string | null | undefined,
  getReportNumber: (report: T) => string | null | undefined,
) => {
  const grouped = new Map<string, string[]>();

  reports.forEach((report) => {
    const unitName = getUnit(report)?.trim() || "Sin unidad";
    const reportNumber = getReportNumber(report)?.trim();

    if (!reportNumber) {
      return;
    }

    if (!grouped.has(unitName)) {
      grouped.set(unitName, []);
    }

    grouped.get(unitName)?.push(reportNumber);
  });

  return Array.from(grouped.entries())
    .map(([name, reportNumbers]) => ({ name, reportNumbers }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const buildProposalRoleSummaries = <T>(
  reports: T[],
  getRole: (report: T) => string | string[] | null | undefined,
  getReportNumber: (report: T) => string | null | undefined,
  excludedRoles: string[],
) => {
  const excluded = new Set(excludedRoles.map((role) => normalizeRoleKey(role)));
  const grouped = new Map<string, ProposalRoleSummary>();

  reports.forEach((report) => {
    const reportNumber = getReportNumber(report)?.trim();
    const rawRoles = getRole(report);

    if (!reportNumber || !rawRoles) {
      return;
    }

    const roleList = Array.isArray(rawRoles) ? rawRoles : [rawRoles];
    const uniqueRoles = Array.from(
      new Set(
        roleList
          .map((role) => role?.trim())
          .filter(Boolean),
      ),
    );

    const uniqueLabels = new Set<string>();

    uniqueRoles.forEach((rawRole) => {
      const normalizedRole = normalizeRoleKey(rawRole);
      if (!normalizedRole || excluded.has(normalizedRole)) {
        return;
      }

      const label = formatProposalRoleLabel(rawRole);
      uniqueLabels.add(label);
    });

    uniqueLabels.forEach((label) => {
      const existing = grouped.get(label);

      if (existing) {
        existing.count += 1;
        existing.reportNumbers.push(reportNumber);
        return;
      }

      grouped.set(label, {
        label,
        count: 1,
        reportNumbers: [reportNumber],
      });
    });
  });

  return Array.from(grouped.values()).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }

    return a.label.localeCompare(b.label);
  });
};

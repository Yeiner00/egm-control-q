import { Button } from "@/components/ui/button";
import type { ProposalRoleSummary, ProposalTotalsGroup } from "@/lib/proposalTotals";
import type { LucideIcon } from "lucide-react";
import { Anchor, CarFront, ClipboardCheck, Copy, Layers3, ShieldCheck, Ship, UserRound, UsersRound } from "lucide-react";
import { toast } from "sonner";

interface ProposalTotalsMetric {
  label: string;
  value: string;
  icon: LucideIcon;
}

interface ProposalTotalsSectionProps {
  metrics: ProposalTotalsMetric[];
  unitSectionTitle: string;
  unitGroups: ProposalTotalsGroup[];
  totalReportNumbers: string[];
  roleSummaries: ProposalRoleSummary[];
}

const formatReportChip = (reportNumber: string) => `#${reportNumber}`;

const ROLE_ICONS: Record<string, LucideIcon> = {
  Capitan: Anchor,
  Chofer: CarFront,
  "Jefe de mision": ClipboardCheck,
  Operacional: ShieldCheck,
  "Sub oficial": ShieldCheck,
  Tripulante: UsersRound,
  Acompanante: UsersRound,
};

const getRoleIcon = (label: string) => ROLE_ICONS[label] ?? UserRound;

const formatReportCount = (count: number) => `${count} reporte${count === 1 ? "" : "s"}`;
const formatRoleCount = (count: number) => `${count} ${count === 1 ? "vez" : "veces"}`;

const ProposalTotalsSection = ({
  metrics,
  unitSectionTitle,
  unitGroups,
  totalReportNumbers,
  roleSummaries,
}: ProposalTotalsSectionProps) => {
  const UnitIcon = unitSectionTitle.toLowerCase().includes("embarcacion") ? Ship : CarFront;

  const copyReportList = (reportNumbers: string[], label: string) => {
    navigator.clipboard.writeText(reportNumbers.join(", "));
    toast.success(`Lista copiada de ${label.toLowerCase()}`);
  };

  return (
    <div className="result-panel-section border-primary/25 bg-primary/5">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-semibold text-foreground">Totales</h4>
      </div>

      <div className="totals-summary-grid">
        {metrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <div key={metric.label} className="totals-summary-card">
              <span className="totals-summary-icon">
                <Icon className="h-4 w-4" />
              </span>
              <div className="space-y-0.5">
                <div className="totals-summary-label">{metric.label}</div>
                <div className="totals-summary-value">{metric.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="totals-block">
        <div className="totals-block-heading">{unitSectionTitle}</div>
        <div className="totals-group-grid">
          {unitGroups.map((group) => (
            <div key={group.name} className="totals-list-card">
              <div className="totals-list-header">
                <div className="totals-heading-main">
                  <span className="totals-unit-icon" aria-hidden="true">
                    <UnitIcon className="h-4 w-4" />
                  </span>
                  <div className="totals-list-title">{group.name}</div>
                  <div className="totals-list-meta">{formatReportCount(group.reportNumbers.length)}</div>
                </div>
              </div>
              <div className="totals-chip-list">
                {group.reportNumbers.map((reportNumber) => (
                  <span key={`${group.name}-${reportNumber}`} className="totals-chip">
                    {formatReportChip(reportNumber)}
                  </span>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="totals-copy-button"
                title={`Copiar reportes de ${group.name}`}
                aria-label={`Copiar reportes de ${group.name}`}
                onClick={() => copyReportList(group.reportNumbers, group.name)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          <div className="totals-list-card totals-list-card-total">
            <div className="totals-list-header">
              <div className="totals-heading-main">
                <span className="totals-unit-icon" aria-hidden="true">
                  <Layers3 className="h-4 w-4" />
                </span>
                <div className="totals-list-title">Lista total</div>
                <div className="totals-list-meta">{formatReportCount(totalReportNumbers.length)}</div>
              </div>
            </div>
            <div className="totals-chip-list">
              {totalReportNumbers.map((reportNumber) => (
                <span key={`total-${reportNumber}`} className="totals-chip totals-chip-total">
                  {formatReportChip(reportNumber)}
                </span>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="totals-copy-button"
              title="Copiar lista total"
              aria-label="Copiar lista total"
              onClick={() => copyReportList(totalReportNumbers, "lista total")}
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="totals-block">
        <div className="totals-block-heading">Roles destacados</div>
        {roleSummaries.length > 0 ? (
          <div className="totals-role-grid">
            {roleSummaries.map((role) => {
              const RoleIcon = getRoleIcon(role.label);

              return (
                <div key={role.label} className="totals-role-card">
                  <div className="totals-role-header">
                    <div className="totals-heading-main">
                      <span className="totals-role-icon" aria-hidden="true">
                        <RoleIcon className="h-4 w-4" />
                      </span>
                      <div className="totals-role-title">{role.label}</div>
                      <div className="totals-role-meta">{formatRoleCount(role.count)}</div>
                    </div>
                  </div>
                  <div className="totals-chip-list">
                    {role.reportNumbers.map((reportNumber) => (
                      <span key={`${role.label}-${reportNumber}`} className="totals-chip">
                        {formatReportChip(reportNumber)}
                      </span>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="totals-copy-button"
                    title={`Copiar reportes de ${role.label}`}
                    aria-label={`Copiar reportes de ${role.label}`}
                    onClick={() => copyReportList(role.reportNumbers, role.label)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hubo roles especiales para destacar en esta consulta.
          </p>
        )}
      </div>
    </div>
  );
};

export default ProposalTotalsSection;

import { Button } from "@/components/ui/button";
import type { ProposalRoleSummary, ProposalTotalsGroup } from "@/lib/proposalTotals";
import type { LucideIcon } from "lucide-react";
import { Copy } from "lucide-react";
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

const ProposalTotalsSection = ({
  metrics,
  unitSectionTitle,
  unitGroups,
  totalReportNumbers,
  roleSummaries,
}: ProposalTotalsSectionProps) => {
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
                <div className="space-y-0.5">
                  <div className="totals-list-title">{group.name}</div>
                  <div className="totals-list-meta">
                    {group.reportNumbers.length} reporte{group.reportNumbers.length === 1 ? "" : "s"}
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="totals-copy-button"
                  onClick={() => copyReportList(group.reportNumbers, group.name)}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="totals-chip-list">
                {group.reportNumbers.map((reportNumber) => (
                  <span key={`${group.name}-${reportNumber}`} className="totals-chip">
                    {formatReportChip(reportNumber)}
                  </span>
                ))}
              </div>
            </div>
          ))}

          <div className="totals-list-card totals-list-card-total">
            <div className="totals-list-header">
              <div className="space-y-0.5">
                <div className="totals-list-title">Lista total</div>
                <div className="totals-list-meta">
                  {totalReportNumbers.length} reporte{totalReportNumbers.length === 1 ? "" : "s"}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="totals-copy-button"
                onClick={() => copyReportList(totalReportNumbers, "lista total")}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="totals-chip-list">
              {totalReportNumbers.map((reportNumber) => (
                <span key={`total-${reportNumber}`} className="totals-chip totals-chip-total">
                  {formatReportChip(reportNumber)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="totals-block">
        <div className="totals-block-heading">Roles destacados</div>
        {roleSummaries.length > 0 ? (
          <div className="totals-role-grid">
            {roleSummaries.map((role) => (
              <div key={role.label} className="totals-role-card">
                <div className="totals-role-title">
                  {role.label}: {role.count} {role.count === 1 ? "vez" : "veces"}
                </div>
                <div className="totals-chip-list">
                  {role.reportNumbers.map((reportNumber) => (
                    <span key={`${role.label}-${reportNumber}`} className="totals-chip">
                      {formatReportChip(reportNumber)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
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

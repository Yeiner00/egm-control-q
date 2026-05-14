import { Button } from "@/components/ui/button";
import { Clock3, Eye, EyeOff, FileSpreadsheet, MapPinned, Pencil, Tag, UserRound } from "lucide-react";
import { isEmptyReportValue } from "@/lib/missingData";

interface ProposalMetric {
  label: string;
  value: string | number | null | undefined;
}

interface ProposalReportCardProps {
  date: string | null | undefined;
  reportNumber: string | null | undefined;
  unit: string | null | undefined;
  secondaryLabel?: string | null;
  role: string | null | undefined;
  metrics: ProposalMetric[];
  tags: string[];
  expanded: boolean;
  novedades?: unknown;
  onToggleNovedades: () => void;
  onEdit?: () => void;
  onPrint?: () => void;
  printing?: boolean;
}

const MissingChip = () => <span className="proposal-missing-chip">Sin dato</span>;

const ValueOrMissing = ({ value }: { value: string | number | null | undefined }) =>
  isEmptyReportValue(value) ? <MissingChip /> : <>{value}</>;

const formatNovedades = (value: unknown): string => {
  if (isEmptyReportValue(value)) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map(formatNovedades).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => {
        const formatted = formatNovedades(entry);
        return formatted ? `${key}: ${formatted}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(value);
};

const ProposalReportCard = ({
  date,
  reportNumber,
  unit,
  secondaryLabel,
  role,
  metrics,
  tags,
  expanded,
  novedades,
  onToggleNovedades,
  onEdit,
  onPrint,
  printing = false,
}: ProposalReportCardProps) => {
  const novedadesText = formatNovedades(novedades);

  return (
    <article className="proposal-report-card">
      <div className="proposal-report-top">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="proposal-report-date"><ValueOrMissing value={date} /></h5>
            <span className="proposal-report-pill">
              Viaje: {isEmptyReportValue(reportNumber) ? <MissingChip /> : `#${reportNumber}`}
            </span>
          </div>
          <div className="proposal-report-role">
            <UserRound className="h-3.5 w-3.5" />
            <span>Rol: </span>
            <ValueOrMissing value={role} />
          </div>
        </div>

        <div className="space-y-2.5 text-left lg:text-right">
          <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
            <h6 className="proposal-report-unit"><ValueOrMissing value={unit} /></h6>
            <span className="proposal-report-chip-soft"><ValueOrMissing value={secondaryLabel} /></span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {metrics.map((metric) => (
              <div key={metric.label} className="proposal-report-metric">
                <div className="proposal-report-metric-line">
                  <span className="proposal-report-metric-label">
                    {metric.label === "Millas" || metric.label === "Kilometros" ? (
                      <MapPinned className="h-3.5 w-3.5" />
                    ) : (
                      <Clock3 className="h-3.5 w-3.5" />
                    )}
                    {metric.label}:
                  </span>
                  <span className="proposal-report-metric-value"><ValueOrMissing value={metric.value} /></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="proposal-report-tags">
        {tags.length > 0 ? (
          tags.map((tag, index) => (
            <span key={`${tag}-${index}`} className="proposal-report-tag">
              <Tag className="h-3 w-3" />
              {tag}
            </span>
          ))
        ) : (
          <MissingChip />
        )}
      </div>

      <div className="proposal-report-footer">
        <Button variant="ghost" size="sm" className="proposal-report-toggle" onClick={onToggleNovedades}>
          {expanded ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {expanded ? "Ocultar novedades" : "Ver novedades"}
        </Button>
        {(onPrint || onEdit) && (
          <div className="ml-auto flex items-center gap-1">
            {onPrint && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-primary"
                onClick={onPrint}
                disabled={printing}
                aria-label="Imprimir reporte"
                title="Imprimir reporte"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
              </Button>
            )}
            {onEdit && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-primary"
                onClick={onEdit}
                aria-label="Editar reporte"
                title="Editar reporte"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {expanded && (
        <div className="proposal-report-notes">
          {isEmptyReportValue(novedadesText) ? (
            <MissingChip />
          ) : (
            <p className="whitespace-pre-line text-sm text-muted-foreground">{novedadesText}</p>
          )}
        </div>
      )}
    </article>
  );
};

export default ProposalReportCard;

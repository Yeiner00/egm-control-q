import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  CarFront,
  Clock3,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Pencil,
  Route,
  Ship,
  Tag,
  UserRound,
} from "lucide-react";
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

const normalizeMetricLabel = (label: string) =>
  label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

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
  const isBoatReport = metrics.some((metric) => {
    const label = normalizeMetricLabel(metric.label);
    return label.includes("milla") || label.includes("nav");
  });
  const UnitIcon = isBoatReport ? Ship : CarFront;

  return (
    <article className="proposal-report-card">
      <div className="proposal-report-main">
        <div className="proposal-report-meta">
          <span className="proposal-report-station">
            <ValueOrMissing value={secondaryLabel} />
          </span>
          <div className="proposal-report-meta-cluster">
            <span className="proposal-report-meta-item">
              <CalendarDays className="proposal-report-icon" />
              <span className="proposal-report-meta-text"><ValueOrMissing value={date} /></span>
            </span>
            <span className="proposal-report-meta-item">
              <FileText className="proposal-report-icon" />
              <span className="proposal-report-meta-text">
                {isEmptyReportValue(reportNumber) ? <MissingChip /> : `#${reportNumber}`}
              </span>
            </span>
            <span className="proposal-report-meta-item">
              <UnitIcon className="proposal-report-icon" />
              <span className="proposal-report-meta-text"><ValueOrMissing value={unit} /></span>
            </span>
          </div>
        </div>

        <div className="proposal-report-divider proposal-report-header-divider" />

        <div className="proposal-report-body">
          <div className="proposal-report-info-row">
            <div className="proposal-report-detail proposal-report-role">
              <UserRound className="proposal-report-icon" />
              <span className="proposal-report-label">Rol</span>
              <span className="proposal-report-value"><ValueOrMissing value={role} /></span>
            </div>
            {metrics.map((metric) => {
              const label = normalizeMetricLabel(metric.label);
              const MetricIcon = label.includes("kilometro") || label.includes("milla") ? Route : Clock3;

              return (
                <div key={metric.label} className="proposal-report-detail proposal-report-metric">
                  <MetricIcon className="proposal-report-icon" />
                  <span className="proposal-report-label">{metric.label}</span>
                  <span className="proposal-report-value"><ValueOrMissing value={metric.value} /></span>
                </div>
              );
            })}
          </div>

          <div className="proposal-report-motives">
            <div className="proposal-report-motives-label">
              <Tag className="proposal-report-icon" />
              <span>Motivos</span>
            </div>
            <div className="proposal-report-tags">
              {tags.length > 0 ? (
                tags.map((tag, index) => (
                  <span key={`${tag}-${index}`} className="proposal-report-tag">
                    {tag}
                  </span>
                ))
              ) : (
                <MissingChip />
              )}
            </div>
          </div>
        </div>

        <div className="proposal-report-divider proposal-report-footer-divider" />

        <div className="proposal-report-footer">
          <Button variant="ghost" size="sm" className="proposal-report-toggle" onClick={onToggleNovedades}>
            {expanded ? <EyeOff className="proposal-report-icon" /> : <Eye className="proposal-report-icon" />}
            {expanded ? "Ocultar novedades" : "Ver novedades"}
          </Button>
          {(onPrint || onEdit) && (
            <div className="ml-auto flex items-center gap-2">
              {onPrint && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="proposal-report-action"
                  onClick={onPrint}
                  disabled={printing}
                  aria-label="Imprimir reporte"
                  title="Imprimir reporte"
                >
                  <FileSpreadsheet className="proposal-report-icon" />
                </Button>
              )}
              {onEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="proposal-report-action"
                  onClick={onEdit}
                  aria-label="Editar reporte"
                  title="Editar reporte"
                >
                  <Pencil className="proposal-report-icon" />
                </Button>
              )}
            </div>
          )}
        </div>
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

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ReportType } from "@/lib/reportPersistence";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  CalendarDays,
  CarFront,
  CheckCircle2,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pencil,
  Ship,
  Tag,
  UserRound,
  X,
} from "lucide-react";

export type ReportRowOrigin = "gestion" | "subida" | "propuesta";
export type ReportRowStatus = "idle" | "pending" | "processing" | "ready" | "saved" | "error" | "save-error";

export interface ReportRowMetric {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
}

interface ReportListRowProps {
  origin: ReportRowOrigin;
  type?: ReportType;
  status?: ReportRowStatus;
  title?: string;
  reportNumber?: string | null;
  date?: string | null;
  unit?: string | null;
  station?: string | null;
  role?: string | null;
  metrics?: ReportRowMetric[];
  tags?: string[];
  expanded?: boolean;
  expandable?: boolean;
  statusText?: string;
  errorText?: string;
  onExpandedChange?: (open: boolean) => void;
  onToggleNovedades?: () => void;
  novedadesExpanded?: boolean;
  onGenerateExcel?: () => void;
  generatingExcel?: boolean;
  onEdit?: () => void;
  editing?: boolean;
  hideEditAction?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
  notes?: ReactNode;
  children?: ReactNode;
  className?: string;
}

const STATUS_LABELS: Record<ReportRowStatus, string> = {
  idle: "Pendiente",
  pending: "Pendiente",
  processing: "Procesando",
  ready: "Listo",
  saved: "Guardado",
  error: "Error",
  "save-error": "Error al guardar",
};

const getStatusIcon = (status: ReportRowStatus) => {
  if (status === "processing" || status === "pending") return Loader2;
  if (status === "error" || status === "save-error") return AlertCircle;
  if (status === "ready" || status === "saved") return CheckCircle2;
  return CheckCircle2;
};

const getStatusClass = (status: ReportRowStatus) => {
  if (status === "error" || status === "save-error") return "report-list-row-error";
  if (status === "saved") return "report-list-row-saved";
  return "";
};

const formatReportNumber = (reportNumber?: string | null) =>
  reportNumber ? `#${reportNumber}` : "#----";

const RowActionButton = ({
  label,
  onClick,
  disabled,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}) => (
  <Button
    type="button"
    variant="ghost"
    size="icon"
    className={cn("report-list-action", className)}
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
  >
    {children}
  </Button>
);

const ReportListRow = ({
  origin,
  type,
  status = "ready",
  title,
  reportNumber,
  date,
  unit,
  station,
  role,
  metrics = [],
  tags = [],
  expanded = false,
  expandable = false,
  statusText,
  errorText,
  onExpandedChange,
  onToggleNovedades,
  novedadesExpanded = false,
  onGenerateExcel,
  generatingExcel = false,
  onEdit,
  editing = false,
  hideEditAction = false,
  onRemove,
  removeLabel,
  notes,
  children,
  className,
}: ReportListRowProps) => {
  const StatusIcon = getStatusIcon(status);
  const UnitIcon = type === "embarcacion" ? Ship : CarFront;
  const visibleTags = tags.slice(0, 3);
  const hiddenTagCount = Math.max(tags.length - visibleTags.length, 0);
  const rowTitle = title || `Reporte ${formatReportNumber(reportNumber)}`;
  const displayStatus = statusText || STATUS_LABELS[status];
  const showStatusText = status !== "ready" || Boolean(statusText || errorText);
  const showStatusIndicator = status !== "ready" || Boolean(statusText || errorText);
  const triggerLabel = `${expanded ? "Cerrar" : "Abrir"} ${rowTitle}`;
  const editAction = hideEditAction ? undefined : onEdit || (expandable && !expanded ? () => onExpandedChange?.(true) : undefined);

  const summaryContent = (
    <>
      {showStatusIndicator && (
        <div className="report-list-status" aria-hidden="true">
          <StatusIcon className={cn("h-4 w-4", (status === "processing" || status === "pending") && "animate-spin")} />
        </div>
      )}
      <div className="report-list-main">
        <div className="report-list-identity">
          <div className="report-list-primary">
            <span className="report-list-number">
              <FileText className="report-list-icon" />
              {formatReportNumber(reportNumber)}
            </span>
            {date && (
              <span className="report-list-date">
                <CalendarDays className="report-list-icon" />
                {date}
              </span>
            )}
            {station && <span className="report-list-station">{station}</span>}
            {title && <span className="report-list-title">{title}</span>}
          </div>
        </div>
        <div className="report-list-facts">
          {unit && (
            <span className="report-list-fact">
              <UnitIcon className="report-list-icon" />
              {unit}
            </span>
          )}
          {role && (
            <span className="report-list-fact report-list-role">
              <UserRound className="report-list-icon" />
              {role}
            </span>
          )}
          {metrics.map((metric) => {
            const MetricIcon = metric.icon;

            return (
              <span key={metric.label} className="report-list-fact">
                {MetricIcon && <MetricIcon className="report-list-icon" />}
                <span className="report-list-fact-label">{metric.label}</span>
                <span className="report-list-fact-value">{metric.value}</span>
              </span>
            );
          })}
          {tags.length > 0 && (
            <span className="report-list-tags" aria-label="Motivos">
              <Tag className="report-list-icon" />
              {visibleTags.map((tag, index) => (
                <span key={`${tag}-${index}`} className="report-list-tag">
                  {tag}
                </span>
              ))}
              {hiddenTagCount > 0 && <span className="report-list-tag">+{hiddenTagCount}</span>}
            </span>
          )}
          {showStatusText && (
            <span className={cn("report-list-fact report-list-row-state", errorText && "text-destructive")}>
              {errorText || displayStatus}
            </span>
          )}
        </div>
      </div>
    </>
  );

  return (
    <article className={cn("report-list-row deferred-report-region", getStatusClass(status), className)} data-origin={origin}>
      <div className="report-list-row-shell">
        {expandable ? (
          <button
            type="button"
            className="report-list-trigger"
            onClick={() => onExpandedChange?.(!expanded)}
            aria-expanded={expanded}
            aria-label={triggerLabel}
          >
            {summaryContent}
          </button>
        ) : (
          <div className="report-list-trigger report-list-trigger-static">
            {summaryContent}
          </div>
        )}

        <div className="report-list-actions">
          {onToggleNovedades && (
            <RowActionButton
              label={novedadesExpanded ? "Ocultar novedades" : "Ver novedades"}
              onClick={onToggleNovedades}
            >
              {novedadesExpanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </RowActionButton>
          )}
          {onGenerateExcel && (
            <RowActionButton
              label={`Generar Excel del reporte ${formatReportNumber(reportNumber)}`}
              onClick={onGenerateExcel}
              disabled={generatingExcel}
            >
              {generatingExcel ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            </RowActionButton>
          )}
          {editAction && (
            <RowActionButton
              label={`Editar reporte ${formatReportNumber(reportNumber)}`}
              onClick={editAction}
              disabled={editing}
            >
              {editing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            </RowActionButton>
          )}
          {onRemove && (
            <RowActionButton
              label={removeLabel || `Quitar reporte ${formatReportNumber(reportNumber)}`}
              onClick={onRemove}
              className="report-list-action-danger"
            >
              <X className="h-4 w-4" />
            </RowActionButton>
          )}
        </div>
      </div>

      {expanded && children && (
        <div className="report-list-row-details">
          {children}
        </div>
      )}

      {novedadesExpanded && notes && (
        <div className="report-list-row-notes">
          {notes}
        </div>
      )}
    </article>
  );
};

export default ReportListRow;

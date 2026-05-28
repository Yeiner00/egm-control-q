import { Loader2, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReportFormActionBarProps {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
  cancelLabel?: string;
  onDelete?: () => void;
  deleting?: boolean;
  deleteLabel?: string;
}

const actionBarClass = "sticky bottom-0 z-20 -mx-4 -mb-4 flex flex-col gap-2 rounded-b-[calc(var(--radius)-0.08rem)] border-t border-border/70 bg-card/95 px-4 py-3 shadow-[0_-18px_32px_-28px_rgba(15,23,42,0.45)] backdrop-blur supports-[backdrop-filter]:bg-card/88 sm:flex-row sm:items-center sm:justify-between dark:shadow-none";
const actionButtonClass = "w-full sm:w-auto";

const ReportFormActionBar = ({
  onSave,
  onCancel,
  saving,
  saveLabel,
  cancelLabel = "Cancelar",
  onDelete,
  deleting = false,
  deleteLabel = "Eliminar reporte",
}: ReportFormActionBarProps) => (
  <div className={actionBarClass}>
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Button type="button" onClick={onSave} disabled={saving || deleting} size="sm" className={actionButtonClass}>
        <Save className="h-4 w-4 mr-1" />
        {saving ? "Guardando..." : saveLabel}
      </Button>
      <Button type="button" variant="outline" onClick={onCancel} disabled={saving || deleting} size="sm" className={actionButtonClass}>
        <X className="h-4 w-4 mr-1" />
        {cancelLabel}
      </Button>
    </div>
    {onDelete && (
      <Button
        type="button"
        variant="destructive"
        onClick={onDelete}
        disabled={saving || deleting}
        size="sm"
        className={actionButtonClass}
      >
        {deleting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
        {deleting ? "Eliminando..." : deleteLabel}
      </Button>
    )}
  </div>
);

export default ReportFormActionBar;

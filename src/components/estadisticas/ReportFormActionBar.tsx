import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ReportFormActionBarProps {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  saveLabel: string;
}

const actionBarClass = "sticky bottom-0 z-20 -mx-4 -mb-4 flex flex-col gap-2 rounded-b-[calc(var(--radius)-0.08rem)] border-t border-border/70 bg-card/95 px-4 py-3 shadow-[0_-18px_32px_-28px_rgba(15,23,42,0.45)] backdrop-blur supports-[backdrop-filter]:bg-card/88 sm:flex-row sm:justify-end dark:shadow-none";
const actionButtonClass = "w-full sm:w-auto";

const ReportFormActionBar = ({
  onSave,
  onCancel,
  saving,
  saveLabel,
}: ReportFormActionBarProps) => (
  <div className={actionBarClass}>
    <Button type="button" onClick={onSave} disabled={saving} size="sm" className={actionButtonClass}>
      <Save className="h-4 w-4 mr-1" />
      {saving ? "Guardando..." : saveLabel}
    </Button>
    <Button type="button" variant="outline" onClick={onCancel} size="sm" className={actionButtonClass}>
      <X className="h-4 w-4 mr-1" />
      Cancelar
    </Button>
  </div>
);

export default ReportFormActionBar;

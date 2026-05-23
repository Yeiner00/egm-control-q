import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { downloadReportExcel } from "@/lib/reportExcelExport";
import {
  deleteSavedReport,
  loadReportFormOptions,
  loadSavedReportEditorData,
  updateSavedReport,
  type ReportFormOptions,
  type ReportType,
} from "@/lib/reportPersistence";
import { getErrorMessage } from "@/lib/errorMessage";
import VehicleReportForm, { type VehicleFormData } from "./VehicleReportForm";
import BoatReportForm, { type BoatFormData } from "./BoatReportForm";
import ReportListRow, { type ReportRowMetric, type ReportRowOrigin } from "./ReportListRow";

interface SavedReportListRowProps {
  origin: ReportRowOrigin;
  type: ReportType;
  reportId: string;
  reportNumber: string | null | undefined;
  date: string | null | undefined;
  unit: string | null | undefined;
  station?: string | null;
  role?: string | null;
  metrics?: ReportRowMetric[];
  tags?: string[];
  novedadesExpanded?: boolean;
  onToggleNovedades?: () => void;
  novedadesContent?: ReactNode;
  onChanged?: (change: SavedReportChange) => Promise<void> | void;
  children?: ReactNode;
}

export interface SavedReportChange {
  action: "updated" | "deleted";
  reportId: string;
}

const REPORT_STATIONS = ["Murcielago"];

const getFallbackYear = (date?: string | null) =>
  date ? parseInt(date.split("-")[0], 10) : new Date().getFullYear();

const emptyOptions: ReportFormOptions = {
  unitOptions: [],
  peopleOptions: [],
  motiveOptions: [],
  siteOptions: [],
};

const SavedReportListRow = ({
  origin,
  type,
  reportId,
  reportNumber,
  date,
  unit,
  station,
  role,
  metrics = [],
  tags = [],
  novedadesExpanded = false,
  onToggleNovedades,
  novedadesContent,
  onChanged,
  children,
}: SavedReportListRowProps) => {
  const [expanded, setExpanded] = useState(false);
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generatingExcel, setGeneratingExcel] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vehicleData, setVehicleData] = useState<VehicleFormData | null>(null);
  const [boatData, setBoatData] = useState<BoatFormData | null>(null);
  const [options, setOptions] = useState<ReportFormOptions>(emptyOptions);

  const notifyChanged = (change: SavedReportChange) => {
    const refresh = onChanged?.(change);
    if (refresh && "catch" in refresh) {
      void refresh.catch((error) => {
        toast.error("No se pudieron actualizar los resultados", {
          description: getErrorMessage(error),
        });
      });
    }
  };

  const openEditor = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);
    if (vehicleData || boatData) return;

    setLoadingEditor(true);
    try {
      const [editorData, formOptions] = await Promise.all([
        loadSavedReportEditorData(type, reportId),
        loadReportFormOptions(type),
      ]);
      setVehicleData(editorData.vehicleData || null);
      setBoatData(editorData.boatData || null);
      setOptions(formOptions);
    } catch (error) {
      toast.error("No se pudo cargar el reporte seleccionado", {
        description: getErrorMessage(error),
      });
      setExpanded(false);
    } finally {
      setLoadingEditor(false);
    }
  };

  const save = async () => {
    const data = type === "vehiculo" ? vehicleData : boatData;
    if (!data) return;

    setSaving(true);
    try {
      const result = await updateSavedReport(type, reportId, data, getFallbackYear(date));
      if (result.error) {
        toast.error(result.error);
        setSaving(false);
        return;
      }
      toast.success("Reporte actualizado correctamente");
      setExpanded(false);
      setSaving(false);
      notifyChanged({ action: "updated", reportId });
    } catch (error) {
      toast.error("Error al guardar cambios", {
        description: getErrorMessage(error),
      });
      setSaving(false);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteSavedReport(type, reportId);
      toast.success("Reporte eliminado correctamente");
      setDeleteDialogOpen(false);
      setExpanded(false);
      setDeleting(false);
      notifyChanged({ action: "deleted", reportId });
      return;
    } catch (error) {
      toast.error("Error al eliminar el reporte", {
        description: getErrorMessage(error),
      });
      setDeleting(false);
    }
  };

  const generateExcel = async () => {
    setGeneratingExcel(true);
    try {
      await downloadReportExcel(type, reportId);
      toast.success("Excel generado correctamente");
    } catch {
      toast.error("No se pudo generar el Excel");
    } finally {
      setGeneratingExcel(false);
    }
  };

  return (
    <>
      <ReportListRow
        origin={origin}
        type={type}
        status={loadingEditor ? "processing" : "ready"}
        reportNumber={reportNumber}
        date={date}
        unit={unit}
        station={station}
        role={role}
        metrics={metrics}
        tags={tags}
        expanded={expanded}
        expandable
        onExpandedChange={(open) => {
          if (open) void openEditor();
          else setExpanded(false);
        }}
        onToggleNovedades={onToggleNovedades}
        novedadesExpanded={novedadesExpanded}
        onGenerateExcel={generateExcel}
        generatingExcel={generatingExcel}
        onEdit={openEditor}
        editing={loadingEditor}
        notes={novedadesContent}
      >
        {loadingEditor && (
          <div className="panel-subtle flex items-center gap-2 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Cargando datos del reporte...
          </div>
        )}
        {!loadingEditor && type === "vehiculo" && vehicleData && (
          <VehicleReportForm
            data={vehicleData}
            onChange={setVehicleData}
            onSave={save}
            onCancel={() => setExpanded(false)}
            saving={saving}
            stationOptions={REPORT_STATIONS}
            unitOptions={options.unitOptions}
            peopleOptions={options.peopleOptions}
            motiveOptions={options.motiveOptions}
            siteOptions={options.siteOptions}
            onDelete={() => setDeleteDialogOpen(true)}
            deleting={deleting}
          />
        )}
        {!loadingEditor && type === "embarcacion" && boatData && (
          <BoatReportForm
            data={boatData}
            onChange={setBoatData}
            onSave={save}
            onCancel={() => setExpanded(false)}
            saving={saving}
            stationOptions={REPORT_STATIONS}
            unitOptions={options.unitOptions}
            peopleOptions={options.peopleOptions}
            motiveOptions={options.motiveOptions}
            siteOptions={options.siteOptions}
            onDelete={() => setDeleteDialogOpen(true)}
            deleting={deleting}
          />
        )}
        {children}
      </ReportListRow>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar reporte</AlertDialogTitle>
            <AlertDialogDescription>
              Esta accion no se puede deshacer. El reporte y sus datos relacionados seran eliminados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={remove}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default SavedReportListRow;

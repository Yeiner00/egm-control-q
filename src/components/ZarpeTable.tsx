import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadXlsx } from "@/lib/xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarRange, Download, Loader2, Search, Trash2 } from "lucide-react";
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
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import ResultPanelState from "@/components/ResultPanelState";

type Zarpe = Tables<"zarpes_semana">;

interface Props {
  refreshKey: number;
  onDeleted?: () => void;
}

const ZarpeTable = ({ refreshKey, onDeleted }: Props) => {
  const [zarpes, setZarpes] = useState<Zarpe[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Zarpe | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchZarpes = useCallback(async () => {
    if (!startDate || !endDate) {
      toast.error("Selecciona una fecha inicial y final");
      return;
    }

    if (startDate > endDate) {
      toast.error("La fecha inicial no puede ser mayor que la fecha final");
      return;
    }

    setLoading(true);
    setHasSearched(true);
    const { data, error } = await supabase
      .from("zarpes_semana")
      .select("*")
      .gte("fecha_viaje", startDate)
      .lte("fecha_viaje", endDate)
      .order("fecha_viaje", { ascending: true });

    if (error) {
      toast.error("Error al consultar registros", { description: error.message });
      setZarpes([]);
    } else {
      setZarpes(data ?? []);
    }
    setLoading(false);
  }, [endDate, startDate]);

  useEffect(() => {
    if (hasSearched) {
      void fetchZarpes();
    }
  }, [fetchZarpes, hasSearched, refreshKey]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("zarpes_semana").delete().eq("id", deleteTarget.id);

    if (error) {
      toast.error("Error al eliminar", { description: error.message });
    } else {
      toast.success("Registro eliminado");
      setZarpes((prev) => prev.filter((z) => z.id !== deleteTarget.id));
      onDeleted?.();
    }
    setDeleting(false);
    setDeleteTarget(null);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "-";
    try {
      return new Date(`${d}T00:00:00`).toLocaleDateString("es-CR");
    } catch {
      return d;
    }
  };

  const formatTime = (t: string | null) => {
    if (!t) return "-";
    return t.substring(0, 5);
  };

  const handleExport = async () => {
    if (!hasSearched || zarpes.length === 0) {
      toast.error("Primero consulta un rango con registros");
      return;
    }

    setExporting(true);
    try {
      const XLSX = await loadXlsx();

      const headers = [
        "FECHA",
        "EMBARCACION",
        "MATRICULA",
        "NOMBRE DEL CAPITAN",
        "N° CEDULA",
        "N° ZARPE",
        "CANTIDAD ADULTOS",
        "CANTIDAD MENORES",
        "HORA DE INGRESO",
        "HORA DE SALIDA",
        "FECHA ESTIMADA DE REGRESO",
        "MEDIO COMUNICACION",
        "DESTINO",
        "REGISTRADO POR",
      ];

      const rows = zarpes.map((z) => [
        z.fecha_viaje,
        z.nombre_embarcacion,
        z.matricula,
        z.nombre_capitan,
        z.cedula_capitan,
        z.zarpe_folio,
        z.num_tripulantes,
        z.cantidad_menores,
        z.hora_ingreso,
        z.hora_salida,
        z.fecha_regreso,
        z.medio_comunicacion,
        z.destino,
        z.registrado_por,
      ]);

      const ws = XLSX.utils.aoa_to_sheet([["INFORME DE ZARPES"], headers, ...rows]);
      ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: headers.length - 1 } }];
      ws["!cols"] = headers.map((header) => ({ wch: Math.max(header.length + 2, 16) }));

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Zarpes");
      XLSX.writeFile(wb, `zarpes_${startDate}_${endDate}.xlsx`);
      toast.success("Archivo Excel generado");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error al exportar";
      toast.error("Error", { description: message });
    } finally {
      setExporting(false);
    }
  };

  const renderEmpty = () => {
    if (!hasSearched) {
      return (
        <ResultPanelState
          title="Selecciona un rango de fechas"
          description="Consulta los zarpes dentro del periodo requerido y luego podras exportar ese mismo rango."
        />
      );
    }

    return (
      <ResultPanelState
        title="Sin registros en el rango"
        description="No se encontraron zarpes entre las fechas seleccionadas."
      />
    );
  };

  if (!hasSearched || zarpes.length === 0) {
    return (
      <Card className="mx-auto w-full overflow-hidden">
        <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
          <div className="flex items-start gap-3">
            <div className="section-icon-shell">
              <CalendarRange className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="section-eyebrow">Consulta y descarga</div>
              <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">
                Registros de zarpes por rango
              </h3>
              <p className="section-copy">
                Selecciona el rango de fechas para consultar registros y habilitar la descarga del archivo Excel.
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-5 p-5 sm:p-6 lg:space-y-4 lg:p-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="startDate">Fecha inicial</Label>
              <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">Fecha final</Label>
              <Input id="endDate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <Button onClick={() => void fetchZarpes()} disabled={loading} className="lg:min-w-36">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Consultar
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting || !hasSearched || zarpes.length === 0}
              className="lg:min-w-36"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Descargar
            </Button>
          </div>

          <div className="result-panel-shell">
            <div className="result-panel-body">
              {loading ? (
                <div className="flex justify-center py-6">
                  <div className="operational-loader">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Consultando registros...</span>
                  </div>
                </div>
              ) : (
                renderEmpty()
              )}
            </div>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="mx-auto w-full overflow-hidden">
        <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="section-icon-shell">
                <CalendarRange className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <div className="section-eyebrow">Consulta y descarga</div>
                <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">
                  Registros de zarpes por rango
                </h3>
                <p className="section-copy">
                  Mostrando {zarpes.length} registro{zarpes.length === 1 ? "" : "s"} entre {formatDate(startDate)} y{" "}
                  {formatDate(endDate)}.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
              <div className="space-y-2">
                <Label htmlFor="startDateFilled">Fecha inicial</Label>
                <Input
                  id="startDateFilled"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDateFilled">Fecha final</Label>
                <Input
                  id="endDateFilled"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <Button onClick={() => void fetchZarpes()} disabled={loading} className="lg:min-w-36">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Consultar
              </Button>
              <Button
                variant="outline"
                onClick={handleExport}
                disabled={exporting || zarpes.length === 0}
                className="lg:min-w-36"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Descargar
              </Button>
            </div>
            {loading && (
              <div className="flex justify-center pt-2">
                <div className="operational-loader">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Actualizando registros...</span>
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="data-table-shell data-table-scroll-hint overflow-x-auto lg:overflow-x-visible">
          <table className="w-full text-sm">
            <thead className="data-table-head">
              <tr>
                <th className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground">N° Zarpe</th>
                <th className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground">Embarcacion</th>
                <th className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground">Capitan</th>
                <th className="hidden whitespace-nowrap p-3 text-left font-medium text-muted-foreground lg:table-cell">Matricula</th>
                <th className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground">Destino</th>
                <th className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground">Fecha</th>
                <th className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground">Salida</th>
                <th className="hidden whitespace-nowrap p-3 text-left font-medium text-muted-foreground lg:table-cell">Regreso Est.</th>
                <th className="whitespace-nowrap p-3 text-left font-medium text-muted-foreground">Adultos</th>
                <th className="w-10 p-3"></th>
              </tr>
            </thead>
            <tbody>
              {zarpes.map((z) => (
                <tr
                  key={z.id}
                  className={
                    "data-table-row last:border-0" + (zarpes.length > 30 ? " deferred-report-region" : "")
                  }
                >
                  <td className="whitespace-nowrap p-3 font-semibold text-foreground">{z.zarpe_folio || "-"}</td>
                  <td className="whitespace-nowrap p-3 text-foreground">{z.nombre_embarcacion || "-"}</td>
                  <td className="whitespace-nowrap p-3 text-foreground">{z.nombre_capitan || "-"}</td>
                  <td className="hidden whitespace-nowrap p-3 text-muted-foreground lg:table-cell">{z.matricula || "-"}</td>
                  <td className="whitespace-nowrap p-3 text-muted-foreground">{z.destino || "-"}</td>
                  <td className="whitespace-nowrap p-3 text-muted-foreground">{formatDate(z.fecha_viaje)}</td>
                  <td className="whitespace-nowrap p-3 text-muted-foreground">{formatTime(z.hora_salida)}</td>
                  <td className="hidden whitespace-nowrap p-3 text-muted-foreground lg:table-cell">{formatDate(z.fecha_regreso)}</td>
                  <td className="whitespace-nowrap p-3 text-center font-semibold text-foreground">{z.num_tripulantes ?? "-"}</td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-[var(--radius-md)] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Eliminar zarpe ${z.zarpe_folio || z.nombre_embarcacion || "seleccionado"}`}
                      onClick={() => setDeleteTarget(z)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminara el zarpe {deleteTarget?.zarpe_folio ? `N° ${deleteTarget.zarpe_folio}` : ""} de forma permanente.
              Esta accion no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ZarpeTable;

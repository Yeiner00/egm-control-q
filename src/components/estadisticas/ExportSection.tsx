import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronDown, Download, FileJson, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  loadPeopleNameOptions,
  loadReportPeopleByIds,
  searchPersonParticipations,
} from "@/lib/reportPeople";

const EXCLUDED_ROLES = ["particular", "persona_particular"];

type VehicleReport = Tables<"reportes_vehiculo">;
type BoatReport = Tables<"reportes_embarcacion">;
type MotivoRecord = Tables<"reporte_motivos">;
type SitioRecord = Tables<"reporte_sitios">;
type ExportReportType = "todos" | "vehiculo" | "embarcacion";
type ExportPerson = { nombre: string; roles: string[] };
type ExportSite = { nombre_sitio: string; zona: string | null };
type ExportedVehicleReport = VehicleReport & {
  motivos: string[];
  motivos_originales: string[];
  personas: ExportPerson[];
  sitios: ExportSite[];
};
type ExportedBoatReport = BoatReport & {
  motivos: string[];
  motivos_originales: string[];
  personas: ExportPerson[];
  sitios: ExportSite[];
};

const sumNumbers = (values: Array<number | null>) =>
  values.reduce((total, value) => total + (typeof value === "number" ? value : 0), 0);

const uniqueSorted = (values: string[]) => [...new Set(values.filter(Boolean))].sort();

const countOccurrences = (values: string[]) =>
  Object.entries(values.reduce<Record<string, number>>((acc, value) => {
    if (!value) return acc;
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {}))
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre));

const groupVehicleReportsByUnit = (reports: ExportedVehicleReport[]) =>
  uniqueSorted(reports.map((report) => report.vehiculo || "Sin unidad")).map((unit) => {
    const unitReports = reports.filter((report) => (report.vehiculo || "Sin unidad") === unit);
    return {
      unidad: unit,
      cantidad_reportes: unitReports.length,
      reportes: unitReports.map((report) => ({
        no_reporte: report.no_reporte,
        fecha: report.fecha,
        kilometros_recorridos: report.kilometros_recorridos,
        total_horas: report.total_horas,
      })),
      totales: {
        kilometros_recorridos: sumNumbers(unitReports.map((report) => report.kilometros_recorridos)),
        horas: sumNumbers(unitReports.map((report) => report.total_horas)),
      },
    };
  });

const groupBoatReportsByUnit = (reports: ExportedBoatReport[]) =>
  uniqueSorted(reports.map((report) => report.embarcacion || "Sin unidad")).map((unit) => {
    const unitReports = reports.filter((report) => (report.embarcacion || "Sin unidad") === unit);
    return {
      unidad: unit,
      cantidad_reportes: unitReports.length,
      reportes: unitReports.map((report) => ({
        no_reporte: report.no_reporte,
        fecha: report.fecha,
        millas_nauticas: report.millas_nauticas,
        horas_navegadas: report.horas_navegadas,
      })),
      totales: {
        millas_nauticas: sumNumbers(unitReports.map((report) => report.millas_nauticas)),
        horas_navegadas: sumNumbers(unitReports.map((report) => report.horas_navegadas)),
      },
    };
  });

const buildAiExportSummary = (vehicleReports: ExportedVehicleReport[], boatReports: ExportedBoatReport[]) => {
  const allReports = [...vehicleReports, ...boatReports];
  const allPeople = allReports.flatMap((report) => report.personas.map((person) => person.nombre));
  const allRoles = allReports.flatMap((report) =>
    report.personas.flatMap((person) => person.roles.map((role) => `${person.nombre} | ${role}`)),
  );
  const allMotivos = allReports.flatMap((report) => report.motivos);
  const allSitios = allReports.flatMap((report) => report.sitios.map((site) => site.nombre_sitio));

  return {
    descripcion:
      "Resumen calculado localmente para facilitar analisis con IA. Los reportes completos permanecen en vehiculos.reportes y embarcaciones.reportes.",
    totales_generales: {
      reportes: allReports.length,
      reportes_vehiculo: vehicleReports.length,
      reportes_embarcacion: boatReports.length,
      kilometros_recorridos: sumNumbers(vehicleReports.map((report) => report.kilometros_recorridos)),
      horas_vehiculo: sumNumbers(vehicleReports.map((report) => report.total_horas)),
      millas_nauticas: sumNumbers(boatReports.map((report) => report.millas_nauticas)),
      horas_navegadas: sumNumbers(boatReports.map((report) => report.horas_navegadas)),
    },
    unidades: {
      vehiculos: groupVehicleReportsByUnit(vehicleReports),
      embarcaciones: groupBoatReportsByUnit(boatReports),
    },
    listas_rapidas: {
      reportes_vehiculo: vehicleReports.map((report) => ({
        no_reporte: report.no_reporte,
        fecha: report.fecha,
        unidad: report.vehiculo,
        destino: report.destino,
      })),
      reportes_embarcacion: boatReports.map((report) => ({
        no_reporte: report.no_reporte,
        fecha: report.fecha,
        unidad: report.embarcacion,
        destino: report.destino,
      })),
    },
    conteos: {
      motivos: countOccurrences(allMotivos),
      personas: countOccurrences(allPeople),
      roles_por_persona: countOccurrences(allRoles).map((item) => {
        const [persona, rol] = item.nombre.split(" | ");
        return { persona, rol, cantidad: item.cantidad };
      }),
      sitios: countOccurrences(allSitios),
    },
  };
};

const ExportSection = () => {
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [personNames, setPersonNames] = useState<string[]>([]);
  const [tipoFilter, setTipoFilter] = useState<ExportReportType>("todos");
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [unitsOpen, setUnitsOpen] = useState(false);
  const [unidades, setUnidades] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadNames = async () => {
      const names = await loadPeopleNameOptions(EXCLUDED_ROLES);
      setPersonNames(names);
    };
    loadNames();
  }, []);

  useEffect(() => {
    setSelectedUnits([]);
    setUnitsOpen(false);

    if (tipoFilter === "todos") {
      setUnidades([]);
      return;
    }

    const loadUnits = async () => {
      if (tipoFilter === "vehiculo") {
        const { data } = await supabase.from("reportes_vehiculo").select("vehiculo");
        setUnidades([...new Set((data || []).map((row) => row.vehiculo).filter(Boolean) as string[])].sort());
        return;
      }

      const { data } = await supabase.from("reportes_embarcacion").select("embarcacion");
      setUnidades([...new Set((data || []).map((row) => row.embarcacion).filter(Boolean) as string[])].sort());
    };

    loadUnits();
  }, [tipoFilter]);

  const togglePerson = (name: string) => {
    setSelectedPeople((prev) =>
      prev.includes(name) ? prev.filter((person) => person !== name) : [...prev, name],
    );
  };

  const toggleUnit = (unit: string) => {
    setSelectedUnits((prev) =>
      prev.includes(unit) ? prev.filter((value) => value !== unit) : [...prev, unit],
    );
  };

  const exportJSON = async () => {
    if (!fechaInicio || !fechaFin) {
      toast.error("Selecciona fecha inicio y fecha fin");
      return;
    }

    setLoading(true);
    try {
      let vReports: VehicleReport[] = [];
      let bReports: BoatReport[] = [];

      if (tipoFilter === "todos" || tipoFilter === "vehiculo") {
        let query = supabase.from("reportes_vehiculo").select("*").gte("fecha", fechaInicio).lte("fecha", fechaFin);
        if (tipoFilter === "vehiculo" && selectedUnits.length > 0) {
          query = query.in("vehiculo", selectedUnits);
        }
        const { data } = await query;
        vReports = data || [];
      }

      if (tipoFilter === "todos" || tipoFilter === "embarcacion") {
        let query = supabase.from("reportes_embarcacion").select("*").gte("fecha", fechaInicio).lte("fecha", fechaFin);
        if (tipoFilter === "embarcacion" && selectedUnits.length > 0) {
          query = query.in("embarcacion", selectedUnits);
        }
        const { data } = await query;
        bReports = data || [];
      }

      if (selectedPeople.length > 0) {
        const vehicleIds = vReports.map((report) => report.id);
        const boatIds = bReports.map((report) => report.id);
        const [vehicleMatchesByPerson, boatMatchesByPerson] = await Promise.all([
          Promise.all(selectedPeople.map((name) => searchPersonParticipations(name, "vehiculo", vehicleIds))),
          Promise.all(selectedPeople.map((name) => searchPersonParticipations(name, "embarcacion", boatIds))),
        ]);

        const vehicleMatchIds = new Set(vehicleMatchesByPerson.flat().map((match) => match.reporte_id));
        const boatMatchIds = new Set(boatMatchesByPerson.flat().map((match) => match.reporte_id));

        vReports = vReports.filter((report) => vehicleMatchIds.has(report.id));
        bReports = bReports.filter((report) => boatMatchIds.has(report.id));
      }

      const allIds = [...vReports.map((report) => report.id), ...bReports.map((report) => report.id)];
      const [{ data: allMotivos }, { data: allSitios }] = await Promise.all([
        supabase.from("reporte_motivos").select("*").in("reporte_id", allIds.length > 0 ? allIds : ["none"]),
        supabase.from("reporte_sitios").select("*").in("reporte_id", allIds.length > 0 ? allIds : ["none"]),
      ]);
      const vehiclePeopleMap = await loadReportPeopleByIds(vReports.map((report) => report.id), "vehiculo");
      const boatPeopleMap = await loadReportPeopleByIds(bReports.map((report) => report.id), "embarcacion");

      const enrich = <T extends VehicleReport | BoatReport>(
        report: T,
        peopleMap: Map<string, { nombre: string; roles: string[] }[]>,
      ) => ({
        ...report,
        motivos: ((allMotivos || []) as MotivoRecord[])
          .filter((motivo) => motivo.reporte_id === report.id)
          .map((motivo) => motivo.motivo),
        motivos_originales: ((allMotivos || []) as MotivoRecord[])
          .filter((motivo) => motivo.reporte_id === report.id)
          .map((motivo) => motivo.motivo_original || motivo.motivo),
        personas: (peopleMap.get(report.id) || []).map((person) => ({
          nombre: person.nombre,
          roles: person.roles,
        })),
        sitios: ((allSitios || []) as SitioRecord[])
          .filter((sitio) => sitio.reporte_id === report.id)
          .map((sitio) => ({ nombre_sitio: sitio.nombre_sitio, zona: sitio.zona })),
      });

      const vehicleExportReports = vReports.map((report) => enrich(report, vehiclePeopleMap)) as ExportedVehicleReport[];
      const boatExportReports = bReports.map((report) => enrich(report, boatPeopleMap)) as ExportedBoatReport[];

      const payload = {
        rango: { desde: fechaInicio, hasta: fechaFin },
        filtros: { personas: selectedPeople, tipo: tipoFilter, unidades: selectedUnits },
        exportado_en: new Date().toISOString(),
        resumen_exportacion: buildAiExportSummary(vehicleExportReports, boatExportReports),
        vehiculos: { total: vehicleExportReports.length, reportes: vehicleExportReports },
        embarcaciones: { total: boatExportReports.length, reportes: boatExportReports },
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `reportes_${fechaInicio}_${fechaFin}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Exportacion completada");
    } catch {
      toast.error("Error al exportar");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="mx-auto w-full overflow-hidden">
      <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
        <div className="flex items-start gap-3">
          <div className="flex shrink-0 items-center justify-center text-primary">
            <FileJson className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="section-eyebrow">Exportar para ia</div>
            <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">Generar archivo JSON</h3>
            <p className="section-copy">
              Seleccione rango, personas, tipo y unidades para preparar la exportacion de reportes.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4 p-5 sm:p-6 lg:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Fecha inicio</Label>
            <Input type="date" value={fechaInicio} onChange={(event) => setFechaInicio(event.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Fecha fin</Label>
            <Input type="date" value={fechaFin} onChange={(event) => setFechaFin(event.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Persona (opcional)</Label>
            <Popover open={peopleOpen} onOpenChange={setPeopleOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between font-normal">
                  {selectedPeople.length > 0
                    ? `${selectedPeople.length} persona${selectedPeople.length === 1 ? "" : "s"} seleccionada${selectedPeople.length === 1 ? "" : "s"}`
                    : "Todas las personas"}
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar persona..." />
                  <CommandList>
                    <CommandEmpty>No se encontro.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem value="__clear_people__" onSelect={() => setSelectedPeople([])}>
                        <Checkbox checked={selectedPeople.length === 0} className="mr-2" />
                        Todas las personas
                      </CommandItem>
                      {personNames.map((name) => (
                        <CommandItem key={name} value={name} onSelect={() => togglePerson(name)}>
                          <Checkbox checked={selectedPeople.includes(name)} className="mr-2" />
                          {name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label>Tipo (opcional)</Label>
            <Select value={tipoFilter} onValueChange={(value: ExportReportType) => setTipoFilter(value)}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="vehiculo">Vehiculo</SelectItem>
                <SelectItem value="embarcacion">Embarcacion</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {tipoFilter !== "todos" && unidades.length > 0 && (
            <div className="space-y-1">
              <Label>Unidad (opcional)</Label>
              <Popover open={unitsOpen} onOpenChange={setUnitsOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between font-normal">
                    {selectedUnits.length > 0
                      ? `${selectedUnits.length} unidad${selectedUnits.length === 1 ? "" : "es"} seleccionada${selectedUnits.length === 1 ? "" : "s"}`
                      : "Todas"}
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar unidad..." />
                    <CommandList>
                      <CommandEmpty>No se encontro.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem value="__clear_units__" onSelect={() => setSelectedUnits([])}>
                          <Checkbox checked={selectedUnits.length === 0} className="mr-2" />
                          Todas
                        </CommandItem>
                        {unidades.map((unit) => (
                          <CommandItem key={unit} value={unit} onSelect={() => toggleUnit(unit)}>
                            <Checkbox checked={selectedUnits.includes(unit)} className="mr-2" />
                            {unit}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <Button onClick={exportJSON} disabled={loading} className="sm:min-w-44">
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
          Exportar
        </Button>
      </div>
    </Card>
  );
};

export default ExportSection;

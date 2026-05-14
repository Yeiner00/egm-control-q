import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarRange, Ship, Upload } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ImageUploader from "@/components/ImageUploader";
import ZarpeForm from "@/components/ZarpeForm";
import ZarpeTable from "@/components/ZarpeTable";
import DuplicateModal from "@/components/DuplicateModal";
import type { Tables } from "@/integrations/supabase/types";

type Zarpe = Tables<"zarpes_semana">;
type ZarpesSubtab = "subir" | "consulta";
type SubtabRequest<T extends string> = { value: T; nonce: number };

export interface ZarpeFormData {
  fecha_viaje: string;
  nombre_embarcacion: string;
  matricula: string;
  nombre_capitan: string;
  cedula_capitan: string;
  zarpe_folio: string;
  num_tripulantes: number | null;
  cantidad_menores: number | null;
  hora_ingreso: string;
  hora_salida: string;
  fecha_regreso: string;
  medio_comunicacion: string;
  destino: string;
  registrado_por: string;
}

const emptyForm: ZarpeFormData = {
  fecha_viaje: "",
  nombre_embarcacion: "",
  matricula: "",
  nombre_capitan: "",
  cedula_capitan: "",
  zarpe_folio: "",
  num_tripulantes: null,
  cantidad_menores: null,
  hora_ingreso: "",
  hora_salida: "",
  fecha_regreso: "",
  medio_comunicacion: "",
  destino: "",
  registrado_por: "",
};

interface ZarpesTabProps {
  subtabRequest?: SubtabRequest<ZarpesSubtab> | null;
}

const ZarpesTab = ({ subtabRequest }: ZarpesTabProps) => {
  const [activeTab, setActiveTab] = useState<ZarpesSubtab>("subir");
  const [formData, setFormData] = useState<ZarpeFormData>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [duplicateRecord, setDuplicateRecord] = useState<Zarpe | null>(null);

  useEffect(() => {
    if (!subtabRequest) return;
    setActiveTab(subtabRequest.value);
    if (subtabRequest.value === "subir") {
      setShowForm(false);
    }
  }, [subtabRequest]);

  const handleExtracted = useCallback((data: Partial<ZarpeFormData>) => {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    setFormData({
      ...emptyForm,
      ...data,
      hora_ingreso: currentTime,
    });
    setShowForm(true);
  }, []);

  const convertDateFormat = (dateStr: string): string | null => {
    if (!dateStr) return null;
    // DD/MM/YYYY → YYYY-MM-DD
    const match = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    return dateStr;
  };

  const saveZarpe = async (overwrite?: string) => {
    setSaving(true);

    const record = {
      matricula: formData.matricula || null,
      zarpe_folio: formData.zarpe_folio || null,
      cedula_capitan: formData.cedula_capitan || null,
      nombre_capitan: formData.nombre_capitan || null,
      destino: formData.destino || null,
      fecha_viaje: convertDateFormat(formData.fecha_viaje),
      nombre_embarcacion: formData.nombre_embarcacion || null,
      num_tripulantes: formData.num_tripulantes,
      hora_salida: formData.hora_salida || null,
      fecha_regreso: convertDateFormat(formData.fecha_regreso),
      hora_ingreso: formData.hora_ingreso || null,
      registrado_por: formData.registrado_por || null,
    };

    try {
      if (overwrite) {
        const { error } = await supabase
          .from("zarpes_semana")
          .update(record)
          .eq("id", overwrite);
        if (error) throw error;
        toast.success("Registro actualizado exitosamente");
      } else {
        // Check for duplicate folio
        if (formData.zarpe_folio) {
          const { data: existing } = await supabase
            .from("zarpes_semana")
            .select("*")
            .eq("zarpe_folio", formData.zarpe_folio)
            .maybeSingle();

          if (existing) {
            setDuplicateRecord(existing);
            setSaving(false);
            return;
          }
        }

        const { error } = await supabase.from("zarpes_semana").insert(record);
        if (error) throw error;
        toast.success("Zarpe registrado exitosamente");
      }

      setFormData(emptyForm);
      setShowForm(false);
      setRefreshKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al guardar";
      toast.error("Error", { description: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicateChoice = (choice: "overwrite" | "new") => {
    if (choice === "overwrite" && duplicateRecord) {
      setDuplicateRecord(null);
      saveZarpe(duplicateRecord.id);
    } else {
      setDuplicateRecord(null);
      // Insert without folio check
      const doInsert = async () => {
        setSaving(true);
        const record = {
          matricula: formData.matricula || null,
          zarpe_folio: formData.zarpe_folio || null,
          cedula_capitan: formData.cedula_capitan || null,
          nombre_capitan: formData.nombre_capitan || null,
          destino: formData.destino || null,
          fecha_viaje: convertDateFormat(formData.fecha_viaje),
          nombre_embarcacion: formData.nombre_embarcacion || null,
          num_tripulantes: formData.num_tripulantes,
          hora_salida: formData.hora_salida || null,
          fecha_regreso: convertDateFormat(formData.fecha_regreso),
          hora_ingreso: formData.hora_ingreso || null,
          registrado_por: formData.registrado_por || null,
        };
        const { error } = await supabase.from("zarpes_semana").insert(record);
        if (error) {
          toast.error("Error", { description: error.message });
        } else {
          toast.success("Nuevo registro creado exitosamente");
          setFormData(emptyForm);
          setShowForm(false);
          setRefreshKey((k) => k + 1);
        }
        setSaving(false);
      };
      doInsert();
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <Card className="mx-auto w-full overflow-hidden">
        <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
          <div className="flex items-start gap-3">
            <div className="section-icon-shell">
              <Ship className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <div className="section-eyebrow">Modulo de zarpes</div>
              <h3 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">
                Subir, consultar y exportar zarpes
              </h3>
              <p className="section-copy">
                Centralice la captura de documentos oficiales, revise registros guardados y descargue el Excel por rango.
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as ZarpesSubtab)} className="w-full">
        <TabsList>
          <TabsTrigger value="subir">
            <Upload className="h-4 w-4" />
            Subir
          </TabsTrigger>
          <TabsTrigger value="consulta">
            <CalendarRange className="h-4 w-4" />
            Consultar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="subir">
          {!showForm && <ImageUploader onExtracted={handleExtracted} />}

          {showForm && (
            <ZarpeForm
              formData={formData}
              onChange={setFormData}
              onSave={() => saveZarpe()}
              onCancel={() => {
                setFormData(emptyForm);
                setShowForm(false);
              }}
              saving={saving}
            />
          )}
        </TabsContent>

        <TabsContent value="consulta">
          <ZarpeTable refreshKey={refreshKey} />
        </TabsContent>
      </Tabs>

      <DuplicateModal
        open={!!duplicateRecord}
        onClose={() => setDuplicateRecord(null)}
        onChoice={handleDuplicateChoice}
        folio={formData.zarpe_folio}
      />
    </div>
  );
};

export default ZarpesTab;

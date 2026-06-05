import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, X } from "lucide-react";
import type { ZarpeFormData } from "@/components/ZarpesTab";

interface Props {
  formData: ZarpeFormData;
  onChange: (data: ZarpeFormData) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

const fields: { key: keyof ZarpeFormData; label: string; type?: string }[] = [
  { key: "fecha_viaje", label: "Fecha", type: "date" },
  { key: "nombre_embarcacion", label: "Embarcación" },
  { key: "matricula", label: "Matrícula" },
  { key: "nombre_capitan", label: "Nombre del Capitán" },
  { key: "cedula_capitan", label: "N° Cédula" },
  { key: "zarpe_folio", label: "N° Zarpe" },
  { key: "num_tripulantes", label: "Cantidad Adultos", type: "number" },
  { key: "cantidad_menores", label: "Cantidad Menores", type: "number" },
  { key: "hora_ingreso", label: "Hora de Ingreso", type: "time" },
  { key: "hora_salida", label: "Hora de Salida", type: "time" },
  { key: "fecha_regreso", label: "Fecha Estimada de Regreso", type: "date" },
  { key: "medio_comunicacion", label: "Medio Comunicación" },
  { key: "destino", label: "Destino" },
  { key: "registrado_por", label: "Registrado Por" },
];

const ZarpeForm = ({ formData, onChange, onSave, onCancel, saving }: Props) => {
  const update = (key: keyof ZarpeFormData, value: string | number | null) => {
    onChange({ ...formData, [key]: value });
  };

  // Convert DD/MM/YYYY to YYYY-MM-DD for date inputs
  const toInputDate = (val: string): string => {
    if (!val) return "";
    const match = val.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    return val;
  };

  return (
    <Card className="mx-auto max-w-4xl animate-fade-in overflow-hidden">
      <div className="border-b border-border/70 bg-navy px-5 py-5 text-white sm:px-6 lg:px-4 lg:py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="text-[0.68rem] font-bold uppercase tracking-[0.22em] text-white/65">Registro de Zarpe</div>
            <h2 className="text-lg font-semibold lg:text-[1.02rem]">Confirmar datos extraídos</h2>
          </div>
          <Button variant="ghost" size="icon" className="border border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={onCancel}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
        className="space-y-5 p-5 sm:p-6 lg:space-y-4 lg:p-4"
      >
        <div className="panel-subtle p-4">
          <p className="section-copy">
            Revise los campos antes de guardar. Puede corregir cualquier dato sin afectar el flujo del registro.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map(({ key, label, type }) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                name={key}
                type={type || "text"}
                inputMode={type === "number" ? "numeric" : undefined}
                autoComplete="off"
                value={
                  type === "date"
                    ? toInputDate(String(formData[key] ?? ""))
                    : String(formData[key] ?? "")
                }
                onChange={(e) => {
                  if (type === "number") {
                    const v = e.target.value === "" ? null : Number(e.target.value);
                    update(key, v);
                  } else {
                    update(key, e.target.value);
                  }
                }}
                required
                aria-errormessage={`${key}-error`}
              />
              <p id={`${key}-error`} className="form-error-message">
                <span aria-hidden="true">!</span>
                Este campo es obligatorio.
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row">
          <Button type="submit" disabled={saving} className="flex-1 sm:flex-none sm:min-w-48">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Guardar Zarpe
          </Button>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving} className="sm:min-w-36">
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
};

export default ZarpeForm;

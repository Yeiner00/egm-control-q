import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Upload, Camera, Loader2, ImageIcon } from "lucide-react";
import { createAiServiceError, runAiTask } from "@/lib/aiRateLimit";
import type { ZarpeFormData } from "@/components/ZarpesTab";

interface Props {
  onExtracted: (data: Partial<ZarpeFormData>) => void;
  showIntroHeader?: boolean;
}

const ImageUploader = ({ onExtracted, showIntroHeader = true }: Props) => {
  const [extracting, setExtracting] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [aiMessage, setAiMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Solo se permiten imágenes JPG/PNG");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("La imagen no debe superar 10MB");
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setPreview(previewUrl);

    setExtracting(true);
    setAiMessage("");
    try {
      const formData = new FormData();
      formData.append("image", file);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sesión expirada. Inicia sesión nuevamente.");
        return;
      }

      const result = await runAiTask(
        async () => {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-zarpe`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${session.access_token}`,
              },
              body: formData,
            },
          );

          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw createAiServiceError(payload || { error: `Error ${response.status}` }, response.status);
          }

          return payload;
        },
        {
          label: "Extraer zarpe",
          onStatus: (status) => setAiMessage(status.message),
        },
      );

      if (result.data) {
        onExtracted(result.data);
        toast.success("Datos extraídos correctamente");
      } else {
        throw new Error("No se pudieron extraer datos");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al extraer datos";
      toast.error("Error de extracción", { description: msg });
    } finally {
      setExtracting(false);
      setAiMessage("");
      setPreview(null);
      URL.revokeObjectURL(previewUrl);
    }
  };

  return (
    <Card className="w-full overflow-hidden">
      {showIntroHeader && (
      <div className="border-b border-border/70 bg-card px-5 py-5 sm:px-6 lg:px-4 lg:py-4">
        <div className="flex items-start gap-3">
          <div className="section-icon-shell">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="section-eyebrow">Captura y extracción</div>
            <h2 className="text-lg font-semibold text-foreground lg:text-[1.02rem]">Cargar documento de zarpe</h2>
            <p className="section-copy">
              Cargue una imagen del documento oficial. El sistema extrae los datos y abre el formulario para revisión.
            </p>
          </div>
        </div>
      </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      <div className="space-y-4 p-5 sm:p-6 lg:p-4">
        {extracting && preview ? (
          <div className="relative overflow-hidden rounded-[calc(var(--radius)+0.1rem)] border border-border/80">
            <img src={preview} alt="Procesando" className="max-h-64 w-full object-cover opacity-45" />
            <div className="absolute inset-0 flex items-center justify-center bg-navy/15 backdrop-blur-[2px]">
              <div className="operational-loader bg-card/96">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span>{aiMessage || "Extrayendo datos del documento..."}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="panel-subtle flex flex-col gap-3 p-4 sm:flex-row">
            <Button
              variant="default"
              className="flex-1 sm:flex-none sm:min-w-48"
              onClick={() => fileRef.current?.click()}
              disabled={extracting}
            >
              <Upload className="h-4 w-4 mr-2" />
              Subir imagen
            </Button>
            <Button
              variant="outline"
              className="flex-1 sm:hidden"
              onClick={() => {
                if (fileRef.current) {
                  fileRef.current.setAttribute("capture", "environment");
                  fileRef.current.click();
                  fileRef.current.removeAttribute("capture");
                }
              }}
              disabled={extracting}
            >
              <Camera className="h-4 w-4 mr-2" />
              Usar cámara
            </Button>
          </div>
        )}

        <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Formatos permitidos: JPG y PNG, máximo 10 MB.
        </p>
      </div>
    </Card>
  );
};

export default ImageUploader;

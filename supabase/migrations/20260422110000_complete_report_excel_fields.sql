-- Datos adicionales necesarios para regenerar reportes Excel completos.

ALTER TABLE public.reportes_vehiculo
  ADD COLUMN IF NOT EXISTS bitacora text,
  ADD COLUMN IF NOT EXISTS estacion_combustible text,
  ADD COLUMN IF NOT EXISTS lugar_combustible text,
  ADD COLUMN IF NOT EXISTS cedula_juridica_combustible text,
  ADD COLUMN IF NOT EXISTS no_factura text,
  ADD COLUMN IF NOT EXISTS combustible_trasegado_bomba numeric,
  ADD COLUMN IF NOT EXISTS total_combustible_antes_viaje numeric,
  ADD COLUMN IF NOT EXISTS saldo_combustible_despues_viaje numeric;

ALTER TABLE public.reportes_embarcacion
  ADD COLUMN IF NOT EXISTS bitacora text,
  ADD COLUMN IF NOT EXISTS folios text,
  ADD COLUMN IF NOT EXISTS estacion_combustible text,
  ADD COLUMN IF NOT EXISTS lugar_combustible text,
  ADD COLUMN IF NOT EXISTS cedula_juridica_combustible text,
  ADD COLUMN IF NOT EXISTS no_factura text;

ALTER TABLE public.reporte_personas
  ADD COLUMN IF NOT EXISTS cedula text;

ALTER TABLE public.reporte_sitios
  ADD COLUMN IF NOT EXISTS posicion text;

CREATE TABLE IF NOT EXISTS public.reporte_embarcaciones_inspeccionadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL REFERENCES public.reportes_embarcacion(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  matricula text,
  no_inspeccion text,
  zona text,
  posicion text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reporte_embarcaciones_inspeccionadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select" ON public.reporte_embarcaciones_inspeccionadas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert" ON public.reporte_embarcaciones_inspeccionadas
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update" ON public.reporte_embarcaciones_inspeccionadas
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "auth_delete" ON public.reporte_embarcaciones_inspeccionadas
  FOR DELETE TO authenticated USING (true);

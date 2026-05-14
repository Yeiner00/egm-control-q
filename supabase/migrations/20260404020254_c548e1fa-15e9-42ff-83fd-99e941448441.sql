
-- Reportes de vehículos
CREATE TABLE public.reportes_vehiculo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  no_reporte text NOT NULL,
  anio integer NOT NULL,
  fecha date,
  hora_salida time,
  hora_regreso time,
  total_horas numeric,
  estacion text,
  vehiculo text,
  destino text,
  combustible_gastado numeric,
  kilometros_recorridos numeric,
  novedades text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(no_reporte, anio)
);

-- Reportes de embarcación
CREATE TABLE public.reportes_embarcacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  no_reporte text NOT NULL,
  anio integer NOT NULL,
  fecha date,
  estacion text,
  embarcacion text,
  no_cierre_os text,
  hora_salida time,
  hora_regreso time,
  horas_navegadas numeric,
  horas_motor_babor numeric,
  horas_motor_centro numeric,
  horas_motor_estribor numeric,
  horas_hombre numeric,
  destino text,
  saldo_anterior numeric,
  combustible_trasegado_bodega numeric,
  total_antes_viaje numeric,
  combustible_trasegado_durante numeric,
  combustible_gastado numeric,
  saldo_despues numeric,
  tipo_combustible text,
  millas_nauticas numeric,
  novedades text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(no_reporte, anio)
);

-- Personas de reporte (chofer, acompañante, oficial, capitán, tripulante, etc.)
CREATE TABLE public.personas_reporte (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL,
  tipo_reporte text NOT NULL CHECK (tipo_reporte IN ('vehiculo', 'embarcacion')),
  nombre text NOT NULL,
  rol text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Motivos de reporte
CREATE TABLE public.reporte_motivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL,
  tipo_reporte text NOT NULL CHECK (tipo_reporte IN ('vehiculo', 'embarcacion')),
  motivo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Sitios visitados (solo vehículos)
CREATE TABLE public.reporte_sitios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporte_id uuid NOT NULL,
  nombre_sitio text NOT NULL,
  zona text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.reportes_vehiculo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes_embarcacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personas_reporte ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporte_motivos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporte_sitios ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated users
CREATE POLICY "auth_select" ON public.reportes_vehiculo FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON public.reportes_vehiculo FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON public.reportes_vehiculo FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON public.reportes_vehiculo FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_select" ON public.reportes_embarcacion FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON public.reportes_embarcacion FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update" ON public.reportes_embarcacion FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth_delete" ON public.reportes_embarcacion FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_select" ON public.personas_reporte FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON public.personas_reporte FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_delete" ON public.personas_reporte FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_select" ON public.reporte_motivos FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON public.reporte_motivos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_delete" ON public.reporte_motivos FOR DELETE TO authenticated USING (true);

CREATE POLICY "auth_select" ON public.reporte_sitios FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert" ON public.reporte_sitios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_delete" ON public.reporte_sitios FOR DELETE TO authenticated USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_reportes_vehiculo_updated_at BEFORE UPDATE ON public.reportes_vehiculo FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_reportes_embarcacion_updated_at BEFORE UPDATE ON public.reportes_embarcacion FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

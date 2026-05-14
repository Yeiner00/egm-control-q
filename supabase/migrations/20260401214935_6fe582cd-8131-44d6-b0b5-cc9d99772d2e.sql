
CREATE TABLE public.zarpes_semana (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  matricula TEXT,
  zarpe_folio TEXT,
  cedula_capitan TEXT,
  nombre_capitan TEXT,
  destino TEXT,
  fecha_viaje DATE,
  nombre_embarcacion TEXT,
  num_tripulantes INTEGER,
  hora_salida TIME,
  fecha_regreso DATE,
  hora_ingreso TIME,
  registrado_por TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.zarpes_semana ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view zarpes"
  ON public.zarpes_semana FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert zarpes"
  ON public.zarpes_semana FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update zarpes"
  ON public.zarpes_semana FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete zarpes"
  ON public.zarpes_semana FOR DELETE
  TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_zarpes_semana_updated_at
  BEFORE UPDATE ON public.zarpes_semana
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

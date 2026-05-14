ALTER FUNCTION public.normalize_report_number(text) SET search_path = public;
ALTER FUNCTION public.normalize_report_unit(text) SET search_path = public;
ALTER FUNCTION public.normalize_motivo_key(text) SET search_path = public;
ALTER FUNCTION public.canonical_motives(text) SET search_path = public;

CREATE INDEX IF NOT EXISTS reporte_embarcaciones_inspeccionadas_reporte_id_idx
  ON public.reporte_embarcaciones_inspeccionadas (reporte_id);

CREATE INDEX IF NOT EXISTS reportes_embarcacion_user_id_idx
  ON public.reportes_embarcacion (user_id);

CREATE INDEX IF NOT EXISTS reportes_vehiculo_user_id_idx
  ON public.reportes_vehiculo (user_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'rls_auto_enable'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated';
  END IF;
END $$;

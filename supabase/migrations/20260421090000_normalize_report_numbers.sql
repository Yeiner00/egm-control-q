-- Normaliza numeros de reporte y cambia la unicidad a numero + anio + unidad.
-- Esta migracion se detiene si encuentra conflictos reales bajo la regla nueva.

CREATE OR REPLACE FUNCTION public.normalize_report_number(raw_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(
    lpad(NULLIF(substring(COALESCE(raw_value, '') FROM '\d+'), ''), 4, '0'),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.normalize_report_unit(raw_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT upper(regexp_replace(btrim(COALESCE(raw_value, '')), '\s+', ' ', 'g'));
$$;

DO $$
DECLARE
  invalid_vehicle_count integer;
  invalid_boat_count integer;
  vehicle_conflict_count integer;
  boat_conflict_count integer;
BEGIN
  SELECT count(*)
    INTO invalid_vehicle_count
  FROM public.reportes_vehiculo
  WHERE public.normalize_report_number(no_reporte) = '';

  SELECT count(*)
    INTO invalid_boat_count
  FROM public.reportes_embarcacion
  WHERE public.normalize_report_number(no_reporte) = '';

  IF invalid_vehicle_count > 0 OR invalid_boat_count > 0 THEN
    RAISE EXCEPTION
      'No se puede normalizar: hay reportes sin digitos. Vehiculos: %, Embarcaciones: %. Revise con el script de diagnostico.',
      invalid_vehicle_count,
      invalid_boat_count;
  END IF;

  SELECT count(*)
    INTO vehicle_conflict_count
  FROM (
    SELECT
      public.normalize_report_number(no_reporte) AS no_reporte_normalizado,
      anio,
      public.normalize_report_unit(vehiculo) AS unidad_normalizada
    FROM public.reportes_vehiculo
    GROUP BY 1, 2, 3
    HAVING count(*) > 1
  ) conflicts;

  SELECT count(*)
    INTO boat_conflict_count
  FROM (
    SELECT
      public.normalize_report_number(no_reporte) AS no_reporte_normalizado,
      anio,
      public.normalize_report_unit(embarcacion) AS unidad_normalizada
    FROM public.reportes_embarcacion
    GROUP BY 1, 2, 3
    HAVING count(*) > 1
  ) conflicts;

  IF vehicle_conflict_count > 0 OR boat_conflict_count > 0 THEN
    RAISE EXCEPTION
      'No se aplico la normalizacion: hay conflictos bajo la regla numero+anio+unidad. Vehiculos: %, Embarcaciones: %. Resuelva manualmente y vuelva a ejecutar.',
      vehicle_conflict_count,
      boat_conflict_count;
  END IF;
END $$;

ALTER TABLE public.reportes_vehiculo
  DROP CONSTRAINT IF EXISTS reportes_vehiculo_no_reporte_anio_key;

ALTER TABLE public.reportes_embarcacion
  DROP CONSTRAINT IF EXISTS reportes_embarcacion_no_reporte_anio_key;

UPDATE public.reportes_vehiculo
SET no_reporte = public.normalize_report_number(no_reporte)
WHERE no_reporte IS DISTINCT FROM public.normalize_report_number(no_reporte);

UPDATE public.reportes_embarcacion
SET no_reporte = public.normalize_report_number(no_reporte)
WHERE no_reporte IS DISTINCT FROM public.normalize_report_number(no_reporte);

ALTER TABLE public.reportes_vehiculo
  DROP CONSTRAINT IF EXISTS reportes_vehiculo_no_reporte_digits_check;

ALTER TABLE public.reportes_embarcacion
  DROP CONSTRAINT IF EXISTS reportes_embarcacion_no_reporte_digits_check;

ALTER TABLE public.reportes_vehiculo
  ADD CONSTRAINT reportes_vehiculo_no_reporte_digits_check
  CHECK (no_reporte ~ '^\d{4,}$');

ALTER TABLE public.reportes_embarcacion
  ADD CONSTRAINT reportes_embarcacion_no_reporte_digits_check
  CHECK (no_reporte ~ '^\d{4,}$');

DROP INDEX IF EXISTS public.reportes_vehiculo_no_reporte_anio_vehiculo_uidx;
DROP INDEX IF EXISTS public.reportes_embarcacion_no_reporte_anio_embarcacion_uidx;

CREATE UNIQUE INDEX reportes_vehiculo_no_reporte_anio_vehiculo_uidx
ON public.reportes_vehiculo (
  no_reporte,
  anio,
  public.normalize_report_unit(vehiculo)
);

CREATE UNIQUE INDEX reportes_embarcacion_no_reporte_anio_embarcacion_uidx
ON public.reportes_embarcacion (
  no_reporte,
  anio,
  public.normalize_report_unit(embarcacion)
);


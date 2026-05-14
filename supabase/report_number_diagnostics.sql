-- Ejecutar antes de la migracion para revisar como quedaran los numeros
-- y cuales conflictos deben resolverse manualmente.

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

-- Vista previa de cambios en vehiculos.
SELECT
  id,
  no_reporte AS no_reporte_actual,
  public.normalize_report_number(no_reporte) AS no_reporte_normalizado,
  anio,
  fecha,
  vehiculo,
  public.normalize_report_unit(vehiculo) AS vehiculo_normalizado
FROM public.reportes_vehiculo
WHERE no_reporte IS DISTINCT FROM public.normalize_report_number(no_reporte)
ORDER BY anio, vehiculo, no_reporte;

-- Vista previa de cambios en embarcaciones.
SELECT
  id,
  no_reporte AS no_reporte_actual,
  public.normalize_report_number(no_reporte) AS no_reporte_normalizado,
  anio,
  fecha,
  embarcacion,
  public.normalize_report_unit(embarcacion) AS embarcacion_normalizada
FROM public.reportes_embarcacion
WHERE no_reporte IS DISTINCT FROM public.normalize_report_number(no_reporte)
ORDER BY anio, embarcacion, no_reporte;

-- Conflictos de vehiculos que impiden crear la nueva regla unica.
WITH normalized AS (
  SELECT
    id,
    no_reporte AS no_reporte_actual,
    public.normalize_report_number(no_reporte) AS no_reporte_normalizado,
    anio,
    fecha,
    vehiculo,
    public.normalize_report_unit(vehiculo) AS unidad_normalizada,
    destino
  FROM public.reportes_vehiculo
)
SELECT
  no_reporte_normalizado,
  anio,
  unidad_normalizada,
  count(*) AS cantidad,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'no_reporte_actual', no_reporte_actual,
      'fecha', fecha,
      'vehiculo', vehiculo,
      'destino', destino
    )
    ORDER BY fecha, no_reporte_actual
  ) AS registros
FROM normalized
GROUP BY no_reporte_normalizado, anio, unidad_normalizada
HAVING count(*) > 1
ORDER BY anio, unidad_normalizada, no_reporte_normalizado;

-- Conflictos de embarcaciones que impiden crear la nueva regla unica.
WITH normalized AS (
  SELECT
    id,
    no_reporte AS no_reporte_actual,
    public.normalize_report_number(no_reporte) AS no_reporte_normalizado,
    anio,
    fecha,
    embarcacion,
    public.normalize_report_unit(embarcacion) AS unidad_normalizada,
    destino
  FROM public.reportes_embarcacion
)
SELECT
  no_reporte_normalizado,
  anio,
  unidad_normalizada,
  count(*) AS cantidad,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'no_reporte_actual', no_reporte_actual,
      'fecha', fecha,
      'embarcacion', embarcacion,
      'destino', destino
    )
    ORDER BY fecha, no_reporte_actual
  ) AS registros
FROM normalized
GROUP BY no_reporte_normalizado, anio, unidad_normalizada
HAVING count(*) > 1
ORDER BY anio, unidad_normalizada, no_reporte_normalizado;


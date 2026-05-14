-- Diagnostico de motivos antes/despues de normalizar.
-- No modifica datos.

SELECT
  count(*) AS total_filas,
  count(DISTINCT motivo) AS motivos_exactos,
  count(DISTINCT public.normalize_motivo_key(motivo)) AS motivos_por_clave_normalizada
FROM public.reporte_motivos;

SELECT
  motivo,
  count(*) AS cantidad
FROM public.reporte_motivos
GROUP BY motivo
ORDER BY cantidad DESC, motivo;

WITH canonical AS (
  SELECT
    id,
    reporte_id,
    tipo_reporte,
    motivo_original,
    motivo,
    public.canonical_motives(coalesce(motivo_original, motivo)) AS motivos_detectados
  FROM public.reporte_motivos
)
SELECT
  motivo_original,
  motivo,
  count(*) AS cantidad
FROM canonical
WHERE array_length(motivos_detectados, 1) IS NULL
   OR motivos_detectados = ARRAY[trim(coalesce(motivo_original, motivo))]
GROUP BY motivo_original, motivo
ORDER BY cantidad DESC, motivo_original;

SELECT
  reporte_id,
  tipo_reporte,
  motivo_key,
  count(*) AS cantidad,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'motivo', motivo,
      'motivo_original', motivo_original
    )
    ORDER BY created_at
  ) AS registros
FROM public.reporte_motivos
WHERE motivo_key IS NOT NULL
GROUP BY reporte_id, tipo_reporte, motivo_key
HAVING count(*) > 1
ORDER BY cantidad DESC, tipo_reporte, reporte_id, motivo_key;

-- Ejecutar solo cuando la consulta anterior no devuelva filas.
-- CREATE UNIQUE INDEX IF NOT EXISTS reporte_motivos_unique_report_motivo_key
--   ON public.reporte_motivos (reporte_id, tipo_reporte, motivo_key)
--   WHERE motivo_key IS NOT NULL;

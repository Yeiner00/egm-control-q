ALTER TABLE public.reporte_motivos
  ADD COLUMN IF NOT EXISTS motivo_original text,
  ADD COLUMN IF NOT EXISTS motivo_key text;

CREATE OR REPLACE FUNCTION public.normalize_motivo_key(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(
    regexp_replace(
      translate(
        lower(coalesce(raw, '')),
        'áàäâãéèëêíìïîóòöôõúùüûñç',
        'aaaaaeeeeiiiiooooouuuunc'
      ),
      '[^a-z0-9]+',
      ' ',
      'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.canonical_motives(raw text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k text := public.normalize_motivo_key(raw);
  result text[] := ARRAY[]::text[];
BEGIN
  IF k = '' THEN
    RETURN result;
  END IF;

  IF k LIKE '%migratori%' OR k LIKE '%migracion%' THEN
    result := array_append(result, 'Control migratorio');
  END IF;

  IF k LIKE '%narcotrafico%' OR k LIKE '%narco trafico%' THEN
    result := array_append(result, 'Control de narcotráfico');
  END IF;

  IF k LIKE '%pesca ilegal%' OR k LIKE '%control de pesca%' THEN
    result := array_append(result, 'Pesca ilegal');
  END IF;

  IF k LIKE '%seguridad ciudadana%' OR k LIKE '%seguridad cuidadana%' OR k LIKE '%patrullaje seguridad%' THEN
    result := array_append(result, 'Seguridad ciudadana');
  END IF;

  IF k LIKE '%proteccion a banistas%' OR k LIKE '%proteccion de banistas%' OR k LIKE '%seguridad de banistas%' OR k LIKE '%banistas%' THEN
    result := array_append(result, 'Protección a bañistas');
  END IF;

  IF k LIKE '%contrabando%' THEN
    result := array_append(result, 'Control de contrabando');
  END IF;

  IF k LIKE '%reafirmacion%' OR k LIKE '%soberania%' OR k LIKE '%sobernia%' THEN
    result := array_append(result, 'Reafirmación de soberanía');
  END IF;

  IF k LIKE '%pirateria%' THEN
    result := array_append(result, 'Piratería');
  END IF;

  IF k LIKE '%caceria%' OR k LIKE '%cazeria%' THEN
    result := array_append(result, 'Cacería ilegal');
  END IF;

  IF k LIKE '%seguridad ambiental%' THEN
    result := array_append(result, 'Seguridad ambiental');
  END IF;

  IF k LIKE '%verano seguro%' OR k LIKE '%orden de operaciones verano%' THEN
    result := array_append(result, 'Operativo Verano Seguro');
  END IF;

  IF k LIKE '%semana santa%' THEN
    result := array_append(result, 'Operativo Semana Santa');
  END IF;

  IF k LIKE '%proteccion de bosques%' OR k LIKE '%bosques%' THEN
    result := array_append(result, 'Protección de bosques');
  END IF;

  IF k LIKE '%alteracion de humedales%' OR k LIKE '%humedales%' THEN
    result := array_append(result, 'Alteración de humedales');
  END IF;

  IF (k LIKE '%inspeccion%' AND k LIKE '%embarcacion%') OR k LIKE '%grupo nacional de buzos%' OR k LIKE '%buzos%' THEN
    result := array_append(result, 'Inspección de embarcación');
  END IF;

  IF k LIKE '%traslado%' OR k LIKE '%extintores%' OR k LIKE '%incendio%' OR k LIKE '%trabajo conjunto%' OR k LIKE '%policia fronteras%' THEN
    result := array_append(result, 'Apoyo operativo');
  END IF;

  IF array_length(result, 1) IS NULL THEN
    result := array_append(result, trim(coalesce(raw, '')));
  END IF;

  RETURN result;
END;
$$;

UPDATE public.reporte_motivos
SET motivo_original = motivo
WHERE motivo_original IS NULL;

WITH expanded AS (
  SELECT
    id,
    reporte_id,
    tipo_reporte,
    motivo_original,
    canonical,
    row_number() OVER (PARTITION BY id ORDER BY canonical) AS rn
  FROM public.reporte_motivos
  CROSS JOIN LATERAL unnest(public.canonical_motives(motivo_original)) AS canonical
),
first_canonical AS (
  SELECT id, canonical
  FROM expanded
  WHERE rn = 1
)
UPDATE public.reporte_motivos m
SET
  motivo = f.canonical,
  motivo_key = public.normalize_motivo_key(f.canonical)
FROM first_canonical f
WHERE m.id = f.id;

WITH expanded AS (
  SELECT
    id,
    reporte_id,
    tipo_reporte,
    motivo_original,
    canonical,
    row_number() OVER (PARTITION BY id ORDER BY canonical) AS rn
  FROM public.reporte_motivos
  CROSS JOIN LATERAL unnest(public.canonical_motives(motivo_original)) AS canonical
),
additional AS (
  SELECT reporte_id, tipo_reporte, motivo_original, canonical
  FROM expanded
  WHERE rn > 1
),
missing AS (
  SELECT DISTINCT
    a.reporte_id,
    a.tipo_reporte,
    a.canonical AS motivo,
    public.normalize_motivo_key(a.canonical) AS motivo_key,
    a.motivo_original
  FROM additional a
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.reporte_motivos existing
    WHERE existing.reporte_id = a.reporte_id
      AND existing.tipo_reporte = a.tipo_reporte
      AND public.normalize_motivo_key(existing.motivo) = public.normalize_motivo_key(a.canonical)
  )
)
INSERT INTO public.reporte_motivos (reporte_id, tipo_reporte, motivo, motivo_key, motivo_original)
SELECT reporte_id, tipo_reporte, motivo, motivo_key, motivo_original
FROM missing;

CREATE INDEX IF NOT EXISTS reporte_motivos_motivo_key_idx
  ON public.reporte_motivos (motivo_key);

CREATE INDEX IF NOT EXISTS reporte_motivos_report_motivo_key_idx
  ON public.reporte_motivos (reporte_id, tipo_reporte, motivo_key);

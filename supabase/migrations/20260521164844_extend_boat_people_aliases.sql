-- Refuerza la normalizacion de nombres usados en propuestas, especialmente
-- variantes historicas provenientes de reportes de embarcacion.

CREATE OR REPLACE FUNCTION public.normalize_report_person_display(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  rank_token constant text :=
    '(s\s*\.?\s*/?\s*int(endente)?|sint|sub\s*[-.]?\s*int(endente)?|subintendente|sub\s+oficial|suboficial|ag(ente|t|te)?|insp?|inspector|comandante|cmdt|cmdte|cmte|intendente|comisario|director|oficial|capitan|cap)';
  clean text;
  next_clean text;
  i integer;
BEGIN
  clean := translate(
    coalesce(raw, ''),
    U&'\00E1\00E0\00E4\00E2\00E3\00C1\00C0\00C4\00C2\00C3\00E9\00E8\00EB\00EA\00C9\00C8\00CB\00CA\00ED\00EC\00EF\00EE\00CD\00CC\00CF\00CE\00F3\00F2\00F6\00F4\00F5\00D3\00D2\00D6\00D4\00D5\00FA\00F9\00FC\00FB\00DA\00D9\00DC\00DB\00F1\00D1\00E7\00C7',
    'aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuunncc'
  );
  clean := regexp_replace(clean, '\([^)]*\)', ' ', 'g');
  clean := regexp_replace(clean, '\s+', ' ', 'g');
  clean := btrim(clean, ' .,;:-');

  FOR i IN 1..5 LOOP
    next_clean := regexp_replace(clean, '^' || rank_token || '\.?\s+', '', 'i');
    next_clean := btrim(regexp_replace(next_clean, '\s+', ' ', 'g'), ' .,;:-');
    EXIT WHEN next_clean = clean;
    clean := next_clean;
  END LOOP;

  IF public.normalize_report_person_key(clean) = '' THEN
    RETURN '';
  END IF;

  RETURN initcap(lower(clean));
END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_report_person_name(raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  clean text := public.normalize_report_person_display(raw);
  key text := public.normalize_report_person_key(clean);
BEGIN
  RETURN CASE
    WHEN key IN ('josue acevedo rios') THEN 'Josue Acevedo Rios'
    WHEN key IN ('olman alfaro quiros') THEN 'Olman Alfaro Quiros'
    WHEN key IN ('sergio alpizar carrillo') THEN 'Sergio Alpizar Carrillo'
    WHEN key IN ('cesar alvarez martinez', 'cesar alvares martinez', 'cesar alvarez martines', 'cesar alvares martines') THEN 'Cesar Alvarez Martinez'
    WHEN key IN ('jhonny araya chacon') THEN 'Jhonny Araya Chacon'
    WHEN key IN ('pablo barrantes palma') THEN 'Pablo Barrantes Palma'
    WHEN key IN ('minor cambronero campos') THEN 'Minor Cambronero Campos'
    WHEN key IN ('yeiner castro alvarez', 'yeiner castro alvares', 'yeiner castro anlvares', 'yeiner cstro alvares', 'yeiner cstro anlvares') THEN 'Yeiner Castro Alvarez'
    WHEN key IN ('dara chavarria hernandez') THEN 'Dara Chavarria Hernandez'
    WHEN key IN ('jorge gonzalez barrantes', 'jorge gonzales barrantes', 'jprge gonzalez barrantes', 'jprge gonzales barrantes') THEN 'Jorge Gonzalez Barrantes'
    WHEN key IN ('luis carlos gonzalez jarquin', 'luis carlos gonzales jarquin', 'luis gonzalez jarquin', 'luis gonzales jarquin', 'luis c jarquin gonzalez', 'luis c jarquin gonzales') THEN 'Luis Carlos Gonzalez Jarquin'
    WHEN key IN ('landy gonzalez vargas', 'landy gonzales vargas') THEN 'Landy Gonzalez Vargas'
    WHEN key IN ('randall mena villavicencio', 'randall mena villavicencion') THEN 'Randall Mena Villavicencio'
    WHEN key IN ('joel mora estrada') THEN 'Joel Mora Estrada'
    WHEN key IN ('alfonso noguera corrales') THEN 'Alfonso Noguera Corrales'
    WHEN key IN ('bryan obando munoz', 'brayan obando munoz', 'brayan obando quiros', 'bryan obando quiros') THEN 'Bryan Obando Munoz'
    WHEN key IN ('wilber pena pena') THEN 'Wilber Pena Pena'
    WHEN key IN ('michael rojas brenes', 'micchael rojas brenes') THEN 'Michael Rojas Brenes'
    WHEN key IN ('roberth sanchez parra') THEN 'Roberth Sanchez Parra'
    WHEN key IN ('obed vasquez chaves', 'obed vasques chaves', 'obed vasquez chavez', 'obed vasques chavez', 'obed vazquez chaves', 'obed vazquez chavez') THEN 'Obed Vasquez Chaves'
    WHEN key IN ('griselda ugarte ruiz', 'griseldad ugarte ruiz') THEN 'Griselda Ugarte Ruiz'
    ELSE clean
  END;
END;
$$;

CREATE OR REPLACE FUNCTION public.split_report_person_names(raw text)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  rank_token constant text :=
    '(s\s*\.?\s*/?\s*int(endente)?|sint|sub\s*[-.]?\s*int(endente)?|subintendente|sub\s+oficial|suboficial|ag(ente|t|te)?|insp?|inspector|comandante|cmdt|cmdte|cmte|intendente|comisario|director|oficial|capitan|cap)';
  clean text;
  part text;
  person_name text;
  person_key text;
  names text[] := ARRAY[]::text[];
  keys text[] := ARRAY[]::text[];
BEGIN
  clean := translate(
    coalesce(raw, ''),
    U&'\00E1\00E0\00E4\00E2\00E3\00C1\00C0\00C4\00C2\00C3\00E9\00E8\00EB\00EA\00C9\00C8\00CB\00CA\00ED\00EC\00EF\00EE\00CD\00CC\00CF\00CE\00F3\00F2\00F6\00F4\00F5\00D3\00D2\00D6\00D4\00D5\00FA\00F9\00FC\00FB\00DA\00D9\00DC\00DB\00F1\00D1\00E7\00C7',
    'aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuunncc'
  );
  clean := regexp_replace(clean, '\s+(y|e)\s+', ';', 'gi');
  clean := regexp_replace(clean, '\s+(' || rank_token || ')\.?\s+', ';\1 ', 'gi');

  FOREACH part IN ARRAY regexp_split_to_array(clean, '[,;\n]+') LOOP
    person_name := public.canonical_report_person_name(part);
    person_key := public.normalize_report_person_key(person_name);
    IF person_key <> '' AND NOT person_key = ANY(keys) THEN
      names := array_append(names, person_name);
      keys := array_append(keys, person_key);
    END IF;
  END LOOP;

  RETURN names;
END;
$$;

CREATE TEMP TABLE report_people_boat_alias_expanded ON COMMIT DROP AS
SELECT
  p.id AS old_id,
  p.reporte_id,
  p.tipo_reporte,
  n.nombre,
  public.normalize_report_person_key(n.nombre) AS nombre_normalizado,
  CASE WHEN array_length(s.names, 1) = 1 THEN nullif(btrim(coalesce(p.cedula, '')), '') ELSE NULL END AS cedula,
  p.created_at
FROM public.reporte_personas p
CROSS JOIN LATERAL (
  SELECT public.split_report_person_names(p.nombre) AS names
) s
CROSS JOIN LATERAL unnest(s.names) WITH ORDINALITY AS n(nombre, ord)
WHERE public.normalize_report_person_key(n.nombre) <> '';

CREATE TEMP TABLE report_people_boat_alias_people ON COMMIT DROP AS
SELECT
  gen_random_uuid() AS id,
  reporte_id,
  tipo_reporte,
  min(nombre) AS nombre,
  nombre_normalizado,
  (array_remove(array_agg(cedula ORDER BY created_at) FILTER (WHERE cedula IS NOT NULL), NULL))[1] AS cedula,
  min(created_at) AS created_at
FROM report_people_boat_alias_expanded
GROUP BY reporte_id, tipo_reporte, nombre_normalizado;

CREATE TEMP TABLE report_people_boat_alias_roles ON COMMIT DROP AS
SELECT
  cp.id AS reporte_persona_id,
  btrim(r.rol) AS rol,
  min(r.created_at) AS created_at
FROM report_people_boat_alias_expanded e
JOIN public.reporte_persona_roles r
  ON r.reporte_persona_id = e.old_id
JOIN report_people_boat_alias_people cp
  ON cp.reporte_id = e.reporte_id
 AND cp.tipo_reporte = e.tipo_reporte
 AND cp.nombre_normalizado = e.nombre_normalizado
WHERE btrim(coalesce(r.rol, '')) <> ''
GROUP BY cp.id, btrim(r.rol);

DELETE FROM public.reporte_persona_roles
WHERE reporte_persona_id IN (SELECT id FROM public.reporte_personas);

DELETE FROM public.reporte_personas;

INSERT INTO public.reporte_personas (
  id,
  reporte_id,
  tipo_reporte,
  nombre,
  nombre_normalizado,
  cedula,
  created_at
)
SELECT id, reporte_id, tipo_reporte, nombre, nombre_normalizado, cedula, created_at
FROM report_people_boat_alias_people;

INSERT INTO public.reporte_persona_roles (
  reporte_persona_id,
  rol,
  created_at
)
SELECT reporte_persona_id, rol, created_at
FROM report_people_boat_alias_roles;

CREATE TEMP TABLE legacy_report_people_boat_alias_cleanup ON COMMIT DROP AS
SELECT
  gen_random_uuid() AS id,
  p.reporte_id,
  p.tipo_reporte,
  n.nombre,
  btrim(p.rol) AS rol,
  min(p.created_at) AS created_at
FROM public.personas_reporte p
CROSS JOIN LATERAL (
  SELECT public.split_report_person_names(p.nombre) AS names
) s
CROSS JOIN LATERAL unnest(s.names) WITH ORDINALITY AS n(nombre, ord)
WHERE public.normalize_report_person_key(n.nombre) <> ''
  AND btrim(coalesce(p.rol, '')) <> ''
GROUP BY p.reporte_id, p.tipo_reporte, public.normalize_report_person_key(n.nombre), n.nombre, btrim(p.rol);

DELETE FROM public.personas_reporte;

INSERT INTO public.personas_reporte (
  id,
  reporte_id,
  tipo_reporte,
  nombre,
  rol,
  created_at
)
SELECT id, reporte_id, tipo_reporte, nombre, rol, created_at
FROM legacy_report_people_boat_alias_cleanup;

-- Corrige las variantes restantes de Obed Vasquez Chaves y Randall Mena Villavicencio.

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
    WHEN key IN ('yeiner castro alvarez') THEN 'Yeiner Castro Alvarez'
    WHEN key IN ('dara chavarria hernandez') THEN 'Dara Chavarria Hernandez'
    WHEN key IN ('jorge gonzalez barrantes', 'jorge gonzales barrantes', 'jprge gonzalez barrantes', 'jprge gonzales barrantes') THEN 'Jorge Gonzalez Barrantes'
    WHEN key IN ('luis carlos gonzalez jarquin', 'luis carlos gonzales jarquin', 'luis gonzalez jarquin', 'luis gonzales jarquin') THEN 'Luis Carlos Gonzalez Jarquin'
    WHEN key IN ('landy gonzalez vargas', 'landy gonzales vargas') THEN 'Landy Gonzalez Vargas'
    WHEN key IN ('randall mena villavicencio', 'randall mena villavicencion') THEN 'Randall Mena Villavicencio'
    WHEN key IN ('joel mora estrada') THEN 'Joel Mora Estrada'
    WHEN key IN ('alfonso noguera corrales') THEN 'Alfonso Noguera Corrales'
    WHEN key IN ('bryan obando munoz') THEN 'Bryan Obando Munoz'
    WHEN key IN ('wilber pena pena') THEN 'Wilber Pena Pena'
    WHEN key IN ('michael rojas brenes') THEN 'Michael Rojas Brenes'
    WHEN key IN ('roberth sanchez parra') THEN 'Roberth Sanchez Parra'
    WHEN key IN ('obed vasquez chaves', 'obed vasques chaves', 'obed vasquez chavez', 'obed vasques chavez', 'obed vazquez chaves', 'obed vazquez chavez') THEN 'Obed Vasquez Chaves'
    WHEN key IN ('griselda ugarte ruiz', 'griseldad ugarte ruiz') THEN 'Griselda Ugarte Ruiz'
    ELSE clean
  END;
END;
$$;

CREATE TEMP TABLE report_people_obed_randall_expanded ON COMMIT DROP AS
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

CREATE TEMP TABLE report_people_obed_randall_people ON COMMIT DROP AS
SELECT
  gen_random_uuid() AS id,
  reporte_id,
  tipo_reporte,
  min(nombre) AS nombre,
  nombre_normalizado,
  (array_remove(array_agg(cedula ORDER BY created_at) FILTER (WHERE cedula IS NOT NULL), NULL))[1] AS cedula,
  min(created_at) AS created_at
FROM report_people_obed_randall_expanded
GROUP BY reporte_id, tipo_reporte, nombre_normalizado;

CREATE TEMP TABLE report_people_obed_randall_roles ON COMMIT DROP AS
SELECT
  cp.id AS reporte_persona_id,
  btrim(r.rol) AS rol,
  min(r.created_at) AS created_at
FROM report_people_obed_randall_expanded e
JOIN public.reporte_persona_roles r
  ON r.reporte_persona_id = e.old_id
JOIN report_people_obed_randall_people cp
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
FROM report_people_obed_randall_people;

INSERT INTO public.reporte_persona_roles (
  reporte_persona_id,
  rol,
  created_at
)
SELECT reporte_persona_id, rol, created_at
FROM report_people_obed_randall_roles;

CREATE TEMP TABLE legacy_report_people_obed_randall_cleanup ON COMMIT DROP AS
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
FROM legacy_report_people_obed_randall_cleanup;

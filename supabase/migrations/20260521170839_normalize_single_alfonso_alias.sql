-- Une el nombre incompleto "Alfonso" con el oficial conocido
-- Alfonso Noguera Corrales.

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
    WHEN key IN ('alfonso', 'alfonso noguera corrales') THEN 'Alfonso Noguera Corrales'
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

UPDATE public.reporte_personas
SET
  nombre = 'Alfonso Noguera Corrales',
  nombre_normalizado = 'alfonso noguera corrales'
WHERE public.normalize_report_person_key(nombre) = 'alfonso';

UPDATE public.personas_reporte
SET nombre = 'Alfonso Noguera Corrales'
WHERE public.normalize_report_person_key(nombre) = 'alfonso';

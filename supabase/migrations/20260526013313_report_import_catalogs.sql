CREATE TABLE IF NOT EXISTS public.report_motive_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motivo text NOT NULL,
  motivo_key text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.report_motive_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  motive_id uuid NOT NULL REFERENCES public.report_motive_catalog(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  source text NOT NULL DEFAULT 'seed',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_key, motive_id)
);

CREATE TABLE IF NOT EXISTS public.report_site_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_sitio text NOT NULL,
  site_key text NOT NULL UNIQUE,
  zona text,
  posicion text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.report_site_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES public.report_site_catalog(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_key text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  source text NOT NULL DEFAULT 'seed',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_key, site_id)
);

CREATE TABLE IF NOT EXISTS public.report_import_catalog_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.report_import_jobs(id) ON DELETE CASCADE,
  field_id uuid REFERENCES public.report_import_fields(id) ON DELETE SET NULL,
  field_key text,
  catalog_type text NOT NULL CHECK (catalog_type IN ('motive', 'site')),
  catalog_item_id uuid,
  raw_value text NOT NULL,
  normalized_value text NOT NULL,
  final_value text,
  action_taken text NOT NULL CHECK (action_taken IN (
    'accepted_suggestion',
    'linked_existing',
    'created_new',
    'saved_for_report',
    'omitted'
  )),
  suggested_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reviewed', 'dismissed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS report_motive_catalog_key_idx
  ON public.report_motive_catalog (motivo_key);

CREATE INDEX IF NOT EXISTS report_motive_aliases_key_idx
  ON public.report_motive_aliases (alias_key);

CREATE INDEX IF NOT EXISTS report_site_catalog_key_idx
  ON public.report_site_catalog (site_key);

CREATE INDEX IF NOT EXISTS report_site_aliases_key_idx
  ON public.report_site_aliases (alias_key);

CREATE INDEX IF NOT EXISTS report_import_catalog_suggestions_job_idx
  ON public.report_import_catalog_suggestions (job_id);

CREATE INDEX IF NOT EXISTS report_import_catalog_suggestions_type_status_idx
  ON public.report_import_catalog_suggestions (catalog_type, status, created_at DESC);

ALTER TABLE public.report_motive_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_motive_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_site_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_site_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_import_catalog_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_report_motive_catalog"
  ON public.report_motive_catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_report_motive_catalog"
  ON public.report_motive_catalog FOR INSERT TO authenticated WITH CHECK (created_by IS NULL OR created_by = auth.uid());

CREATE POLICY "auth_select_report_motive_aliases"
  ON public.report_motive_aliases FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_report_motive_aliases"
  ON public.report_motive_aliases FOR INSERT TO authenticated WITH CHECK (created_by IS NULL OR created_by = auth.uid());

CREATE POLICY "auth_select_report_site_catalog"
  ON public.report_site_catalog FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_report_site_catalog"
  ON public.report_site_catalog FOR INSERT TO authenticated WITH CHECK (created_by IS NULL OR created_by = auth.uid());

CREATE POLICY "auth_select_report_site_aliases"
  ON public.report_site_aliases FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_report_site_aliases"
  ON public.report_site_aliases FOR INSERT TO authenticated WITH CHECK (created_by IS NULL OR created_by = auth.uid());

CREATE POLICY "auth_select_own_report_import_catalog_suggestions"
  ON public.report_import_catalog_suggestions FOR SELECT TO authenticated
  USING (suggested_by = auth.uid());

CREATE POLICY "auth_insert_own_report_import_catalog_suggestions"
  ON public.report_import_catalog_suggestions FOR INSERT TO authenticated
  WITH CHECK (suggested_by = auth.uid());

CREATE TRIGGER update_report_motive_catalog_updated_at
  BEFORE UPDATE ON public.report_motive_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_report_motive_aliases_updated_at
  BEFORE UPDATE ON public.report_motive_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_report_site_catalog_updated_at
  BEFORE UPDATE ON public.report_site_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_report_site_aliases_updated_at
  BEFORE UPDATE ON public.report_site_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

WITH motives(motivo, motivo_key) AS (
  VALUES
    ('Control migratorio', 'control migratorio'),
    ('Control de narcotrafico', 'control de narcotrafico'),
    ('Pesca ilegal', 'pesca ilegal'),
    ('Seguridad ciudadana', 'seguridad ciudadana'),
    ('Proteccion a banistas', 'proteccion a banistas'),
    ('Control de contrabando', 'control de contrabando'),
    ('Reafirmacion de soberania', 'reafirmacion de soberania'),
    ('Pirateria', 'pirateria'),
    ('Caceria ilegal', 'caceria ilegal'),
    ('Seguridad ambiental', 'seguridad ambiental'),
    ('Operativo Verano Seguro', 'operativo verano seguro'),
    ('Operativo Semana Santa', 'operativo semana santa'),
    ('Proteccion de bosques', 'proteccion de bosques'),
    ('Alteracion de humedales', 'alteracion de humedales'),
    ('Apoyo operativo', 'apoyo operativo')
)
INSERT INTO public.report_motive_catalog (motivo, motivo_key, active)
SELECT motivo, motivo_key, true
FROM motives
ON CONFLICT (motivo_key) DO UPDATE
SET motivo = EXCLUDED.motivo,
    active = true;

WITH aliases(alias, alias_key, motive_key) AS (
  VALUES
    ('Migracion ilegal', 'migracion ilegal', 'control migratorio'),
    ('Control migracion ilegal', 'control migracion ilegal', 'control migratorio'),
    ('Narcotrafico', 'narcotrafico', 'control de narcotrafico'),
    ('Narco trafico', 'narco trafico', 'control de narcotrafico'),
    ('Control de pesca', 'control de pesca', 'pesca ilegal'),
    ('Seguridad cuidadana', 'seguridad cuidadana', 'seguridad ciudadana'),
    ('Proteccion de banistas', 'proteccion de banistas', 'proteccion a banistas'),
    ('Seguridad de banistas', 'seguridad de banistas', 'proteccion a banistas'),
    ('Sobernia nacional', 'sobernia nacional', 'reafirmacion de soberania'),
    ('Cazeria ilegal', 'cazeria ilegal', 'caceria ilegal'),
    ('Traslado', 'traslado', 'apoyo operativo')
)
INSERT INTO public.report_motive_aliases (alias, alias_key, motive_id, source)
SELECT aliases.alias, aliases.alias_key, motives.id, 'seed'
FROM aliases
JOIN public.report_motive_catalog motives ON motives.motivo_key = aliases.motive_key
ON CONFLICT (alias_key, motive_id) DO UPDATE
SET alias = EXCLUDED.alias,
    status = 'active';

WITH sites(nombre_sitio, site_key, zona, posicion) AS (
  VALUES
    ('Aguas Calientes', 'aguas calientes', '1B', '10°56''53" N / 085°39''21" W'),
    ('Bello Horizonte', 'bello horizonte', '1B', '10°58''50.9" N / 085°39''55.4" W'),
    ('Conventillos', 'conventillos', '1B', '11°04''47" N / 085°41''32" W'),
    ('Copal', 'copal', '1B', '11°01''42" N / 085°42''18" W'),
    ('Coquitos', 'coquitos', '1B', '11°02''45" N / 085°43''53" W'),
    ('Coyotera', 'coyotera', '1B', '11°02''37.3" N / 085°43''22.3" W'),
    ('Cuajiniquil', 'cuajiniquil', '1B', '10°56''34" N / 085°41''08" W'),
    ('Ecoplaya', 'ecoplaya', '1B', '11°01''41.9" N / 085°42''56.1" W'),
    ('El Jobo', 'el jobo', '1B', '11°01''54" N / 085°44''17" W'),
    ('El Lorenzo', 'el lorenzo', '3A', ''),
    ('El Morro', 'el morro', '1B', '11°09''35.31" N / 085°45''08.85" W'),
    ('Islita', 'islita', '1B', '10°57''50.43" N / 085°41''46.03" W'),
    ('Junquillal', 'junquillal', '1B', '10°58''07.56" N / 085°41''15.72" W'),
    ('La Cruz', 'la cruz', '1B', '11°04''14.8" N / 085°37''46.9" W'),
    ('Las Nubes', 'las nubes', '1B', '11°01''40" N / 085°41''49.6" W'),
    ('Manzanillo', 'manzanillo', '1B', '11°01''28.31" N / 085°43''57.52" W'),
    ('Papaturro', 'papaturro', '1B', '11°01''54.6" N / 085°41''16.4" W'),
    ('Parque Santa Elena', 'parque santa elena', '1B', '10°52''56" N / 085°42''09" W'),
    ('Penas Blancas', 'penas blancas', '1B', '11°12''40.5" N / 085°36''44.8" W'),
    ('Pista Aterrizaje Murcielago', 'pista aterrizaje murcielago', '1B', '10°54''21.8" N / 085°43''15.5" W'),
    ('Playa 4x4', 'playa 4x4', '1B', '10°56''05" N / 085°42''15" W'),
    ('Pocosol', 'pocosol', '2C', '10°53''20" N / 085°36''08" W'),
    ('Quebrada Grande', 'quebrada grande', '2C', '11°50''37" N / 085°29''30" W'),
    ('Rajada', 'rajada', '1B', '11°01''47.76" N / 085°44''41.86" W'),
    ('Ruta 1', 'ruta 1', '1B', '10°57''06" N / 085°36''48" W'),
    ('San Dimas', 'san dimas', '1B', '11°10''45.6" N / 085°36''37.8" W'),
    ('Santa Elena', 'santa elena', '2C', '10°55''32" N / 085°36''27" W'),
    ('Santa Rosa', 'santa rosa', '2C', '10°52''39" N / 085°35''08" W'),
    ('Soley', 'soley', '1B', '11°02''32.32" N / 085°40''03.85" W')
)
INSERT INTO public.report_site_catalog (nombre_sitio, site_key, zona, posicion, active)
SELECT nombre_sitio, site_key, zona, nullif(posicion, ''), true
FROM sites
ON CONFLICT (site_key) DO UPDATE
SET nombre_sitio = EXCLUDED.nombre_sitio,
    zona = EXCLUDED.zona,
    posicion = EXCLUDED.posicion,
    active = true;

WITH aliases(alias, alias_key, site_key) AS (
  VALUES
    ('Playa Rajada', 'playa rajada', 'rajada'),
    ('Playa Soley', 'playa soley', 'soley'),
    ('Murcielago', 'murcielago', 'pista aterrizaje murcielago')
)
INSERT INTO public.report_site_aliases (alias, alias_key, site_id, source)
SELECT aliases.alias, aliases.alias_key, sites.id, 'seed'
FROM aliases
JOIN public.report_site_catalog sites ON sites.site_key = aliases.site_key
ON CONFLICT (alias_key, site_id) DO UPDATE
SET alias = EXCLUDED.alias,
    status = 'active';

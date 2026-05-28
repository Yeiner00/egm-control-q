CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.officers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  cedula text NOT NULL UNIQUE,
  nombre_normalizado text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.officer_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES public.officers(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_normalizado text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  source text NOT NULL DEFAULT 'seed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (alias_normalizado, officer_id)
);

CREATE TABLE IF NOT EXISTS public.report_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('uploaded', 'parsed', 'review_required', 'gemini_failed', 'ready', 'confirmed', 'failed')),
  report_type text CHECK (report_type IN ('vehiculo', 'embarcacion')),
  original_filename text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'report-import-snapshots',
  storage_path text,
  file_size_bytes integer NOT NULL DEFAULT 0,
  mime_type text,
  error_message text,
  gemini_error text,
  confirmed_report_id uuid,
  confirmed_report_type text CHECK (confirmed_report_type IN ('vehiculo', 'embarcacion')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.report_import_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.report_import_jobs(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_kind text NOT NULL CHECK (field_kind IN ('deterministic', 'person', 'catalog', 'text')),
  raw_value text,
  normalized_value text,
  final_value text,
  cell_address text,
  source text NOT NULL CHECK (source IN ('local', 'gemini', 'manual', 'system')),
  confidence numeric NOT NULL DEFAULT 0 CHECK (confidence >= 0 AND confidence <= 1),
  status text NOT NULL CHECK (status IN ('accepted', 'needs_review', 'rejected')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.report_import_alias_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.report_import_jobs(id) ON DELETE CASCADE,
  field_id uuid REFERENCES public.report_import_fields(id) ON DELETE SET NULL,
  field_key text,
  officer_id uuid NOT NULL REFERENCES public.officers(id) ON DELETE CASCADE,
  raw_alias text NOT NULL,
  normalized_alias text NOT NULL,
  suggested_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS officers_nombre_normalizado_trgm_idx
  ON public.officers USING gin (nombre_normalizado gin_trgm_ops);

CREATE INDEX IF NOT EXISTS officer_aliases_alias_normalizado_trgm_idx
  ON public.officer_aliases USING gin (alias_normalizado gin_trgm_ops);

CREATE INDEX IF NOT EXISTS report_import_jobs_user_created_idx
  ON public.report_import_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS report_import_fields_job_idx
  ON public.report_import_fields (job_id);

CREATE INDEX IF NOT EXISTS report_import_fields_status_idx
  ON public.report_import_fields (status);

CREATE INDEX IF NOT EXISTS report_import_alias_suggestions_status_idx
  ON public.report_import_alias_suggestions (status, created_at DESC);

ALTER TABLE public.officers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.officer_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_import_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_import_alias_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_officers"
  ON public.officers FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_select_officer_aliases"
  ON public.officer_aliases FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_select_own_report_import_jobs"
  ON public.report_import_jobs FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "auth_insert_own_report_import_jobs"
  ON public.report_import_jobs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "auth_update_own_report_import_jobs"
  ON public.report_import_jobs FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "auth_select_own_report_import_fields"
  ON public.report_import_fields FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.report_import_jobs j
    WHERE j.id = report_import_fields.job_id AND j.user_id = auth.uid()
  ));

CREATE POLICY "auth_insert_own_report_import_fields"
  ON public.report_import_fields FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.report_import_jobs j
    WHERE j.id = report_import_fields.job_id AND j.user_id = auth.uid()
  ));

CREATE POLICY "auth_update_own_report_import_fields"
  ON public.report_import_fields FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.report_import_jobs j
    WHERE j.id = report_import_fields.job_id AND j.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.report_import_jobs j
    WHERE j.id = report_import_fields.job_id AND j.user_id = auth.uid()
  ));

CREATE POLICY "auth_select_own_report_import_alias_suggestions"
  ON public.report_import_alias_suggestions FOR SELECT TO authenticated
  USING (suggested_by = auth.uid());

CREATE POLICY "auth_insert_own_report_import_alias_suggestions"
  ON public.report_import_alias_suggestions FOR INSERT TO authenticated
  WITH CHECK (suggested_by = auth.uid());

CREATE TRIGGER update_officers_updated_at
  BEFORE UPDATE ON public.officers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_officer_aliases_updated_at
  BEFORE UPDATE ON public.officer_aliases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_report_import_jobs_updated_at
  BEFORE UPDATE ON public.report_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_report_import_fields_updated_at
  BEFORE UPDATE ON public.report_import_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public)
VALUES ('report-import-snapshots', 'report-import-snapshots', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth_insert_own_report_import_snapshots"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'report-import-snapshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "auth_select_own_report_import_snapshots"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'report-import-snapshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

INSERT INTO public.officers (nombre, cedula, nombre_normalizado)
VALUES
  ('Josue Acevedo Rios', '603290196', 'josue acevedo rios'),
  ('Olman Alfaro Quiros', '118150120', 'olman alfaro quiros'),
  ('Sergio Alpizar Carrillo', '602690624', 'sergio alpizar carrillo'),
  ('Cesar Alvarez Martinez', '208060620', 'cesar alvarez martinez'),
  ('Jhonny Araya Chacon', '206900634', 'jhonny araya chacon'),
  ('Pablo Barrantes Palma', '603790678', 'pablo barrantes palma'),
  ('Minor Cambronero Campos', '603460878', 'minor cambronero campos'),
  ('Yeiner Castro Alvarez', '603830474', 'yeiner castro alvarez'),
  ('Dara Chavarria Hernandez', '304310005', 'dara chavarria hernandez'),
  ('Jorge Gonzalez Barrantes', '603100467', 'jorge gonzalez barrantes'),
  ('Luis Carlos Gonzalez Jarquin', '503740662', 'luis carlos gonzalez jarquin'),
  ('Landy Gonzalez Vargas', '504250218', 'landy gonzalez vargas'),
  ('Randall Mena Villavicencio', '205200912', 'randall mena villavicencio'),
  ('Joel Mora Estrada', '604640540', 'joel mora estrada'),
  ('Alfonso Noguera Corrales', '604320632', 'alfonso noguera corrales'),
  ('Bryan Obando Munoz', '604560018', 'bryan obando munoz'),
  ('Wilber Pena Pena', '502550203', 'wilber pena pena'),
  ('Michael Rojas Brenes', '603310561', 'michael rojas brenes'),
  ('Roberth Sanchez Parra', '503950054', 'roberth sanchez parra'),
  ('Obed Vasquez Chaves', '702220098', 'obed vasquez chaves'),
  ('Griselda Ugarte Ruiz', '206910650', 'griselda ugarte ruiz')
ON CONFLICT (cedula) DO UPDATE
SET nombre = EXCLUDED.nombre,
    nombre_normalizado = EXCLUDED.nombre_normalizado,
    active = true;

WITH aliases(alias, alias_normalizado, officer_cedula) AS (
  VALUES
    ('alfonso', 'alfonso', '604320632'),
    ('brayan obando munoz', 'brayan obando munoz', '604560018'),
    ('brayan obando quiros', 'brayan obando quiros', '604560018'),
    ('bryan obando quiros', 'bryan obando quiros', '604560018'),
    ('cesar alvares martinez', 'cesar alvares martinez', '208060620'),
    ('jprge gonzales barrantes', 'jprge gonzales barrantes', '603100467'),
    ('jprge gonzalez barrantes', 'jprge gonzalez barrantes', '603100467'),
    ('jorga gonzalez barrantes', 'jorga gonzalez barrantes', '603100467'),
    ('luis c gonzalez jarquin', 'luis c gonzalez jarquin', '503740662'),
    ('luis c jarquin gonzales', 'luis c jarquin gonzales', '503740662'),
    ('luis c jarquin gonzalez', 'luis c jarquin gonzalez', '503740662'),
    ('luis gonzales jarquin', 'luis gonzales jarquin', '503740662'),
    ('luis gonzalez jarquin', 'luis gonzalez jarquin', '503740662'),
    ('micchael rojas brenes', 'micchael rojas brenes', '603310561'),
    ('obed vasques chavez', 'obed vasques chavez', '702220098'),
    ('obed vasques chaves', 'obed vasques chaves', '702220098'),
    ('obed vasquez chavez', 'obed vasquez chavez', '702220098'),
    ('obed vazquez chavez', 'obed vazquez chavez', '702220098'),
    ('obed vazquez chaves', 'obed vazquez chaves', '702220098'),
    ('randal mena villavicencio', 'randal mena villavicencio', '205200912'),
    ('randall mena villavicencion', 'randall mena villavicencion', '205200912'),
    ('roberth sanches parra', 'roberth sanches parra', '503950054'),
    ('yeiner castro alvares', 'yeiner castro alvares', '603830474'),
    ('yeiner castro anlvares', 'yeiner castro anlvares', '603830474'),
    ('yeiner cstro alvares', 'yeiner cstro alvares', '603830474'),
    ('yeiner cstro anlvares', 'yeiner cstro anlvares', '603830474')
)
INSERT INTO public.officer_aliases (alias, alias_normalizado, officer_id, source)
SELECT aliases.alias, aliases.alias_normalizado, officers.id, 'seed'
FROM aliases
JOIN public.officers officers ON officers.cedula = aliases.officer_cedula
ON CONFLICT (alias_normalizado, officer_id) DO UPDATE
SET alias = EXCLUDED.alias,
    status = 'active';

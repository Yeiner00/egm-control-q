CREATE TABLE IF NOT EXISTS public.report_import_person_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.report_import_jobs(id) ON DELETE CASCADE,
  field_id uuid REFERENCES public.report_import_fields(id) ON DELETE SET NULL,
  field_key text,
  raw_name text NOT NULL,
  normalized_name text NOT NULL,
  final_name text,
  officer_id uuid REFERENCES public.officers(id) ON DELETE SET NULL,
  action_taken text NOT NULL CHECK (action_taken IN ('saved_without_cedula', 'possible_new_officer', 'linked_existing', 'omitted')),
  suggested_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS report_import_person_suggestions_job_idx
  ON public.report_import_person_suggestions (job_id);

CREATE INDEX IF NOT EXISTS report_import_person_suggestions_status_idx
  ON public.report_import_person_suggestions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS report_import_person_suggestions_normalized_idx
  ON public.report_import_person_suggestions (normalized_name);

ALTER TABLE public.report_import_person_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_own_report_import_person_suggestions"
  ON public.report_import_person_suggestions FOR SELECT TO authenticated
  USING (suggested_by = auth.uid());

CREATE POLICY "auth_insert_own_report_import_person_suggestions"
  ON public.report_import_person_suggestions FOR INSERT TO authenticated
  WITH CHECK (suggested_by = auth.uid());

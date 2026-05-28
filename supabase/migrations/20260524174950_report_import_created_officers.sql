ALTER TABLE public.report_import_person_suggestions
  DROP CONSTRAINT IF EXISTS report_import_person_suggestions_action_taken_check;

ALTER TABLE public.report_import_person_suggestions
  ADD CONSTRAINT report_import_person_suggestions_action_taken_check
  CHECK (action_taken IN (
    'saved_without_cedula',
    'possible_new_officer',
    'created_new_officer',
    'linked_existing',
    'omitted'
  ));

DROP POLICY IF EXISTS "auth_insert_officers" ON public.officers;

CREATE POLICY "auth_insert_officers"
  ON public.officers FOR INSERT TO authenticated
  WITH CHECK (true);

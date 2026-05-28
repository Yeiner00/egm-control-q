CREATE TABLE IF NOT EXISTS public.report_catalog_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('insert', 'update')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_catalog_admin_audit_entity_idx
  ON public.report_catalog_admin_audit (entity_table, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS report_catalog_admin_audit_changed_by_idx
  ON public.report_catalog_admin_audit (changed_by, created_at DESC);

ALTER TABLE public.report_catalog_admin_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_report_catalog_admin_audit"
  ON public.report_catalog_admin_audit FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_report_catalog_admin_audit"
  ON public.report_catalog_admin_audit FOR INSERT TO authenticated
  WITH CHECK (changed_by IS NULL OR changed_by = auth.uid());

DROP POLICY IF EXISTS "auth_insert_officer_aliases" ON public.officer_aliases;
DROP POLICY IF EXISTS "auth_update_officers" ON public.officers;
DROP POLICY IF EXISTS "auth_update_officer_aliases" ON public.officer_aliases;
DROP POLICY IF EXISTS "auth_update_report_motive_catalog" ON public.report_motive_catalog;
DROP POLICY IF EXISTS "auth_update_report_motive_aliases" ON public.report_motive_aliases;
DROP POLICY IF EXISTS "auth_update_report_site_catalog" ON public.report_site_catalog;
DROP POLICY IF EXISTS "auth_update_report_site_aliases" ON public.report_site_aliases;
DROP POLICY IF EXISTS "auth_update_report_import_alias_suggestions" ON public.report_import_alias_suggestions;
DROP POLICY IF EXISTS "auth_update_report_import_person_suggestions" ON public.report_import_person_suggestions;
DROP POLICY IF EXISTS "auth_update_report_import_catalog_suggestions" ON public.report_import_catalog_suggestions;

CREATE POLICY "auth_insert_officer_aliases"
  ON public.officer_aliases FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "auth_update_officers"
  ON public.officers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_update_officer_aliases"
  ON public.officer_aliases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_update_report_motive_catalog"
  ON public.report_motive_catalog FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_update_report_motive_aliases"
  ON public.report_motive_aliases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_update_report_site_catalog"
  ON public.report_site_catalog FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_update_report_site_aliases"
  ON public.report_site_aliases FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "auth_update_report_import_alias_suggestions"
  ON public.report_import_alias_suggestions FOR UPDATE TO authenticated
  USING (suggested_by = auth.uid())
  WITH CHECK (suggested_by = auth.uid());

CREATE POLICY "auth_update_report_import_person_suggestions"
  ON public.report_import_person_suggestions FOR UPDATE TO authenticated
  USING (suggested_by = auth.uid())
  WITH CHECK (suggested_by = auth.uid());

CREATE POLICY "auth_update_report_import_catalog_suggestions"
  ON public.report_import_catalog_suggestions FOR UPDATE TO authenticated
  USING (suggested_by = auth.uid())
  WITH CHECK (suggested_by = auth.uid());

CREATE OR REPLACE FUNCTION public.log_report_catalog_admin_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.report_catalog_admin_audit (
      entity_table,
      entity_id,
      action,
      old_data,
      new_data,
      changed_by
    )
    VALUES (
      TG_TABLE_NAME,
      NEW.id,
      'insert',
      NULL,
      to_jsonb(NEW),
      auth.uid()
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF to_jsonb(OLD) - 'updated_at' = to_jsonb(NEW) - 'updated_at' THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.report_catalog_admin_audit (
      entity_table,
      entity_id,
      action,
      old_data,
      new_data,
      changed_by
    )
    VALUES (
      TG_TABLE_NAME,
      NEW.id,
      'update',
      to_jsonb(OLD),
      to_jsonb(NEW),
      auth.uid()
    );
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_officers_catalog_admin ON public.officers;
DROP TRIGGER IF EXISTS audit_officer_aliases_catalog_admin ON public.officer_aliases;
DROP TRIGGER IF EXISTS audit_report_motive_catalog_admin ON public.report_motive_catalog;
DROP TRIGGER IF EXISTS audit_report_motive_aliases_admin ON public.report_motive_aliases;
DROP TRIGGER IF EXISTS audit_report_site_catalog_admin ON public.report_site_catalog;
DROP TRIGGER IF EXISTS audit_report_site_aliases_admin ON public.report_site_aliases;

CREATE TRIGGER audit_officers_catalog_admin
  AFTER INSERT OR UPDATE ON public.officers
  FOR EACH ROW EXECUTE FUNCTION public.log_report_catalog_admin_audit();

CREATE TRIGGER audit_officer_aliases_catalog_admin
  AFTER INSERT OR UPDATE ON public.officer_aliases
  FOR EACH ROW EXECUTE FUNCTION public.log_report_catalog_admin_audit();

CREATE TRIGGER audit_report_motive_catalog_admin
  AFTER INSERT OR UPDATE ON public.report_motive_catalog
  FOR EACH ROW EXECUTE FUNCTION public.log_report_catalog_admin_audit();

CREATE TRIGGER audit_report_motive_aliases_admin
  AFTER INSERT OR UPDATE ON public.report_motive_aliases
  FOR EACH ROW EXECUTE FUNCTION public.log_report_catalog_admin_audit();

CREATE TRIGGER audit_report_site_catalog_admin
  AFTER INSERT OR UPDATE ON public.report_site_catalog
  FOR EACH ROW EXECUTE FUNCTION public.log_report_catalog_admin_audit();

CREATE TRIGGER audit_report_site_aliases_admin
  AFTER INSERT OR UPDATE ON public.report_site_aliases
  FOR EACH ROW EXECUTE FUNCTION public.log_report_catalog_admin_audit();

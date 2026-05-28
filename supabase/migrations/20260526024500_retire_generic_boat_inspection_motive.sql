UPDATE public.report_motive_aliases
SET status = 'inactive',
    updated_at = now()
WHERE alias_key = 'buzos'
   OR motive_id IN (
    SELECT id
    FROM public.report_motive_catalog
    WHERE motivo_key = 'inspeccion de embarcacion'
  );

UPDATE public.report_motive_catalog
SET active = false,
    updated_at = now()
WHERE motivo_key = 'inspeccion de embarcacion';

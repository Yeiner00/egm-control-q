CREATE OR REPLACE FUNCTION public.keepalive()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'checked_at', now()
  );
$$;

REVOKE ALL ON FUNCTION public.keepalive() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.keepalive() FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.keepalive() TO anon, authenticated;

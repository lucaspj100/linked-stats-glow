CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Operações privilegiadas do backend usam service_role e devem poder persistir
  -- os campos CRM. Usuários comuns continuam impedidos; admins autenticados passam.
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.crm_user_id := OLD.crm_user_id;
    NEW.crm_link_status := OLD.crm_link_status;
    NEW.crm_name := OLD.crm_name;
    NEW.crm_email := OLD.crm_email;
    NEW.crm_linked_at := OLD.crm_linked_at;
    NEW.crm_last_attempt_at := OLD.crm_last_attempt_at;
    NEW.crm_last_error := OLD.crm_last_error;
    NEW.active := OLD.active;
    NEW.email := OLD.email;
    NEW.user_id := OLD.user_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.protect_profile_privileged_fields() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_profile_privileged_fields() TO service_role;
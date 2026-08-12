ALTER TABLE public.extension_installations
  ADD COLUMN IF NOT EXISTS device_name text,
  ADD COLUMN IF NOT EXISTS token_secret text;

-- Ninguém lê token_hash/token_secret pela Data API; apenas o servidor (service_role).
REVOKE SELECT ON public.extension_installations FROM authenticated;
GRANT SELECT (id, label, device_name, person_name, linkedin_account, is_active, last_used_at, created_at, updated_at, seller_user_id)
  ON public.extension_installations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.extension_installations TO authenticated;
GRANT ALL ON public.extension_installations TO service_role;

DROP POLICY IF EXISTS "Authenticated users can create installations" ON public.extension_installations;
CREATE POLICY "Users create own installations"
  ON public.extension_installations FOR INSERT TO authenticated
  WITH CHECK (seller_user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users update own installations"
  ON public.extension_installations FOR UPDATE TO authenticated
  USING (seller_user_id = auth.uid())
  WITH CHECK (seller_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.protect_installation_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.seller_user_id := OLD.seller_user_id;
    NEW.token_hash := OLD.token_hash;
    NEW.token_secret := OLD.token_secret;
    NEW.person_name := OLD.person_name;
    NEW.last_used_at := OLD.last_used_at;
    NEW.id := OLD.id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_installation_privileged_fields ON public.extension_installations;
CREATE TRIGGER protect_installation_privileged_fields
  BEFORE UPDATE ON public.extension_installations
  FOR EACH ROW EXECUTE FUNCTION public.protect_installation_privileged_fields();
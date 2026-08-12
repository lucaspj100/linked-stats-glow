ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS crm_link_status text NOT NULL DEFAULT 'unlinked',
  ADD COLUMN IF NOT EXISTS crm_name text,
  ADD COLUMN IF NOT EXISTS crm_email text,
  ADD COLUMN IF NOT EXISTS crm_linked_at timestamptz,
  ADD COLUMN IF NOT EXISTS crm_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS crm_last_error text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_crm_link_status_check
  CHECK (crm_link_status IN ('linked','unlinked','needs_review','error'));

UPDATE public.profiles SET crm_link_status = 'linked' WHERE crm_user_id IS NOT NULL AND crm_user_id <> '';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_crm_user_id_unique
  ON public.profiles (crm_user_id)
  WHERE crm_user_id IS NOT NULL AND crm_user_id <> '';

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    NEW.crm_user_id := OLD.crm_user_id;
    NEW.crm_link_status := OLD.crm_link_status;
    NEW.crm_name := OLD.crm_name;
    NEW.crm_email := OLD.crm_email;
    NEW.crm_linked_at := OLD.crm_linked_at;
    NEW.active := OLD.active;
    NEW.email := OLD.email;
    NEW.user_id := OLD.user_id;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TABLE IF NOT EXISTS public.crm_link_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email_normalized text NOT NULL,
  outcome text NOT NULL,
  matches_count integer NOT NULL DEFAULT 0,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.crm_link_attempts TO authenticated;
GRANT ALL ON public.crm_link_attempts TO service_role;
ALTER TABLE public.crm_link_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can read crm link attempts"
  ON public.crm_link_attempts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS crm_link_attempts_profile_idx ON public.crm_link_attempts (profile_id, created_at DESC);
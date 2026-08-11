-- 1. Installations table
CREATE TABLE public.extension_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  person_name text NOT NULL,
  linkedin_account text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.extension_installations TO authenticated;
GRANT ALL ON public.extension_installations TO service_role;

ALTER TABLE public.extension_installations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read installations"
  ON public.extension_installations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create installations"
  ON public.extension_installations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update installations"
  ON public.extension_installations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete installations"
  ON public.extension_installations FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_extension_installations_updated_at
BEFORE UPDATE ON public.extension_installations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Dedup + origin on message_events
ALTER TABLE public.message_events
  ADD COLUMN IF NOT EXISTS event_id uuid,
  ADD COLUMN IF NOT EXISTS installation_id uuid REFERENCES public.extension_installations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS message_events_event_id_key
  ON public.message_events (event_id) WHERE event_id IS NOT NULL;

-- 3. Remove public insert access (extension now goes through the secure endpoint)
DROP POLICY IF EXISTS "Extension can insert message events" ON public.message_events;
REVOKE ALL ON public.message_events FROM anon;
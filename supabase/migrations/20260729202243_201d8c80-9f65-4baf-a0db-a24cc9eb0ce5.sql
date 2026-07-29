DROP POLICY IF EXISTS "Public read of message events" ON public.message_events;

REVOKE ALL ON public.message_events FROM anon;
GRANT SELECT ON public.message_events TO authenticated;
GRANT ALL ON public.message_events TO service_role;

ALTER TABLE public.message_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read message events"
ON public.message_events
FOR SELECT
TO authenticated
USING (true);
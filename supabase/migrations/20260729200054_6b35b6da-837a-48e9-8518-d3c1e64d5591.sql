DROP POLICY IF EXISTS "Authenticated can insert message events" ON public.message_events;
REVOKE INSERT, UPDATE, DELETE ON public.message_events FROM authenticated;
GRANT INSERT ON public.message_events TO anon;
GRANT INSERT ON public.message_events TO authenticated;

CREATE POLICY "Extension can insert message events"
ON public.message_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  person_name <> ''
  AND length(person_name) <= 120
  AND linkedin_account <> ''
  AND length(linkedin_account) <= 120
  AND (url IS NULL OR length(url) <= 2000)
  AND sent_at > now() - interval '1 day'
  AND sent_at < now() + interval '1 hour'
);
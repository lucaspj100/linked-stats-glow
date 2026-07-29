CREATE TABLE IF NOT EXISTS public.message_events (
  id uuid primary key default gen_random_uuid(),
  person_name text not null,
  linkedin_account text not null,
  sent_at timestamptz not null default now(),
  url text,
  created_at timestamptz not null default now()
);

GRANT SELECT ON public.message_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_events TO authenticated;
GRANT ALL ON public.message_events TO service_role;

ALTER TABLE public.message_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read of message events"
ON public.message_events FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Authenticated can insert message events"
ON public.message_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE INDEX IF NOT EXISTS message_events_sent_at_idx ON public.message_events (sent_at DESC);
CREATE INDEX IF NOT EXISTS message_events_person_idx ON public.message_events (person_name);

ALTER TABLE public.message_events REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_events;

INSERT INTO public.message_events (person_name, linkedin_account, sent_at, url)
SELECT
  p.name,
  p.account,
  now() - (random() * interval '13 days'),
  'https://www.linkedin.com/in/lead-' || g
FROM generate_series(1, 420) g
CROSS JOIN LATERAL (
  SELECT * FROM (VALUES
    ('Ana Souza','ana.souza@empresa.com'),
    ('Ana Souza','ana.prospect@empresa.com'),
    ('Bruno Lima','bruno.lima@empresa.com'),
    ('Carla Mendes','carla.mendes@empresa.com'),
    ('Carla Mendes','carla.sdr@empresa.com'),
    ('Diego Rocha','diego.rocha@empresa.com'),
    ('Elisa Prado','elisa.prado@empresa.com')
  ) AS v(name, account)
  ORDER BY random() LIMIT 1
) p;

INSERT INTO public.message_events (person_name, linkedin_account, sent_at, url)
SELECT
  p.name,
  p.account,
  date_trunc('day', now()) + (random() * interval '10 hours'),
  'https://www.linkedin.com/in/lead-today-' || g
FROM generate_series(1, 60) g
CROSS JOIN LATERAL (
  SELECT * FROM (VALUES
    ('Ana Souza','ana.souza@empresa.com'),
    ('Bruno Lima','bruno.lima@empresa.com'),
    ('Carla Mendes','carla.sdr@empresa.com'),
    ('Diego Rocha','diego.rocha@empresa.com'),
    ('Elisa Prado','elisa.prado@empresa.com')
  ) AS v(name, account)
  ORDER BY random() LIMIT 1
) p;
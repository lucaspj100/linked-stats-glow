WITH people AS (
  SELECT * FROM (VALUES
    (0,'Ana Souza','ana.souza@empresa.com'),
    (1,'Ana Souza','ana.prospect@empresa.com'),
    (2,'Bruno Lima','bruno.lima@empresa.com'),
    (3,'Carla Mendes','carla.mendes@empresa.com'),
    (4,'Carla Mendes','carla.sdr@empresa.com'),
    (5,'Diego Rocha','diego.rocha@empresa.com'),
    (6,'Elisa Prado','elisa.prado@empresa.com')
  ) AS v(idx, name, account)
), numbered AS (
  SELECT id, (floor(random()*7))::int AS idx FROM public.message_events
)
UPDATE public.message_events m
SET person_name = p.name, linkedin_account = p.account
FROM numbered n
JOIN people p ON p.idx = n.idx
WHERE m.id = n.id;
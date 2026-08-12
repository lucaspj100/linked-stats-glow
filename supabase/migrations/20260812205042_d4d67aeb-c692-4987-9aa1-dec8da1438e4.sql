ALTER TABLE public.message_events
  ADD COLUMN IF NOT EXISTS crm_sync_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS crm_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS crm_sync_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS crm_next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS crm_last_error text,
  ADD COLUMN IF NOT EXISTS crm_user_id text;

CREATE INDEX IF NOT EXISTS message_events_crm_pending_idx
  ON public.message_events (crm_sync_status, crm_next_attempt_at)
  WHERE crm_sync_status <> 'synced';

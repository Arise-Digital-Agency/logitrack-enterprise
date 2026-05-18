ALTER TABLE public.team_members
ADD COLUMN role text NOT NULL DEFAULT 'member';

ALTER TABLE public.time_logs
ADD COLUMN is_active boolean NOT NULL DEFAULT false;

-- Add an index to efficiently query active sessions
CREATE INDEX IF NOT EXISTS idx_time_logs_is_active ON public.time_logs(is_active) WHERE is_active = true;

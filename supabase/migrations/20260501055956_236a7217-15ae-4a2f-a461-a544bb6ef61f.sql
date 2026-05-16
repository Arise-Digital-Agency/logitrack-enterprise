ALTER TABLE public.time_logs ADD COLUMN request_id uuid;
CREATE INDEX IF NOT EXISTS idx_time_logs_request_id ON public.time_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_time_logs_user_started ON public.time_logs(user_id, started_at DESC);
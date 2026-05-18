ALTER TABLE public.time_logs
ADD COLUMN tracking_mode text NOT NULL DEFAULT 'standard';

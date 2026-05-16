
-- Sub-tasks table
CREATE TABLE public.request_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  client_id uuid,
  user_id uuid NOT NULL,
  title text NOT NULL,
  is_done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.request_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages tasks"
  ON public.request_tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Track client's last read time per request for unread badge
ALTER TABLE public.requests ADD COLUMN client_last_read_at timestamptz;

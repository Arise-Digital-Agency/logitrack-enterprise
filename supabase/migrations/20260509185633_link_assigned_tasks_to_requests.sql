
-- Add request_id to assigned_tasks
ALTER TABLE public.assigned_tasks ADD COLUMN request_id UUID REFERENCES public.requests(id) ON DELETE SET NULL;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_assigned_tasks_request_id ON public.assigned_tasks(request_id);

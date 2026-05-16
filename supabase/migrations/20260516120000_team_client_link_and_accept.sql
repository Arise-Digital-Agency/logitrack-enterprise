-- Link team members to clients; track when assignments are accepted
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_team_members_client_id ON public.team_members(client_id);

ALTER TABLE public.assigned_tasks
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;

-- Backfill client_id from existing assigned tasks where possible
UPDATE public.team_members tm
SET client_id = sub.client_id
FROM (
  SELECT DISTINCT ON (at.team_member_id) at.team_member_id, at.client_id
  FROM public.assigned_tasks at
  WHERE at.client_id IS NOT NULL
  ORDER BY at.team_member_id, at.created_at DESC
) sub
WHERE tm.id = sub.team_member_id
  AND tm.client_id IS NULL;

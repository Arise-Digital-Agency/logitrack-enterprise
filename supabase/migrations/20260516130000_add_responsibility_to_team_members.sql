-- Add responsibility column to team_members
ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS responsibility TEXT;

-- Update existing records with a default if needed (optional, keeping it null for now)

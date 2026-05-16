
-- 1. Add share_token to clients
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS share_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE;

CREATE INDEX IF NOT EXISTS idx_clients_share_token ON public.clients(share_token);

-- 2. Attachments table
CREATE TABLE IF NOT EXISTS public.request_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id uuid NOT NULL, -- owner of the request (for RLS)
  uploaded_by text NOT NULL DEFAULT 'owner', -- 'owner' or 'client'
  file_name text NOT NULL,
  relative_path text, -- preserves folder structure
  storage_path text NOT NULL, -- path in the bucket
  mime_type text,
  size_bytes bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_request ON public.request_attachments(request_id);
CREATE INDEX IF NOT EXISTS idx_attachments_client ON public.request_attachments(client_id);

ALTER TABLE public.request_attachments ENABLE ROW LEVEL SECURITY;

-- 3. Comments table
CREATE TABLE IF NOT EXISTS public.request_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  user_id uuid NOT NULL, -- owner of the request (for RLS)
  author text NOT NULL DEFAULT 'owner', -- 'owner' or 'client'
  author_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_comments_request ON public.request_comments(request_id);

ALTER TABLE public.request_comments ENABLE ROW LEVEL SECURITY;

-- 4. Helper: validate a share token corresponds to a given client_id
CREATE OR REPLACE FUNCTION public.client_id_for_token(_token uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.clients WHERE share_token = _token LIMIT 1;
$$;

-- 5. RLS policies for request_attachments
DROP POLICY IF EXISTS "Owner manages attachments" ON public.request_attachments;
CREATE POLICY "Owner manages attachments"
  ON public.request_attachments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. RLS policies for request_comments
DROP POLICY IF EXISTS "Owner manages comments" ON public.request_comments;
CREATE POLICY "Owner manages comments"
  ON public.request_comments
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. Storage bucket (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('request-attachments', 'request-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- 8. Owner can fully manage their files (folder structure: <user_id>/<client_id>/<request_id>/...)
DROP POLICY IF EXISTS "Owners read own attachments" ON storage.objects;
CREATE POLICY "Owners read own attachments"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'request-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Owners write own attachments" ON storage.objects;
CREATE POLICY "Owners write own attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'request-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Owners update own attachments" ON storage.objects;
CREATE POLICY "Owners update own attachments"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'request-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Owners delete own attachments" ON storage.objects;
CREATE POLICY "Owners delete own attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'request-attachments'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

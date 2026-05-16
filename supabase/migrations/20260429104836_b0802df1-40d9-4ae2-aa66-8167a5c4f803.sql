CREATE TABLE public.requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  due_at DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own requests select" ON public.requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Own requests insert" ON public.requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own requests update" ON public.requests FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Own requests delete" ON public.requests FOR DELETE USING (auth.uid() = user_id);
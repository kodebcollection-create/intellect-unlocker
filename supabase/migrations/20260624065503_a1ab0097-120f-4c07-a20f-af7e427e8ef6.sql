
-- 1) Books: published flag + page_count
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS page_count integer;

-- Backfill: any book that already has a pdf_path is considered published so
-- existing learners keep their access.
UPDATE public.books SET published = true WHERE pdf_path IS NOT NULL AND published = false;

-- 2) Admin activity log
CREATE TABLE IF NOT EXISTS public.admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.admin_activity_log TO authenticated;
GRANT ALL ON public.admin_activity_log TO service_role;

ALTER TABLE public.admin_activity_log ENABLE ROW LEVEL SECURITY;

-- Only admins may read the log from the client; writes go through service-role server fns.
CREATE POLICY "Admins can read activity log"
  ON public.admin_activity_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS admin_activity_log_created_idx
  ON public.admin_activity_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_activity_log_book_idx
  ON public.admin_activity_log (book_id);

-- 3) Speed up the per-user unlock check
CREATE INDEX IF NOT EXISTS user_progress_user_book_idx
  ON public.user_progress (user_id, book_id);

-- 4) Clean up the 5 duplicate "psychopaths" books that were created without PDFs
DELETE FROM public.books WHERE id IN (
  '3261f8fc-f68e-4b1a-8adf-add40b7c9cd4',
  '235729a5-18b9-46ea-8838-58f3e119758a',
  '7c9b9c49-0aa2-4879-b942-161f2c4a22e1',
  '3c845c78-5135-4ff9-b592-3c25c8cdd22a',
  '5cf3cd04-e737-46ad-8747-bfa6d72514e0'
);


-- 1. book_pdfs_read_auth_no_unlock_check: drop broad SELECT on private bucket.
--    Clients access PDFs only via server-signed URLs from the unlock-gated getPdfUrl.
DROP POLICY IF EXISTS book_pdfs_read_auth ON storage.objects;

-- 2. book_unlock_clientside: prevent users from writing quiz_passed=true directly.
CREATE OR REPLACE FUNCTION public.enforce_user_progress_quiz_passed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- The server routes that award a passed quiz use the service_role client
  -- (bypasses RLS). Any other role (authenticated/anon) is not allowed to
  -- set or preserve quiz_passed=true.
  IF current_user <> 'service_role' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.quiz_passed := false;
    ELSE
      NEW.quiz_passed := COALESCE(OLD.quiz_passed, false);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_progress_enforce_quiz_passed ON public.user_progress;
CREATE TRIGGER user_progress_enforce_quiz_passed
BEFORE INSERT OR UPDATE ON public.user_progress
FOR EACH ROW EXECUTE FUNCTION public.enforce_user_progress_quiz_passed();

-- 3. books_pdf_path_public: hide storage path from clients; expose boolean instead.
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS has_pdf boolean
  GENERATED ALWAYS AS (pdf_path IS NOT NULL) STORED;

REVOKE SELECT (pdf_path) ON public.books FROM authenticated;
REVOKE SELECT (pdf_path) ON public.books FROM anon;

-- 5. quiz_attempts_answers_leak: scrub the correct_index / explanation out of
--    every stored quiz_attempt row so users can never recover the answer key.
UPDATE public.quiz_attempts
SET answers = COALESCE((
  SELECT jsonb_agg(
    jsonb_build_object(
      'question_id', elem->'question_id',
      'choice',      elem->'choice',
      'correct',     elem->'correct'
    )
  )
  FROM jsonb_array_elements(answers) elem
), '[]'::jsonb)
WHERE jsonb_typeof(answers) = 'array';

-- 6. quiz_questions_correct_index_exposed: only the server (service_role) may
--    read the answer key. Client (authenticated / anon) sees question + options.
REVOKE SELECT (correct_index, explanation) ON public.quiz_questions FROM authenticated;
REVOKE SELECT (correct_index, explanation) ON public.quiz_questions FROM anon;

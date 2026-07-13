
-- Previous migration's column-level REVOKE ended up stripping table-level SELECT
-- from `authenticated`, so the Library page can no longer read `books`.
-- Re-grant SELECT explicitly on every column except pdf_path, which remains
-- server-only and reachable through the unlock-gated getPdfUrl server fn.

GRANT SELECT (
  id, category_id, title, author, description, cover_url,
  total_pages, display_order, global_order, created_at,
  published, page_count, has_pdf
) ON public.books TO authenticated;

-- Preserve full write access for the app's authenticated policies + admin.
GRANT INSERT, UPDATE, DELETE ON public.books TO authenticated;
GRANT ALL ON public.books TO service_role;

-- Same defense for quiz_questions: re-grant every safe column to authenticated
-- so the quiz page can still read questions + options. correct_index / explanation
-- stay revoked.
GRANT SELECT (id, book_id, question, options, display_order, created_at)
  ON public.quiz_questions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;

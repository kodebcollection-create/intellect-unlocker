
REVOKE ALL ON public.books FROM authenticated, anon;
GRANT SELECT (
  id, category_id, title, author, description, cover_url,
  total_pages, display_order, global_order, created_at,
  published, page_count, has_pdf
) ON public.books TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.books TO authenticated;

REVOKE ALL ON public.quiz_questions FROM authenticated, anon;
GRANT SELECT (id, book_id, question, options, display_order, created_at)
  ON public.quiz_questions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;

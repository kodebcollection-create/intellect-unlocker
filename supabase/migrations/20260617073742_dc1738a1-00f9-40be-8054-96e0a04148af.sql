-- Hide quiz answer key from regular users via column-level grants
REVOKE SELECT ON public.quiz_questions FROM authenticated;
GRANT SELECT (id, book_id, question, options, explanation, display_order, created_at)
  ON public.quiz_questions TO authenticated;
GRANT ALL ON public.quiz_questions TO service_role;

-- Lock down SECURITY DEFINER helpers so signed-in users cannot invoke them directly.
-- Policies still use them because policies execute as the table owner.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_book_unlocked(uuid, uuid) FROM PUBLIC, anon, authenticated;
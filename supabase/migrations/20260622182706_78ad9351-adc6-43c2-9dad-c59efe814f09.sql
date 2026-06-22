-- Restrict column-level SELECT on quiz_questions so the answer key is not exposed to clients.
REVOKE SELECT ON public.quiz_questions FROM authenticated;
GRANT SELECT (id, book_id, question, options, display_order, created_at) ON public.quiz_questions TO authenticated;
-- service_role retains full access for the server admin client used by submitQuiz / generate.
GRANT ALL ON public.quiz_questions TO service_role;
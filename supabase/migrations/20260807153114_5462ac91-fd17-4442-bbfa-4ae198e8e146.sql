CREATE INDEX IF NOT EXISTS bookmarks_user_book_idx ON public.bookmarks (user_id, book_id, page);
CREATE INDEX IF NOT EXISTS highlights_user_book_idx ON public.highlights (user_id, book_id, page);
CREATE INDEX IF NOT EXISTS notes_user_book_idx ON public.notes (user_id, book_id);
CREATE INDEX IF NOT EXISTS quiz_attempts_user_book_idx ON public.quiz_attempts (user_id, book_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vocabulary_user_created_idx ON public.vocabulary (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quiz_questions_book_order_idx ON public.quiz_questions (book_id, display_order);
CREATE INDEX IF NOT EXISTS books_category_order_idx ON public.books (category_id, display_order);
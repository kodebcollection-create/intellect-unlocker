-- Fix: Only require quiz completion for published prior books.
-- Ensures unpublished/draft books don't deadlock reader progress.
CREATE OR REPLACE FUNCTION public.is_book_unlocked(_user_id UUID, _book_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _g INTEGER;
  _unpassed INTEGER;
BEGIN
  SELECT global_order INTO _g FROM public.books WHERE id = _book_id AND published = true;
  IF _g IS NULL THEN RETURN false; END IF;
  IF _g = 1 THEN RETURN true; END IF;
  SELECT COUNT(*) INTO _unpassed
  FROM public.books b
  LEFT JOIN public.user_progress p ON p.book_id = b.id AND p.user_id = _user_id
  WHERE b.global_order < _g AND b.published = true AND COALESCE(p.quiz_passed, false) = false;
  RETURN _unpassed = 0;
END;
$$;

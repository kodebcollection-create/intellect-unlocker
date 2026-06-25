-- Restrict books reads to authenticated users only; non-admins can only see published books.
-- This fixes anonymous enumeration of draft books and their pdf_path values.
DROP POLICY IF EXISTS books_read_all ON public.books;

CREATE POLICY books_read_published ON public.books
  FOR SELECT
  TO authenticated
  USING (
    published = true
    OR public.has_role(auth.uid(), 'admin')
  );

REVOKE SELECT ON public.books FROM anon;
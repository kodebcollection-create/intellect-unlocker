
DROP POLICY IF EXISTS "book_pdfs_admin_select" ON storage.objects;
DROP POLICY IF EXISTS "book_pdfs_admin_insert" ON storage.objects;
DROP POLICY IF EXISTS "book_pdfs_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "book_pdfs_admin_delete" ON storage.objects;

CREATE POLICY "book_pdfs_admin_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'book-pdfs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "book_pdfs_admin_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'book-pdfs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "book_pdfs_admin_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'book-pdfs' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'book-pdfs' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "book_pdfs_admin_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'book-pdfs' AND public.has_role(auth.uid(), 'admin'));

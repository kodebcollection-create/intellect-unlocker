
-- Restrict execute on SECURITY DEFINER fns
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_book_unlocked(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_book_unlocked(UUID, UUID) TO authenticated;

-- Ensure search_path on touch_updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- Storage policies for book-pdfs bucket
CREATE POLICY "book_pdfs_read_auth" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'book-pdfs');
CREATE POLICY "book_pdfs_admin_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'book-pdfs' AND public.is_admin());
CREATE POLICY "book_pdfs_admin_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'book-pdfs' AND public.is_admin());
CREATE POLICY "book_pdfs_admin_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'book-pdfs' AND public.is_admin());

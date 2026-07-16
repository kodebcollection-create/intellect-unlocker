REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_book_unlocked(uuid, uuid) FROM authenticated;

DROP POLICY IF EXISTS book_pdfs_admin_insert ON storage.objects;
DROP POLICY IF EXISTS book_pdfs_admin_update ON storage.objects;
DROP POLICY IF EXISTS book_pdfs_admin_delete ON storage.objects;

CREATE POLICY book_pdfs_admin_insert
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'book-pdfs'
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::public.app_role
  )
);

CREATE POLICY book_pdfs_admin_update
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'book-pdfs'
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::public.app_role
  )
)
WITH CHECK (
  bucket_id = 'book-pdfs'
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::public.app_role
  )
);

CREATE POLICY book_pdfs_admin_delete
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'book-pdfs'
  AND EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'::public.app_role
  )
);
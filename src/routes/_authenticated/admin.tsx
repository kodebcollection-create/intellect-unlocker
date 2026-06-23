import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  generateQuizFromPdf,
  setBookPdfPath,
  deleteBookPdf,
  claimAdminIfFirst,
  updateBookTitle,
  getAdminBooks,
  createBook,
  getPdfUrl,
} from "@/lib/library.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Upload,
  Trash2,
  Sparkles,
  ShieldCheck,
  Pencil,
  Check,
  X,
  RefreshCw,
  Plus,
  AlertTriangle,
  Eye,
  FileWarning,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

const PdfViewer = lazy(() => import("@/components/pdf-viewer"));

const MAX_PDF_BYTES = 50 * 1024 * 1024; // 50 MB

function validatePdf(file: File): string | null {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return `${file.name}: not a PDF file`;
  if (file.size === 0) return `${file.name}: file is empty`;
  if (file.size > MAX_PDF_BYTES)
    return `${file.name}: exceeds 50 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
  return null;
}

export const Route = createFileRoute("/_authenticated/admin")({
  component: Admin,
});

type PreviewState = {
  bookId: string;
  title: string;
  url: string;
  numPages: number | null;
  error: string | null;
};

function Admin() {
  const qc = useQueryClient();
  const setPath = useServerFn(setBookPdfPath);
  const delPdf = useServerFn(deleteBookPdf);
  const genQuiz = useServerFn(generateQuizFromPdf);
  const claim = useServerFn(claimAdminIfFirst);
  const rename = useServerFn(updateBookTitle);
  const fetchAdminBooks = useServerFn(getAdminBooks);
  const createBookFn = useServerFn(createBook);
  const getUrl = useServerFn(getPdfUrl);

  const [busyBookId, setBusyBookId] = useState<string | null>(null);
  const [busyCategory, setBusyCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);

  const { data: me } = useQuery({
    queryKey: ["admin-check"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user!.id)
        .eq("role", "admin")
        .maybeSingle();
      return { isAdmin: !!data, user: u.user };
    },
  });

  const {
    data: books,
    refetch,
    isLoading: booksLoading,
    error: booksError,
  } = useQuery({
    queryKey: ["admin-books"],
    queryFn: async () => fetchAdminBooks(),
    enabled: !!me?.isAdmin,
  });

  const { data: categories } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!me?.isAdmin,
  });

  if (!me) return <div className="text-muted-foreground">Loading…</div>;
  if (!me.isAdmin) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-border bg-card p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-primary" />
        <h1 className="mt-4 font-display text-2xl">Admin access required</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          If you're the first user setting up this library, you can claim admin rights now.
        </p>
        <Button
          className="mt-4"
          onClick={async () => {
            try {
              const r = await claim();
              if (r.granted) {
                toast.success("You are now admin");
                qc.invalidateQueries();
              } else toast.error(r.reason);
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
        >
          Claim admin rights
        </Button>
      </div>
    );
  }

  const openPreview = async (bookId: string, title: string) => {
    try {
      const book = (books ?? []).find((b: any) => b.id === bookId);
      if (!book?.pdf_path) {
        toast.error("No PDF on this book yet");
        return;
      }
      const { url } = await getUrl({ data: { path: book.pdf_path } });
      setPreview({ bookId, title, url, numPages: null, error: null });
    } catch (e: any) {
      toast.error(`Could not load preview: ${e.message}`);
    }
  };

  const uploadOne = async (
    bookId: string,
    file: File,
    opts: { openPreviewAfter?: boolean; title?: string } = {},
  ) => {
    const validationError = validatePdf(file);
    if (validationError) {
      toast.error(validationError);
      return false;
    }
    try {
      const path = `${bookId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("book-pdfs")
        .upload(path, file, { upsert: true, contentType: "application/pdf" });
      if (upErr) throw upErr;
      await setPath({ data: { book_id: bookId, pdf_path: path } });
      toast.success(`Uploaded: ${file.name}`);
      if (opts.openPreviewAfter) {
        const { url } = await getUrl({ data: { path } });
        setPreview({
          bookId,
          title: opts.title ?? file.name,
          url,
          numPages: null,
          error: null,
        });
      }
      return true;
    } catch (e: any) {
      toast.error(`Failed: ${file.name} — ${e.message}`);
      return false;
    }
  };

  const replacePdf = async (bookId: string, file: File) => {
    setBusyBookId(bookId);
    const ok = await uploadOne(bookId, file, {
      openPreviewAfter: true,
      title: file.name,
    });
    if (ok) refetch();
    setBusyBookId(null);
  };

  const uploadNewBooks = async (categoryId: string, files: FileList) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusyCategory(categoryId);

    // Pre-validate everything so we can warn about all rejects up front.
    const valid: File[] = [];
    for (const f of list) {
      const err = validatePdf(f);
      if (err) toast.error(err);
      else valid.push(f);
    }

    let succeeded = 0;
    let firstNewBookId: string | null = null;
    let firstNewTitle = "";
    for (const file of valid) {
      const title = file.name.replace(/\.pdf$/i, "").trim() || "Untitled";
      try {
        const { id } = await createBookFn({
          data: { category_id: categoryId, title },
        });
        const ok = await uploadOne(id, file, { openPreviewAfter: false });
        if (ok) {
          succeeded++;
          if (!firstNewBookId) {
            firstNewBookId = id;
            firstNewTitle = title;
          }
        }
      } catch (e: any) {
        toast.error(`Could not create book "${title}": ${e.message}`);
      }
    }

    setBusyCategory(null);
    if (succeeded > 0) {
      toast.success(
        `${succeeded} of ${list.length} PDF${list.length === 1 ? "" : "s"} added`,
      );
      await refetch();
      // Auto-open preview on the first new upload so the admin can validate render.
      if (firstNewBookId) {
        await openPreview(firstNewBookId, firstNewTitle);
      }
    }
  };

  const removePdf = async (bookId: string) => {
    if (!confirm("Remove this PDF?")) return;
    setBusyBookId(bookId);
    try {
      await delPdf({ data: { book_id: bookId } });
      toast.success("Removed");
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
    setBusyBookId(null);
  };

  const generate = async (bookId: string) => {
    setBusyBookId(bookId);
    try {
      const r = await genQuiz({ data: { book_id: bookId } });
      toast.success(`Generated ${r.count} questions`);
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
    setBusyBookId(null);
  };

  const saveTitle = async () => {
    if (!editing) return;
    try {
      await rename({
        data: { book_id: editing.id, title: editing.title.trim() },
      });
      toast.success("Title updated");
      setEditing(null);
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Group books by category id (so we can target the right category for "Add").
  const grouped: Record<string, { name: string; items: any[] }> = {};
  (books ?? []).forEach((b: any) => {
    const id = b.category_id ?? "uncategorized";
    const name = b.categories?.name ?? "Uncategorized";
    grouped[id] ??= { name, items: [] };
    grouped[id].items.push(b);
  });
  // Ensure all categories show up even when empty.
  (categories ?? []).forEach((c) => {
    grouped[c.id] ??= { name: c.name, items: [] };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">Admin dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Add books to each category, upload PDFs, preview them, then generate the AI quiz.
        </p>
      </div>

      {booksLoading && (
        <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Loading books…
        </div>
      )}

      {booksError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1">
              <div className="font-medium text-destructive">
                Couldn't load the book list
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {(booksError as Error).message ||
                  "An admin-only request failed. Upload controls will appear after the list loads."}
              </p>
              <Button
                className="mt-3"
                size="sm"
                variant="outline"
                onClick={() => refetch()}
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          </div>
        </div>
      )}

      {!booksLoading && !booksError && (books ?? []).length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <FileWarning className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-3 font-display text-lg">No books yet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the <span className="font-medium">Upload PDFs</span> button on any category below to add your first books.
          </p>
        </div>
      )}

      {Object.entries(grouped).map(([catId, { name, items }]) => (
        <section key={catId} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl text-primary">{name}</h2>
            {catId !== "uncategorized" && (
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="hidden"
                  disabled={busyCategory === catId}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length) {
                      uploadNewBooks(catId, e.target.files);
                    }
                    e.target.value = "";
                  }}
                />
                <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90">
                  {busyCategory === catId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Upload PDFs
                </span>
              </label>
            )}
          </div>

          {items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-card/50 p-4 text-sm text-muted-foreground">
              No books in this category yet. Click <span className="font-medium">Upload PDFs</span> to add some.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((b: any) => (
                <div
                  key={b.id}
                  className="grid grid-cols-1 items-start gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[60px_1fr_auto] md:items-center"
                >
                  <div className="font-mono text-xs text-muted-foreground md:text-sm">
                    #{String(b.global_order).padStart(2, "0")}
                  </div>
                  <div className="min-w-0">
                    {editing?.id === b.id ? (
                      (() => {
                        const ed = editing!;
                        return (
                          <div className="flex items-center gap-2">
                            <Input
                              value={ed.title}
                              onChange={(e) =>
                                setEditing({ id: ed.id, title: e.target.value })
                              }
                              autoFocus
                              onKeyDown={(e) => e.key === "Enter" && saveTitle()}
                            />
                            <Button size="icon" variant="ghost" onClick={saveTitle}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditing(null)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        );
                      })()
                    ) : (
                      <div className="flex items-center gap-2">
                        <div className="font-display text-base truncate sm:text-lg">
                          {b.title}
                        </div>
                        <button
                          onClick={() => setEditing({ id: b.id, title: b.title })}
                          className="text-muted-foreground hover:text-foreground"
                          title="Rename"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      {b.pdf_path ? "✓ PDF uploaded" : "No PDF yet"} ·{" "}
                      {b.quiz_questions?.[0]?.count ?? 0} quiz questions
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        disabled={busyBookId === b.id}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) replacePdf(b.id, f);
                          e.target.value = "";
                        }}
                      />
                      <span className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:opacity-90">
                        <Upload className="h-4 w-4" />
                        {b.pdf_path ? "Replace" : "Upload PDF"}
                      </span>
                    </label>
                    {b.pdf_path && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyBookId === b.id}
                          onClick={() => openPreview(b.id, b.title)}
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyBookId === b.id}
                          onClick={() => generate(b.id)}
                        >
                          <Sparkles className="mr-1 h-4 w-4" />
                          Generate quiz
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyBookId === b.id}
                          onClick={() => removePdf(b.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}

      <Dialog
        open={!!preview}
        onOpenChange={(o) => {
          if (!o) setPreview(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">
              Preview: {preview?.title}
            </DialogTitle>
            <DialogDescription>
              Confirm the PDF renders correctly before generating the quiz or sharing
              with readers.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="max-h-[65vh] overflow-auto rounded border border-border bg-muted/30 p-2">
              {preview.error ? (
                <div className="p-6 text-center text-sm text-destructive">
                  <AlertTriangle className="mx-auto h-6 w-6" />
                  <p className="mt-2">PDF failed to render: {preview.error}</p>
                  <p className="mt-1 text-muted-foreground">
                    Try re-uploading the file or use a different PDF.
                  </p>
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div className="p-10 text-center text-sm text-muted-foreground">
                      Loading preview…
                    </div>
                  }
                >
                  <PdfViewer
                    file={{ url: preview.url }}
                    page={1}
                    width={640}
                    onLoadSuccess={(n) =>
                      setPreview((p) =>
                        p ? { ...p, numPages: n, error: null } : p,
                      )
                    }
                    onLoadError={(msg) =>
                      setPreview((p) => (p ? { ...p, error: msg } : p))
                    }
                    fallbackUrl={preview.url}
                  />
                </Suspense>
              )}
            </div>
          )}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {preview?.numPages
                ? `✓ Rendered successfully — ${preview.numPages} pages detected`
                : preview?.error
                ? "✗ Render failed — please replace the PDF"
                : "Rendering…"}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreview(null)}>
                Close
              </Button>
              {preview && preview.numPages && !preview.error && (
                <Button
                  onClick={() => {
                    toast.success("Looks good — ready to publish");
                    setPreview(null);
                  }}
                >
                  <Check className="mr-1 h-4 w-4" />
                  Confirm
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { generateQuizFromPdf, setBookPdfPath, deleteBookPdf, claimAdminIfFirst, updateBookTitle } from "@/lib/library.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, Trash2, Sparkles, ShieldCheck, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: Admin,
});

function Admin() {
  const qc = useQueryClient();
  const setPath = useServerFn(setBookPdfPath);
  const delPdf = useServerFn(deleteBookPdf);
  const genQuiz = useServerFn(generateQuizFromPdf);
  const claim = useServerFn(claimAdminIfFirst);
  const rename = useServerFn(updateBookTitle);
  const [busyBookId, setBusyBookId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);

  const { data: me } = useQuery({
    queryKey: ["admin-check"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user!.id).eq("role", "admin").maybeSingle();
      return { isAdmin: !!data, user: u.user };
    },
  });

  const { data: books, refetch } = useQuery({
    queryKey: ["admin-books"],
    queryFn: async () => {
      const { data } = await supabase.from("books").select("*, categories(name), quiz_questions(count)").order("global_order");
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
        <p className="mt-2 text-sm text-muted-foreground">If you're the first user setting up this library, you can claim admin rights now.</p>
        <Button className="mt-4" onClick={async () => {
          try { const r = await claim(); if (r.granted) { toast.success("You are now admin"); qc.invalidateQueries(); } else toast.error(r.reason); }
          catch (e: any) { toast.error(e.message); }
        }}>Claim admin rights</Button>
      </div>
    );
  }

  const upload = async (bookId: string, file: File) => {
    setBusyBookId(bookId);
    try {
      const path = `${bookId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("book-pdfs").upload(path, file, { upsert: true, contentType: "application/pdf" });
      if (upErr) throw upErr;
      await setPath({ data: { book_id: bookId, pdf_path: path } });
      toast.success("PDF uploaded");
      refetch();
    } catch (e: any) { toast.error(e.message); }
    setBusyBookId(null);
  };

  const removePdf = async (bookId: string) => {
    if (!confirm("Remove this PDF?")) return;
    setBusyBookId(bookId);
    try { await delPdf({ data: { book_id: bookId } }); toast.success("Removed"); refetch(); }
    catch (e: any) { toast.error(e.message); }
    setBusyBookId(null);
  };

  const generate = async (bookId: string) => {
    setBusyBookId(bookId);
    try {
      const r = await genQuiz({ data: { book_id: bookId } });
      toast.success(`Generated ${r.count} questions`);
      refetch();
    } catch (e: any) { toast.error(e.message); }
    setBusyBookId(null);
  };

  const saveTitle = async () => {
    if (!editing) return;
    try {
      await rename({ data: { book_id: editing.id, title: editing.title.trim() } });
      toast.success("Title updated");
      setEditing(null);
      refetch();
    } catch (e: any) { toast.error(e.message); }
  };

  // Group by category
  const grouped = (books ?? []).reduce((acc: Record<string, any[]>, b: any) => {
    const k = b.categories?.name ?? "Uncategorized";
    (acc[k] ??= []).push(b);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl">Admin dashboard</h1>
        <p className="mt-1 text-muted-foreground">Upload a PDF for each book, rename books, then generate the AI quiz.</p>
      </div>
      {Object.entries(grouped).map(([cat, items]) => (
        <section key={cat} className="space-y-2">
          <h2 className="font-display text-xl text-primary">{cat}</h2>
          <div className="space-y-2">
            {items.map((b: any) => (
              <div key={b.id} className="grid grid-cols-1 items-center gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[60px_1fr_auto]">
                <div className="font-mono text-sm text-muted-foreground">#{String(b.global_order).padStart(2, "0")}</div>
                <div className="min-w-0">
                  {editing?.id === b.id ? (
                    <div className="flex items-center gap-2">
                      <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} autoFocus onKeyDown={(e) => e.key === "Enter" && saveTitle()} />
                      <Button size="icon" variant="ghost" onClick={saveTitle}><Check className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="font-display text-lg truncate">{b.title}</div>
                      <button onClick={() => setEditing({ id: b.id, title: b.title })} className="text-muted-foreground hover:text-foreground" title="Rename">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">{b.pdf_path ? "✓ PDF uploaded" : "No PDF yet"} · {b.quiz_questions?.[0]?.count ?? 0} quiz questions</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer">
                    <input type="file" accept="application/pdf" className="hidden" disabled={busyBookId === b.id} onChange={(e) => e.target.files?.[0] && upload(b.id, e.target.files[0])} />
                    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"><Upload className="h-4 w-4" />{b.pdf_path ? "Replace PDF" : "Upload PDF"}</span>
                  </label>
                  {b.pdf_path && (
                    <>
                      <Button size="sm" variant="outline" disabled={busyBookId === b.id} onClick={() => generate(b.id)}>
                        <Sparkles className="mr-1 h-4 w-4" />Generate quiz
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyBookId === b.id} onClick={() => removePdf(b.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPdfUrl, saveProgress, markBookComplete } from "@/lib/library.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bookmark, Highlighter, NotebookPen, ArrowLeft, ArrowRight, Settings2, BookMarked, ChevronLeft, GraduationCap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/read/$bookId")({
  ssr: false,
  component: Reader,
});

function Reader() {
  const { bookId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const fetchPdfUrl = useServerFn(getPdfUrl);
  const persistProgress = useServerFn(saveProgress);
  const finishBook = useServerFn(markBookComplete);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState<number | "">("");
  const [fontSize, setFontSize] = useState(16);
  const [highlightText, setHighlightText] = useState("");
  const [highlightColor, setHighlightColor] = useState("yellow");
  const [noteText, setNoteText] = useState("");
  const [vocabWord, setVocabWord] = useState("");
  const [vocabDef, setVocabDef] = useState("");

  const { data: book } = useQuery({
    queryKey: ["book", bookId],
    queryFn: async () => {
      const { data, error } = await supabase.from("books").select("*, categories(name)").eq("id", bookId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: progress } = useQuery({
    queryKey: ["progress", bookId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("user_progress").select("*").eq("user_id", u.user!.id).eq("book_id", bookId).maybeSingle();
      return data;
    },
  });

  const { data: bookmarks, refetch: refetchBookmarks } = useQuery({
    queryKey: ["bookmarks", bookId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("bookmarks").select("*").eq("user_id", u.user!.id).eq("book_id", bookId).order("page");
      return data ?? [];
    },
  });
  const { data: highlights, refetch: refetchHighlights } = useQuery({
    queryKey: ["highlights", bookId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("highlights").select("*").eq("user_id", u.user!.id).eq("book_id", bookId).order("page");
      return data ?? [];
    },
  });
  const { data: notes, refetch: refetchNotes } = useQuery({
    queryKey: ["notes", bookId],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("notes").select("*").eq("user_id", u.user!.id).eq("book_id", bookId).order("page");
      return data ?? [];
    },
  });

  // Load PDF + initial state
  useEffect(() => {
    if (!book) return;
    if (progress) { setPage(progress.current_page); if (progress.total_pages) setTotalPages(progress.total_pages); }
    if (book.pdf_path) {
      fetchPdfUrl({ data: { path: book.pdf_path } }).then(r => setPdfUrl(r.url)).catch((e) => toast.error(e.message));
    }
  }, [book, progress, fetchPdfUrl]);

  // Auto-save on page change (debounced)
  const debouncedSave = useCallback((p: number, tp?: number) => {
    persistProgress({ data: { book_id: bookId, current_page: p, total_pages: tp } }).catch(() => {});
  }, [bookId, persistProgress]);

  useEffect(() => {
    const t = setTimeout(() => debouncedSave(page, typeof totalPages === "number" ? totalPages : undefined), 800);
    return () => clearTimeout(t);
  }, [page, totalPages, debouncedSave]);

  const addBookmark = async () => {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("bookmarks").insert({ user_id: u.user!.id, book_id: bookId, page, label: `Page ${page}` });
    refetchBookmarks(); toast.success("Bookmarked");
  };
  const saveHighlight = async () => {
    if (!highlightText.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("highlights").insert({ user_id: u.user!.id, book_id: bookId, page, text: highlightText, color: highlightColor });
    setHighlightText(""); refetchHighlights(); toast.success("Highlight saved");
  };
  const saveNote = async () => {
    if (!noteText.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("notes").insert({ user_id: u.user!.id, book_id: bookId, page, content: noteText });
    setNoteText(""); refetchNotes(); toast.success("Note saved");
  };
  const saveVocab = async () => {
    if (!vocabWord.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("vocabulary").insert({ user_id: u.user!.id, book_id: bookId, word: vocabWord, definition: vocabDef });
    setVocabWord(""); setVocabDef(""); toast.success("Added to vocabulary");
  };
  const finish = async () => {
    await finishBook({ data: { book_id: bookId } });
    qc.invalidateQueries({ queryKey: ["progress", bookId] });
    nav({ to: "/quiz/$bookId", params: { bookId } });
  };

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link to="/library"><Button variant="ghost" size="icon"><ChevronLeft className="h-4 w-4" /></Button></Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg">{book?.title ?? "Loading…"}</h1>
            <p className="text-xs text-muted-foreground">{(book as any)?.categories?.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={addBookmark} title="Bookmark page"><Bookmark className="h-4 w-4" /></Button>
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon"><Settings2 className="h-4 w-4" /></Button></SheetTrigger>
            <SheetContent>
              <SheetHeader><SheetTitle>Reader settings</SheetTitle></SheetHeader>
              <div className="mt-6 space-y-6">
                <div>
                  <Label>Font size: {fontSize}px</Label>
                  <Slider value={[fontSize]} min={12} max={24} step={1} onValueChange={(v) => setFontSize(v[0])} className="mt-2" />
                </div>
                <div>
                  <Label>Total pages (for offline reading)</Label>
                  <Input type="number" min={1} value={totalPages} onChange={(e) => setTotalPages(e.target.value ? Number(e.target.value) : "")} />
                  <p className="mt-1 text-xs text-muted-foreground">Enter the page number you're on to track progress offline.</p>
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <Button onClick={finish} variant="secondary"><GraduationCap className="mr-2 h-4 w-4" />Finish & quiz</Button>
        </div>
      </header>

      <div className="grid flex-1 gap-0 md:grid-cols-[1fr_360px]">
        {/* PDF viewer / Offline tracker */}
        <div className="flex flex-col" style={{ fontSize }}>
          {pdfUrl ? (
            <iframe title="PDF" src={`${pdfUrl}#page=${page}`} className="h-[calc(100vh-64px)] w-full bg-card" />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
              <BookMarked className="h-12 w-12 text-muted-foreground" />
              <h2 className="mt-4 font-display text-2xl">No PDF uploaded yet</h2>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">You can still track your reading by entering the page number you're on (offline mode). An admin can upload the book PDF in the dashboard.</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 border-t border-border bg-card px-4 py-3">
            <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, page - 1))}><ArrowLeft className="mr-1 h-4 w-4" />Prev</Button>
            <div className="flex items-center gap-2">
              <Label htmlFor="pg" className="text-xs text-muted-foreground">Page</Label>
              <Input id="pg" type="number" min={1} value={page} onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))} className="w-20 text-center" />
              {totalPages && <span className="text-sm text-muted-foreground">/ {totalPages}</span>}
            </div>
            <Button variant="outline" size="sm" onClick={() => setPage(page + 1)}>Next<ArrowRight className="ml-1 h-4 w-4" /></Button>
          </div>
        </div>

        {/* Sidebar */}
        <aside className="border-l border-border bg-card/40">
          <Tabs defaultValue="highlight" className="h-full">
            <TabsList className="m-3 grid grid-cols-4">
              <TabsTrigger value="highlight"><Highlighter className="h-4 w-4" /></TabsTrigger>
              <TabsTrigger value="note"><NotebookPen className="h-4 w-4" /></TabsTrigger>
              <TabsTrigger value="bookmark"><Bookmark className="h-4 w-4" /></TabsTrigger>
              <TabsTrigger value="vocab">Aa</TabsTrigger>
            </TabsList>

            <TabsContent value="highlight" className="space-y-3 px-4">
              <Label>Highlight text from page {page}</Label>
              <Textarea value={highlightText} onChange={(e) => setHighlightText(e.target.value)} placeholder="Paste or type the passage you want to remember…" rows={3} />
              <div className="flex gap-2">
                {["yellow", "green", "blue", "pink"].map(c => (
                  <button key={c} onClick={() => setHighlightColor(c)} className={`h-6 w-6 rounded-full border-2 ${highlightColor === c ? "border-primary" : "border-transparent"}`} style={{ background: c }} />
                ))}
                <Button size="sm" className="ml-auto" onClick={saveHighlight}>Save</Button>
              </div>
              <div className="mt-4 space-y-2">
                {highlights?.map((h: any) => (
                  <div key={h.id} className="rounded-md border border-border bg-background p-2 text-xs">
                    <div className="mb-1 flex justify-between text-muted-foreground">
                      <span>p. {h.page}</span><span style={{ color: h.color }}>●</span>
                    </div>
                    <p>{h.text}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="note" className="space-y-3 px-4">
              <Label>Note on page {page}</Label>
              <Textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} rows={3} placeholder="Your thoughts…" />
              <Button size="sm" onClick={saveNote}>Save note</Button>
              <div className="mt-4 space-y-2">
                {notes?.map((n: any) => (
                  <div key={n.id} className="rounded-md border border-border bg-background p-2 text-xs">
                    <div className="mb-1 text-muted-foreground">p. {n.page}</div>
                    <p>{n.content}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="bookmark" className="space-y-3 px-4">
              <Button size="sm" onClick={addBookmark} className="w-full">Bookmark current page ({page})</Button>
              <div className="space-y-1">
                {bookmarks?.map((b: any) => (
                  <button key={b.id} onClick={() => setPage(b.page)} className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent">
                    <span>{b.label}</span><span className="text-muted-foreground">→</span>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="vocab" className="space-y-3 px-4">
              <Label>Word</Label>
              <Input value={vocabWord} onChange={(e) => setVocabWord(e.target.value)} />
              <Label>Definition</Label>
              <Textarea value={vocabDef} onChange={(e) => setVocabDef(e.target.value)} rows={3} />
              <Button size="sm" onClick={saveVocab}>Add to vocabulary</Button>
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}

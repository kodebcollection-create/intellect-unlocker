import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPdfUrl, saveProgress, markBookComplete } from "@/lib/library.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bookmark, Highlighter, NotebookPen, ArrowLeft, ArrowRight, Settings2, BookMarked, ChevronLeft, GraduationCap, PanelRight, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Use bundled worker (works on mobile + desktop, no external CDN).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

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
  const [numPages, setNumPages] = useState<number | null>(null);
  const [fontSize, setFontSize] = useState(16);
  const [highlightText, setHighlightText] = useState("");
  const [highlightColor, setHighlightColor] = useState("yellow");
  const [noteText, setNoteText] = useState("");
  const [vocabWord, setVocabWord] = useState("");
  const [vocabDef, setVocabDef] = useState("");
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!book) return;
    if (progress?.current_page) setPage(progress.current_page);
    if (book.pdf_path) {
      fetchPdfUrl({ data: { path: book.pdf_path } }).then(r => setPdfUrl(r.url)).catch((e) => toast.error(e.message));
    }
  }, [book, progress, fetchPdfUrl]);

  // Track viewer width for responsive PDF sizing.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setContainerWidth(Math.floor(e.contentRect.width));
    });
    ro.observe(el);
    setContainerWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [pdfUrl]);

  const debouncedSave = useCallback((p: number, tp?: number) => {
    persistProgress({ data: { book_id: bookId, current_page: p, total_pages: tp } }).catch(() => {});
  }, [bookId, persistProgress]);

  useEffect(() => {
    const t = setTimeout(() => debouncedSave(page, numPages ?? undefined), 800);
    return () => clearTimeout(t);
  }, [page, numPages, debouncedSave]);

  const addBookmark = async () => {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("bookmarks").insert({ user_id: u.user!.id, book_id: bookId, page, label: `Page ${page}` });
    refetchBookmarks(); toast.success(`Bookmarked page ${page}`);
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

  const fileProp = useMemo(() => (pdfUrl ? { url: pdfUrl } : null), [pdfUrl]);

  const Sidebar = (
    <Tabs defaultValue="highlight" className="h-full">
      <TabsList className="m-3 grid grid-cols-4">
        <TabsTrigger value="highlight"><Highlighter className="h-4 w-4" /></TabsTrigger>
        <TabsTrigger value="note"><NotebookPen className="h-4 w-4" /></TabsTrigger>
        <TabsTrigger value="bookmark"><Bookmark className="h-4 w-4" /></TabsTrigger>
        <TabsTrigger value="vocab">Aa</TabsTrigger>
      </TabsList>

      <TabsContent value="highlight" className="space-y-3 px-4">
        <Label>Highlight from page {page}</Label>
        <Textarea value={highlightText} onChange={(e) => setHighlightText(e.target.value)} placeholder="Paste or type the passage…" rows={3} />
        <div className="flex flex-wrap items-center gap-2">
          {["yellow", "green", "blue", "pink"].map(c => (
            <button key={c} onClick={() => setHighlightColor(c)} className={`h-6 w-6 rounded-full border-2 ${highlightColor === c ? "border-primary" : "border-transparent"}`} style={{ background: c }} />
          ))}
          <Button size="sm" className="ml-auto" onClick={saveHighlight}>Save</Button>
        </div>
        <div className="mt-4 space-y-2">
          {highlights?.map((h: any) => (
            <div key={h.id} className="rounded-md border border-border bg-background p-2 text-xs">
              <div className="mb-1 flex justify-between text-muted-foreground"><span>p. {h.page}</span><span style={{ color: h.color }}>●</span></div>
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
        <Button size="sm" onClick={addBookmark} className="w-full">Bookmark page {page}</Button>
        <div className="space-y-1">
          {bookmarks?.map((b: any) => (
            <button key={b.id} onClick={() => setPage(b.page)} className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-accent">
              <span>{b.label}</span><span className="text-muted-foreground">→</span>
            </button>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="vocab" className="space-y-3 px-4">
        <p className="text-xs text-muted-foreground">Tip: select a word on this page and click <em>Use selection</em>.</p>
        <Button size="sm" variant="outline" className="w-full" onClick={() => {
          const sel = typeof window !== "undefined" ? window.getSelection()?.toString().trim() : "";
          if (!sel) { toast.error("Highlight a word or phrase first"); return; }
          setVocabWord(sel);
        }}>Use selection</Button>
        <Label>Word</Label>
        <Input value={vocabWord} onChange={(e) => setVocabWord(e.target.value)} placeholder="e.g. reciprocity" />
        <Label>Definition / context</Label>
        <Textarea value={vocabDef} onChange={(e) => setVocabDef(e.target.value)} rows={3} placeholder="What it means…" />
        <Button size="sm" onClick={saveVocab} className="w-full">Add to vocabulary</Button>
      </TabsContent>
    </Tabs>
  );

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
        <div className="flex items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
          <Link to="/library"><Button variant="ghost" size="icon"><ChevronLeft className="h-4 w-4" /></Button></Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-base sm:text-lg">{book?.title ?? "Loading…"}</h1>
            <p className="truncate text-xs text-muted-foreground">{(book as any)?.categories?.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={addBookmark} title={`Bookmark page ${page}`}><Bookmark className="h-4 w-4" /></Button>
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon" title="Reader settings"><Settings2 className="h-4 w-4" /></Button></SheetTrigger>
            <SheetContent>
              <SheetHeader><SheetTitle>Reader settings</SheetTitle></SheetHeader>
              <div className="mt-6 space-y-6">
                <div>
                  <Label>Font size: {fontSize}px</Label>
                  <Slider value={[fontSize]} min={12} max={24} step={1} onValueChange={(v) => setFontSize(v[0])} className="mt-2" />
                </div>
                {pdfUrl && (
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary underline">
                    <ExternalLink className="h-4 w-4" />Open PDF in new tab
                  </a>
                )}
              </div>
            </SheetContent>
          </Sheet>
          {/* Mobile notes panel */}
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon" className="md:hidden" title="Notes & tools"><PanelRight className="h-4 w-4" /></Button></SheetTrigger>
            <SheetContent side="right" className="w-[88vw] max-w-md overflow-y-auto p-0">
              <SheetHeader className="px-4 pt-4"><SheetTitle>Notes & tools</SheetTitle></SheetHeader>
              <div className="pb-6">{Sidebar}</div>
            </SheetContent>
          </Sheet>
          <Button onClick={finish} variant="secondary" size="sm" className="shrink-0">
            <GraduationCap className="mr-1 h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Finish & quiz</span>
            <span className="sm:hidden">Quiz</span>
          </Button>
        </div>
      </header>

      <div className="grid flex-1 gap-0 md:grid-cols-[1fr_360px]">
        {/* PDF viewer */}
        <div className="flex min-w-0 flex-col" style={{ fontSize }}>
          <div ref={containerRef} className="flex flex-1 justify-center overflow-auto bg-muted/30 p-2 sm:p-4">
            {fileProp ? (
              <Document
                file={fileProp}
                onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                onLoadError={(err) => toast.error(`Failed to load PDF: ${err.message}`)}
                loading={<div className="p-10 text-center text-sm text-muted-foreground">Loading PDF…</div>}
                error={
                  <div className="p-6 text-center text-sm">
                    <p className="text-destructive">Could not render the PDF inline.</p>
                    {pdfUrl && <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-primary underline">Open it in a new tab</a>}
                  </div>
                }
              >
                <Page
                  pageNumber={page}
                  width={Math.max(280, Math.min(containerWidth - 16, 900))}
                  renderTextLayer
                  renderAnnotationLayer={false}
                />
              </Document>
            ) : book && !book.pdf_path ? (
              <div className="flex flex-1 flex-col items-center justify-center p-10 text-center">
                <BookMarked className="h-12 w-12 text-muted-foreground" />
                <h2 className="mt-4 font-display text-2xl">No PDF uploaded yet</h2>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">An admin can upload the book PDF in the dashboard.</p>
              </div>
            ) : (
              <div className="p-10 text-center text-sm text-muted-foreground">Loading…</div>
            )}
          </div>

          <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-border bg-card px-3 py-2 sm:px-4 sm:py-3">
            <Button variant="outline" size="sm" onClick={() => setPage(Math.max(1, page - 1))}><ArrowLeft className="h-4 w-4 sm:mr-1" /><span className="hidden sm:inline">Prev</span></Button>
            <div className="flex items-center gap-2">
              <Label htmlFor="pg" className="text-xs text-muted-foreground">Page</Label>
              <Input id="pg" type="number" min={1} max={numPages ?? undefined} value={page} onChange={(e) => setPage(Math.max(1, Number(e.target.value) || 1))} className="w-16 text-center sm:w-20" />
              {numPages && <span className="text-sm text-muted-foreground">/ {numPages}</span>}
            </div>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => (numPages ? Math.min(numPages, p + 1) : p + 1))}><span className="hidden sm:inline">Next</span><ArrowRight className="h-4 w-4 sm:ml-1" /></Button>
          </div>
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden border-l border-border bg-card/40 md:block">{Sidebar}</aside>
      </div>
    </div>
  );
}

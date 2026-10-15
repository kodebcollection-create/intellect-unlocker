import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import { getPdfUrl, saveProgress, markBookComplete, getBookDetails, askSocraticTutor } from "@/lib/library.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bookmark, Highlighter, NotebookPen, ArrowLeft, ArrowRight, Settings2, BookMarked, ChevronLeft, GraduationCap, PanelRight, ExternalLink, Sparkles, ScrollText, Send, Bot, User, BookOpen } from "lucide-react";
import { toast } from "sonner";

// react-pdf/pdfjs-dist reference browser globals (DOMMatrix) at module scope.
// Lazy-load so the module never evaluates during SSR/build prerender.
const PdfViewer = lazy(() => import("@/components/pdf-viewer"));

export const Route = createFileRoute("/_authenticated/read/$bookId")({
  ssr: false,
  component: Reader,
});

function Reader() {
  const { bookId } = Route.useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const fetchPdfUrl = useServerFn(getPdfUrl);
  const fetchBookDetails = useServerFn(getBookDetails);
  const persistProgress = useServerFn(saveProgress);
  const finishBook = useServerFn(markBookComplete);
  const callSocraticTutor = useServerFn(askSocraticTutor);

  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(100);
  const [viewMode, setViewMode] = useState<"single" | "continuous">("single");
  const [highlightText, setHighlightText] = useState("");
  const [highlightColor, setHighlightColor] = useState("yellow");
  const [noteText, setNoteText] = useState("");
  const [vocabWord, setVocabWord] = useState("");
  const [vocabDef, setVocabDef] = useState("");
  const [containerWidth, setContainerWidth] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Socratic AI Tutor states
  const [socraticQuestion, setSocraticQuestion] = useState("");
  const [socraticPassage, setSocraticPassage] = useState("");
  const [socraticLoading, setSocraticLoading] = useState(false);
  const [socraticMessages, setSocraticMessages] = useState<Array<{
    role: "user" | "assistant";
    content: string;
    passage?: string;
  }>>([]);

  const { data: book } = useQuery({
    queryKey: ["book", bookId],
    queryFn: async () => fetchBookDetails({ data: { book_id: bookId } }),
  });

  const { data: progress } = useQuery({
    queryKey: ["progress", bookId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("user_progress").select("*").eq("user_id", user!.id).eq("book_id", bookId).maybeSingle();
      return data;
    },
  });

  const { data: bookmarks, refetch: refetchBookmarks } = useQuery({
    queryKey: ["bookmarks", bookId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("bookmarks").select("*").eq("user_id", user!.id).eq("book_id", bookId).order("page");
      return data ?? [];
    },
  });
  const { data: highlights, refetch: refetchHighlights } = useQuery({
    queryKey: ["highlights", bookId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("highlights").select("*").eq("user_id", user!.id).eq("book_id", bookId).order("page");
      return data ?? [];
    },
  });
  const { data: notes, refetch: refetchNotes } = useQuery({
    queryKey: ["notes", bookId, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("notes").select("*").eq("user_id", user!.id).eq("book_id", bookId).order("page");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!book) return;
    if (progress?.current_page) setPage(progress.current_page);
    if (book.has_pdf) {
      fetchPdfUrl({ data: { book_id: bookId } }).then(r => setPdfUrl(r.url)).catch((e) => toast.error(e.message));
    }
  }, [book, progress, fetchPdfUrl, bookId]);

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

  // Keyboard navigation for page turning
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key === "ArrowLeft") {
        setPage((p) => Math.max(1, p - 1));
      } else if (e.key === "ArrowRight") {
        setPage((p) => (numPages ? Math.min(numPages, p + 1) : p + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [numPages]);

  const debouncedSave = useCallback((p: number, tp?: number) => {
    persistProgress({ data: { book_id: bookId, current_page: p, total_pages: tp } }).catch(() => {});
  }, [bookId, persistProgress]);

  useEffect(() => {
    const t = setTimeout(() => debouncedSave(page, numPages ?? undefined), 800);
    return () => clearTimeout(t);
  }, [page, numPages, debouncedSave]);

  const addBookmark = async () => {
    if (!user) return;
    await supabase.from("bookmarks").insert({ user_id: user.id, book_id: bookId, page, label: `Page ${page}` });
    refetchBookmarks(); toast.success(`Bookmarked page ${page}`);
  };
  const saveHighlight = async () => {
    if (!highlightText.trim() || !user) return;
    await supabase.from("highlights").insert({ user_id: user.id, book_id: bookId, page, text: highlightText, color: highlightColor });
    setHighlightText(""); refetchHighlights(); toast.success("Highlight saved");
  };
  const saveNote = async () => {
    if (!noteText.trim() || !user) return;
    await supabase.from("notes").insert({ user_id: user.id, book_id: bookId, page, content: noteText });
    setNoteText(""); refetchNotes(); toast.success("Note saved");
  };
  const saveVocab = async () => {
    if (!vocabWord.trim() || !user) return;
    await supabase.from("vocabulary").insert({ user_id: user.id, book_id: bookId, word: vocabWord, definition: vocabDef });
    setVocabWord(""); setVocabDef(""); toast.success("Added to vocabulary");
  };
  const finish = async () => {
    await finishBook({ data: { book_id: bookId } });
    qc.invalidateQueries({ queryKey: ["progress", bookId] });
    nav({ to: "/quiz/$bookId", params: { bookId } });
  };

  const handleAskTutor = async (promptOverride?: string) => {
    const q = (promptOverride || socraticQuestion).trim();
    if (!q) {
      toast.error("Please enter a question or topic to discuss.");
      return;
    }
    const currentPassage = socraticPassage.trim() || undefined;
    setSocraticLoading(true);
    setSocraticMessages((prev) => [
      ...prev,
      { role: "user", content: q, passage: currentPassage },
    ]);
    setSocraticQuestion("");
    setSocraticPassage("");
    try {
      const res = await callSocraticTutor({
        data: {
          book_id: bookId,
          question: q,
          passage: currentPassage,
          page,
        },
      });
      setSocraticMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.reply },
      ]);
    } catch (e: any) {
      toast.error(e.message || "Failed to contact Socratic Companion.");
      setSocraticMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "*(AI Companion unavailable: Ensure VITE_LOVABLE_API_KEY is configured in your environment settings.)*",
        },
      ]);
    }
    setSocraticLoading(false);
  };

  const fileProp = useMemo(() => (pdfUrl ? { url: pdfUrl } : null), [pdfUrl]);

  const Sidebar = (
    <Tabs defaultValue="highlight" className="flex flex-col h-full">
      <TabsList className="m-3 grid grid-cols-5">
        <TabsTrigger value="ai" title="AI Companion"><Sparkles className="h-4 w-4 text-primary" /></TabsTrigger>
        <TabsTrigger value="highlight" title="Highlights"><Highlighter className="h-4 w-4" /></TabsTrigger>
        <TabsTrigger value="note" title="Notes"><NotebookPen className="h-4 w-4" /></TabsTrigger>
        <TabsTrigger value="bookmark" title="Bookmarks"><Bookmark className="h-4 w-4" /></TabsTrigger>
        <TabsTrigger value="vocab" title="Vocabulary"><BookOpen className="h-4 w-4" /></TabsTrigger>
      </TabsList>

      {/* Socratic AI Tutor Tab */}
      <TabsContent value="ai" className="flex-1 flex flex-col space-y-3 px-4 overflow-y-auto">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
          <p className="font-semibold text-primary flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Socratic Companion
          </p>
          <p className="mt-1 text-muted-foreground">
            Analyze psychological dynamics, explore counter-defenses, or break down difficult passages from this book.
          </p>
        </div>

        {/* Selected passage helper */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Passage Context (Page {page})</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              onClick={() => {
                const sel = typeof window !== "undefined" ? window.getSelection()?.toString().trim() : "";
                if (!sel) {
                  toast.error("Highlight a passage on the page first");
                  return;
                }
                setSocraticPassage(sel);
                toast.success("Passage attached");
              }}
            >
              Attach Selection
            </Button>
          </div>
          {socraticPassage && (
            <div className="rounded border border-border bg-muted/30 p-2 text-xs relative">
              <p className="line-clamp-3 italic text-muted-foreground">"{socraticPassage}"</p>
              <button
                onClick={() => setSocraticPassage("")}
                className="absolute top-1 right-1 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Quick prompt suggestions */}
        <div className="flex flex-wrap gap-1.5">
          {["Explain this tactic", "Counter-defense?", "Real-world example"].map((prompt) => (
            <button
              key={prompt}
              onClick={() => handleAskTutor(prompt)}
              disabled={socraticLoading}
              className="text-[11px] rounded-full border border-border bg-muted/60 px-2.5 py-1 hover:border-primary/40 transition disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Message exchange history */}
        <div className="flex-1 space-y-3 overflow-y-auto pr-1">
          {socraticMessages.map((msg, idx) => (
            <div
              key={idx}
              className={`rounded-lg p-3 text-xs leading-relaxed ${
                msg.role === "user"
                  ? "bg-secondary text-secondary-foreground ml-4"
                  : "bg-card border border-border mr-2"
              }`}
            >
              <div className="flex items-center gap-1.5 font-medium mb-1">
                {msg.role === "user" ? (
                  <>
                    <User className="h-3 w-3" /> You
                  </>
                ) : (
                  <>
                    <Bot className="h-3.5 w-3.5 text-primary" /> Umbra Tutor
                  </>
                )}
              </div>
              {msg.passage && (
                <p className="border-l-2 border-primary/40 pl-2 my-1 italic text-muted-foreground">
                  "{msg.passage}"
                </p>
              )}
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          ))}
          {socraticLoading && (
            <div className="rounded-lg border border-border bg-card p-3 text-xs flex items-center gap-2 text-muted-foreground animate-pulse">
              <Bot className="h-3.5 w-3.5 text-primary animate-spin" />
              <span>Analyzing argument and formulating Socratic insight…</span>
            </div>
          )}
        </div>

        {/* Question input */}
        <div className="pt-2 flex gap-2">
          <Input
            value={socraticQuestion}
            onChange={(e) => setSocraticQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleAskTutor();
              }
            }}
            placeholder="Ask a question about this page…"
            className="text-xs h-9"
            disabled={socraticLoading}
          />
          <Button
            size="sm"
            onClick={() => handleAskTutor()}
            disabled={socraticLoading || !socraticQuestion.trim()}
            className="h-9 px-3"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </TabsContent>

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
          {/* Continuous / Single-page toggle button */}
          <Button
            variant={viewMode === "continuous" ? "secondary" : "ghost"}
            size="icon"
            onClick={() => {
              const nextMode = viewMode === "single" ? "continuous" : "single";
              setViewMode(nextMode);
              toast.info(nextMode === "continuous" ? "Continuous scroll enabled" : "Single page mode enabled");
            }}
            title={viewMode === "single" ? "Switch to Continuous Vertical Scroll" : "Switch to Single Page"}
          >
            <ScrollText className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={addBookmark} title={`Bookmark page ${page}`}><Bookmark className="h-4 w-4" /></Button>
          <Sheet>
            <SheetTrigger asChild><Button variant="ghost" size="icon" title="Reader settings"><Settings2 className="h-4 w-4" /></Button></SheetTrigger>
            <SheetContent>
              <SheetHeader><SheetTitle>Reader settings</SheetTitle></SheetHeader>
              <div className="mt-6 space-y-6">
                <div>
                  <Label className="mb-2 block">Reading Mode</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant={viewMode === "single" ? "default" : "outline"}
                      onClick={() => setViewMode("single")}
                      className="text-xs"
                    >
                      Single Page
                    </Button>
                    <Button
                      size="sm"
                      variant={viewMode === "continuous" ? "default" : "outline"}
                      onClick={() => setViewMode("continuous")}
                      className="text-xs"
                    >
                      Continuous Scroll
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <Label>Zoom / Scale: {zoom}%</Label>
                  </div>
                  <Slider
                    value={[zoom]}
                    min={60}
                    max={160}
                    step={5}
                    onValueChange={(v) => setZoom(v[0])}
                    className="mt-2"
                  />
                  <div className="mt-3 flex gap-2">
                    {[80, 100, 125, 150].map((preset) => (
                      <Button
                        key={preset}
                        size="sm"
                        variant={zoom === preset ? "default" : "outline"}
                        className="h-7 text-xs flex-1"
                        onClick={() => setZoom(preset)}
                      >
                        {preset}%
                      </Button>
                    ))}
                  </div>
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
              <SheetHeader className="px-4 pt-4"><SheetTitle>Tools & Socratic AI</SheetTitle></SheetHeader>
              <div className="pb-6 h-[calc(100vh-5rem)]">{Sidebar}</div>
            </SheetContent>
          </Sheet>
          <Button onClick={finish} variant="secondary" size="sm" className="shrink-0">
            <GraduationCap className="mr-1 h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Finish & quiz</span>
            <span className="sm:hidden">Quiz</span>
          </Button>
        </div>
      </header>

      <div className="grid flex-1 gap-0 md:grid-cols-[1fr_380px]">
        {/* PDF viewer */}
        <div className="flex min-w-0 flex-col">
          <div ref={containerRef} className="flex flex-1 justify-center overflow-auto bg-muted/30 p-2 sm:p-4">
            {fileProp ? (
              <Suspense fallback={<div className="p-10 text-center text-sm text-muted-foreground">Loading PDF…</div>}>
                <PdfViewer
                  file={fileProp}
                  page={page}
                  viewMode={viewMode}
                  width={Math.round(Math.max(280, Math.min(containerWidth - 16, 900)) * (zoom / 100))}
                  onLoadSuccess={(n) => setNumPages(n)}
                  onLoadError={() => { /* inline error UI handled in PdfViewer */ }}
                  fallbackUrl={pdfUrl ?? undefined}
                />
              </Suspense>
            ) : book && !book.has_pdf ? (
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

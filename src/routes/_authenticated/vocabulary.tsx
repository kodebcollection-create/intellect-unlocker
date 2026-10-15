import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Trash2, Sparkles, BookOpen, RotateCcw, Check, ArrowRight, Search, Layers, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vocabulary")({
  component: Vocab,
});

interface VocabItem {
  id: string;
  word: string;
  definition: string | null;
  book_id?: string | null;
  created_at: string;
  books?: { title: string } | null;
}

function Vocab() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [word, setWord] = useState("");
  const [def, setDef] = useState("");
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"library" | "practice">("library");

  // Flashcard practice session state
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [masteredIds, setMasteredIds] = useState<Set<string>>(new Set());
  const [practiceDeck, setPracticeDeck] = useState<VocabItem[]>([]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["vocab", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("vocabulary")
        .select("*, books(title)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return (data as VocabItem[]) ?? [];
    },
  });

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(
      (v) =>
        v.word.toLowerCase().includes(q) ||
        (v.definition && v.definition.toLowerCase().includes(q)) ||
        (v.books?.title && v.books.title.toLowerCase().includes(q))
    );
  }, [data, search]);

  const startPractice = () => {
    if (data.length === 0) {
      toast.error("Add some vocabulary words first before starting practice.");
      return;
    }
    // Shuffle the deck for practice
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    setPracticeDeck(shuffled);
    setCurrentCardIndex(0);
    setIsFlipped(false);
    setMasteredIds(new Set());
    setActiveTab("practice");
  };

  const handleNextCard = (mastered: boolean) => {
    const currentCard = practiceDeck[currentCardIndex];
    if (mastered && currentCard) {
      setMasteredIds((prev) => new Set(prev).add(currentCard.id));
    }
    setIsFlipped(false);
    setCurrentCardIndex((prev) => prev + 1);
  };

  const add = async () => {
    if (!word.trim() || !user) return;
    const { error } = await supabase
      .from("vocabulary")
      .insert({ user_id: user.id, word: word.trim(), definition: def.trim() || null });
    if (error) {
      toast.error(error.message);
    } else {
      setWord("");
      setDef("");
      qc.invalidateQueries({ queryKey: ["vocab"] });
      toast.success("Word added to vocabulary");
    }
  };

  const del = async (id: string) => {
    await supabase.from("vocabulary").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["vocab"] });
    toast.info("Word removed");
  };

  const currentCard = practiceDeck[currentCardIndex];
  const isPracticeFinished = practiceDeck.length > 0 && currentCardIndex >= practiceDeck.length;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="font-display text-4xl">Vocabulary Builder</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.length} term{data.length === 1 ? "" : "s"} collected across your reading curriculum.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === "library" ? "secondary" : "ghost"}
            onClick={() => setActiveTab("library")}
            size="sm"
          >
            <BookOpen className="mr-1.5 h-4 w-4" /> Word List
          </Button>
          <Button
            variant={activeTab === "practice" ? "default" : "outline"}
            onClick={startPractice}
            size="sm"
          >
            <Layers className="mr-1.5 h-4 w-4" /> Flashcard Practice
          </Button>
        </div>
      </div>

      {activeTab === "practice" ? (
        <div className="max-w-2xl mx-auto space-y-6">
          {!isPracticeFinished && currentCard ? (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Card {currentCardIndex + 1} of {practiceDeck.length}</span>
                <span>{masteredIds.size} mastered</span>
              </div>
              <Progress value={((currentCardIndex) / practiceDeck.length) * 100} />

              {/* Interactive Flashcard */}
              <div
                onClick={() => setIsFlipped((f) => !f)}
                className="min-h-[260px] cursor-pointer rounded-2xl border-2 border-border bg-card p-8 flex flex-col items-center justify-center text-center shadow-lg transition-all hover:border-primary/50 relative select-none"
              >
                <span className="absolute top-4 right-4 text-[11px] font-mono uppercase text-muted-foreground bg-muted px-2 py-0.5 rounded">
                  {isFlipped ? "Definition" : "Term (Click to flip)"}
                </span>

                {!isFlipped ? (
                  <div className="space-y-3">
                    <h2 className="font-display text-4xl text-foreground font-semibold">{currentCard.word}</h2>
                    {currentCard.books?.title && (
                      <p className="text-xs text-muted-foreground italic">from {currentCard.books.title}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border/40">
                      Tap anywhere or click below to reveal definition
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-w-lg">
                    <h3 className="font-display text-2xl text-primary font-medium">{currentCard.word}</h3>
                    <p className="text-base text-foreground leading-relaxed">
                      {currentCard.definition || "No definition recorded."}
                    </p>
                    {currentCard.books?.title && (
                      <p className="text-xs text-muted-foreground italic">Context from {currentCard.books.title}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Self-Assessment Controls */}
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNextCard(false);
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4 text-destructive" /> Needs Review
                </Button>
                <Button
                  size="lg"
                  className="flex-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNextCard(true);
                  }}
                >
                  <Check className="mr-2 h-4 w-4 text-primary" /> Mastered
                </Button>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
              <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="font-display text-3xl">Session Completed!</h2>
              <p className="text-muted-foreground">
                You mastered {masteredIds.size} out of {practiceDeck.length} terms in this round.
              </p>
              <div className="flex justify-center gap-3 pt-4">
                <Button onClick={startPractice} size="lg">
                  <RefreshCw className="mr-2 h-4 w-4" /> Practice Again
                </Button>
                <Button variant="outline" size="lg" onClick={() => setActiveTab("library")}>
                  Back to List
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Quick Add Form */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Add New Term
            </h2>
            <div className="grid gap-3 md:grid-cols-[220px_1fr_auto]">
              <Input
                placeholder="Word (e.g. gaslighting)"
                value={word}
                onChange={(e) => setWord(e.target.value)}
              />
              <Textarea
                placeholder="Definition or psychological significance…"
                value={def}
                onChange={(e) => setDef(e.target.value)}
                rows={1}
              />
              <Button onClick={add} disabled={!word.trim()}>Add Term</Button>
            </div>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search terms, definitions, or books…"
              className="pl-9 bg-card"
            />
          </div>

          {/* Word Grid */}
          <div className="grid gap-4 md:grid-cols-2">
            {filteredData.map((v) => (
              <div
                key={v.id}
                className="rounded-xl border border-border bg-card p-5 flex flex-col justify-between transition hover:border-primary/40 shadow-sm"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-display text-xl font-semibold">{v.word}</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => del(v.id)}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="Delete term"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {v.definition ? (
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      {v.definition}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground italic">No definition added.</p>
                  )}
                </div>
                {v.books?.title && (
                  <p className="mt-3 pt-3 border-t border-border/40 text-xs text-muted-foreground italic">
                    from <span className="font-medium text-foreground">{v.books.title}</span>
                  </p>
                )}
              </div>
            ))}
            {filteredData.length === 0 && !isLoading && (
              <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
                {search
                  ? `No vocabulary matching "${search}".`
                  : "No words recorded yet. Highlight text in the reader to build your collection."}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

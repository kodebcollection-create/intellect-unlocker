import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getLibraryData } from "@/lib/library.functions";
import { Lock, CheckCircle2, BookOpen, Circle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/library")({
  component: Library,
});

function Library() {
  const fetchLibraryData = useServerFn(getLibraryData);
  const { data, isLoading } = useQuery({
    queryKey: ["library"],
    queryFn: async () => fetchLibraryData(),
  });

  if (isLoading || !data) return <div className="text-muted-foreground">Loading library…</div>;
  const { cats, books, progress } = data;
  const pMap = new Map(progress.map((p: any) => [p.book_id, p]));
  // book is unlocked iff all prior books (by global_order) have quiz_passed
  const sortedBooks = [...books].sort((a: any, b: any) => a.global_order - b.global_order);
  const unlocked = new Set<string>();
  let allPrev = true;
  for (const b of sortedBooks) {
    if (allPrev) unlocked.add(b.id);
    const p = pMap.get(b.id) as any;
    if (!p?.quiz_passed) allPrev = false;
  }

  const completed = progress.filter((p: any) => p.quiz_passed).length;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-4xl">Your library</h1>
        <p className="mt-1 text-muted-foreground">Read each book in order. Pass the quiz to unlock the next.</p>
        <div className="mt-4 flex items-center gap-4">
          <Progress value={(completed / 30) * 100} className="max-w-md" />
          <span className="text-sm text-muted-foreground">{completed} / 30 books mastered</span>
        </div>
      </div>

      {cats.map((c: any) => {
        const catBooks = sortedBooks.filter((b: any) => b.category_id === c.id);
        return (
          <section key={c.id}>
            <div className="mb-4 flex items-baseline gap-3">
              <span className="font-mono text-sm text-primary">0{c.display_order}</span>
              <h2 className="font-display text-2xl">{c.name}</h2>
              <p className="text-sm text-muted-foreground">{c.description}</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {catBooks.map((b: any) => {
                const isUnlocked = unlocked.has(b.id);
                const p = pMap.get(b.id) as any;
                const passed = p?.quiz_passed;
                const inProgress = p && !passed;
                return (
                  <div key={b.id} className={`rounded-xl border bg-card p-5 transition ${isUnlocked ? "border-border hover:border-primary/40" : "border-border opacity-50"}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">#{String(b.global_order).padStart(2, "0")}</span>
                      {passed ? <CheckCircle2 className="h-4 w-4 text-primary" /> : !isUnlocked ? <Lock className="h-4 w-4 text-muted-foreground" /> : inProgress ? <BookOpen className="h-4 w-4 text-primary" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <h3 className="font-display text-lg leading-snug">{b.title}</h3>
                    {b.author && <p className="mt-1 text-xs text-muted-foreground">{b.author}</p>}
                    {b.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{b.description}</p>}
                    {isUnlocked ? (
                      <div className="mt-4 flex gap-2">
                        <Link to="/read/$bookId" params={{ bookId: b.id }} className="flex-1 rounded-md bg-primary px-3 py-2 text-center text-sm font-medium text-primary-foreground">
                          {passed ? "Reread" : inProgress ? `Resume p.${p.current_page}` : "Begin"}
                        </Link>
                        {p?.completed && !passed && (
                          <Link to="/quiz/$bookId" params={{ bookId: b.id }} className="rounded-md border border-border px-3 py-2 text-sm">Quiz</Link>
                        )}
                      </div>
                    ) : (
                      <p className="mt-4 text-xs text-muted-foreground">Complete previous books to unlock.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

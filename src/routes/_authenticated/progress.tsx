import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/progress")({
  component: ProgressPage,
});

function ProgressPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["progress-page"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const [{ data: books }, { data: progress }, { data: attempts }] = await Promise.all([
        supabase.from("books").select("id, title, author, category_id, cover_url, description, display_order, global_order, has_pdf, page_count, published, total_pages").order("global_order"),
        supabase.from("user_progress").select("*").eq("user_id", u.user!.id),
        supabase.from("quiz_attempts").select("*").eq("user_id", u.user!.id).order("created_at", { ascending: false }),
      ]);
      return { books: books ?? [], progress: progress ?? [], attempts: attempts ?? [] };
    },
  });
  if (!data) return <div className="text-muted-foreground">Loading…</div>;
  const passed = data.progress.filter((p: any) => p.quiz_passed).length;
  const inProgress = data.progress.filter((p: any) => !p.quiz_passed).length;
  return (
    <div className="space-y-8">
      <h1 className="font-display text-4xl">Progress</h1>
      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Books mastered" value={`${passed} / 30`} />
        <Stat label="In progress" value={inProgress.toString()} />
        <Stat label="Quiz attempts" value={data.attempts.length.toString()} />
      </div>
      <div>
        <Progress value={(passed / 30) * 100} />
      </div>
      <div>
        <h2 className="mb-3 font-display text-2xl">Quiz attempts — review</h2>
        <p className="mb-3 text-sm text-muted-foreground">Click any attempt to review every question, your answer, the correct answer, and the explanation.</p>
        <div className="space-y-2">
          {data.attempts.length === 0 && <p className="text-sm text-muted-foreground">No attempts yet. Take a quiz to see your review here.</p>}
          {data.attempts.map((a: any) => {
            const book = data.books.find((b: any) => b.id === a.book_id);
            const isOpen = openId === a.id;
            const detailed: any[] = Array.isArray(a.answers) ? a.answers : [];
            return (
              <div key={a.id} className="rounded-md border border-border bg-card">
                <button
                  onClick={() => setOpenId(isOpen ? null : a.id)}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm hover:bg-accent/40"
                >
                  <span className="flex items-center gap-2">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    <span className="font-medium">{book?.title ?? "Unknown book"}</span>
                    <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</span>
                  </span>
                  <span className={a.passed ? "text-primary" : "text-destructive"}>
                    {a.score}/{a.total} {a.passed ? "✓ Passed" : "✗ Retry"}
                  </span>
                </button>
                {isOpen && (
                  <AttemptReview bookId={a.book_id} detailed={detailed} passed={!!a.passed} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AttemptReview({ bookId, detailed, passed }: { bookId: string; detailed: any[]; passed: boolean }) {
  const { data: questions } = useQuery({
    queryKey: ["review-questions", bookId],
    queryFn: async () => {
      const { data } = await supabase
        .from("quiz_questions")
        .select("id, question, options, display_order")
        .eq("book_id", bookId)
        .order("display_order");
      return data ?? [];
    },
  });
  if (!questions) return <div className="px-3 pb-3 text-xs text-muted-foreground">Loading review…</div>;
  const qMap = new Map(questions.map((q: any) => [q.id, q]));
  return (
    <div className="space-y-2 border-t border-border p-3">
      {!passed && (
        <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Correct answers and explanations are hidden until you pass this quiz. Re-read the book and try again.
        </p>
      )}
      {detailed.map((d, i) => {
        const q: any = qMap.get(d.question_id);
        if (!q) return null;
        const correctIdx = passed ? (d.correct_index ?? -1) : -1;
        return (
          <div key={d.question_id} className="rounded-md border border-border bg-background p-3 text-sm">
            <div className="flex items-start gap-2">
              {d.correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
              <div className="flex-1">
                <p className="font-medium">{i + 1}. {q.question}</p>
                <ul className="mt-2 space-y-1">
                  {q.options.map((opt: string, idx: number) => {
                    const youPicked = idx === d.choice;
                    const isCorrect = passed && idx === correctIdx;
                    return (
                      <li
                        key={idx}
                        className={`rounded px-2 py-1 text-xs ${
                          isCorrect ? "bg-primary/15 text-primary"
                          : youPicked ? (passed ? "bg-destructive/15 text-destructive" : "bg-muted text-foreground")
                          : "text-muted-foreground"
                        }`}
                      >
                        {isCorrect && "✓ "}{youPicked && !isCorrect && "Your answer: "}{opt}
                      </li>
                    );
                  })}
                </ul>
                {passed && d.explanation && <p className="mt-2 text-xs italic text-muted-foreground">{d.explanation}</p>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 font-display text-3xl">{value}</div>
    </div>
  );
}

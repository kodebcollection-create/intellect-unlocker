import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { submitQuiz } from "@/lib/library.functions";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/quiz/$bookId")({
  ssr: false,
  component: Quiz,
});

function Quiz() {
  const { bookId } = Route.useParams();
  const nav = useNavigate();
  const submit = useServerFn(submitQuiz);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: book } = useQuery({
    queryKey: ["book", bookId],
    queryFn: async () => (await supabase.from("books").select("title").eq("id", bookId).single()).data,
  });
  const { data: questions } = useQuery({
    queryKey: ["quiz", bookId],
    queryFn: async () => {
      // Do NOT select correct_index or explanation — answers are server-side only.
      const { data } = await supabase.from("quiz_questions").select("id, book_id, question, options, display_order").eq("book_id", bookId).order("display_order");
      return data ?? [];
    },
  });

  if (!questions) return <div className="text-muted-foreground">Loading quiz…</div>;
  if (questions.length === 0) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-8 text-center">
        <h1 className="font-display text-2xl">No quiz yet</h1>
        <p className="mt-2 text-muted-foreground">An admin needs to generate the quiz for this book from its PDF.</p>
        <Link to="/library" className="mt-6 inline-block"><Button>Back to library</Button></Link>
      </div>
    );
  }

  const onSubmit = async () => {
    if (Object.keys(answers).length < questions.length) {
      toast.error("Answer every question first");
      return;
    }
    setBusy(true);
    try {
      const r = await submit({
        data: {
          book_id: bookId,
          answers: questions.map((q: any) => ({ question_id: q.id, choice: answers[q.id] })),
        },
      });
      setResult(r);
      if (r.passed) toast.success(`Passed! ${r.score}/${r.total}`);
      else toast.error(`${r.score}/${r.total} — needs 70%. Try again.`);
    } catch (e: any) { toast.error(e.message); }
    setBusy(false);
  };

  if (result) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <h1 className="font-display text-3xl">{result.passed ? "Passed!" : "Not yet"}</h1>
          <p className="mt-2 text-muted-foreground">{book?.title}</p>
          <div className="mt-4 text-5xl font-display">{result.score}/{result.total}</div>
          <Progress value={(result.score / result.total) * 100} className="mt-4" />
          <div className="mt-6 flex justify-center gap-2">
            {result.passed
              ? <Link to="/library"><Button>Unlock next book</Button></Link>
              : <Button onClick={() => { setResult(null); setAnswers({}); }}>Try again</Button>}
            <Link to="/library"><Button variant="outline">Library</Button></Link>
          </div>
        </div>
        <div className="space-y-3">
          {questions.map((q: any, i: number) => {
            const d = result.detailed.find((x: any) => x.question_id === q.id);
            return (
              <div key={q.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start gap-2">
                  {d.correct ? <CheckCircle2 className="mt-1 h-4 w-4 text-primary" /> : <XCircle className="mt-1 h-4 w-4 text-destructive" />}
                  <div className="flex-1">
                    <p className="font-medium">{i + 1}. {q.question}</p>
                    <p className="mt-1 text-sm text-muted-foreground">Correct: {q.options[d.correct_index]}</p>
                    {d.explanation && <p className="mt-2 text-xs italic text-muted-foreground">{d.explanation}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link to="/library" className="text-sm text-muted-foreground">← Library</Link>
        <h1 className="mt-2 font-display text-3xl">Quiz: {book?.title}</h1>
        <p className="mt-1 text-muted-foreground">{questions.length} questions · Pass with 70% to unlock the next book.</p>
      </div>
      <div className="space-y-4">
        {questions.map((q: any, i: number) => (
          <div key={q.id} className="rounded-xl border border-border bg-card p-5">
            <p className="font-medium">{i + 1}. {q.question}</p>
            <RadioGroup className="mt-3 space-y-2" value={answers[q.id]?.toString()} onValueChange={(v) => setAnswers(a => ({ ...a, [q.id]: Number(v) }))}>
              {q.options.map((opt: string, idx: number) => (
                <div key={idx} className="flex items-center gap-3 rounded-md border border-border bg-background p-3">
                  <RadioGroupItem value={idx.toString()} id={`${q.id}-${idx}`} />
                  <Label htmlFor={`${q.id}-${idx}`} className="flex-1 cursor-pointer">{opt}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        ))}
      </div>
      <Button size="lg" disabled={busy} onClick={onSubmit} className="w-full">{busy ? "Grading…" : "Submit quiz"}</Button>
    </div>
  );
}

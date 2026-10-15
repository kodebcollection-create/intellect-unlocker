import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { submitQuiz, getQuizData } from "@/lib/library.functions";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, XCircle, RefreshCw, BookOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/quiz/$bookId")({
  ssr: false,
  component: Quiz,
});

interface RawQuestion {
  id: string;
  book_id?: string;
  question: string;
  options: string[];
  display_order: number;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function Quiz() {
  const { bookId } = Route.useParams();
  const nav = useNavigate();
  const submit = useServerFn(submitQuiz);
  const fetchQuizData = useServerFn(getQuizData);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [attemptKey, setAttemptKey] = useState(0);

  const { data: quizData } = useQuery({
    queryKey: ["quiz", bookId],
    queryFn: async () => fetchQuizData({ data: { book_id: bookId } }),
  });

  const book = quizData?.book;
  const rawQuestions: RawQuestion[] | undefined = quizData?.questions;

  // Shuffle question order and options per attempt to prevent mechanical trial-and-error memorization
  const shuffledQuestions = useMemo(() => {
    if (!rawQuestions || rawQuestions.length === 0) return [];
    // Randomize question sequence
    const qList = shuffleArray(rawQuestions);
    return qList.map((q) => {
      // Create options with their original index preserved for server grading
      const optsWithOriginalIndex = (q.options || []).map((text, idx) => ({
        text,
        originalIndex: idx,
      }));
      return {
        ...q,
        shuffledOptions: shuffleArray(optsWithOriginalIndex),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawQuestions, attemptKey]);

  if (!rawQuestions) return <div className="text-muted-foreground p-8 text-center">Loading quiz…</div>;
  if (rawQuestions.length === 0) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-8 text-center">
        <h1 className="font-display text-2xl">No quiz yet</h1>
        <p className="mt-2 text-muted-foreground">An admin needs to generate the quiz for this book from its PDF.</p>
        <Link to="/library" className="mt-6 inline-block"><Button>Back to library</Button></Link>
      </div>
    );
  }

  const onSubmit = async () => {
    if (Object.keys(answers).length < shuffledQuestions.length) {
      toast.error(`Please answer all ${shuffledQuestions.length} questions before submitting.`);
      return;
    }
    setBusy(true);
    try {
      const r = await submit({
        data: {
          book_id: bookId,
          answers: shuffledQuestions.map((q) => ({
            question_id: q.id,
            choice: answers[q.id],
          })),
        },
      });
      setResult(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
      if (r.passed) toast.success(`Passed! ${r.score}/${r.total}`);
      else toast.error(`${r.score}/${r.total} — needs 70% to pass. Review the material and try again.`);
    } catch (e: any) {
      toast.error(e.message);
    }
    setBusy(false);
  };

  const handleRetry = () => {
    setResult(null);
    setAnswers({});
    setAttemptKey((k) => k + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (result) {
    const percentage = Math.round((result.score / result.total) * 100);
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-muted/60 mb-3">
            {result.passed ? (
              <CheckCircle2 className="h-10 w-10 text-primary" />
            ) : (
              <XCircle className="h-10 w-10 text-destructive" />
            )}
          </div>
          <h1 className="font-display text-3xl">{result.passed ? "Curriculum Passed!" : "Not Quite Yet"}</h1>
          <p className="mt-2 text-muted-foreground">{book?.title}</p>
          <div className="mt-4 text-5xl font-display">{result.score}/{result.total}</div>
          <p className="mt-1 text-sm font-medium text-muted-foreground">{percentage}% score (70% required to pass)</p>
          <Progress value={percentage} className="mt-4 max-w-md mx-auto" />
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {result.passed ? (
              <Link to="/library"><Button size="lg">Unlock Next Book</Button></Link>
            ) : (
              <>
                <Button size="lg" onClick={handleRetry}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Try Again (New Attempt)
                </Button>
                <Link to={`/read/${bookId}`}>
                  <Button variant="outline" size="lg">
                    <BookOpen className="mr-2 h-4 w-4" /> Review Book
                  </Button>
                </Link>
              </>
            )}
            <Link to="/library"><Button variant="ghost" size="lg">Library</Button></Link>
          </div>
        </div>

        {/* Detailed breakdown */}
        <div className="space-y-3">
          <h2 className="font-display text-xl px-1">Performance Review</h2>
          {shuffledQuestions.map((q, i: number) => {
            const d = result.detailed?.find((x: any) => x.question_id === q.id);
            if (!d) return null;
            const isCorrect = d.correct;

            return (
              <div key={q.id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-start gap-3">
                  {isCorrect ? (
                    <CheckCircle2 className="mt-1 h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <XCircle className="mt-1 h-5 w-5 shrink-0 text-destructive" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-sm sm:text-base">{i + 1}. {q.question}</p>
                    {result.passed ? (
                      <>
                        <p className="mt-2 text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">Answer:</span> {q.options[d.correct_index]}
                        </p>
                        {d.explanation && (
                          <p className="mt-1 text-xs italic text-muted-foreground">{d.explanation}</p>
                        )}
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {isCorrect ? "Answered correctly" : "Incorrect — re-read this topic in the text before retrying."}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const totalCount = shuffledQuestions.length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border pb-4">
        <div>
          <Link to="/library" className="text-sm text-muted-foreground hover:underline">← Library</Link>
          <h1 className="mt-1 font-display text-3xl">Quiz: {book?.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {totalCount} questions · Pass with 70% to unlock the next book.
          </p>
        </div>
        <div className="text-xs bg-muted px-3 py-1.5 rounded-full font-medium self-start sm:self-auto">
          Progress: {answeredCount} / {totalCount}
        </div>
      </div>

      <div className="space-y-4">
        {shuffledQuestions.map((q, i: number) => {
          const selectedChoice = answers[q.id];
          return (
            <div key={q.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">{i + 1}. {q.question}</p>
              </div>
              <RadioGroup
                className="mt-3 space-y-2"
                value={selectedChoice !== undefined ? selectedChoice.toString() : ""}
                onValueChange={(val) => setAnswers((prev) => ({ ...prev, [q.id]: Number(val) }))}
              >
                {q.shuffledOptions.map((opt, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 rounded-md border border-border bg-background p-3 transition hover:border-primary/50"
                  >
                    <RadioGroupItem value={opt.originalIndex.toString()} id={`${q.id}-${idx}`} />
                    <Label htmlFor={`${q.id}-${idx}`} className="flex-1 cursor-pointer text-sm leading-relaxed">
                      {opt.text}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-4 bg-background/95 backdrop-blur border border-border p-3 rounded-xl shadow-lg flex items-center justify-between gap-4">
        <span className="text-xs text-muted-foreground">
          {answeredCount < totalCount
            ? `${totalCount - answeredCount} question(s) remaining`
            : "All questions answered — ready to grade"}
        </span>
        <Button
          size="lg"
          disabled={busy || answeredCount < totalCount}
          onClick={onSubmit}
          className="min-w-[140px]"
        >
          {busy ? "Grading…" : "Submit Quiz"}
        </Button>
      </div>
    </div>
  );
}

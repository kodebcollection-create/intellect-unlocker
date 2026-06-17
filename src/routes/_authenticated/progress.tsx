import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/progress")({
  component: ProgressPage,
});

function ProgressPage() {
  const { data } = useQuery({
    queryKey: ["progress-page"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const [{ data: books }, { data: progress }, { data: attempts }] = await Promise.all([
        supabase.from("books").select("*").order("global_order"),
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
        <h2 className="mb-3 font-display text-2xl">Recent attempts</h2>
        <div className="space-y-2">
          {data.attempts.slice(0, 20).map((a: any) => {
            const book = data.books.find((b: any) => b.id === a.book_id);
            return (
              <div key={a.id} className="flex items-center justify-between rounded-md border border-border bg-card p-3 text-sm">
                <span>{book?.title}</span>
                <span className={a.passed ? "text-primary" : "text-destructive"}>{a.score}/{a.total} {a.passed ? "✓" : "✗"}</span>
              </div>
            );
          })}
        </div>
      </div>
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

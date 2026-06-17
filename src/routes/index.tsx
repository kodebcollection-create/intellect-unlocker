import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Lock, Shield, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Umbra — The Dark Influence Library" },
      { name: "description", content: "30 essential books on influence, dark triad dynamics, and interpersonal defense. Sequential curriculum, comprehension quizzes, and a reader built for serious study." },
      { property: "og:title", content: "Umbra — The Dark Influence Library" },
      { property: "og:description", content: "A structured 30-book curriculum on influence and defense. Read in order, prove comprehension, build mastery." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground font-display text-lg font-bold">U</div>
          <span className="font-display text-xl">Umbra</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link to="/auth"><Button variant="ghost">Sign in</Button></Link>
          <Link to="/auth"><Button>Begin</Button></Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-20 md:py-32">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">A curriculum, not a library</p>
          <h1 className="mt-4 max-w-3xl font-display text-5xl leading-tight md:text-7xl">
            Read the dark side of influence — in the order it was meant to be read.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            30 books across six categories. Each one unlocks only after you prove you understood the last.
            Built-in reader with bookmarks, highlights, notes, vocabulary, and adjustable typography.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth"><Button size="lg">Start reading</Button></Link>
            <Link to="/library"><Button size="lg" variant="outline">View the library</Button></Link>
          </div>
        </section>

        <section className="grid gap-6 border-t border-border py-16 md:grid-cols-3">
          {[
            { icon: BookOpen, title: "Sequential mastery", body: "Book 1 unlocks Book 2. No skipping. Real comprehension." },
            { icon: Sparkles, title: "AI-graded quizzes", body: "Fifteen questions after each book — pass 70% to advance." },
            { icon: Shield, title: "Built for defense", body: "Recognise the patterns. Build the boundaries. Keep your mind your own." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-6">
              <Icon className="h-6 w-6 text-primary" />
              <h3 className="mt-4 font-display text-xl">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>

        <section className="border-t border-border py-16">
          <h2 className="font-display text-3xl">The six categories</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {[
              "Foundations of Influence",
              "Dark Triad Dynamics",
              "Manipulation Tactics",
              "Interpersonal Defense",
              "Cognitive Reframing",
              "Mastery & Application",
            ].map((c, i) => (
              <div key={c} className="flex items-center gap-4 rounded-lg border border-border bg-card/50 p-4">
                <span className="font-mono text-sm text-primary">0{i + 1}</span>
                <span className="font-display text-lg">{c}</span>
                {i > 0 && <Lock className="ml-auto h-4 w-4 text-muted-foreground" />}
              </div>
            ))}
          </div>
        </section>

        <footer className="border-t border-border py-10 text-sm text-muted-foreground">
          Umbra · A reading discipline for those who refuse to be manipulated.
        </footer>
      </main>
    </div>
  );
}

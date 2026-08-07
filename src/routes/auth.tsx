import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({
    next: typeof s.next === "string" ? s.next : undefined,
  }),
  head: () => ({ meta: [{ title: "Sign in · Umbra" }, { name: "description", content: "Sign in to your Umbra reading account." }] }),
  component: AuthPage,
});

// Only allow same-origin relative paths to prevent open redirects.
function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function AuthPage() {
  const nav = useNavigate();
  const { next } = Route.useSearch();
  const safe = safeNext(next);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const afterAuth = () => {
    if (safe) window.location.href = safe;
    else nav({ to: "/library" });
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) afterAuth();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Welcome back");
      afterAuth();
    }
  };
  const signUp = async () => {
    setBusy(true);
    const emailRedirectTo = safe
      ? `${window.location.origin}${safe}`
      : `${window.location.origin}/library`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Account created");
      afterAuth();
    }
  };
  const google = async () => {
    const redirect_uri = safe
      ? `${window.location.origin}${safe}`
      : `${window.location.origin}/library`;
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri });
    if (res.error) toast.error("Google sign-in failed");
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8">
        <Link to="/" className="font-display text-2xl">Umbra</Link>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to continue your reading.</p>

        <Tabs defaultValue="signin" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>
          {(["signin", "signup"] as const).map((mode) => (
            <TabsContent key={mode} value={mode} className="space-y-4 pt-4">
              <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div className="space-y-2"><Label>Password</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <Button className="w-full" disabled={busy} onClick={mode === "signin" ? signIn : signUp}>
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
            </TabsContent>
          ))}
        </Tabs>

        <div className="mt-6 flex items-center gap-3"><div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">OR</span><div className="h-px flex-1 bg-border" /></div>
        <Button variant="outline" className="mt-4 w-full" onClick={google}>Continue with Google</Button>
      </div>
    </div>
  );
}

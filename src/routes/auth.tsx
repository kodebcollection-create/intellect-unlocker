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
  head: () => ({ meta: [{ title: "Sign in · Umbra" }, { name: "description", content: "Sign in to your Umbra reading account." }] }),
  component: AuthPage,
});

function AuthPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) nav({ to: "/library" }); });
  }, [nav]);

  const signIn = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Welcome back"); nav({ to: "/library" }); }
  };
  const signUp = async () => {
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${window.location.origin}/library` },
    });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Account created"); nav({ to: "/library" }); }
  };
  const google = async () => {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/library` });
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

import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, KeyRound, Mail, CheckCircle2, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string; mode?: string } => ({
    next: typeof s.next === "string" ? s.next : undefined,
    mode: typeof s.mode === "string" ? s.mode : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in · Umbra" },
      { name: "description", content: "Sign in to your Umbra reading account." },
    ],
  }),
  component: AuthPage,
});

function safeNext(next: string | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//")) return null;
  return next;
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" {...props}>
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.37 7.34 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.16 0 9.94 0 12s.46 3.84 1.26 5.42l4.02-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.25 2.63 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
}

function AuthPage() {
  const nav = useNavigate();
  const searchParams = Route.useSearch();
  const safe = safeNext(searchParams.next);

  const [authView, setAuthView] = useState<"signin" | "signup" | "forgot" | "update-password">(
    searchParams.mode === "update-password" ? "update-password" : "signin"
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const afterAuth = () => {
    if (safe) window.location.href = safe;
    else nav({ to: "/library" });
  };

  useEffect(() => {
    // Check initial user session
    supabase.auth.getUser().then(({ data }) => {
      if (data.user && authView !== "update-password") {
        afterAuth();
      }
    });

    // Handle password recovery redirection event from email link
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setAuthView("update-password");
        toast.info("Password recovery session started. Enter your new password below.");
      } else if (event === "SIGNED_IN" && authView !== "update-password") {
        afterAuth();
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authView]);

  const signIn = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Please enter your email and password.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Welcome back");
      afterAuth();
    }
  };

  const signUp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim() || !password) {
      toast.error("Please enter an email and password.");
      return;
    }
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    setBusy(true);
    const emailRedirectTo = safe
      ? `${window.location.origin}${safe}`
      : `${window.location.origin}/library`;
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else if (data.session) {
      toast.success("Account created successfully!");
      afterAuth();
    } else {
      toast.success("Account created! Please check your email to confirm your registration.");
    }
  };

  const sendPasswordReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!email.trim()) {
      toast.error("Please enter your account email address.");
      return;
    }
    setBusy(true);
    const redirectTo = `${window.location.origin}/auth?mode=update-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      setResetSent(true);
      toast.success("Password reset instructions sent to your email.");
    }
  };

  const updatePassword = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setBusy(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Password updated successfully!");
      afterAuth();
    }
  };

  const google = async () => {
    setBusy(true);
    const redirectTo = safe
      ? `${window.location.origin}${safe}`
      : `${window.location.origin}/library`;

    try {
      // First try standard Supabase OAuth
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) {
        // Fallback to lovable OAuth proxy
        const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirectTo });
        if (res.error) {
          toast.error(error.message || "Google sign-in failed. Ensure Google OAuth is enabled in Supabase.");
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to start Google sign-in.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl">
        <Link to="/" className="font-display text-3xl font-bold tracking-tight text-foreground">
          Umbra
        </Link>

        {/* View 1: Update Password (from reset link) */}
        {authView === "update-password" && (
          <div className="mt-6 space-y-4">
            <div>
              <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" /> Set New Password
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter your new password to regain access to your account.
              </p>
            </div>

            <form onSubmit={updatePassword} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-pw">New Password</Label>
                <Input
                  id="new-pw"
                  type="password"
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm-pw">Confirm New Password</Label>
                <Input
                  id="confirm-pw"
                  type="password"
                  placeholder="Repeat new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? "Updating…" : "Update Password"}
              </Button>
            </form>
          </div>
        )}

        {/* View 2: Forgot Password Request */}
        {authView === "forgot" && (
          <div className="mt-6 space-y-4">
            <div>
              <h2 className="font-display text-xl font-semibold flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" /> Reset Password
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter the email associated with your account and we'll send you a password reset link.
              </p>
            </div>

            {resetSent ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-center space-y-3">
                <CheckCircle2 className="h-8 w-8 text-primary mx-auto" />
                <p className="text-sm font-medium text-foreground">Recovery email sent</p>
                <p className="text-xs text-muted-foreground">
                  Check your inbox for a password reset email from Umbra. Follow the link inside to set a new password.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => {
                    setResetSent(false);
                    setAuthView("signin");
                  }}
                >
                  Back to Sign In
                </Button>
              </div>
            ) : (
              <form onSubmit={sendPasswordReset} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-email">Account Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reset-email"
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Sending…" : "Send Reset Instructions"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-xs text-muted-foreground"
                  onClick={() => setAuthView("signin")}
                >
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Back to Sign In
                </Button>
              </form>
            )}
          </div>
        )}

        {/* View 3: Sign In / Create Account Tabs */}
        {(authView === "signin" || authView === "signup") && (
          <>
            <p className="mt-1 text-sm text-muted-foreground">
              Sign in to continue your dark influence reading curriculum.
            </p>

            <Tabs
              value={authView}
              onValueChange={(v) => setAuthView(v as "signin" | "signup")}
              className="mt-6"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Create account</TabsTrigger>
              </TabsList>

              {/* Sign In Tab */}
              <TabsContent value="signin" className="space-y-4 pt-4">
                <form onSubmit={signIn} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="signin-password">Password</Label>
                      <button
                        type="button"
                        onClick={() => setAuthView("forgot")}
                        className="text-xs text-primary hover:underline font-medium"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              </TabsContent>

              {/* Sign Up Tab */}
              <TabsContent value="signup" className="space-y-4 pt-4">
                <form onSubmit={signUp} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <p className="text-[11px] text-muted-foreground">Minimum 6 characters.</p>
                  </div>
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Creating account…" : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="mt-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">OR</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* Official Google OAuth Button */}
            <Button
              type="button"
              variant="outline"
              className="mt-4 w-full flex items-center justify-center gap-2.5 h-11 border-border hover:bg-muted/60 transition"
              onClick={google}
              disabled={busy}
            >
              <GoogleIcon />
              <span className="font-medium text-sm">Continue with Google</span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

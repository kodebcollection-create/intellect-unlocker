import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, GraduationCap, LayoutDashboard, LogOut, NotebookPen, Sun, Moon, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/use-theme";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  const nav = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { theme, setTheme } = useTheme();

  const { data: isAdmin } = useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return false;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      return !!data;
    },
  });

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    nav({ to: "/" });
  };

  const links = [
    { to: "/library", label: "Library", icon: BookOpen },
    { to: "/vocabulary", label: "Vocabulary", icon: NotebookPen },
    { to: "/progress", label: "Progress", icon: GraduationCap },
  ];

  const isReader = pathname.startsWith("/read/");

  if (isReader) return <Outlet />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3">
          <Link to="/library" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground font-display font-bold">U</div>
            <span className="font-display text-lg">Umbra</span>
          </Link>
          <nav className="hidden gap-1 md:flex">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground" activeProps={{ className: "bg-accent text-accent-foreground" }}>
                <l.icon className="h-4 w-4" />{l.label}
              </Link>
            ))}
            {isAdmin && (
              <Link to="/admin" className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground" activeProps={{ className: "bg-accent text-accent-foreground" }}>
                <LayoutDashboard className="h-4 w-4" />Admin
              </Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : theme === "light" ? "sepia" : "dark")} title={`Theme: ${theme}`}>
              {theme === "dark" ? <Moon className="h-4 w-4" /> : theme === "light" ? <Sun className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut} title="Sign out"><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 pb-24 md:pb-8"><Outlet /></main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur md:hidden">
        <div className="flex items-stretch justify-around">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground" activeProps={{ className: "text-primary" }}>
              <l.icon className="h-5 w-5" />
              <span>{l.label}</span>
            </Link>
          ))}
          {isAdmin && (
            <Link to="/admin" className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground" activeProps={{ className: "text-primary" }}>
              <LayoutDashboard className="h-5 w-5" />
              <span>Admin</span>
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}

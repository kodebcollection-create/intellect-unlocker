import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { runStorageHealthCheck } from "@/lib/library.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin-health")({
  component: AdminHealth,
});

function AdminHealth() {
  const runCheck = useServerFn(runStorageHealthCheck);
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ["admin-storage-health"],
    queryFn: async () => runCheck(),
    retry: false,
  });

  const summary = data?.summary ?? "warn";
  const SummaryIcon = summary === "pass" ? CheckCircle2 : summary === "fail" ? XCircle : AlertTriangle;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            Admin diagnostics
          </div>
          <h1 className="font-display text-3xl sm:text-4xl">Storage & RLS Health Check</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Runs an authenticated admin probe against PDF uploads, cleanup, role reads, category reads, and the published-library read path.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">Back to admin</Link>
          </Button>
          <Button size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            Run check
          </Button>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <div className="font-medium text-destructive">Health check could not run</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {(error as Error).message === "Forbidden"
                  ? "This page is admin-only. Confirm this account has admin access, then sign out and back in."
                  : (error as Error).message}
              </p>
            </div>
          </div>
        </div>
      )}

      {!error && (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <SummaryIcon className={`h-6 w-6 ${summary === "pass" ? "text-primary" : summary === "fail" ? "text-destructive" : "text-muted-foreground"}`} />
              <div>
                <h2 className="font-display text-xl">
                  {isFetching && !data
                    ? "Running checks…"
                    : summary === "pass"
                      ? "All checks passed"
                      : summary === "fail"
                        ? "Action needed"
                        : "Review warnings"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {data?.ranAt ? `Last run ${new Date(data.ranAt).toLocaleString()}` : "The check starts automatically when this page opens."}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-3">
        {(data?.checks ?? []).map((check) => {
          const Icon = check.status === "pass" ? CheckCircle2 : check.status === "fail" ? XCircle : AlertTriangle;
          return (
            <section key={check.key} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-3">
                <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${check.status === "pass" ? "text-primary" : check.status === "fail" ? "text-destructive" : "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{check.label}</h3>
                    <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">{check.status}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{check.message}</p>
                  {check.advice && <p className="mt-2 text-sm">{check.advice}</p>}
                  {check.detail && (
                    <pre className="mt-3 whitespace-pre-wrap break-words rounded-md bg-background/70 p-3 text-xs text-muted-foreground">{check.detail}</pre>
                  )}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
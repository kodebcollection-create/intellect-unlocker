// Converts raw errors (Supabase/Postgres/AI gateway) to safe, user-facing messages.
// Raw error details (table names, constraint names, internal IDs) are logged
// server-side only and never surfaced to the client.

type AnyErr = { message?: string; code?: string; status?: number } | null | undefined;

/**
 * Logs the raw error server-side and returns a generic, user-safe message.
 * If `fallback` is omitted a neutral default is used.
 */
export function safeError(err: AnyErr, fallback = "Something went wrong. Please try again."): string {
  try {
    // eslint-disable-next-line no-console
    console.error("[server-error]", err);
  } catch {
    // ignore logging failures
  }

  const code = err?.code;
  // Map a small set of well-known Postgres / PostgREST codes to friendly text.
  switch (code) {
    case "23505": return "That already exists.";
    case "23503": return "Related record is missing.";
    case "23502": return "A required field is missing.";
    case "42501":
    case "PGRST301": return "You don't have permission to do that.";
    case "PGRST116": return "Not found.";
  }
  return fallback;
}

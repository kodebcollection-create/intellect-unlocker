// Server-only helpers — never imported from a client-reachable module at top level.
// `.server.ts` files are stripped from the client bundle entirely.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Throws if the given user has not unlocked the given book.
 * A book is unlocked when:
 *   - it is published, AND
 *   - its global_order = 1, OR every other book with a lower global_order has
 *     a user_progress row for this user with quiz_passed = true.
 */
export async function assertBookUnlocked(userId: string, bookId: string): Promise<void> {
  const { data: book, error } = await supabaseAdmin
    .from("books")
    .select("id, global_order, published")
    .eq("id", bookId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!book) throw new Error("Book not found");
  if (!book.published) throw new Error("This book isn't available yet.");
  if (book.global_order === 1) return;

  const { data: priors, error: pErr } = await supabaseAdmin
    .from("books")
    .select("id")
    .lt("global_order", book.global_order)
    .eq("published", true);
  if (pErr) throw new Error(pErr.message);
  const priorIds = (priors ?? []).map((b) => b.id);
  if (priorIds.length === 0) return;

  const { data: passed, error: prErr } = await supabaseAdmin
    .from("user_progress")
    .select("book_id")
    .eq("user_id", userId)
    .eq("quiz_passed", true)
    .in("book_id", priorIds);
  if (prErr) throw new Error(prErr.message);

  const passedCount = (passed ?? []).length;
  if (passedCount < priorIds.length) {
    throw new Error("This book isn't unlocked yet — pass the previous book's quiz first.");
  }
}

/** Append an entry to the admin activity log. Never throws — logging must not break the action. */
export async function logAdminActivity(params: {
  actorUserId: string;
  action: string;
  bookId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await supabaseAdmin.from("admin_activity_log").insert({
      actor_user_id: params.actorUserId,
      action: params.action,
      book_id: params.bookId ?? null,
      metadata: (params.metadata ?? {}) as never,
    });
  } catch {
    // swallow — telemetry only
  }
}

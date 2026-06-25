// Server functions for book management, progress, and AI quiz generation.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { safeError } from "@/lib/safe-error";

// Get a signed URL for a book's PDF (valid 1 hour). User-scoped and unlock-gated.
// Takes the book_id (not the raw storage path) so the server can verify both the
// book is published AND the user has unlocked it before issuing a URL.
export const getPdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertBookUnlocked } = await import("@/lib/unlock.server");
    await assertBookUnlocked(context.userId, data.book_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: book, error: bErr } = await supabaseAdmin
      .from("books").select("pdf_path").eq("id", data.book_id).maybeSingle();
    if (bErr) throw new Error(safeError(bErr));
    if (!book?.pdf_path) throw new Error("This book has no PDF uploaded yet.");

    const { data: signed, error } = await context.supabase.storage
      .from("book-pdfs").createSignedUrl(book.pdf_path, 3600);
    if (error) throw new Error(safeError(error));
    return { url: signed.signedUrl };
  });

// Save/update reading progress (auto-bookmark). Unlock-gated.
export const saveProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    book_id: z.string().uuid(),
    current_page: z.number().int().min(1),
    total_pages: z.number().int().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertBookUnlocked } = await import("@/lib/unlock.server");
    await assertBookUnlocked(context.userId, data.book_id);
    const { error } = await context.supabase.from("user_progress").upsert({
      user_id: context.userId,
      book_id: data.book_id,
      current_page: data.current_page,
      total_pages: data.total_pages ?? null,
      last_read_at: new Date().toISOString(),
    }, { onConflict: "user_id,book_id" });
    if (error) throw new Error(safeError(error));
    return { ok: true };
  });

// Mark book complete (after finishing pages — pre-quiz). Unlock-gated.
export const markBookComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertBookUnlocked } = await import("@/lib/unlock.server");
    await assertBookUnlocked(context.userId, data.book_id);
    const { error } = await context.supabase.from("user_progress").upsert({
      user_id: context.userId,
      book_id: data.book_id,
      completed: true,
      current_page: 1,
      last_read_at: new Date().toISOString(),
    }, { onConflict: "user_id,book_id", ignoreDuplicates: false });
    if (error) throw new Error(safeError(error));
    return { ok: true };
  });

// Submit quiz answers; score & maybe unlock next book.
// CRITICAL: on a failed attempt the response strips correct_index/explanation
// so users can't read the answer key off the results screen and retry.
export const submitQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    book_id: z.string().uuid(),
    answers: z.array(z.object({ question_id: z.string().uuid(), choice: z.number().int() })),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertBookUnlocked } = await import("@/lib/unlock.server");
    await assertBookUnlocked(context.userId, data.book_id);

    const ids = data.answers.map(a => a.question_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: qs, error } = await supabaseAdmin
      .from("quiz_questions").select("id, book_id, correct_index, explanation").in("id", ids);
    if (error) throw new Error(safeError(error));

    // Defense-in-depth: reject any submitted question that doesn't belong to this book.
    const map = new Map(qs.filter(q => q.book_id === data.book_id).map(q => [q.id, q]));
    let score = 0;
    const fullDetailed = data.answers.map(a => {
      const q = map.get(a.question_id);
      const correct = !!q && q.correct_index === a.choice;
      if (correct) score++;
      return {
        question_id: a.question_id,
        choice: a.choice,
        correct,
        correct_index: q?.correct_index,
        explanation: q?.explanation,
      };
    });
    const total = data.answers.length;
    const passed = total > 0 && score / total >= 0.7;

    // Store the full detail server-side (admin can review later); pass nothing privileged to the client on a fail.
    await context.supabase.from("quiz_attempts").insert({
      user_id: context.userId, book_id: data.book_id, score, total, passed, answers: fullDetailed,
    });
    await context.supabase.from("user_progress").upsert({
      user_id: context.userId, book_id: data.book_id, completed: true, quiz_passed: passed,
      last_read_at: new Date().toISOString(),
    }, { onConflict: "user_id,book_id" });

    const detailed = passed
      ? fullDetailed
      : fullDetailed.map(({ question_id, choice, correct }) => ({ question_id, choice, correct }));
    return { score, total, passed, detailed };
  });

// Generate quiz from a book's PDF via Lovable AI (admin only).
export const generateQuizFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { data: book, error: bErr } = await context.supabase.from("books").select("id, title, pdf_path").eq("id", data.book_id).single();
    if (bErr || !book?.pdf_path) throw new Error("Book has no PDF uploaded");
    const { data: signed, error: sErr } = await context.supabase.storage.from("book-pdfs").createSignedUrl(book.pdf_path, 600);
    if (sErr) throw new Error(safeError(sErr));
    const pdfRes = await fetch(signed.signedUrl);
    if (!pdfRes.ok) throw new Error("Failed to fetch PDF");
    const buf = new Uint8Array(await pdfRes.arrayBuffer());
    const MAX = 19 * 1024 * 1024;
    if (buf.length > MAX) {
      throw new Error(`PDF is ${(buf.length / 1024 / 1024).toFixed(1)}MB. The AI quiz generator accepts PDFs up to ~19MB — please upload a smaller or compressed version of this book.`);
    }
    let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You generate rigorous multiple-choice comprehension quizzes from books." },
        { role: "user", content: [
          { type: "text", text: `Read this book ("${book.title}") and produce exactly 15 multiple-choice questions assessing comprehension of core arguments, key concepts, and notable examples. Return STRICT JSON: {"questions":[{"question":string,"options":[string,string,string,string],"correct_index":0-3,"explanation":string}]}` },
          { type: "file", file: { filename: "book.pdf", file_data: `data:application/pdf;base64,${b64}` } },
        ] },
      ],
      response_format: { type: "json_object" },
    };

    let aiRes: Response;
    try {
      aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
        body: JSON.stringify(body),
      });
    } catch (e: unknown) {
      throw new Error(safeError(e as { message?: string }, "Could not reach the AI service. Please try again."));
    }
    if (aiRes.status === 429) throw new Error("AI rate limit hit. Try again shortly.");
    if (aiRes.status === 402) throw new Error("AI credits exhausted. Please add credits in workspace settings.");
    if (!aiRes.ok) {
      // Log the raw upstream body server-side only.
      const errBody = await aiRes.text().catch(() => "");
      // eslint-disable-next-line no-console
      console.error("[ai-gateway-error]", aiRes.status, errBody.slice(0, 1000));
      throw new Error("The AI service returned an error. Please try again.");
    }
    const j = await aiRes.json();
    const content = j.choices?.[0]?.message?.content ?? "{}";
    let parsed: { questions: Array<{ question: string; options: string[]; correct_index: number; explanation?: string }> };
    try { parsed = JSON.parse(content); } catch { throw new Error("AI returned non-JSON"); }
    if (!Array.isArray(parsed.questions) || parsed.questions.length < 5) throw new Error("AI returned too few questions");

    await context.supabase.from("quiz_questions").delete().eq("book_id", data.book_id);
    const rows = parsed.questions.slice(0, 20).map((q, i) => ({
      book_id: data.book_id,
      question: q.question,
      options: q.options,
      correct_index: Math.max(0, Math.min(3, q.correct_index ?? 0)),
      explanation: q.explanation ?? null,
      display_order: i,
    }));
    const { error: insErr } = await context.supabase.from("quiz_questions").insert(rows);
    if (insErr) throw new Error(safeError(insErr));

    const { logAdminActivity } = await import("@/lib/unlock.server");
    await logAdminActivity({ actorUserId: context.userId, action: "generate_quiz", bookId: data.book_id, metadata: { count: rows.length } });

    return { count: rows.length };
  });

// Admin: list books and quiz counts without exposing quiz answer columns to the browser.
export const getAdminBooks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: books, error } = await supabaseAdmin
      .from("books")
      .select("*, categories(name)")
      .order("global_order");
    if (error) throw new Error(safeError(error));

    const ids = (books ?? []).map((b) => b.id);
    const counts = new Map<string, number>();
    await Promise.all(ids.map(async (id) => {
      const { count, error: countError } = await supabaseAdmin
        .from("quiz_questions")
        .select("id", { count: "exact", head: true })
        .eq("book_id", id);
      if (countError) throw new Error(safeError(countError));
      counts.set(id, count ?? 0);
    }));

    return (books ?? []).map((book) => ({
      ...book,
      quiz_questions: [{ count: counts.get(book.id) ?? 0 }],
    }));
  });

// Admin: record an uploaded PDF path (and optional page count) on a book.
export const setBookPdfPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    book_id: z.string().uuid(),
    pdf_path: z.string(),
    page_count: z.number().int().positive().optional(),
    replaced: z.boolean().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const update: { pdf_path: string; page_count?: number } = { pdf_path: data.pdf_path };
    if (data.page_count) update.page_count = data.page_count;
    const { error } = await context.supabase.from("books").update(update).eq("id", data.book_id);
    if (error) throw new Error(safeError(error));

    const { logAdminActivity } = await import("@/lib/unlock.server");
    await logAdminActivity({
      actorUserId: context.userId,
      action: data.replaced ? "replace_pdf" : "upload_pdf",
      bookId: data.book_id,
      metadata: { pdf_path: data.pdf_path, page_count: data.page_count ?? null },
    });
    return { ok: true };
  });

// Admin: delete just the PDF file (book row stays).
export const deleteBookPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { data: b } = await context.supabase.from("books").select("pdf_path").eq("id", data.book_id).single();
    if (b?.pdf_path) await context.supabase.storage.from("book-pdfs").remove([b.pdf_path]);
    // Unpublishing once the file is gone keeps it out of the library.
    await context.supabase.from("books").update({ pdf_path: null, page_count: null, published: false }).eq("id", data.book_id);

    const { logAdminActivity } = await import("@/lib/unlock.server");
    await logAdminActivity({
      actorUserId: context.userId,
      action: "delete_pdf",
      bookId: data.book_id,
      metadata: { pdf_path: b?.pdf_path ?? null },
    });
    return { ok: true };
  });

// Admin: delete an entire book row (used to clean up mistaken/duplicate entries).
export const deleteBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: book } = await supabaseAdmin.from("books").select("id, title, pdf_path").eq("id", data.book_id).maybeSingle();
    if (!book) throw new Error("Book not found");
    if (book.pdf_path) {
      await supabaseAdmin.storage.from("book-pdfs").remove([book.pdf_path]);
    }
    await supabaseAdmin.from("quiz_questions").delete().eq("book_id", data.book_id);
    const { error } = await supabaseAdmin.from("books").delete().eq("id", data.book_id);
    if (error) throw new Error(safeError(error));

    const { logAdminActivity } = await import("@/lib/unlock.server");
    await logAdminActivity({
      actorUserId: context.userId,
      action: "delete_book",
      bookId: null,
      metadata: { deleted_book_id: data.book_id, title: book.title },
    });
    return { ok: true };
  });

// Admin: toggle the published flag. Unpublished books are hidden from the library
// and from getPdfUrl / submitQuiz / etc.
export const setBookPublished = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    book_id: z.string().uuid(),
    published: z.boolean(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { error } = await context.supabase.from("books").update({ published: data.published }).eq("id", data.book_id);
    if (error) throw new Error(safeError(error));

    const { logAdminActivity } = await import("@/lib/unlock.server");
    await logAdminActivity({
      actorUserId: context.userId,
      action: data.published ? "publish" : "unpublish",
      bookId: data.book_id,
    });
    return { ok: true };
  });

// Admin: update a book's title.
export const updateBookTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid(), title: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { error } = await context.supabase.from("books").update({ title: data.title }).eq("id", data.book_id);
    if (error) throw new Error(safeError(error));
    return { ok: true };
  });

// Promote current user to admin (only if no admin exists). Bootstrap mechanism.
export const claimAdminIfFirst = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("user_roles").select("*", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) return { granted: false, reason: "Admin already exists" };
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(safeError(error));
    return { granted: true };
  });

// Admin: create a new book row in a category. global_order/display_order auto-computed.
export const createBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    category_id: z.string().uuid(),
    title: z.string().min(1).max(200),
    pdf_path: z.string().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: maxGlobal } = await supabaseAdmin.from("books").select("global_order").order("global_order", { ascending: false }).limit(1).maybeSingle();
    const { data: maxDisp } = await supabaseAdmin.from("books").select("display_order").eq("category_id", data.category_id).order("display_order", { ascending: false }).limit(1).maybeSingle();
    const nextGlobal = (maxGlobal?.global_order ?? 0) + 1;
    const nextDisp = (maxDisp?.display_order ?? 0) + 1;

    const { data: row, error } = await supabaseAdmin.from("books").insert({
      category_id: data.category_id,
      title: data.title,
      pdf_path: data.pdf_path ?? null,
      global_order: nextGlobal,
      display_order: nextDisp,
      published: false, // always start as draft
    }).select("id").single();
    if (error) throw new Error(safeError(error));

    const { logAdminActivity } = await import("@/lib/unlock.server");
    await logAdminActivity({
      actorUserId: context.userId,
      action: "create_book",
      bookId: row.id,
      metadata: { title: data.title, category_id: data.category_id },
    });
    return { id: row.id };
  });

// Admin: paginated activity feed.
export const getAdminActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("admin_activity_log")
      .select("id, actor_user_id, action, book_id, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(safeError(error));

    const actorIds = Array.from(new Set((data ?? []).map((r) => r.actor_user_id).filter(Boolean) as string[]));
    const bookIds = Array.from(new Set((data ?? []).map((r) => r.book_id).filter(Boolean) as string[]));
    const [{ data: profiles }, { data: books }] = await Promise.all([
      actorIds.length
        ? supabaseAdmin.from("profiles").select("id, display_name").in("id", actorIds)
        : Promise.resolve({ data: [] as Array<{ id: string; display_name: string | null }> }),
      bookIds.length
        ? supabaseAdmin.from("books").select("id, title").in("id", bookIds)
        : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    ]);
    const pMap = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
    const bMap = new Map((books ?? []).map((b) => [b.id, b.title]));

    return (data ?? []).map((r) => ({
      ...r,
      actor_name: r.actor_user_id ? (pMap.get(r.actor_user_id) ?? null) : null,
      book_title: r.book_id ? (bMap.get(r.book_id) ?? null) : (r.metadata as any)?.title ?? null,
    }));
  });

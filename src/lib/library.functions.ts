// Server functions for book management, progress, and AI quiz generation.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Get a signed URL for a book's PDF (valid 1 hour). User-scoped (RLS).
export const getPdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ path: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("book-pdfs").createSignedUrl(data.path, 3600);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

// Save/update reading progress (auto-bookmark)
export const saveProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    book_id: z.string().uuid(),
    current_page: z.number().int().min(1),
    total_pages: z.number().int().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("user_progress").upsert({
      user_id: context.userId,
      book_id: data.book_id,
      current_page: data.current_page,
      total_pages: data.total_pages ?? null,
      last_read_at: new Date().toISOString(),
    }, { onConflict: "user_id,book_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Mark book complete (after finishing pages — pre-quiz)
export const markBookComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("user_progress").upsert({
      user_id: context.userId,
      book_id: data.book_id,
      completed: true,
      current_page: 1,
      last_read_at: new Date().toISOString(),
    }, { onConflict: "user_id,book_id", ignoreDuplicates: false });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Submit quiz answers; score & maybe unlock next book.
export const submitQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    book_id: z.string().uuid(),
    answers: z.array(z.object({ question_id: z.string().uuid(), choice: z.number().int() })),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const ids = data.answers.map(a => a.question_id);
    // Use admin client to read the answer key — regular users have no SELECT grant on `correct_index`.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: qs, error } = await supabaseAdmin
      .from("quiz_questions").select("id, correct_index, explanation").in("id", ids);
    if (error) throw new Error(error.message);
    const map = new Map(qs.map(q => [q.id, q]));
    let score = 0;
    const detailed = data.answers.map(a => {
      const q = map.get(a.question_id);
      const correct = q?.correct_index === a.choice;
      if (correct) score++;
      return { question_id: a.question_id, choice: a.choice, correct, correct_index: q?.correct_index, explanation: q?.explanation };
    });
    const total = data.answers.length;
    const passed = total > 0 && score / total >= 0.7;
    await context.supabase.from("quiz_attempts").insert({
      user_id: context.userId, book_id: data.book_id, score, total, passed, answers: detailed,
    });
    await context.supabase.from("user_progress").upsert({
      user_id: context.userId, book_id: data.book_id, completed: true, quiz_passed: passed,
      last_read_at: new Date().toISOString(),
    }, { onConflict: "user_id,book_id" });
    return { score, total, passed, detailed };
  });

// Generate quiz from a book's PDF via Lovable AI (admin only).
export const generateQuizFromPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    const isAdmin = !!roleRow;
    if (!isAdmin) throw new Error("Forbidden");
    const { data: book, error: bErr } = await context.supabase.from("books").select("id, title, pdf_path").eq("id", data.book_id).single();
    if (bErr || !book?.pdf_path) throw new Error("Book has no PDF uploaded");
    const { data: signed, error: sErr } = await context.supabase.storage.from("book-pdfs").createSignedUrl(book.pdf_path, 600);
    if (sErr) throw new Error(sErr.message);
    const pdfRes = await fetch(signed.signedUrl);
    if (!pdfRes.ok) throw new Error("Failed to fetch PDF");
    const buf = new Uint8Array(await pdfRes.arrayBuffer());
    // Gemini inline file limit is ~20MB; refuse early with a clear message.
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
    } catch (e: any) {
      throw new Error(`Could not reach the AI gateway: ${e?.message ?? "network error"}`);
    }
    if (aiRes.status === 429) throw new Error("AI rate limit hit. Try again shortly.");
    if (aiRes.status === 402) throw new Error("AI credits exhausted. Please add credits in workspace settings.");
    if (!aiRes.ok) {
      const errBody = await aiRes.text().catch(() => "");
      throw new Error(`AI error ${aiRes.status}: ${errBody.slice(0, 400) || aiRes.statusText}`);
    }
    const j = await aiRes.json();
    const content = j.choices?.[0]?.message?.content ?? "{}";
    let parsed: { questions: Array<{ question: string; options: string[]; correct_index: number; explanation?: string }> };
    try { parsed = JSON.parse(content); } catch { throw new Error("AI returned non-JSON"); }
    if (!Array.isArray(parsed.questions) || parsed.questions.length < 5) throw new Error("AI returned too few questions");

    // Replace existing quiz for this book
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
    if (insErr) throw new Error(insErr.message);
    return { count: rows.length };
  });

// Admin: upload PDF (path generated client-side, stored via signed URL). Here we just record the path on the book.
export const setBookPdfPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid(), pdf_path: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    const isAdmin = !!roleRow;
    if (!isAdmin) throw new Error("Forbidden");
    const { error } = await context.supabase.from("books").update({ pdf_path: data.pdf_path }).eq("id", data.book_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin: delete PDF for a book
export const deleteBookPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    const isAdmin = !!roleRow;
    if (!isAdmin) throw new Error("Forbidden");
    const { data: b } = await context.supabase.from("books").select("pdf_path").eq("id", data.book_id).single();
    if (b?.pdf_path) await context.supabase.storage.from("book-pdfs").remove([b.pdf_path]);
    await context.supabase.from("books").update({ pdf_path: null }).eq("id", data.book_id);
    return { ok: true };
  });

// Admin: update a book's title
export const updateBookTitle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid(), title: z.string().min(1).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { error } = await context.supabase.from("books").update({ title: data.title }).eq("id", data.book_id);
    if (error) throw new Error(error.message);
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
    if (error) throw new Error(error.message);
    return { granted: true };
  });

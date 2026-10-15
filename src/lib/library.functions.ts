// Server functions for book management, progress, and AI quiz generation.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { safeError } from "@/lib/safe-error";

// User library list. Uses the server to return only safe, published book fields
// so the client never needs direct access to the private pdf_path column.
export const getLibraryData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [catsResult, booksResult, progressResult] = await Promise.all([
      supabaseAdmin.from("categories").select("id, name, description, display_order, created_at").order("display_order"),
      supabaseAdmin
        .from("books")
        .select("id, title, author, category_id, cover_url, description, display_order, global_order, has_pdf, page_count, published, total_pages")
        .eq("published", true)
        .order("global_order"),
      supabaseAdmin.from("user_progress").select("*").eq("user_id", context.userId),
    ]);

    if (catsResult.error) throw new Error(safeError(catsResult.error));
    if (booksResult.error) throw new Error(safeError(booksResult.error));
    if (progressResult.error) throw new Error(safeError(progressResult.error));

    return {
      cats: catsResult.data ?? [],
      books: booksResult.data ?? [],
      progress: progressResult.data ?? [],
    };
  });

export const getBookDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: adminRole, error: adminRoleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminRoleError) throw new Error(safeError(adminRoleError));
    const isAdmin = !!adminRole;
    let query = supabaseAdmin
      .from("books")
      .select("id, title, author, category_id, cover_url, description, display_order, global_order, has_pdf, page_count, published, total_pages, categories(name)")
      .eq("id", data.book_id);
    if (!isAdmin) query = query.eq("published", true);
    const { data: book, error } = await query.maybeSingle();
    if (error) throw new Error(safeError(error));
    if (!book) throw new Error("Book not found");
    return book;
  });

export const getQuizData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertBookUnlocked } = await import("@/lib/unlock.server");
    await assertBookUnlocked(context.userId, data.book_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [bookResult, questionsResult] = await Promise.all([
      supabaseAdmin.from("books").select("id, title").eq("id", data.book_id).eq("published", true).maybeSingle(),
      supabaseAdmin
        .from("quiz_questions")
        .select("id, book_id, question, options, display_order")
        .eq("book_id", data.book_id)
        .order("display_order"),
    ]);
    if (bookResult.error) throw new Error(safeError(bookResult.error));
    if (questionsResult.error) throw new Error(safeError(questionsResult.error));
    return { book: bookResult.data, questions: questionsResult.data ?? [] };
  });

export const getProgressPageData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: adminRole, error: adminRoleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminRoleError) throw new Error(safeError(adminRoleError));
    const isAdmin = !!adminRole;
    const booksQuery = supabaseAdmin
      .from("books")
      .select("id, title, author, category_id, cover_url, description, display_order, global_order, has_pdf, page_count, published, total_pages")
      .order("global_order");
    const [booksResult, progressResult, attemptsResult] = await Promise.all([
      isAdmin ? booksQuery : booksQuery.eq("published", true),
      supabaseAdmin.from("user_progress").select("*").eq("user_id", context.userId),
      supabaseAdmin.from("quiz_attempts").select("*").eq("user_id", context.userId).order("created_at", { ascending: false }),
    ]);
    if (booksResult.error) throw new Error(safeError(booksResult.error));
    if (progressResult.error) throw new Error(safeError(progressResult.error));
    if (attemptsResult.error) throw new Error(safeError(attemptsResult.error));
    return { books: booksResult.data ?? [], progress: progressResult.data ?? [], attempts: attemptsResult.data ?? [] };
  });

export const getReviewQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { assertBookUnlocked } = await import("@/lib/unlock.server");
    await assertBookUnlocked(context.userId, data.book_id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: questions, error } = await supabaseAdmin
      .from("quiz_questions")
      .select("id, question, options, display_order")
      .eq("book_id", data.book_id)
      .order("display_order");
    if (error) throw new Error(safeError(error));
    return questions ?? [];
  });

// Get a signed URL for a book's PDF (valid 1 hour). User-scoped and unlock-gated.
// Takes the book_id (not the raw storage path) so the server can verify both the
// book is published AND the user has unlocked it before issuing a URL.
export const getPdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ book_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: adminRole, error: adminRoleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (adminRoleError) throw new Error(safeError(adminRoleError));
    const isAdmin = !!adminRole;
    if (!isAdmin) {
      const { assertBookUnlocked } = await import("@/lib/unlock.server");
      await assertBookUnlocked(context.userId, data.book_id);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: book, error: bErr } = await supabaseAdmin
      .from("books").select("pdf_path").eq("id", data.book_id).maybeSingle();
    if (bErr) throw new Error(safeError(bErr));
    if (!book?.pdf_path) throw new Error("This book has no PDF uploaded yet.");

    const { data: signed, error } = await supabaseAdmin.storage
      .from("book-pdfs").createSignedUrl(book.pdf_path, 3600);
    if (error) throw new Error(safeError(error));
    return { url: signed.signedUrl };
  });

type HealthCheckStatus = "pass" | "fail" | "warn";

// Admin-only: run the same authenticated storage/read paths the UI depends on.
export const runStorageHealthCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const checks: Array<{
      key: string;
      label: string;
      status: HealthCheckStatus;
      message: string;
      detail?: string;
      advice?: string;
    }> = [];

    const addCheck = (check: (typeof checks)[number]) => checks.push(check);
    const diagnosticError = (error: unknown) => {
      if (!error || typeof error !== "object") return String(error ?? "Unknown backend error");
      const parts = [
        "message" in error ? String((error as { message?: unknown }).message ?? "") : "",
        "code" in error ? `code: ${String((error as { code?: unknown }).code ?? "")}` : "",
        "status" in error ? `status: ${String((error as { status?: unknown }).status ?? "")}` : "",
      ].filter(Boolean);
      return parts.join(" · ") || "Unknown backend error";
    };
    const policyAdvice = (message: string, area: "storage" | "read" | "role") => {
      const lower = message.toLowerCase();
      if (lower.includes("row-level security") || lower.includes("rls") || lower.includes("policy")) {
        if (area === "storage") {
          return "The signed-in account reached storage, but the upload policy rejected it. Confirm the account has the admin role and the book-pdfs admin upload policy is active.";
        }
        return "A database access policy rejected this read. Confirm the signed-in account has the expected role and the table grants/policies are active.";
      }
      if (lower.includes("permission denied") || lower.includes("not authorized") || lower.includes("unauthorized")) {
        return "The backend denied permission. Sign out and back in, then confirm this account is still an admin.";
      }
      if (lower.includes("jwt") || lower.includes("token") || lower.includes("auth")) {
        return "The session token was missing or invalid. Sign out and back in, then retry the check.";
      }
      return area === "storage"
        ? "Storage did not accept the test upload. Check the storage upload policy and retry."
        : "The read check failed. Check the related table grant or access policy and retry.";
    };
    const { data: roleRowForCheck, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) {
      const detail = diagnosticError(roleError);
      addCheck({
        key: "admin-role",
        label: "Admin role check",
        status: "fail",
        message: "Could not verify the current account's admin role.",
        detail,
        advice: policyAdvice(detail, "role"),
      });
      return { ranAt: new Date().toISOString(), checks, summary: "fail" as const };
    }
    if (!roleRowForCheck) throw new Error("Forbidden");
    addCheck({
      key: "admin-role",
      label: "Admin role check",
      status: "pass",
      message: "This signed-in account is recognized as an admin.",
    });

    const roleRead = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleRead.error) {
      const detail = diagnosticError(roleRead.error);
      addCheck({
        key: "role-row-read",
        label: "Role table read",
        status: "fail",
        message: "The app could not read the current admin role row.",
        detail,
        advice: policyAdvice(detail, "read"),
      });
    } else {
      addCheck({
        key: "role-row-read",
        label: "Role table read",
        status: "pass",
        message: "The admin role row is readable by this account.",
      });
    }

    const categoryRead = await context.supabase.from("categories").select("id, name").limit(1);
    if (categoryRead.error) {
      const detail = diagnosticError(categoryRead.error);
      addCheck({
        key: "category-read",
        label: "Category read",
        status: "fail",
        message: "The app could not read library categories.",
        detail,
        advice: policyAdvice(detail, "read"),
      });
    } else {
      addCheck({
        key: "category-read",
        label: "Category read",
        status: "pass",
        message: `Category metadata is readable (${categoryRead.data?.length ?? 0} sample row${(categoryRead.data?.length ?? 0) === 1 ? "" : "s"}).`,
      });
    }

    const probePath = `_health/${context.userId}/${Date.now()}.pdf`;
    const probePdf = new Blob(["%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"], { type: "application/pdf" });
    const uploadResult = await context.supabase.storage
      .from("book-pdfs")
      .upload(probePath, probePdf, { contentType: "application/pdf", upsert: false });

    if (uploadResult.error) {
      const detail = diagnosticError(uploadResult.error);
      addCheck({
        key: "storage-upload",
        label: "Authenticated storage upload",
        status: "fail",
        message: "The private PDF bucket rejected an authenticated admin upload.",
        detail,
        advice: policyAdvice(detail, "storage"),
      });
    } else {
      addCheck({
        key: "storage-upload",
        label: "Authenticated storage upload",
        status: "pass",
        message: "The private PDF bucket accepted a test upload from this admin account.",
      });

      const cleanup = await context.supabase.storage.from("book-pdfs").remove([probePath]);
      if (cleanup.error) {
        const detail = diagnosticError(cleanup.error);
        addCheck({
          key: "storage-cleanup",
          label: "Storage cleanup",
          status: "warn",
          message: "The upload worked, but the test file could not be removed automatically.",
          detail,
          advice: "Uploads are allowed, but delete cleanup may be blocked. Check the admin delete policy for the PDF bucket.",
        });
      } else {
        addCheck({
          key: "storage-cleanup",
          label: "Storage cleanup",
          status: "pass",
          message: "The test PDF was removed successfully.",
        });
      }
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error: libraryReadError } = await supabaseAdmin
      .from("books")
      .select("id", { count: "exact", head: true })
      .eq("published", true)
      .not("pdf_path", "is", null);
    if (libraryReadError) {
      const detail = diagnosticError(libraryReadError);
      addCheck({
        key: "published-library-read",
        label: "Published library read path",
        status: "fail",
        message: "The server-side library read path could not load published PDFs.",
        detail,
        advice: "The learner library uses this read path. Check the books table and retry Sync Library after publishing.",
      });
    } else {
      addCheck({
        key: "published-library-read",
        label: "Published library read path",
        status: "pass",
        message: `${count ?? 0} published PDF${(count ?? 0) === 1 ? "" : "s"} are visible to the library read path.`,
      });
    }

    const failed = checks.filter((check) => check.status === "fail").length;
    const warnings = checks.filter((check) => check.status === "warn").length;
    return {
      ranAt: new Date().toISOString(),
      checks,
      summary: failed > 0 ? "fail" : warnings > 0 ? "warn" : "pass",
    };
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
    // fullDetailed is used only in-memory to return per-question feedback to the
    // client when the user passes. It is NEVER persisted with the answer key —
    // the row stored in quiz_attempts.answers is stripped to {question_id, choice, correct}
    // so users cannot extract correct_index/explanation from their own attempt history.
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

    // Persist only the sanitized shape — no correct_index, no explanation.
    const persistedAnswers = fullDetailed.map(({ question_id, choice, correct }) => ({
      question_id, choice, correct,
    }));
    await context.supabase.from("quiz_attempts").insert({
      user_id: context.userId, book_id: data.book_id, score, total, passed,
      answers: persistedAnswers,
    });
    // user_progress.quiz_passed is guarded by a DB trigger that forces it to false
    // for any non-service_role writer. Use supabaseAdmin so a passed quiz can flip it.
    await supabaseAdmin.from("user_progress").upsert({
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: book, error: bErr } = await supabaseAdmin.from("books").select("id, title, pdf_path").eq("id", data.book_id).single();
    if (bErr || !book?.pdf_path) throw new Error("Book has no PDF uploaded");
    const { data: signed, error: sErr } = await supabaseAdmin.storage.from("book-pdfs").createSignedUrl(book.pdf_path, 600);
    if (sErr) throw new Error(safeError(sErr));
    const pdfRes = await fetch(signed.signedUrl);
    if (!pdfRes.ok) throw new Error("Failed to fetch PDF");
    const buf = new Uint8Array(await pdfRes.arrayBuffer());
    const MAX = 19 * 1024 * 1024;
    if (buf.length > MAX) {
      throw new Error(`PDF is ${(buf.length / 1024 / 1024).toFixed(1)}MB. The AI quiz generator accepts PDFs up to ~19MB — please upload a smaller or compressed version of this book.`);
    }
    const b64 = Buffer.from(buf).toString("base64");
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

    const { data: allQuestions, error: countError } = await supabaseAdmin
      .from("quiz_questions")
      .select("book_id");
    if (countError) throw new Error(safeError(countError));

    const counts = new Map<string, number>();
    for (const q of allQuestions ?? []) {
      counts.set(q.book_id, (counts.get(q.book_id) ?? 0) + 1);
    }

    return (books ?? []).map((book) => ({
      ...book,
      quiz_questions: [{ count: counts.get(book.id) ?? 0 }],
    }));
  });

// Admin: record an uploaded PDF path (and optional page count) on a book.
export const createAdminPdfUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    book_id: z.string().uuid(),
    file_name: z.string().min(1).max(240),
    file_size: z.number().int().positive().max(50 * 1024 * 1024),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow, error: roleError } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) throw new Error(safeError(roleError));
    if (!roleRow) throw new Error("Forbidden");

    const cleanedName = data.file_name
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._ -]+/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^\.+/, "")
      .slice(0, 140);
    const fileName = (cleanedName || "book.pdf").toLowerCase().endsWith(".pdf")
      ? (cleanedName || "book.pdf")
      : `${cleanedName || "book"}.pdf`;
    const path = `books/${data.book_id}/${Date.now()}-${crypto.randomUUID()}-${fileName}`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("book-pdfs")
      .createSignedUploadUrl(path, { upsert: false });
    if (error) throw new Error(safeError(error));
    return { path, token: signed.token };
  });

export const setBookPdfPath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    book_id: z.string().uuid(),
    pdf_path: z.string(),
    page_count: z.number().int().positive().nullable().optional(),
    replaced: z.boolean().optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const update: { pdf_path: string; page_count?: number } = { pdf_path: data.pdf_path };
    if (data.page_count) update.page_count = data.page_count;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("books").update(update).eq("id", data.book_id);
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: b } = await supabaseAdmin.from("books").select("pdf_path").eq("id", data.book_id).single();
    if (b?.pdf_path) await supabaseAdmin.storage.from("book-pdfs").remove([b.pdf_path]);
    // Unpublishing once the file is gone keeps it out of the library.
    await supabaseAdmin.from("books").update({ pdf_path: null, page_count: null, published: false }).eq("id", data.book_id);

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("books").update({ published: data.published }).eq("id", data.book_id);
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("books").update({ title: data.title }).eq("id", data.book_id);
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

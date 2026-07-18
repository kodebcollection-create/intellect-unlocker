import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller, unauthorized } from "../supabase";

export default defineTool({
  name: "list_my_vocabulary",
  title: "List my vocabulary",
  description: "List the signed-in user's saved vocabulary entries, newest first.",
  inputSchema: {
    book_id: z.string().uuid().optional().describe("Optional book UUID to filter entries by."),
    limit: z.number().int().min(1).max(200).optional().describe("Max entries to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ book_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    const supabase = supabaseForCaller(ctx);
    let q = supabase
      .from("vocabulary")
      .select("id, word, definition, context, book_id, created_at")
      .eq("user_id", ctx.getUserId())
      .order("created_at", { ascending: false })
      .limit(limit ?? 50);
    if (book_id) q = q.eq("book_id", book_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { vocabulary: data ?? [] },
    };
  },
});

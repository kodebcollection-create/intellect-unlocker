import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller, unauthorized } from "../supabase";

export default defineTool({
  name: "list_books",
  title: "List books",
  description:
    "List published books in the Umbra library, ordered by global_order. Optionally filter by category.",
  inputSchema: {
    category_id: z
      .string()
      .uuid()
      .optional()
      .describe("Optional category UUID to filter books by."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ category_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    const supabase = supabaseForCaller(ctx);
    let q = supabase
      .from("books")
      .select("id, title, author, description, category_id, global_order, display_order, has_pdf, total_pages, published")
      .eq("published", true)
      .order("global_order");
    if (category_id) q = q.eq("category_id", category_id);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { books: data ?? [] },
    };
  },
});

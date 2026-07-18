import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForCaller, unauthorized } from "../supabase";

export default defineTool({
  name: "list_categories",
  title: "List categories",
  description: "List all book categories in the Umbra library, in display order.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    const supabase = supabaseForCaller(ctx);
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, description, display_order")
      .order("display_order");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { categories: data ?? [] },
    };
  },
});

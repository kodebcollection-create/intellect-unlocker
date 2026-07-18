import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForCaller, unauthorized } from "../supabase";

export default defineTool({
  name: "get_my_progress",
  title: "Get my reading progress",
  description:
    "Return the signed-in user's progress across all books: current page, completion, and quiz pass state.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    const supabase = supabaseForCaller(ctx);
    const { data, error } = await supabase
      .from("user_progress")
      .select("book_id, current_page, completed, quiz_passed, updated_at")
      .eq("user_id", ctx.getUserId());
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data) }],
      structuredContent: { progress: data ?? [] },
    };
  },
});

import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForCaller, unauthorized } from "../supabase";

export default defineTool({
  name: "add_vocabulary",
  title: "Add vocabulary entry",
  description:
    "Save a new vocabulary entry (word, optional definition and context) for the signed-in user.",
  inputSchema: {
    word: z.string().trim().min(1).max(200).describe("The word or phrase to save."),
    definition: z.string().trim().max(2000).optional().describe("Optional definition."),
    context: z.string().trim().max(2000).optional().describe("Optional sentence or context."),
    book_id: z.string().uuid().optional().describe("Optional book UUID this word is from."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ word, definition, context, book_id }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthorized();
    const supabase = supabaseForCaller(ctx);
    const { data, error } = await supabase
      .from("vocabulary")
      .insert({ user_id: ctx.getUserId(), word, definition, context, book_id })
      .select("id, word, definition, context, book_id, created_at")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Saved "${data.word}".` }],
      structuredContent: { entry: data },
    };
  },
});

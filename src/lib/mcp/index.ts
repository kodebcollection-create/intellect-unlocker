import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCategories from "./tools/list_categories";
import listBooks from "./tools/list_books";
import getMyProgress from "./tools/get_my_progress";
import listMyVocabulary from "./tools/list_my_vocabulary";
import addVocabulary from "./tools/add_vocabulary";

// OAuth issuer MUST be the direct Supabase host, not the .lovable.cloud proxy.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "umbra-mcp",
  title: "Umbra Library",
  version: "0.1.0",
  instructions:
    "Tools for the Umbra reading library. Browse categories and published books, read the signed-in user's reading progress, and manage their personal vocabulary list.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCategories, listBooks, getMyProgress, listMyVocabulary, addVocabulary],
});

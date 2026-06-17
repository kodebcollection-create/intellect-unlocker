import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vocabulary")({
  component: Vocab,
});

function Vocab() {
  const qc = useQueryClient();
  const [word, setWord] = useState("");
  const [def, setDef] = useState("");
  const { data } = useQuery({
    queryKey: ["vocab"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { data } = await supabase.from("vocabulary").select("*, books(title)").eq("user_id", u.user!.id).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const add = async () => {
    if (!word.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("vocabulary").insert({ user_id: u.user!.id, word, definition: def });
    if (error) toast.error(error.message); else { setWord(""); setDef(""); qc.invalidateQueries({ queryKey: ["vocab"] }); }
  };
  const del = async (id: string) => {
    await supabase.from("vocabulary").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["vocab"] });
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl">Vocabulary builder</h1>
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="grid gap-3 md:grid-cols-[200px_1fr_auto]">
          <Input placeholder="Word" value={word} onChange={(e) => setWord(e.target.value)} />
          <Textarea placeholder="Definition / context" value={def} onChange={(e) => setDef(e.target.value)} rows={1} />
          <Button onClick={add}>Add</Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {data?.map((v: any) => (
          <div key={v.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between">
              <h3 className="font-display text-xl">{v.word}</h3>
              <Button variant="ghost" size="icon" onClick={() => del(v.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            {v.definition && <p className="mt-1 text-sm text-muted-foreground">{v.definition}</p>}
            {v.books?.title && <p className="mt-2 text-xs italic text-muted-foreground">from {v.books.title}</p>}
          </div>
        ))}
        {(!data || data.length === 0) && <p className="text-muted-foreground">No words yet. Add words you encounter while reading.</p>}
      </div>
    </div>
  );
}

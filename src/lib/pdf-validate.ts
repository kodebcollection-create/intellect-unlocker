// Client-only helper to validate a PDF before uploading without loading PDF.js.
// This keeps the admin upload flow independent from mobile browser worker/chunk
// loading issues; the dedicated viewer still does full rendering validation.

export type PdfValidationResult =
  | { ok: true; numPages: number | null }
  | { ok: false; reason: string };

export async function validatePdfFile(file: File): Promise<PdfValidationResult> {
  try {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf.slice(0, Math.min(buf.byteLength, 2_000_000)));
    const header = new TextDecoder("latin1").decode(bytes.slice(0, 1024));
    if (!header.includes("%PDF-")) return { ok: false, reason: "File is not a valid PDF document" };

    const body = new TextDecoder("latin1").decode(bytes);
    if (/\/Encrypt\b/.test(body)) {
      return { ok: false, reason: "PDF is password-protected. Remove the password and try again." };
    }

    const explicitCount = body.match(/\/Count\s+(\d+)/g)
      ?.map((match) => Number(match.match(/\d+/)?.[0] ?? 0))
      .filter((count) => Number.isFinite(count) && count > 0)
      .sort((a, b) => b - a)[0];
    const pageRefs = body.match(/\/Type\s*\/Page\b/g) ?? [];
    const pagesNodeRefs = body.match(/\/Type\s*\/Pages\b/g) ?? [];
    const inferredCount = Math.max(0, pageRefs.length - pagesNodeRefs.length);
    const numPages = explicitCount || inferredCount || null;
    return { ok: true, numPages };
  } catch (e: any) {
    return { ok: false, reason: `Could not inspect PDF: ${e?.message ?? "unknown error"}` };
  }
}

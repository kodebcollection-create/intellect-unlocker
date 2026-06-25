// Client-only helper to validate a PDF before uploading: parses it with pdfjs
// to extract the page count and reject encrypted/corrupted files.
// Imports pdfjs lazily so this never runs at SSR module-scope.
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

export type PdfValidationResult =
  | { ok: true; numPages: number }
  | { ok: false; reason: string };

export async function validatePdfFile(file: File): Promise<PdfValidationResult> {
  try {
    const pdfjs: any = await import("pdfjs-dist");
    if (!pdfjs.GlobalWorkerOptions.workerPort) {
      pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
    }
    const buf = await file.arrayBuffer();
    const task = pdfjs.getDocument({
      data: buf,
      // Reject password-protected files immediately rather than prompting.
      password: "",
    });
    const doc = await task.promise;
    const numPages = doc.numPages;
    try { await doc.destroy(); } catch {}
    if (!numPages || numPages < 1) return { ok: false, reason: "PDF reports 0 pages" };
    return { ok: true, numPages };
  } catch (e: any) {
    const msg = (e?.name === "PasswordException" || /password/i.test(e?.message ?? ""))
      ? "PDF is password-protected. Remove the password and try again."
      : `Could not parse PDF: ${e?.message ?? "unknown error"}`;
    return { ok: false, reason: msg };
  }
}

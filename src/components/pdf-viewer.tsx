// Client-only PDF viewer. Imports react-pdf / pdfjs-dist which reference DOMMatrix
// and other browser globals at module scope — never import this file from a path
// that can run during SSR. It is loaded via React.lazy from the reader route.
import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";
// Bundle the pdfjs worker as a real Worker via Vite's `?worker` suffix. This
// guarantees the worker module and the pdfjs API come from the SAME installed
// pdfjs-dist version (pinned in package.json to match react-pdf 1:1), so the
// "API version X does not match Worker version Y" error can't recur — even if
// the browser has a stale cached worker URL from a previous build.
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerPort) {
  pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
}

export default function PdfViewer({
  file,
  page,
  width,
  viewMode = "single",
  onPageChange,
  onLoadSuccess,
  onLoadError,
  fallbackUrl,
}: {
  file: { url: string };
  page: number;
  width: number;
  viewMode?: "single" | "continuous";
  onPageChange?: (page: number) => void;
  onLoadSuccess: (numPages: number) => void;
  onLoadError: (message: string) => void;
  fallbackUrl?: string;
}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [totalNumPages, setTotalNumPages] = useState<number | null>(null);

  const handleError = useCallback((err: Error) => {
    setErrorMsg(err.message);
    onLoadError(err.message);
  }, [onLoadError]);

  const handleDocumentSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setErrorMsg(null);
    setTotalNumPages(numPages);
    onLoadSuccess(numPages);
  }, [onLoadSuccess]);

  const retry = () => {
    setErrorMsg(null);
    setReloadKey((k) => k + 1);
  };

  // Scroll to active page when changed externally in continuous mode
  useEffect(() => {
    if (viewMode === "continuous") {
      const el = document.getElementById(`pdf-page-container-${page}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }, [page, viewMode]);

  if (errorMsg) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
        <p className="mt-3 font-medium text-destructive">Couldn't display the PDF inline</p>
        <p className="mt-2 break-words text-xs text-muted-foreground">{errorMsg}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="outline" onClick={retry}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry
          </Button>
          {fallbackUrl && (
            <Button size="sm" asChild>
              <a href={fallbackUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" />Open in new tab
              </a>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <Document
      key={reloadKey}
      file={file}
      onLoadSuccess={handleDocumentSuccess}
      onLoadError={handleError}
      loading={<div className="p-10 text-center text-sm text-muted-foreground">Loading PDF…</div>}
    >
      {viewMode === "continuous" && totalNumPages ? (
        <div className="space-y-6">
          {Array.from({ length: totalNumPages }, (_, i) => i + 1).map((pgNum) => (
            <div
              key={pgNum}
              id={`pdf-page-container-${pgNum}`}
              className="rounded-lg shadow-sm border border-border/60 bg-card overflow-hidden"
            >
              <Page
                pageNumber={pgNum}
                width={width}
                renderTextLayer
                renderAnnotationLayer={false}
              />
              <div className="bg-muted/40 py-1.5 text-center text-xs font-mono text-muted-foreground border-t border-border/40">
                Page {pgNum} of {totalNumPages}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Page pageNumber={page} width={width} renderTextLayer renderAnnotationLayer={false} />
      )}
    </Document>
  );
}

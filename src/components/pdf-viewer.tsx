// Client-only PDF viewer. Imports react-pdf / pdfjs-dist which reference DOMMatrix
// and other browser globals at module scope — never import this file from a path
// that can run during SSR. It is loaded via React.lazy from the reader route.
import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";
// Bundle the pdfjs worker locally via Vite. The `?url` suffix yields a hashed
// asset URL served from the app's own origin — no CDN, no CORS, no version
// mismatch. pdfjs-dist is pinned in package.json to the exact version react-pdf
// bundles so the API and worker versions match 1:1.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export default function PdfViewer({
  file,
  page,
  width,
  onLoadSuccess,
  onLoadError,
  fallbackUrl,
}: {
  file: { url: string };
  page: number;
  width: number;
  onLoadSuccess: (numPages: number) => void;
  onLoadError: (message: string) => void;
  fallbackUrl?: string;
}) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const handleError = useCallback((err: Error) => {
    setErrorMsg(err.message);
    onLoadError(err.message);
  }, [onLoadError]);

  const retry = () => {
    setErrorMsg(null);
    setReloadKey((k) => k + 1);
  };

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
      onLoadSuccess={({ numPages }) => { setErrorMsg(null); onLoadSuccess(numPages); }}
      onLoadError={handleError}
      loading={<div className="p-10 text-center text-sm text-muted-foreground">Loading PDF…</div>}
    >
      <Page pageNumber={page} width={width} renderTextLayer renderAnnotationLayer={false} />
    </Document>
  );
}

// Client-only PDF viewer. Imports react-pdf / pdfjs-dist which reference DOMMatrix
// and other browser globals at module scope — never import this file from a path
// that can run during SSR. It is loaded via React.lazy from the reader route.
import { useState, useCallback, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { Button } from "@/components/ui/button";
import { RefreshCw, ExternalLink, AlertTriangle } from "lucide-react";

// Worker source candidates, tried in order. We pin to react-pdf's bundled
// pdfjs version (pdfjs.version) to avoid "API version X does not match Worker
// version Y" errors. If a CDN is blocked on the user's network we fall back
// to the next one, and finally to the locally bundled worker.
const WORKER_SOURCES = (): string[] => {
  const v = pdfjs.version;
  return [
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${v}/pdf.worker.min.mjs`,
    `https://unpkg.com/pdfjs-dist@${v}/build/pdf.worker.min.mjs`,
    `https://cdn.jsdelivr.net/npm/pdfjs-dist@${v}/build/pdf.worker.min.mjs`,
  ];
};

function setWorker(index: number) {
  const sources = WORKER_SOURCES();
  const src = sources[Math.min(index, sources.length - 1)];
  pdfjs.GlobalWorkerOptions.workerSrc = src;
  return src;
}

if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
  setWorker(0);
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
  const [workerIndex, setWorkerIndex] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setWorker(workerIndex);
  }, [workerIndex]);

  const handleError = useCallback((err: Error) => {
    setErrorMsg(err.message);
    onLoadError(err.message);
  }, [onLoadError]);

  const isVersionMismatch = errorMsg && /API version|Worker version/i.test(errorMsg);

  const retry = () => {
    setErrorMsg(null);
    setReloadKey((k) => k + 1);
  };

  const tryNextWorker = () => {
    const next = workerIndex + 1;
    if (next >= WORKER_SOURCES().length) {
      // Cycle back if exhausted
      setWorkerIndex(0);
    } else {
      setWorkerIndex(next);
    }
    setErrorMsg(null);
    setReloadKey((k) => k + 1);
  };

  if (errorMsg) {
    return (
      <div className="mx-auto max-w-md rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center text-sm">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
        <p className="mt-3 font-medium text-destructive">Couldn't display the PDF inline</p>
        <p className="mt-2 break-words text-xs text-muted-foreground">{errorMsg}</p>
        {isVersionMismatch && (
          <p className="mt-2 text-xs text-muted-foreground">
            This usually means the PDF rendering engine needs to reload from a different source.
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button size="sm" variant="outline" onClick={retry}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Retry
          </Button>
          <Button size="sm" variant="outline" onClick={tryNextWorker}>
            Try alternate source
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
      key={`${reloadKey}-${workerIndex}`}
      file={file}
      onLoadSuccess={({ numPages }) => { setErrorMsg(null); onLoadSuccess(numPages); }}
      onLoadError={handleError}
      loading={<div className="p-10 text-center text-sm text-muted-foreground">Loading PDF…</div>}
    >
      <Page pageNumber={page} width={width} renderTextLayer renderAnnotationLayer={false} />
    </Document>
  );
}

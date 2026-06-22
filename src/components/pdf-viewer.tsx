// Client-only PDF viewer. Imports react-pdf / pdfjs-dist which reference DOMMatrix
// and other browser globals at module scope — never import this file from a path
// that can run during SSR. It is loaded via React.lazy from the reader route.
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
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
  return (
    <Document
      file={file}
      onLoadSuccess={({ numPages }) => onLoadSuccess(numPages)}
      onLoadError={(err) => onLoadError(err.message)}
      loading={<div className="p-10 text-center text-sm text-muted-foreground">Loading PDF…</div>}
      error={
        <div className="p-6 text-center text-sm">
          <p className="text-destructive">Could not render the PDF inline.</p>
          {fallbackUrl && (
            <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-primary underline">
              Open it in a new tab
            </a>
          )}
        </div>
      }
    >
      <Page pageNumber={page} width={width} renderTextLayer renderAnnotationLayer={false} />
    </Document>
  );
}

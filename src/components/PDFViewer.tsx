"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from "lucide-react";
import { pdfEngine, pdfOptions } from "@/lib/documents";
import type { PlanMarker, Observation } from "@/lib/models";
export default function PDFViewer({
  file,
  markers = [],
  observations = [],
  placing = false,
  onPlace,
  onSelect,
}: {
  file: Blob;
  markers?: PlanMarker[];
  observations?: Observation[];
  placing?: boolean;
  onPlace?: (page: number, x: number, y: number) => void;
  onSelect?: (id: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy>();
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(650);
  const [error, setError] = useState("");
  const [rendered, setRendered] = useState(false);
  const [height, setHeight] = useState(850);
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | undefined;
    setDoc(undefined);
    setPage(1);
    setError("");
    (async () => {
      const engine = await pdfEngine();
      loaded = await engine.getDocument({
        ...pdfOptions,
        data: new Uint8Array(await file.arrayBuffer()),
      }).promise;
      if (!cancelled) setDoc(loaded);
      else await loaded.destroy();
    })().catch((e) => !cancelled && setError(e.message || "PDF illisible"));
    return () => {
      cancelled = true;
      void loaded?.destroy();
    };
  }, [file]);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver((entries) =>
      setWidth(Math.max(240, entries[0].contentRect.width)),
    );
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!doc || !canvas.current) return;
    let cancelled = false;
    let task:
      | ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]>
      | undefined;
    setRendered(false);
    (async () => {
      const p = await doc.getPage(page);
      if (cancelled || !canvas.current) return;
      const initial = p.getViewport({ scale: 1 });
      const viewport = p.getViewport({ scale: (width / initial.width) * zoom });
      const c = canvas.current;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.floor(viewport.width * dpr);
      c.height = Math.floor(viewport.height * dpr);
      c.style.width = `${viewport.width}px`;
      c.style.height = `${viewport.height}px`;
      setHeight(viewport.height);
      task = p.render({
        canvas: c,
        viewport,
        transform: [dpr, 0, 0, dpr, 0, 0],
      });
      await task.promise;
      if (!cancelled) setRendered(true);
    })().catch((e) => {
      if (!cancelled && e.name !== "RenderingCancelledException")
        setError(e.message);
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, width, zoom]);
  return (
    <div className="pdf-viewer">
      <div className="pdf-toolbar">
        <button
          className="icon-button"
          aria-label="Page précédente"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span>
          Page {page} / {doc?.numPages || "…"}
        </span>
        <button
          className="icon-button"
          aria-label="Page suivante"
          disabled={!doc || page >= doc.numPages}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={18} />
        </button>
        <div className="spacer" />
        <button
          className="icon-button"
          aria-label="Réduire"
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
        >
          <ZoomOut size={18} />
        </button>
        <span>{Math.round(zoom * 100)} %</span>
        <button
          className="icon-button"
          aria-label="Agrandir"
          onClick={() => setZoom(Math.min(3, zoom + 0.25))}
        >
          <ZoomIn size={18} />
        </button>
      </div>
      {placing && (
        <p className="notice">
          Touchez le plan pour placer le repère de l’observation choisie.
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div ref={wrap} className="pdf-scroll">
        <div
          className={`pdf-page ${placing ? "placing" : ""}`}
          style={{ width: width * zoom, height }}
          onClick={(e) => {
            if (!placing || !rendered || !onPlace) return;
            const r = e.currentTarget.getBoundingClientRect();
            onPlace(
              page,
              Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
              Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
            );
          }}
        >
          <canvas ref={canvas} />
          {!rendered && (
            <span className="pdf-loading">Chargement du plan…</span>
          )}
          {rendered &&
            markers
              .filter((m) => m.page === page)
              .map((m) => {
                const o = observations.find((o) => o.id === m.observationId);
                return (
                  <button
                    key={m.id}
                    title={o?.title || "Observation"}
                    aria-label={`Ouvrir ${o?.title || "observation"}`}
                    className={`plan-pin ${o?.status || ""}`}
                    style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect?.(m.observationId);
                    }}
                  >
                    <MapPin size={18} />
                    <span>{o?.number}</span>
                  </button>
                );
              })}
        </div>
      </div>
    </div>
  );
}

import { db } from "./db";
import { uuid, now, type SourceDocument, type ReviewCandidate } from "./models";
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const pdfOptions = {
  cMapUrl: `${basePath}/pdf/cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${basePath}/pdf/standard_fonts/`,
  wasmUrl: `${basePath}/pdf/wasm/`,
};
export async function pdfEngine() {
  const pdf = await import("pdfjs-dist");
  pdf.GlobalWorkerOptions.workerSrc = `${basePath}/pdf/pdf.worker.min.mjs`;
  return pdf;
}
const openPattern =
  /(à\s+(?:reprendre|réaliser|faire|vérifier|contrôler|poser|surveiller|terminer)|en\s+attente|reste\s+à|non\s+(?:posé|réalisé|conforme|terminé)|réserve|bloquant|toujours|prévoir)/i;
const closedPattern =
  /(réserve[s]?\s+levée[s]?|point\s+clôturé|travaux\s+terminés)/i;
export function identifyCandidates(chunks: { text: string; page?: number }[]) {
  return chunks
    .flatMap((c) =>
      c.text
        .split(/\n+/)
        .map((t) => t.trim())
        .filter(
          (t) => t.length > 8 && openPattern.test(t) && !closedPattern.test(t),
        )
        .map((text) => ({ text, page: c.page })),
    )
    .slice(0, 300);
}
export async function importReport(meetingId: string, file: File) {
  if (file.size > 50 * 1024 * 1024) throw Error("Document limité à 50 Mo.");
  const format = file.name.toLowerCase().endsWith(".docx")
    ? "docx"
    : file.name.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : null;
  if (!format) throw Error("Choisissez un fichier DOCX ou PDF.");
  const buffer = await file.arrayBuffer();
  let chunks: { text: string; page?: number }[];
  if (format === "docx") {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: buffer });
    chunks = [{ text: result.value }];
  } else {
    const pdf = await pdfEngine();
    const doc = await pdf.getDocument({ data: new Uint8Array(buffer) }).promise;
    chunks = [];
    try {
      for (let page = 1; page <= doc.numPages; page++) {
        const content = await (await doc.getPage(page)).getTextContent();
        let text = "";
        for (const item of content.items) {
          if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
        }
        chunks.push({ text, page });
      }
    } finally {
      await doc.destroy();
    }
  }
  const documentId = uuid();
  const candidates: ReviewCandidate[] = identifyCandidates(chunks).map((c) => ({
    ...c,
    id: uuid(),
    meetingId,
    sourceDocumentId: documentId,
    decision: "pending",
  }));
  return db.transaction(
    "rw",
    db.meetings,
    db.sourceDocuments,
    db.reviewCandidates,
    async () => {
      const m = await db.meetings.get(meetingId);
      if (!m || m.deletedAt || m.status === "closed")
        throw Error("Réunion non modifiable");
      const document: SourceDocument = {
        id: documentId,
        projectId: m.projectId,
        meetingId,
        name: file.name,
        format,
        text: chunks.map((c) => c.text).join("\n\n"),
        createdAt: now(),
        file: new Blob([buffer], { type: file.type }),
        bytes: buffer,
      };
      await db.sourceDocuments.add(document);
      if (candidates.length) await db.reviewCandidates.bulkAdd(candidates);
      await db.meetings.update(meetingId, { sourceDocumentId: documentId });
      return { document, candidates };
    },
  );
}
export async function decideCandidate(
  id: string,
  decision: "accepted" | "dismissed",
  observationId?: string,
) {
  return db.transaction(
    "rw",
    db.meetings,
    db.observations,
    db.reviewCandidates,
    db.meetingObservations,
    async () => {
      const c = await db.reviewCandidates.get(id);
      if (!c) throw Error("Point introuvable");
      const m = await db.meetings.get(c.meetingId);
      if (!m || m.deletedAt || m.status === "closed")
        throw Error("Réunion non modifiable");
      if (decision === "accepted") {
        const o = observationId
          ? await db.observations.get(observationId)
          : undefined;
        if (!o || o.projectId !== m.projectId)
          throw Error("Choisissez une observation du projet");
        const link = await db.meetingObservations
          .where("[meetingId+observationId]")
          .equals([m.id, o.id])
          .first();
        await db.meetingObservations.put({
          ...link,
          id: link?.id || uuid(),
          meetingId: m.id,
          observationId: o.id,
          toCheck: true,
        });
      }
      await db.reviewCandidates.update(id, { decision, observationId });
    },
  );
}

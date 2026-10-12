import JSZip from "jszip";
import { z } from "zod";
import { db } from "./db";
import {
  projectSchema,
  meetingSchema,
  observationSchema,
  eventSchema,
  linkSchema,
  photoMetaSchema,
  planMetaSchema,
  markerSchema,
  documentMetaSchema,
  candidateSchema,
  snapshotSchema,
  artifactSchema,
  uuid,
  now,
} from "./models";
import { extension } from "./copilot";
const schemas = {
  project: projectSchema,
  meetings: z.array(meetingSchema),
  observations: z.array(observationSchema),
  observation_events: z.array(eventSchema),
  meeting_observations: z.array(linkSchema),
  photo_metadata: z.array(photoMetaSchema),
  plans: z.array(planMetaSchema),
  plan_markers: z.array(markerSchema),
  source_documents: z.array(documentMetaSchema),
  review_candidates: z.array(candidateSchema),
  meeting_snapshots: z.array(snapshotSchema),
  generated_artifacts: z.array(artifactSchema),
};
const manifestSchema = z.object({
  format: z.literal("moe-terrain"),
  schemaVersion: z.literal(1),
  appVersion: z.string(),
  projectId: z.string().uuid(),
  exportedAt: z.iso.datetime(),
  files: z.array(
    z.object({
      path: z.string(),
      size: z.number().int().nonnegative(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/),
    }),
  ),
});
const sha = async (data: Uint8Array) => {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(data).buffer,
  );
  return Array.from(new Uint8Array(hash))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
};
export async function exportProject(
  projectId: string,
  onProgress?: (n: number) => void,
) {
  const data = await db.transaction(
    "r",
    db.tables.filter((t) => t.name !== "settings"),
    async () => {
      const project = await db.projects.get(projectId);
      if (!project) throw Error("Projet introuvable");
      const meetings = await db.meetings
        .where("projectId")
        .equals(projectId)
        .toArray();
      const ids = meetings.map((m) => m.id);
      return {
        project,
        meetings,
        observations: await db.observations
          .where("projectId")
          .equals(projectId)
          .toArray(),
        observation_events: await db.observationEvents
          .where("projectId")
          .equals(projectId)
          .toArray(),
        meeting_observations: await db.meetingObservations
          .where("meetingId")
          .anyOf(ids)
          .toArray(),
        photos: await db.photos.where("projectId").equals(projectId).toArray(),
        plans: await db.plans.where("projectId").equals(projectId).toArray(),
        plan_markers: await db.planMarkers
          .where("projectId")
          .equals(projectId)
          .toArray(),
        documents: await db.sourceDocuments
          .where("projectId")
          .equals(projectId)
          .toArray(),
        review_candidates: await db.reviewCandidates
          .where("meetingId")
          .anyOf(ids)
          .toArray(),
        meeting_snapshots: await db.meetingSnapshots
          .where("projectId")
          .equals(projectId)
          .toArray(),
        generated_artifacts: await db.generatedArtifacts
          .where("projectId")
          .equals(projectId)
          .toArray(),
      };
    },
  );
  const zip = new JSZip();
  const files: { path: string; size: number; sha256: string }[] = [];
  async function add(path: string, value: string | Blob) {
    const bytes =
      typeof value === "string"
        ? new TextEncoder().encode(value)
        : new Uint8Array(await value.arrayBuffer());
    zip.file(path, bytes);
    files.push({ path, size: bytes.byteLength, sha256: await sha(bytes) });
    if (files.reduce((n, f) => n + f.size, 0) > 240 * 1024 * 1024)
      throw Error(
        "Ce projet dépasse la limite de transfert V0.1 (240 Mo de contenu). Réduisez la taille des médias avant ajout ou utilisez une future version prenant en charge les archives volumineuses.",
      );
  }
  const photo_metadata = data.photos.map(({ image, ...meta }) => meta);
  const plans = data.plans.map(({ file, ...meta }) => meta);
  const source_documents = data.documents.map(({ file, ...meta }) => meta);
  for (const [key, value] of Object.entries({
    project: data.project,
    meetings: data.meetings,
    observations: data.observations,
    observation_events: data.observation_events,
    meeting_observations: data.meeting_observations,
    photo_metadata,
    plans,
    plan_markers: data.plan_markers,
    source_documents,
    review_candidates: data.review_candidates,
    meeting_snapshots: data.meeting_snapshots,
    generated_artifacts: data.generated_artifacts,
  }))
    await add(`${key}.json`, JSON.stringify(value, null, 2));
  for (const p of data.photos)
    await add(`photos/${p.id}.${extension(p.originalName)}`, p.image);
  for (const p of data.plans) await add(`plans/${p.id}.pdf`, p.file);
  for (const d of data.documents)
    await add(`documents/${d.id}.${d.format}`, d.file);
  for (const s of data.meeting_snapshots)
    await add(
      `generated/${s.meetingId}/summary.json`,
      JSON.stringify(s, null, 2),
    );
  for (const a of data.generated_artifacts)
    await add(`generated/${a.meetingId}/prompt_update.txt`, a.text);
  const last = data.generated_artifacts.sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )[0];
  await add(
    "prompt_update.txt",
    last?.text ||
      "Aucune réunion clôturée. Aucun prompt de mise à jour disponible.",
  );
  zip.file(
    "manifest.json",
    JSON.stringify(
      {
        format: "moe-terrain",
        schemaVersion: 1,
        appVersion: "0.1.0",
        projectId,
        exportedAt: now(),
        files,
      },
      null,
      2,
    ),
  );
  return {
    blob: await zip.generateAsync({ type: "blob", compression: "STORE" }, (m) =>
      onProgress?.(m.percent),
    ),
    name: `${data.project.name.replace(/[^\p{L}\p{N}_-]+/gu, "_") || "Projet"}.zip`,
  };
}
export async function inspectArchive(file: File) {
  if (file.size > 250 * 1024 * 1024)
    throw Error(
      "Archive limitée à 250 Mo pour préserver la mémoire du téléphone.",
    );
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length > 5000)
    throw Error("Trop de fichiers dans cette archive.");
  for (const entry of entries) {
    if (
      entry.name.startsWith("/") ||
      entry.name.split("/").includes("..") ||
      entry.name.includes("\\") ||
      (entry.unsafeOriginalName && entry.unsafeOriginalName !== entry.name)
    )
      throw Error("Chemin de fichier invalide");
  }
  for (const entry of entries) {
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })
      ._data?.uncompressedSize;
    if (
      size !== undefined &&
      (size > 350 * 1024 * 1024 ||
        (entry.name.endsWith(".json") && size > 12 * 1024 * 1024))
    )
      throw Error("Fichier décompressé trop volumineux.");
  }
  const mf = zip.file("manifest.json");
  if (!mf) throw Error("Manifeste absent.");
  const manifest = manifestSchema.parse(JSON.parse(await mf.async("string")));
  if (manifest.files.reduce((n, f) => n + f.size, 0) > 350 * 1024 * 1024)
    throw Error("Archive décompressée trop volumineuse.");
  const listed = new Set<string>();
  for (const f of manifest.files) {
    if (listed.has(f.path) || f.path === "manifest.json")
      throw Error("Manifeste incohérent");
    listed.add(f.path);
    const entry = zip.file(f.path);
    if (!entry) throw Error(`Fichier manquant : ${f.path}`);
    const rawSize = (
      entry as unknown as { _data?: { uncompressedSize?: number } }
    )._data?.uncompressedSize;
    if (
      rawSize !== undefined &&
      (rawSize !== f.size || rawSize > 350 * 1024 * 1024)
    )
      throw Error("Taille de fichier incohérente");
    const bytes = await entry.async("uint8array");
    if (bytes.byteLength !== f.size || (await sha(bytes)) !== f.sha256)
      throw Error(`Fichier altéré : ${f.path}`);
  }
  if (entries.some((e) => e.name !== "manifest.json" && !listed.has(e.name)))
    throw Error("Fichier non déclaré dans le manifeste");
  const read = async (key: string) => {
    const f = zip.file(`${key}.json`);
    if (!f || !listed.has(`${key}.json`))
      throw Error(`Table manquante : ${key}`);
    return JSON.parse(await f.async("string"));
  };
  const d = {
    project: projectSchema.parse(await read("project")),
    meetings: schemas.meetings.parse(await read("meetings")),
    observations: schemas.observations.parse(await read("observations")),
    observation_events: schemas.observation_events.parse(
      await read("observation_events"),
    ),
    meeting_observations: schemas.meeting_observations.parse(
      await read("meeting_observations"),
    ),
    photo_metadata: schemas.photo_metadata.parse(await read("photo_metadata")),
    plans: schemas.plans.parse(await read("plans")),
    plan_markers: schemas.plan_markers.parse(await read("plan_markers")),
    source_documents: schemas.source_documents.parse(
      await read("source_documents"),
    ),
    review_candidates: schemas.review_candidates.parse(
      await read("review_candidates"),
    ),
    meeting_snapshots: schemas.meeting_snapshots.parse(
      await read("meeting_snapshots"),
    ),
    generated_artifacts: schemas.generated_artifacts.parse(
      await read("generated_artifacts"),
    ),
  };
  if (d.project.id !== manifest.projectId)
    throw Error("Identifiant projet incohérent");
  const sets: Record<string, Set<string>> = {};
  for (const [key, rows] of Object.entries(d)) {
    if (Array.isArray(rows)) {
      sets[key] = new Set(rows.map((r) => r.id));
      if (sets[key].size !== rows.length)
        throw Error(`Identifiants dupliqués : ${key}`);
    }
  }
  const requires = (table: string, id: string | undefined) => {
    if (id && !sets[table]?.has(id))
      throw Error(`Référence absente : ${table}`);
  };
  for (const [key, rows] of Object.entries(d))
    if (Array.isArray(rows))
      for (const r of rows)
        if ("projectId" in r && r.projectId !== d.project.id)
          throw Error(`Projet incompatible : ${key}`);
  const meetingPairs = new Set<string>();
  for (const l of d.meeting_observations) {
    requires("meetings", l.meetingId);
    requires("observations", l.observationId);
    const key = `${l.meetingId}/${l.observationId}`;
    if (meetingPairs.has(key)) throw Error("Lien réunion dupliqué");
    meetingPairs.add(key);
  }
  const nums = new Set<number>();
  for (const o of d.observations) {
    requires("meetings", o.createdMeetingId);
    if (nums.has(o.number)) throw Error("Numéro observation dupliqué");
    nums.add(o.number);
  }
  for (const m of d.meetings) {
    requires("meetings", m.previousMeetingId);
    requires("source_documents", m.sourceDocumentId);
  }
  const eventSequences = new Set<string>();
  for (const e of d.observation_events) {
    const key = `${e.observationId}/${e.sequence}`;
    if (eventSequences.has(key)) throw Error("Séquence historique dupliquée");
    eventSequences.add(key);
    requires("meetings", e.meetingId);
    requires("observations", e.observationId);
  }
  for (const p of d.photo_metadata) {
    requires("observation_events", p.eventId);
    requires("observations", p.observationId);
    if (
      d.observation_events.find((e) => e.id === p.eventId)?.observationId !==
      p.observationId
    )
      throw Error("Photo liée au mauvais événement");
  }
  for (const p of d.plan_markers) {
    requires("plans", p.planId);
    requires("observations", p.observationId);
  }
  for (const s of d.source_documents) requires("meetings", s.meetingId);
  for (const c of d.review_candidates) {
    requires("meetings", c.meetingId);
    requires("source_documents", c.sourceDocumentId);
    requires("observations", c.observationId);
  }
  const snaps = new Set<string>();
  for (const s of d.meeting_snapshots) {
    requires("meetings", s.meetingId);
    if (snaps.has(s.meetingId)) throw Error("Bilan dupliqué");
    snaps.add(s.meetingId);
    for (const id of [
      ...s.newObservationIds,
      ...s.modifiedObservationIds,
      ...s.closedObservationIds,
      ...s.blockingObservationIds,
      ...s.uncheckedObservationIds,
    ]) {
      requires("observations", id);
      if (!s.observations.some((o) => o.id === id))
        throw Error("Bilan incomplet");
    }
    for (const id of s.photoIds) requires("photo_metadata", id);
    for (const e of s.events) {
      requires("observations", e.observationId);
      requires("meetings", e.meetingId);
    }
    requires("source_documents", s.sourceDocumentId);
  }
  for (const a of d.generated_artifacts) requires("meetings", a.meetingId);
  if (d.meetings.filter((m) => m.status !== "closed").length > 1)
    throw Error("Plusieurs réunions actives");
  for (const m of d.meetings.filter((m) => m.status === "closed"))
    if (
      !snaps.has(m.id) ||
      !d.generated_artifacts.some((a) => a.meetingId === m.id)
    )
      throw Error("Réunion clôturée sans bilan ou prompt");
  const binary = async (path: string, type: string) => {
    if (!listed.has(path)) throw Error(`Média manquant : ${path}`);
    const entry = zip.file(path);
    if (!entry) throw Error(`Média absent : ${path}`);
    return new Blob([await entry.async("arraybuffer")], { type });
  };
  const photos = [];
  for (const p of d.photo_metadata)
    photos.push({
      ...p,
      image: await binary(
        `photos/${p.id}.${extension(p.originalName)}`,
        p.mimeType,
      ),
    });
  const plans = [];
  for (const p of d.plans)
    plans.push({
      ...p,
      file: await binary(`plans/${p.id}.pdf`, "application/pdf"),
    });
  const documents = [];
  for (const p of d.source_documents)
    documents.push({
      ...p,
      file: await binary(
        `documents/${p.id}.${p.format}`,
        p.format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    });
  return {
    data: d,
    photos,
    plans,
    documents,
    manifest,
    exists: !!(await db.projects.get(d.project.id)),
  };
}
export type InspectedArchive = Awaited<ReturnType<typeof inspectArchive>>;
export async function commitArchive(
  a: InspectedArchive,
  mode: "copy" | "replace" | "new",
) {
  const d = structuredClone(a.data);
  const mappings = new Map<string, string>();
  if (mode === "copy") {
    mappings.set(d.project.id, uuid());
    for (const rows of Object.values(d))
      if (Array.isArray(rows)) for (const r of rows) mappings.set(r.id, uuid());
  }
  const idFields = new Set([
    "id",
    "projectId",
    "meetingId",
    "observationId",
    "planId",
    "sourceDocumentId",
    "createdMeetingId",
    "previousMeetingId",
    "eventId",
  ]);
  const remap = (value: unknown, field = ""): unknown => {
    if (typeof value === "string")
      return idFields.has(field) || field.endsWith("Ids")
        ? mappings.get(value) || value
        : value;
    if (Array.isArray(value)) return value.map((v) => remap(v, field));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, remap(v, k)]),
      );
    return value;
  };
  const transformed = remap(d) as typeof d;
  if (mode === "copy") transformed.project.name += " — copie";
  const photos = a.photos.map(({ image, ...meta }) => ({
    ...(remap(meta) as typeof meta),
    image,
  }));
  const plans = a.plans.map(({ file, ...meta }) => ({
    ...(remap(meta) as typeof meta),
    file,
  }));
  const documents = a.documents.map(({ file, ...meta }) => ({
    ...(remap(meta) as typeof meta),
    file,
  }));
  // Prompts contain human-readable old paths: regenerate for a copied project.
  if (mode === "copy") {
    const { generatePrompt } = await import("./copilot");
    for (const artifact of transformed.generated_artifacts) {
      const meeting = transformed.meetings.find(
        (m) => m.id === artifact.meetingId,
      )!;
      const snapshot = transformed.meeting_snapshots.find(
        (s) => s.meetingId === artifact.meetingId,
      )!;
      artifact.text = generatePrompt(
        transformed.project,
        meeting,
        snapshot,
        photos.filter((p) => snapshot.photoIds.includes(p.id)),
      );
    }
  }
  await db.transaction(
    "rw",
    db.tables.filter((t) => t.name !== "settings"),
    async () => {
      const existing = await db.projects.get(transformed.project.id);
      if (existing && mode !== "replace") throw Error("Ce projet existe déjà.");
      if (mode === "replace") {
        const mids = (
          await db.meetings.where("projectId").equals(d.project.id).toArray()
        ).map((m) => m.id);
        await db.meetingObservations.where("meetingId").anyOf(mids).delete();
        await db.reviewCandidates.where("meetingId").anyOf(mids).delete();
        for (const t of db.tables.filter(
          (t) =>
            ![
              "settings",
              "projects",
              "meetingObservations",
              "reviewCandidates",
            ].includes(t.name),
        ))
          await t.where("projectId").equals(d.project.id).delete();
        await db.projects.delete(d.project.id);
      }
      const batches: [[string, unknown[]], ...[string, unknown[]][]] = [
        ["projects", [transformed.project]],
        ["meetings", transformed.meetings],
        ["observations", transformed.observations],
        ["observationEvents", transformed.observation_events],
        ["meetingObservations", transformed.meeting_observations],
        ["photos", photos],
        ["plans", plans],
        ["planMarkers", transformed.plan_markers],
        ["sourceDocuments", documents],
        ["reviewCandidates", transformed.review_candidates],
        ["meetingSnapshots", transformed.meeting_snapshots],
        ["generatedArtifacts", transformed.generated_artifacts],
      ];
      for (const [name, rows] of batches)
        if (rows.length) await db.table(name).bulkAdd(rows);
    },
  );
  return transformed.project;
}
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

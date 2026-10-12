import { z } from "zod";
export const statusSchema = z.enum([
  "new",
  "in_progress",
  "blocking",
  "closed",
]);
export type Status = z.infer<typeof statusSchema>;
export const labels: Record<Status, string> = {
  new: "Nouveau",
  in_progress: "En cours",
  blocking: "Bloquant",
  closed: "Clôturé",
};
export const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);
export type Priority = z.infer<typeof prioritySchema>;
export const priorities: Record<Priority, string> = {
  low: "Faible",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
};
const id = z.string().uuid();
const stamp = z.iso.datetime();
export const gpsSchema = z
  .object({
    state: z.enum([
      "captured",
      "denied",
      "timeout",
      "unavailable",
      "unsupported",
    ]),
    position: z
      .object({
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        accuracy: z.number().nonnegative(),
        measuredAt: stamp,
      })
      .optional(),
  })
  .refine(
    (v) => v.state !== "captured" || !!v.position,
    "Position GPS manquante",
  );
export type GPS = z.infer<typeof gpsSchema>;
export const projectSchema = z.object({
  id,
  name: z.string().min(1).max(200),
  clientName: z.string().max(300),
  reference: z.string().max(100),
  createdAt: stamp,
  updatedAt: stamp,
});
export type Project = z.infer<typeof projectSchema>;
export const meetingSchema = z.object({
  id,
  projectId: id,
  date: z.iso.date(),
  type: z.string().min(1).max(100),
  status: z.enum(["draft", "active", "closed"]),
  resumeMarker: z.string().max(500),
  createdAt: stamp,
  closedAt: stamp.optional(),
  previousMeetingId: id.optional(),
  sourceDocumentId: id.optional(),
  deletedAt: stamp.optional(),
});
export type Meeting = z.infer<typeof meetingSchema>;
export const stateSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(20000),
  lot: z.string().max(200),
  company: z.string().max(300),
  status: statusSchema,
  priority: prioritySchema,
});
export type ObservationState = z.infer<typeof stateSchema>;
export const observationSchema = stateSchema.extend({
  id,
  projectId: id,
  number: z.number().int().positive(),
  createdMeetingId: id,
  author: z.string().max(200),
  gps: gpsSchema,
  createdAt: stamp,
  updatedAt: stamp,
  closedAt: stamp.optional(),
  deletedAt: stamp.optional(),
  deletionMeetingId: id.optional(),
});
export type Observation = z.infer<typeof observationSchema>;
export const eventSchema = z.object({
  id,
  projectId: id,
  observationId: id,
  meetingId: id,
  sequence: z.number().int().positive(),
  kind: z.enum(["created", "updated", "checked", "closed", "reopened"]),
  comment: z.string().max(20000),
  before: stateSchema.nullable(),
  after: stateSchema,
  author: z.string().max(200),
  recordedAt: stamp,
  gps: gpsSchema,
});
export type ObservationEvent = z.infer<typeof eventSchema>;
export const linkSchema = z.object({
  id,
  meetingId: id,
  observationId: id,
  toCheck: z.boolean(),
  checkedAt: stamp.optional(),
  outcome: z
    .enum(["unchanged", "progress", "resolved", "not_checked"])
    .optional(),
});
export type MeetingObservation = z.infer<typeof linkSchema>;
export const photoMetaSchema = z.object({
  id,
  projectId: id,
  observationId: id,
  eventId: id,
  originalName: z.string().max(500),
  mimeType: z.string().max(100),
  addedAt: stamp,
  gps: gpsSchema,
  gpsSource: z.literal("device_at_addition"),
});
export type Photo = z.infer<typeof photoMetaSchema> & {
  image: Blob;
  bytes?: ArrayBuffer;
};
export const planMetaSchema = z.object({
  id,
  projectId: id,
  name: z.string().max(500),
  createdAt: stamp,
});
export type Plan = z.infer<typeof planMetaSchema> & {
  file: Blob;
  bytes?: ArrayBuffer;
};
export const markerSchema = z.object({
  id,
  projectId: id,
  planId: id,
  observationId: id,
  page: z.number().int().positive(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  createdAt: stamp,
});
export type PlanMarker = z.infer<typeof markerSchema>;
export const documentMetaSchema = z.object({
  id,
  projectId: id,
  meetingId: id,
  name: z.string().max(500),
  format: z.enum(["docx", "pdf"]),
  text: z.string().max(5000000),
  createdAt: stamp,
});
export type SourceDocument = z.infer<typeof documentMetaSchema> & {
  file: Blob;
  bytes?: ArrayBuffer;
};
export const candidateSchema = z.object({
  id,
  meetingId: id,
  sourceDocumentId: id,
  text: z.string().max(20000),
  page: z.number().int().positive().optional(),
  decision: z.enum(["pending", "accepted", "dismissed"]),
  observationId: id.optional(),
});
export type ReviewCandidate = z.infer<typeof candidateSchema>;
export const snapshotSchema = z.object({
  id,
  meetingId: id,
  projectId: id,
  closedAt: stamp,
  newObservationIds: z.array(id),
  modifiedObservationIds: z.array(id),
  closedObservationIds: z.array(id),
  blockingObservationIds: z.array(id),
  uncheckedObservationIds: z.array(id),
  observations: z.array(observationSchema),
  events: z.array(eventSchema),
  photoIds: z.array(id),
  resumeMarker: z.string(),
  sourceDocumentId: id.optional(),
});
export type Snapshot = z.infer<typeof snapshotSchema>;
export const artifactSchema = z.object({
  id,
  meetingId: id,
  projectId: id,
  kind: z.literal("prompt"),
  text: z.string(),
  createdAt: stamp,
});
export type Artifact = z.infer<typeof artifactSchema>;
export type Setting = { key: string; value: string };
export const uuid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const observationCode = (o: Pick<Observation, "number">) =>
  `OBS-${String(o.number).padStart(4, "0")}`;
export const stateOf = (o: Observation): ObservationState => ({
  title: o.title,
  description: o.description,
  lot: o.lot,
  company: o.company,
  status: o.status,
  priority: o.priority,
});

export const revisionSchema = z.object({
  id,
  projectId: id,
  meetingId: id,
  archivedAt: stamp,
  reason: z.string(),
  snapshot: snapshotSchema,
  prompt: z.string(),
});
export type MeetingRevision = z.infer<typeof revisionSchema>;

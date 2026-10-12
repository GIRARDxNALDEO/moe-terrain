import { db } from "./db";
import {
  uuid,
  now,
  stateOf,
  projectSchema,
  meetingSchema,
  stateSchema,
  type Project,
  type Meeting,
  type Observation,
  type ObservationState,
  type GPS,
  type ObservationEvent,
  type Photo,
  type Snapshot,
} from "./models";
import { generatePrompt } from "./copilot";
const unavailable: GPS = { state: "unavailable" };
export async function createProject(
  input: Pick<Project, "name" | "clientName" | "reference">,
) {
  const t = now();
  const p = projectSchema.parse({
    ...input,
    name: input.name.trim(),
    id: uuid(),
    createdAt: t,
    updatedAt: t,
  });
  await db.projects.add(p);
  return p;
}
export async function createMeeting(
  projectId: string,
  date: string,
  type: string,
) {
  const meeting = meetingSchema.parse({
    id: uuid(),
    projectId,
    date,
    type,
    status: "active",
    resumeMarker: "=== REPRISE MOE TERRAIN ===",
    createdAt: now(),
  });
  return db.transaction(
    "rw",
    db.projects,
    db.meetings,
    db.observations,
    db.meetingObservations,
    async () => {
      if (!(await db.projects.get(projectId)))
        throw Error("Projet introuvable");
      if (
        (await db.meetings.where("projectId").equals(projectId).toArray()).some(
          (m) => m.status !== "closed",
        )
      )
        throw Error("Clôturez la réunion active avant d’en créer une autre.");
      const previous = (
        await db.meetings.where("projectId").equals(projectId).toArray()
      ).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (previous) meeting.previousMeetingId = previous.id;
      await db.meetings.add(meeting);
      const open = (
        await db.observations.where("projectId").equals(projectId).toArray()
      ).filter((o) => o.status !== "closed");
      if (open.length)
        await db.meetingObservations.bulkAdd(
          open.map((o) => ({
            id: uuid(),
            meetingId: meeting.id,
            observationId: o.id,
            toCheck: true,
          })),
        );
      await db.projects.update(projectId, { updatedAt: now() });
      return meeting;
    },
  );
}
async function editableMeeting(id: string) {
  const m = await db.meetings.get(id);
  if (!m || m.status === "closed")
    throw Error("Cette réunion est clôturée ou introuvable.");
  return m;
}
export async function saveObservation(args: {
  meetingId: string;
  observationId?: string;
  expectedUpdatedAt?: string;
  state: ObservationState;
  comment: string;
  author: string;
  gps?: GPS;
  files?: File[];
}) {
  const after = stateSchema.parse({
    ...args.state,
    title: args.state.title.trim(),
  });
  const eventId = uuid(),
    time = now(),
    gps = args.gps || unavailable;
  const prepared = (args.files || []).map((f) => ({
    id: uuid(),
    originalName: f.name,
    mimeType: f.type || "application/octet-stream",
    image: new Blob([f], { type: f.type }),
    addedAt: time,
    gps,
    gpsSource: "device_at_addition" as const,
  }));
  if (prepared.some((p) => p.image.size > 30 * 1024 * 1024))
    throw Error("Une photo dépasse 30 Mo.");
  return db.transaction(
    "rw",
    [
      db.meetings,
      db.observations,
      db.observationEvents,
      db.meetingObservations,
      db.photos,
      db.projects,
    ],
    async () => {
      const m = await editableMeeting(args.meetingId);
      const old = args.observationId
        ? await db.observations.get(args.observationId)
        : undefined;
      if (args.observationId && !old) throw Error("Observation introuvable");
      if (
        old &&
        args.expectedUpdatedAt &&
        old.updatedAt !== args.expectedUpdatedAt
      )
        throw Error(
          "Ce point a été actualisé dans une autre fenêtre. Fermez puis rouvrez la fiche avant de reprendre votre saisie.",
        );
      if (old && old.projectId !== m.projectId)
        throw Error("Projet incompatible");
      if (
        old?.status === "closed" &&
        after.status !== "closed" &&
        !args.comment.trim()
      )
        throw Error("Indiquez le motif de réouverture.");
      if (after.status === "closed" && !args.comment.trim())
        throw Error("Indiquez le motif de clôture ou le contrôle conforme.");
      const observationId = old?.id || uuid();
      const number =
        old?.number ||
        Math.max(
          0,
          ...(
            await db.observations
              .where("projectId")
              .equals(m.projectId)
              .toArray()
          ).map((o) => o.number),
        ) + 1;
      const observation: Observation = {
        ...(old || {}),
        ...after,
        id: observationId,
        projectId: m.projectId,
        number,
        createdMeetingId: old?.createdMeetingId || m.id,
        author: old?.author || args.author,
        gps: old?.gps || gps,
        createdAt: old?.createdAt || time,
        updatedAt: time,
      };
      if (after.status === "closed")
        observation.closedAt = old?.closedAt || time;
      else delete observation.closedAt;
      const kind: ObservationEvent["kind"] = !old
        ? "created"
        : old.status === "closed" && after.status !== "closed"
          ? "reopened"
          : old.status !== "closed" && after.status === "closed"
            ? "closed"
            : JSON.stringify(stateOf(old)) === JSON.stringify(after)
              ? "checked"
              : "updated";
      const sequence =
        (await db.observationEvents
          .where("observationId")
          .equals(observationId)
          .count()) + 1;
      const event: ObservationEvent = {
        id: eventId,
        sequence,
        projectId: m.projectId,
        observationId,
        meetingId: m.id,
        kind,
        comment:
          args.comment.trim() ||
          (!old
            ? "Création de l’observation"
            : "Point contrôlé sans modification"),
        before: old ? stateOf(old) : null,
        after,
        author: args.author,
        recordedAt: time,
        gps,
      };
      await db.observations.put(observation);
      await db.observationEvents.add(event);
      const existing = await db.meetingObservations
        .where("[meetingId+observationId]")
        .equals([m.id, observationId])
        .first();
      await db.meetingObservations.put({
        id: existing?.id || uuid(),
        meetingId: m.id,
        observationId,
        toCheck: existing?.toCheck || false,
        checkedAt: time,
        outcome:
          after.status === "closed"
            ? "resolved"
            : kind === "checked"
              ? "unchanged"
              : "progress",
      });
      if (prepared.length)
        await db.photos.bulkAdd(
          prepared.map((p) => ({
            ...p,
            projectId: m.projectId,
            observationId,
            eventId,
          })),
        );
      await db.projects.update(m.projectId, { updatedAt: time });
      return observation;
    },
  );
}
export async function markToCheck(meetingId: string, observationId: string) {
  return db.transaction(
    "rw",
    db.meetings,
    db.observations,
    db.meetingObservations,
    async () => {
      const m = await editableMeeting(meetingId);
      const o = await db.observations.get(observationId);
      if (!o || o.projectId !== m.projectId)
        throw Error("Observation incompatible");
      const existing = await db.meetingObservations
        .where("[meetingId+observationId]")
        .equals([meetingId, observationId])
        .first();
      await db.meetingObservations.put({
        ...existing,
        id: existing?.id || uuid(),
        meetingId,
        observationId,
        toCheck: true,
      });
    },
  );
}
export async function setResumeMarker(meetingId: string, resumeMarker: string) {
  return db.transaction("rw", db.meetings, async () => {
    await editableMeeting(meetingId);
    await db.meetings.update(meetingId, { resumeMarker: resumeMarker.trim() });
  });
}
export async function closeMeeting(meetingId: string) {
  return db.transaction(
    "rw",
    [
      db.projects,
      db.meetings,
      db.observations,
      db.observationEvents,
      db.meetingObservations,
      db.photos,
      db.meetingSnapshots,
      db.generatedArtifacts,
    ],
    async () => {
      const m = await editableMeeting(meetingId);
      if (!m.resumeMarker.trim())
        throw Error("Renseignez le marqueur de reprise Word.");
      const p = await db.projects.get(m.projectId);
      if (!p) throw Error("Projet introuvable");
      const observations = await db.observations
        .where("projectId")
        .equals(m.projectId)
        .toArray();
      const allEvents = await db.observationEvents
        .where("projectId")
        .equals(m.projectId)
        .toArray();
      const current = allEvents.filter((e) => e.meetingId === m.id);
      const links = await db.meetingObservations
        .where("meetingId")
        .equals(m.id)
        .toArray();
      const unique = (ids: string[]) => [...new Set(ids)];
      const changedIds = unique(current.map((e) => e.observationId));
      const relevantIds = unique([
        ...changedIds,
        ...links.map((l) => l.observationId),
        ...observations.filter((o) => o.status === "blocking").map((o) => o.id),
      ]);
      const photos = await db.photos
        .where("projectId")
        .equals(m.projectId)
        .toArray();
      const eventIds = new Set(current.map((e) => e.id));
      const meetingPhotos = photos.filter((p) => eventIds.has(p.eventId));
      const snap: Snapshot = {
        id: uuid(),
        meetingId: m.id,
        projectId: m.projectId,
        closedAt: now(),
        newObservationIds: unique(
          current
            .filter((e) => e.kind === "created")
            .map((e) => e.observationId),
        ),
        modifiedObservationIds: unique(
          current
            .filter(
              (e) =>
                e.kind === "updated" ||
                e.kind === "reopened" ||
                e.kind === "checked",
            )
            .map((e) => e.observationId),
        ),
        closedObservationIds: unique(
          current
            .filter(
              (e) =>
                e.kind === "closed" ||
                (e.kind === "created" && e.after.status === "closed"),
            )
            .map((e) => e.observationId),
        ).filter(
          (id) => observations.find((o) => o.id === id)?.status === "closed",
        ),
        blockingObservationIds: observations
          .filter((o) => o.status === "blocking")
          .map((o) => o.id),
        uncheckedObservationIds: links
          .filter((l) => l.toCheck && !l.checkedAt)
          .map((l) => l.observationId),
        observations: observations.filter((o) => relevantIds.includes(o.id)),
        events: allEvents
          .filter((e) => relevantIds.includes(e.observationId))
          .sort((a, b) => {
            const an = observations.find(
              (o) => o.id === a.observationId,
            )!.number;
            const bn = observations.find(
              (o) => o.id === b.observationId,
            )!.number;
            return an - bn || a.sequence - b.sequence;
          }),
        photoIds: meetingPhotos.map((p) => p.id),
        resumeMarker: m.resumeMarker,
        sourceDocumentId: m.sourceDocumentId,
      };
      await db.meetingSnapshots.add(snap);
      await db.generatedArtifacts.add({
        id: uuid(),
        projectId: m.projectId,
        meetingId: m.id,
        kind: "prompt",
        text: generatePrompt(p, m, snap, meetingPhotos),
        createdAt: snap.closedAt,
      });
      await db.meetings.update(m.id, {
        status: "closed",
        closedAt: snap.closedAt,
      });
      return snap;
    },
  );
}
export async function addPlan(projectId: string, file: File) {
  if (file.size > 50 * 1024 * 1024) throw Error("Plan limité à 50 Mo.");
  const p = {
    id: uuid(),
    projectId,
    name: file.name,
    file: new Blob([file], { type: "application/pdf" }),
    createdAt: now(),
  };
  await db.plans.add(p);
  return p;
}
export async function addMarker(
  projectId: string,
  planId: string,
  observationId: string,
  page: number,
  x: number,
  y: number,
) {
  return db.transaction(
    "rw",
    db.plans,
    db.observations,
    db.planMarkers,
    async () => {
      const p = await db.plans.get(planId),
        o = await db.observations.get(observationId);
      if (!p || !o || p.projectId !== projectId || o.projectId !== projectId)
        throw Error("Repère incompatible");
      await db.planMarkers.add({
        id: uuid(),
        projectId,
        planId,
        observationId,
        page,
        x,
        y,
        createdAt: now(),
      });
    },
  );
}

import "fake-indexeddb/auto";
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { db, TerrainDB } from "../src/lib/db";
import Dexie from "dexie";
import {
  createProject,
  createMeeting,
  saveObservation,
  closeMeeting,
  addPlan,
  addMarker,
  reopenMeeting,
  setObservationDeleted,
  setMeetingDeleted,
  updateMeeting,
} from "../src/lib/services";
import {
  exportProject,
  inspectArchive,
  commitArchive,
} from "../src/lib/archives";
import { identifyCandidates } from "../src/lib/documents";
import type { ObservationState } from "../src/lib/models";
beforeEach(async () => {
  await db.open();
  await db.transaction("rw", db.tables, async () => {
    for (const t of db.tables) await t.clear();
  });
});
after(() => db.close());
const state: ObservationState = {
  title: "Accumulation d’eau bâtiment E",
  description: "Eau stagnante au pied du bâtiment",
  lot: "VRD",
  company: "Entreprise exemple",
  status: "new",
  priority: "normal",
};
async function setup() {
  const p = await createProject({
    name: "Chantier exemple",
    clientName: "Commune exemple",
    reference: "TEST-01",
  });
  const m = await createMeeting(p.id, "2026-09-24", "Réunion chantier");
  return { p, m };
}
test("Une observation traverse quatre réunions, le premier bilan reste figé", async () => {
  const { p, m } = await setup();
  const o = await saveObservation({
    meetingId: m.id,
    state,
    author: "Baptiste",
    comment: "Création",
  });
  await closeMeeting(m.id);
  const firstPrompt = (await db.generatedArtifacts
    .where("meetingId")
    .equals(m.id)
    .first())!.text;
  for (const [date, comment, status] of [
    ["2026-10-08", "Toujours présente", "in_progress"],
    ["2026-10-22", "Drain repris", "in_progress"],
    ["2026-11-05", "Contrôle conforme", "closed"],
  ] as const) {
    const next = await createMeeting(p.id, date, "Réunion chantier");
    const links = await db.meetingObservations
      .where("meetingId")
      .equals(next.id)
      .toArray();
    assert.equal(links[0].observationId, o.id);
    await saveObservation({
      meetingId: next.id,
      observationId: o.id,
      state: { ...state, status },
      comment,
      author: "Baptiste",
    });
    await closeMeeting(next.id);
  }
  assert.equal((await db.observations.get(o.id))!.status, "closed");
  assert.equal(
    await db.observationEvents.where("observationId").equals(o.id).count(),
    4,
  );
  assert.equal(
    (await db.generatedArtifacts.where("meetingId").equals(m.id).first())!.text,
    firstPrompt,
  );
  assert.equal(
    (await db.meetingSnapshots.where("meetingId").equals(m.id).first())!
      .observations[0].status,
    "new",
  );
  const next = await createMeeting(p.id, "2026-11-19", "Réunion chantier");
  assert.equal(
    await db.meetingObservations.where("meetingId").equals(next.id).count(),
    0,
  );
});
test("Clôture requiert un commentaire et ne laisse aucune écriture partielle", async () => {
  const { m } = await setup();
  await assert.rejects(
    () =>
      saveObservation({
        meetingId: m.id,
        state: { ...state, status: "closed" },
        author: "B",
        comment: "",
      }),
    /motif/,
  );
  assert.equal(await db.observations.count(), 0);
  assert.equal(await db.observationEvents.count(), 0);
});
test("Réunion clôturée non modifiable sans réouverture", async () => {
  const { p, m } = await setup();
  await createMeeting(p.id, "2026-10-08", "Réunion");
  await closeMeeting(m.id);
  await assert.rejects(
    () => saveObservation({ meetingId: m.id, state, author: "B", comment: "" }),
    /clôturée/,
  );
});
test("ZIP conserve photo, plan, repère, bilan et identifiants ; copie remappe les liens", async () => {
  const { p, m } = await setup();
  const photo = new File([new Uint8Array([1, 2, 3])], "photo.png", {
    type: "image/png",
  });
  const o = await saveObservation({
    meetingId: m.id,
    state,
    author: "B",
    comment: "Constat",
    files: [photo],
    gps: {
      state: "captured",
      position: {
        latitude: 44.4,
        longitude: 4.1,
        accuracy: 6,
        measuredAt: new Date().toISOString(),
      },
    },
  });
  const plan = await addPlan(p.id, new File(["%PDF-test"], "plan.pdf"));
  await addMarker(p.id, plan.id, o.id, 1, 0.25, 0.75);
  await closeMeeting(m.id);
  const out = await exportProject(p.id);
  const archive = await inspectArchive(new File([out.blob], out.name));
  assert.equal(archive.photos[0].image.size, 3);
  assert.equal(archive.data.plan_markers[0].x, 0.25);
  assert.equal(archive.data.observation_events[0].observationId, o.id);
  const copy = await commitArchive(archive, "copy");
  assert.notEqual(copy.id, p.id);
  const copied = (
    await db.observations.where("projectId").equals(copy.id).toArray()
  )[0];
  assert.notEqual(copied.id, o.id);
  const copiedPhoto = (
    await db.photos.where("projectId").equals(copy.id).toArray()
  )[0];
  assert.equal(copiedPhoto.observationId, copied.id);
  assert.equal(
    (await db.planMarkers.where("projectId").equals(copy.id).toArray())[0]
      .observationId,
    copied.id,
  );
  const prompt = (await db.generatedArtifacts
    .where("projectId")
    .equals(copy.id)
    .first())!.text;
  assert.ok(prompt.includes(copiedPhoto.id));
  assert.ok(!prompt.includes(archive.photos[0].id));
  await commitArchive(archive, "replace");
  assert.equal(
    await db.observations.where("projectId").equals(p.id).count(),
    1,
  );
});
test("Archive altérée rejetée avant toute écriture", async () => {
  const { p } = await setup();
  const out = await exportProject(p.id);
  const zip = await JSZip.loadAsync(await out.blob.arrayBuffer());
  zip.file("observations.json", "[]\n");
  const bad = await zip.generateAsync({ type: "uint8array" });
  const before = await db.projects.count();
  await assert.rejects(
    () => inspectArchive(new File([new Uint8Array(bad).buffer], "bad.zip")),
    /altéré|Taille/,
  );
  assert.equal(await db.projects.count(), before);
});
test("Contrôle inchangé historisé et point non contrôlé explicite", async () => {
  const { p, m } = await setup();
  const o = await saveObservation({
    meetingId: m.id,
    state,
    author: "B",
    comment: "Constat",
  });
  await closeMeeting(m.id);
  const next = await createMeeting(p.id, "2026-10-08", "Réunion");
  const s = await closeMeeting(next.id);
  assert.deepEqual(s.uncheckedObservationIds, [o.id]);
  const third = await createMeeting(p.id, "2026-10-22", "Réunion");
  await saveObservation({
    meetingId: third.id,
    observationId: o.id,
    state,
    author: "B",
    comment: "Toujours présente",
  });
  const snap = await closeMeeting(third.id);
  assert.deepEqual(snap.uncheckedObservationIds, []);
  assert.deepEqual(snap.modifiedObservationIds, [o.id]);
});
test("Extraction propose des points à vérifier sans considérer une réserve levée ouverte", () => {
  const c = identifyCandidates([
    {
      text: "Candélabre sud non posé\nRéserve levée\nBarrière à vérifier",
      page: 2,
    },
  ]);
  assert.equal(c.length, 2);
  assert.equal(c[0].page, 2);
});

test("Deux mises à jour rapprochées conservent une séquence et une saisie périmée est refusée", async () => {
  const { m } = await setup();
  const o = await saveObservation({
    meetingId: m.id,
    state,
    author: "B",
    comment: "Création",
  });
  await saveObservation({
    meetingId: m.id,
    observationId: o.id,
    state: { ...state, status: "in_progress" },
    author: "B",
    comment: "Avancement",
  });
  await saveObservation({
    meetingId: m.id,
    observationId: o.id,
    state: { ...state, status: "blocking" },
    author: "B",
    comment: "Blocage",
  });
  const history = (
    await db.observationEvents.where("observationId").equals(o.id).toArray()
  ).sort((a, b) => a.sequence - b.sequence);
  assert.deepEqual(
    history.map((e) => e.sequence),
    [1, 2, 3],
  );
  await assert.rejects(
    () =>
      saveObservation({
        meetingId: m.id,
        observationId: o.id,
        expectedUpdatedAt: "2020-01-01T00:00:00.000Z",
        state,
        author: "B",
        comment: "Saisie ancienne",
      }),
    /autre fenêtre/,
  );
  assert.equal(
    await db.observationEvents.where("observationId").equals(o.id).count(),
    3,
  );
});

test("Réouverture, édition et nouvelle clôture conservent l’ancien bilan et un prompt actualisé", async () => {
  const { p, m } = await setup();
  const o = await saveObservation({
    meetingId: m.id,
    state,
    author: "B",
    comment: "Création",
  });
  await closeMeeting(m.id);
  const original = (await db.generatedArtifacts
    .where("meetingId")
    .equals(m.id)
    .first())!.text;
  await createMeeting(p.id, "2026-10-08", "Suivi");
  await reopenMeeting(m.id);
  assert.equal((await db.meetings.get(m.id))!.status, "active");
  assert.equal(
    await db.meetingSnapshots.where("meetingId").equals(m.id).count(),
    0,
  );
  assert.equal(
    (await db.meetingRevisions.where("meetingId").equals(m.id).first())!.prompt,
    original,
  );
  await updateMeeting(m.id, "2026-09-25", "Réunion corrigée");
  await saveObservation({
    meetingId: m.id,
    observationId: o.id,
    state: { ...state, status: "closed" },
    comment: "Contrôle conforme",
    author: "B",
  });
  await closeMeeting(m.id);
  assert.ok(
    (await db.generatedArtifacts
      .where("meetingId")
      .equals(m.id)
      .first())!.text.includes("Réunion corrigée"),
  );
  const out = await exportProject(p.id);
  const a = await inspectArchive(new File([out.blob], out.name));
  assert.equal(a.data.meeting_revisions.length, 1);
  const copy = await commitArchive(a, "copy");
  assert.equal(
    await db.meetingRevisions.where("projectId").equals(copy.id).count(),
    1,
  );
});
test("Point supprimé restaurable, absent d’un nouveau bilan et présent dans le ZIP", async () => {
  const { p, m } = await setup();
  const o = await saveObservation({
    meetingId: m.id,
    state,
    author: "B",
    comment: "Constat",
  });
  await setObservationDeleted(o.id, true);
  const snap = await closeMeeting(m.id);
  assert.equal(snap.observations.length, 0);
  const out = await exportProject(p.id);
  const a = await inspectArchive(new File([out.blob], out.name));
  assert.ok(a.data.observations[0].deletedAt);
  await setObservationDeleted(o.id, false);
  assert.equal((await db.observations.get(o.id))!.deletedAt, undefined);
});
test("Suppression de réunion recalcule le point suivi ailleurs et restaure ses créations", async () => {
  const { p, m } = await setup();
  const o = await saveObservation({
    meetingId: m.id,
    state,
    author: "B",
    comment: "Création",
  });
  await closeMeeting(m.id);
  const next = await createMeeting(p.id, "2026-10-08", "Réunion 2");
  await saveObservation({
    meetingId: next.id,
    observationId: o.id,
    state: { ...state, status: "closed" },
    author: "B",
    comment: "Levée",
  });
  const only = await saveObservation({
    meetingId: next.id,
    state: { ...state, title: "Création accidentelle" },
    author: "B",
    comment: "Création",
  });
  await setMeetingDeleted(next.id, true);
  assert.equal((await db.observations.get(o.id))!.status, "new");
  assert.ok((await db.observations.get(only.id))!.deletedAt);
  await setMeetingDeleted(next.id, false);
  assert.equal((await db.observations.get(o.id))!.status, "closed");
  assert.equal((await db.observations.get(only.id))!.deletedAt, undefined);
});
test("Export utilise les octets persistés même si la lecture des Blob échoue", async () => {
  const { p, m } = await setup();
  await saveObservation({
    meetingId: m.id,
    state,
    author: "B",
    comment: "Photo",
    files: [new File(["octets"], "photo.png", { type: "image/png" })],
  });
  const original = Blob.prototype.arrayBuffer;
  Blob.prototype.arrayBuffer = async () => {
    throw new DOMException(
      "The object can not be found here.",
      "NotFoundError",
    );
  };
  let out;
  try {
    out = await exportProject(p.id);
  } finally {
    Blob.prototype.arrayBuffer = original;
  }
  const a = await inspectArchive(new File([out.blob], out.name));
  assert.equal(await a.photos[0].image.text(), "octets");
});
test("Le ZIP V0.1 sans révisions reste importable", async () => {
  const { p } = await setup();
  const out = await exportProject(p.id);
  const zip = await JSZip.loadAsync(await out.blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
  manifest.schemaVersion = 1;
  manifest.appVersion = "0.1.0";
  manifest.files = manifest.files.filter(
    (f: { path: string }) => f.path !== "meeting_revisions.json",
  );
  zip.remove("meeting_revisions.json");
  zip.file("manifest.json", JSON.stringify(manifest));
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const a = await inspectArchive(
    new File([new Uint8Array(bytes).buffer], "legacy.zip"),
  );
  assert.deepEqual(a.data.meeting_revisions, []);
});

test("Migration V1 vers V2 : les index manquants sont réparés sans effacer les photos", async () => {
  const { p, m } = await setup();
  await saveObservation({
    meetingId: m.id,
    state,
    author: "B",
    comment: "Photo",
    files: [new File(["migration"], "photo.png")],
  });
  const photo = (await db.photos.toArray())[0];
  const name = "moe-migration-test";
  const old = new Dexie(name);
  const stores = Object.fromEntries(
    db.tables
      .filter((t) => t.name !== "meetingRevisions")
      .map((t) => [
        t.name,
        [t.schema.primKey.src, ...t.schema.indexes.map((i) => i.src)]
          .filter((v) => t.name !== "photos" || v !== "projectId")
          .join(","),
      ]),
  );
  old.version(1).stores(stores);
  await old.open();
  await old.table("projects").add(p);
  await old.table("photos").add(photo);
  old.close();
  const updated = new TerrainDB(name);
  await updated.open();
  assert.equal(
    (await updated.photos.where("projectId").equals(p.id).toArray()).length,
    1,
  );
  assert.equal(await updated.meetingRevisions.count(), 0);
  updated.close();
  await Dexie.delete(name);
});

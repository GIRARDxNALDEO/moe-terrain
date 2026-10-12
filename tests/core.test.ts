import "fake-indexeddb/auto";
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";
import { db } from "../src/lib/db";
import {
  createProject,
  createMeeting,
  saveObservation,
  closeMeeting,
  addPlan,
  addMarker,
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
test("Réunion clôturée non modifiable et une seule réunion active", async () => {
  const { p, m } = await setup();
  await assert.rejects(
    () => createMeeting(p.id, "2026-10-08", "Réunion"),
    /Clôturez/,
  );
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

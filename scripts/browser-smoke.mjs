import { server } from "./serve-test.mjs";
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import JSZip from "jszip";
const root = process.env.PREVIEW_URL || "http://127.0.0.1:4318/moe-terrain/";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox","--disable-gpu"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["geolocation"],
  geolocation: { latitude: 44.424, longitude: 4.169, accuracy: 8 },
});
const page = await context.newPage();
const errors = [];
page.on("dialog", (d) => d.accept());
page.on("pageerror", (e) => errors.push(e.message));
process.on("uncaughtException", async (e) => {
  console.error(e.stack);
  console.error("DEBUG ERRORS", errors);
  console.error((await page.locator("body").innerText()).slice(-4500));
  await page.screenshot({ path: "/tmp/moe-failed.png", fullPage: true });
  await browser.close();
  server.close();
  process.exit(1);
});
console.log("Browser: start");
await page.goto(root);
await page.getByRole("heading", { name: /Mes chantiers/ }).waitFor();
await page
  .getByText("Prêt hors ligne", { exact: true })
  .waitFor({ timeout: 60000 });
await page.getByRole("button", { name: "Nouveau projet", exact: true }).click();
await page.getByLabel("Nom du chantier").fill("Réaménagement de la place");
await page.getByLabel("Maître d’ouvrage").fill("Commune exemple");
await page.getByLabel("Référence affaire").fill("26-042");
await page
  .getByRole("button", { name: "Créer le projet", exact: true })
  .click();
await page
  .getByRole("button", { name: "Nouvelle réunion", exact: true })
  .click();
await page
  .getByRole("button", { name: "Ouvrir la réunion", exact: true })
  .click();
console.log("Browser: document");
// Import a real DOCX container with an open point.
const zip = new JSZip();
zip.file(
  "[Content_Types].xml",
  '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
);
zip.file(
  "_rels/.rels",
  '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
);
zip.file(
  "word/document.xml",
  '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Candélabre sud non posé</w:t></w:r></w:p></w:body></w:document>',
);
await page.getByRole("button", { name: "CR précédent", exact: true }).click();
await page.locator('input[accept=".docx,.pdf"]').setInputFiles({
  name: "CR-precedent.docx",
  mimeType:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  buffer: await zip.generateAsync({ type: "nodebuffer" }),
});
await page
  .locator(".candidate p")
  .filter({ hasText: "Candélabre sud non posé" })
  .waitFor();
await page.getByRole("button", { name: "Créer un point", exact: true }).click();
await page
  .getByLabel("Note terrain")
  .fill("Pose attendue à proximité de l’entrée sud.");
await page.locator('input[accept="image/*"][multiple]').setInputFiles({
  name: "terrain.png",
  mimeType: "image/png",
  buffer: await fs.readFile("public/icons/icon-192.png"),
});
await page
  .getByRole("button", { name: "Enregistrer le point", exact: true })
  .click();
await page
  .getByRole("heading", { name: "Candélabre sud non posé", exact: true })
  .waitFor();
await page
  .getByRole("button", { name: "Retour aux points", exact: true })
  .click();
await page
  .getByRole("button", { name: "Clôturer la réunion", exact: true })
  .click();
await page
  .getByRole("button", { name: "Clôturer et générer le prompt", exact: true })
  .click();
await page
  .getByRole("heading", { name: "La réunion est enregistrée.", exact: true })
  .waitFor();
await page
  .getByRole("button", { name: "Rouvrir la réunion", exact: true })
  .click();
await page.getByRole("button", { name: /OBS-0001/ }).click();
await page
  .getByRole("button", { name: "Ajouter un suivi", exact: true })
  .click();
await page
  .getByLabel("Commentaire de cette réunion")
  .fill("Correction après clôture");
await page.getByLabel(/^Priorité/).selectOption("high");
await page
  .getByRole("button", { name: "Enregistrer le point", exact: true })
  .click();
await page.getByText("Correction après clôture", { exact: true }).waitFor();
await page
  .getByRole("button", { name: "Retour aux points", exact: true })
  .click();
await page
  .getByRole("button", { name: "Clôturer la réunion", exact: true })
  .click();
await page
  .getByRole("button", { name: "Clôturer et générer le prompt", exact: true })
  .click();
await page
  .getByRole("heading", { name: "La réunion est enregistrée.", exact: true })
  .waitFor();
const downloadPromise = page.waitForEvent("download");
await page
  .getByRole("button", { name: "Sauvegarder le ZIP", exact: true })
  .click();
const download = await downloadPromise;
const archivePath = "/tmp/moe-terrain-smoke.zip";
await download.saveAs(archivePath);
const archive = await JSZip.loadAsync(await fs.readFile(archivePath));
assert.ok(archive.file("prompt_update.txt"));
assert.equal(
  JSON.parse(await archive.file("photo_metadata.json").async("string")).length,
  1,
  "Photo must survive the real file-input flow",
);
assert.ok(
  (await archive.file("prompt_update.txt").async("string")).includes(
    "NOUVELLES OBSERVATIONS",
  ),
);
await page
  .getByRole("button", { name: "Toutes les réunions", exact: true })
  .click();
await page
  .getByRole("button", { name: "Nouvelle réunion", exact: true })
  .click();
await page
  .getByRole("button", { name: "Ouvrir la réunion", exact: true })
  .click();
await page.getByRole("button", { name: /OBS-0001/ }).click();
await page
  .getByRole("button", { name: "Ajouter un suivi", exact: true })
  .click();
await page
  .getByLabel("Commentaire de cette réunion")
  .fill("Posé. Contrôle conforme.");
await page.getByLabel(/^État/).selectOption("closed");
await page
  .getByRole("button", { name: "Enregistrer le point", exact: true })
  .click();
await page.getByText("Posé. Contrôle conforme.", { exact: true }).waitFor();
console.log("Browser: PDF");
// Render a real two-page PDF, place a marker and change page.
function fixturePDF() {
  const stream1 =
    "BT /F1 22 Tf 50 330 Td (Plan de chantier - page 1) Tj ET 50 70 500 200 re S";
  const stream2 = "BT /F1 22 Tf 50 330 Td (Plan de chantier - page 2) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 420] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream1)} >>\nstream\n${stream1}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 420] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>",
    `<< /Length ${Buffer.byteLength(stream2)} >>\nstream\n${stream2}\nendstream`,
  ];
  let result = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(result));
    result += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(result);
  result +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .slice(1)
      .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
      .join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(result);
}
await page
  .getByRole("button", { name: "Retour aux points", exact: true })
  .click();
await page.getByRole("button", { name: "Plans", exact: true }).first().click();
await page.locator('input[accept=".pdf,application/pdf"]').setInputFiles({
  name: "plan-exemple.pdf",
  mimeType: "application/pdf",
  buffer: fixturePDF(),
});
await page.getByText("Page 1 / 2", { exact: true }).waitFor();
await page.locator(".pdf-loading").waitFor({ state: "hidden" });
await page
  .locator(".plan-controls select")
  .nth(1)
  .selectOption({ label: "OBS-0001 — Candélabre sud non posé" });
await page
  .getByRole("button", { name: "Placer sur le plan", exact: true })
  .click();
await page.locator(".pdf-page canvas").click({ position: { x: 100, y: 100 } });
await page.locator(".plan-pin").waitFor();
await page.getByRole("button", { name: "Page suivante", exact: true }).click();
await page.getByText("Page 2 / 2", { exact: true }).waitFor();
assert.equal(await page.locator(".plan-pin").count(), 0);
await page
  .getByRole("button", { name: "Page précédente", exact: true })
  .click();
await page.locator(".plan-pin").waitFor();
await page
  .getByRole("button", { name: "Transfert", exact: true })
  .first()
  .click();
const finalDownload = page.waitForEvent("download");
await page
  .getByRole("button", { name: "Exporter le projet ZIP", exact: true })
  .click();
const finalArchive = await finalDownload;
await finalArchive.saveAs(archivePath);
console.log("Browser: ZIP import");
// Simulate the office PC with an independent browser storage.
const office = await browser.newContext();
const officePage = await office.newPage();
officePage.on("pageerror", (e) => errors.push(e.message));
await officePage.goto(root);
await officePage.getByRole("heading", { name: /Mes chantiers/ }).waitFor();
await officePage.locator('input[accept=".zip"]').setInputFiles(archivePath);
await officePage
  .getByRole("button", { name: "Importer le chantier", exact: true })
  .click();
await officePage
  .getByRole("heading", { name: "Réaménagement de la place", exact: true })
  .waitFor();
await officePage
  .getByRole("button", { name: "Observations", exact: true })
  .first()
  .click();
await officePage.getByRole("button", { name: /OBS-0001/ }).click();
await officePage
  .getByText("Posé. Contrôle conforme.", { exact: true })
  .waitFor();
assert.equal(await officePage.locator(".photo-card").count(), 1);
await office.close();
console.log("Browser: offline restart");
// Restart entirely offline. Dynamic document and plan chunks must also be cached.
await context.setOffline(true);
await page.reload();
await page.getByRole("heading", { name: /Mes chantiers/ }).waitFor();
await page.getByRole("button", { name: /Réaménagement de la place/ }).click();
await page
  .getByRole("button", { name: "Reprendre la réunion", exact: true })
  .click();
await page.getByRole("button", { name: "Tous", exact: true }).click();
await page.getByRole("button", { name: /OBS-0001/ }).click();
await page.getByText("Posé. Contrôle conforme.", { exact: true }).waitFor();
assert.equal(await page.locator(".photo-card").count(), 1);
await page
  .getByRole("button", { name: "Retour aux points", exact: true })
  .click();
await page.getByRole("button", { name: "Plans", exact: true }).first().click();
await page.locator(".plan-pin").waitFor();
await page.getByRole("button", { name: "Agrandir", exact: true }).click();
await page.locator(".pdf-loading").waitFor({ state: "hidden" });
await page.locator(".plan-pin").click();
await page.getByText("Posé. Contrôle conforme.", { exact: true }).waitFor();
await page.screenshot({ path: "/tmp/moe-terrain-desktop.png", fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page
  .getByRole("button", { name: "Retour aux points", exact: true })
  .click();
await page.screenshot({ path: "/tmp/moe-terrain-mobile.png", fullPage: true });
assert.ok(
  await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  ),
  "Mobile horizontal overflow",
);
console.log("Browser: trash");
await page
  .getByRole("button", { name: "Observations", exact: true })
  .first()
  .click();
await page.getByRole("button", { name: "Tous", exact: true }).click();
await page.getByRole("button", { name: /OBS-0001/ }).click();
await page
  .getByRole("button", { name: "Supprimer ce point", exact: true })
  .click();
await page
  .getByRole("button", { name: "Transfert", exact: true })
  .first()
  .click();
await page
  .getByRole("button", { name: "Restaurer le point", exact: true })
  .click();
await page
  .getByRole("button", { name: "Réunions", exact: true })
  .first()
  .click();
await page
  .getByRole("button", { name: "Supprimer la réunion", exact: true })
  .click();
await page
  .getByRole("button", { name: "Transfert", exact: true })
  .first()
  .click();
await page
  .getByRole("button", { name: "Restaurer la réunion", exact: true })
  .click();
assert.deepEqual(errors, []);
console.log(
  "Browser smoke: DOCX, photo, GPS, PDF with zoom and marker, history, closure, ZIP import on independent PC, offline restart and mobile layout passed.",
);
await browser.close();

server.close();

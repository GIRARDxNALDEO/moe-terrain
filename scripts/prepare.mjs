import { mkdir, copyFile, writeFile, rm, cp } from "node:fs/promises";
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
if (base && (!base.startsWith("/") || base.endsWith("/")))
  throw Error(
    "NEXT_PUBLIC_BASE_PATH doit être vide ou de la forme /moe-terrain",
  );
await rm("out", { recursive: true, force: true });
await mkdir("public/pdf", { recursive: true });
await copyFile(
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "public/pdf/pdf.worker.min.mjs",
);
for (const dir of ["cmaps", "standard_fonts", "wasm"])
  await cp(`node_modules/pdfjs-dist/${dir}`, `public/pdf/${dir}`, {
    recursive: true,
  });
await writeFile(
  "public/manifest.webmanifest",
  JSON.stringify(
    {
      id: `${base}/`,
      name: "MOE Terrain",
      short_name: "MOE Terrain",
      description: "La mémoire locale de vos chantiers",
      lang: "fr",
      start_url: `${base}/`,
      scope: `${base}/`,
      display: "standalone",
      background_color: "#F5F7F9",
      theme_color: "#1D2D44",
      icons: [
        {
          src: `${base}/icons/icon-192.png`,
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: `${base}/icons/icon-512.png`,
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
        {
          src: `${base}/icons/icon-maskable-512.png`,
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    null,
    2,
  ),
);
await writeFile("public/.nojekyll", "");

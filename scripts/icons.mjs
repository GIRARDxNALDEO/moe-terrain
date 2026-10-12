import sharp from "sharp";
const root = "public/icons";
for (const [size, name] of [
  [512, "icon-512.png"],
  [192, "icon-192.png"],
  [180, "apple-touch-icon.png"],
  [32, "favicon.png"],
])
  await sharp(`${root}/icon.svg`)
    .resize(size, size)
    .flatten({ background: "#1D2D44" })
    .png()
    .toFile(`${root}/${name}`);
const inner = await sharp(`${root}/icon.svg`).resize(368, 368).png().toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: "#1D2D44" },
})
  .composite([{ input: inner, left: 72, top: 72 }])
  .png()
  .toFile(`${root}/icon-maskable-512.png`);

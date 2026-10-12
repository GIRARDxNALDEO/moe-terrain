import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const port = Number(process.env.PORT || 4318);
const base = process.env.NEXT_PUBLIC_BASE_PATH || "/moe-terrain";
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain",
  ".wasm": "application/wasm",
};
export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith(`${base}/`)) {
      res.writeHead(404).end();
      return;
    }
    let filename = path.resolve(
      "out",
      `.${decodeURIComponent(url.pathname.slice(base.length))}`,
    );
    if (
      filename !== path.resolve("out") &&
      !filename.startsWith(path.resolve("out") + path.sep)
    ) {
      res.writeHead(403).end();
      return;
    }
    if ((await stat(filename)).isDirectory())
      filename = path.join(filename, "index.html");
    res.writeHead(200, {
      "Content-Type":
        types[path.extname(filename)] || "application/octet-stream",
    });
    res.end(await readFile(filename));
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Static preview http://127.0.0.1:${port}${base}/`),
);

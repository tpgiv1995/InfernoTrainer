// Minimal static server for the built site: node scripts/serve-dist.mjs [port] [dir]
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const port = Number(process.argv[2] ?? 8123);
const root = resolve(process.argv[3] ?? "dist");
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".ogg": "audio/ogg", ".glb": "model/gltf-binary", ".woff": "font/woff", ".woff2": "font/woff2",
  ".gif": "image/gif", ".map": "application/json",
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (rel.includes("..")) { res.writeHead(400).end(); return; }
  let file = join(root, rel);
  try {
    const s = await stat(file);
    if (s.isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(root, "index.html"); // the app picks its region from the path, like the production host
  }
  try {
    const s = await stat(file);
    res.writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream", "Content-Length": s.size });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}`));

// Plays every V3 cache graphic on its own next to the player and saves a close-up of each, to judge how each one
// looks. Usage: npm run build:site && node scripts/smoke/graphics-gallery.mjs   (output: test-results/gallery/)
import { createServer } from "node:http";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "test-results", "gallery");
mkdirSync(out, { recursive: true });
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".ogg": "audio/ogg", ".glb": "model/gltf-binary", ".woff": "font/woff", ".woff2": "font/woff2", ".gif": "image/gif", ".map": "application/json" };
const dist = join(root, "dist");
const server = createServer(async (req, res) => {
  try {
    let file = join(dist, normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)));
    if (!file.startsWith(dist)) throw new Error("outside");
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = (process.argv[2] ? process.argv[2].split(",").map(Number) : [369, 377, 85, 3364, 3365, 3366, 3367, 3368, 1926, 1927]);
const heights = { 3364: 0.7, 3366: 0.7, 1927: 0.7 };
const browser = await chromium.launch({ headless: true, channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto(base + "?wave=1&debug", { waitUntil: "load" });
await page.waitForFunction("!!window.__v3Sim && !!document.querySelector('#v3_start')", null, { timeout: 60000 });
await page.evaluate(() => { const fs = document.querySelector("#v3_fs"); if (fs && fs.checked) fs.click(); });
await page.click("#v3_start");
await page.waitForFunction("window.__v3Sim.playerModelSource() === 'cache'", null, { timeout: 90000 });
await page.mouse.move(720, 450);
for (let i = 0; i < Number(process.env.ZOOM ?? 6); i++) { await page.mouse.wheel(0, -300); await sleep(120); }
await sleep(1500);
for (const id of ids) {
  await page.evaluate(`window.__v3Sim.showGraphic(${id}, ${heights[id] ?? 0}, ${process.env.DX ?? 0}, ${process.env.DY ?? 3})`);
  for (let frame = 0; frame < 4; frame++) {
    await sleep(frame === 0 ? 150 : 350);
    const box = await page.evaluate("window.__v3Sim.lastGraphicBox()");
    const pb = await page.evaluate("window.__v3Sim.playerBox()");
    if (frame === 0) console.log(id, "graphic box", JSON.stringify(box), "player box", JSON.stringify(pb));
    // frame the player and the graphic together
    const pts = [box, pb].filter(Boolean);
    const x0 = Math.min(...pts.map((b) => b.x)) - 100, y0 = Math.min(...pts.map((b) => b.y)) - 120;
    const x1 = Math.max(...pts.map((b) => b.x + b.w)) + 100, y1 = Math.max(...pts.map((b) => b.y + b.h)) + 60;
    const x = Math.max(0, Math.round(x0)), y = Math.max(0, Math.round(y0));
    const w = Math.max(100, Math.min(1440 - x, Math.round(x1 - x0))), h = Math.max(100, Math.min(900 - y, Math.round(y1 - y0)));
    writeFileSync(join(out, `${id}-${frame}.png`), await page.screenshot({ clip: { x, y, width: w, height: h } }));
  }
}
await browser.close();
server.close();
console.log("wrote", out);

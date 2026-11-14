// Browser smoke test for the player model and the player's projectile and impact graphics.
//
// It cold-loads wave 1 in its own headless Chrome (a fresh temporary profile; it never touches any other browser),
// waits for the cache-rendered player, and for five states (tank set with the Blood ancient sceptre, Eye of Ayak,
// Bow of Faerdhinen set, Toxic blowpipe, and an unequipped body) it:
//   1. measures the player's screen region by drawing the frame with and without the player model and failing
//      when the two frames do not differ there (an empty player region), and
//   2. attacks a visible monster (the farthest visible one for the BowFa) and fails if any player projectile used the coloured-sphere fallback, or if the
//      real graphics for that weapon never appeared (the BowFa launch glow, the Eye normal and Soul Rend graphics,
//      the Ice and Blood Barrage impacts).
// Screenshots go to test-results/smoke/ (full frame plus a 4x crop of the player for each state).
//
// Usage:  npm run build:site && npm run smoke
//         node scripts/smoke/player-smoke.mjs [--url http://127.0.0.1:8123/] [--keep]
// With no --url it serves ./dist itself. Chrome is found with Playwright's "chrome" channel; set CHROME_PATH to use
// another executable. Exit code 0 = all states pass.
import { createServer } from "node:http";
import { createReadStream, mkdirSync, writeFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { PNG } from "pngjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = join(root, "test-results", "smoke");
mkdirSync(outDir, { recursive: true });
const args = process.argv.slice(2);
const urlArg = args.includes("--url") ? args[args.indexOf("--url") + 1] : null;

const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".ogg": "audio/ogg", ".glb": "model/gltf-binary", ".woff": "font/woff", ".woff2": "font/woff2",
  ".gif": "image/gif", ".map": "application/json", ".bin": "application/octet-stream",
};

function serveDist() {
  const dist = join(root, "dist");
  const server = createServer(async (req, res) => {
    try {
      const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
      let file = join(dist, path);
      if (!file.startsWith(dist)) throw new Error("outside dist");
      if ((await stat(file)).isDirectory()) file = join(file, "index.html");
      await stat(file);
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      createReadStream(file).pipe(res);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

const failures = [];
const notes = [];
const fail = (state, message) => {
  failures.push(`[${state}] ${message}`);
  console.error(`FAIL [${state}] ${message}`);
};
const note = (state, message) => {
  notes.push(`[${state}] ${message}`);
  console.log(`ok   [${state}] ${message}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(page, expression, timeoutMs, label) {
  const start = Date.now();
  for (;;) {
    const value = await page.evaluate(expression).catch(() => null);
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await sleep(250);
  }
}

/** Number of pixels that differ between two same-size frames (inside `box` {x,y,w,h} when given). */
function differingCount(a, b, box = null) {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  let differing = 0;
  for (let y = box ? box.y : 0; y < (box ? box.y + box.h : pa.height); y++) {
    for (let x = box ? box.x : 0; x < (box ? box.x + box.w : pa.width); x++) {
      const i = (y * pa.width + x) * 4;
      const d = Math.abs(pa.data[i] - pb.data[i]) + Math.abs(pa.data[i + 1] - pb.data[i + 1]) + Math.abs(pa.data[i + 2] - pb.data[i + 2]);
      if (d > 48) differing++;
    }
  }
  return differing;
}

/** Fraction of pixels in the clip that differ between the frame with the player and the frame without. */
function differingFraction(withPlayer, withoutPlayer) {
  const a = PNG.sync.read(withPlayer);
  const b = PNG.sync.read(withoutPlayer);
  let differing = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > 48) differing++;
  }
  return differing / (a.width * a.height);
}

function cropFile(png, scale) {
  const src = PNG.sync.read(png);
  const out = new PNG({ width: src.width * scale, height: src.height * scale });
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const s = ((Math.floor(y / scale)) * src.width + Math.floor(x / scale)) * 4;
      const d = (y * out.width + x) * 4;
      for (let c = 0; c < 4; c++) out.data[d + c] = src.data[s + c];
    }
  }
  return PNG.sync.write(out);
}

const sim = (fn) => `(() => { const s = window.__v3Sim; return ${fn}; })()`;

async function checkPlayerRegion(page, state) {
  await sleep(1200);
  const box = await page.evaluate(sim("s.playerBox()"));
  if (!box || box.w < 10 || box.h < 10) return fail(state, `no player screen box (${JSON.stringify(box)})`);
  const clip = {
    x: Math.max(0, Math.round(box.x)), y: Math.max(0, Math.round(box.y)),
    width: Math.max(20, Math.round(box.w)), height: Math.max(20, Math.round(box.h)),
  };
  const withPlayer = await page.screenshot({ clip });
  await page.evaluate(sim("s.hidePlayer(true)"));
  await sleep(500);
  const without = await page.screenshot({ clip });
  await page.evaluate(sim("s.hidePlayer(false)"));
  await sleep(300);
  const fraction = differingFraction(withPlayer, without);
  const pad = 40;
  const wide = { x: Math.max(0, clip.x - pad), y: Math.max(0, clip.y - pad), width: clip.width + pad * 2, height: clip.height + pad * 2 };
  writeFileSync(join(outDir, `${state}-crop.png`), cropFile(await page.screenshot({ clip: wide }), 4));
  await page.screenshot({ path: join(outDir, `${state}.png`) });
  if (fraction < 0.1) fail(state, `player region looks empty: only ${(fraction * 100).toFixed(1)}% of its pixels change when the model is hidden`);
  else note(state, `player region filled (${(fraction * 100).toFixed(0)}% of pixels are the player)`);
}

/**
 * While a player projectile is in flight, its screen region must change when its model is hidden: that proves the
 * projectile is actually drawn (a model source that is only configured, not rendered, fails here).
 */
async function checkProjectilePixels(page, state, label) {
  const deadline = Date.now() + 25000;
  let lastNote = "no projectile in flight";
  while (Date.now() < deadline) {
    const points = await page.evaluate(sim("s.playerProjectilePoints()"));
    if (!points.length) {
      await sleep(80);
      continue;
    }
    await page.evaluate(sim("s.freeze(true)"));
    await sleep(150);
    const frozen = await page.evaluate(sim("s.playerProjectilePoints()"));
    if (!frozen.length) {
      await page.evaluate(sim("s.freeze(false)"));
      await sleep(60);
      continue; // it landed before the game could be held still
    }
    await page.screenshot({ path: join(outDir, `${state}-projectile-frame.png`) });
    // the player animates on its own clock, so hide the player model for all three frames: only projectiles differ
    await page.evaluate(sim("s.hidePlayer(true)"));
    const frame = async (hidden) => {
      await page.evaluate(sim(`s.hideProjectiles(${hidden})`));
      await sleep(120);
      return page.screenshot();
    };
    const hidden1 = await frame(true);
    const shown = await frame(false);
    const hidden2 = await frame(true);
    await page.evaluate(sim("s.hideProjectiles(false)"));
    await page.evaluate(sim("s.hidePlayer(false)"));
    await page.evaluate(sim("s.freeze(false)"));
    // measure the region around each projectile in flight; the best one is the verdict
    let best = null;
    for (const pt of frozen) {
      const half = 30;
      const x0 = Math.max(0, Math.round(pt.x - half));
      const y0 = Math.max(0, Math.round(pt.y - half));
      const box = { x: x0, y: y0, w: Math.min(1440 - x0, half * 2), h: Math.min(900 - y0, half * 2) };
      if (box.w < 20 || box.h < 20) continue;
      const result = { pt, signal: differingCount(shown, hidden1, box), noise: differingCount(hidden1, hidden2, box) };
      if (!best || result.signal - result.noise > best.signal - best.noise) best = result;
    }
    if (!best) {
      lastNote = "every projectile was off screen";
      await sleep(80);
      continue;
    }
    const { signal, noise, pt } = best;
    lastNote = `${label}: ${signal} pixels change around the projectile at ${Math.round(pt.x)},${Math.round(pt.y)} with it drawn vs hidden (noise ${noise}, source ${pt.source}, ${frozen.length} in flight)`;
    const crop = (png, size = 3) => {
      const clip = PNG.sync.read(png);
      const x0 = Math.max(0, Math.round(pt.x - 60)), y0 = Math.max(0, Math.round(pt.y - 60));
      const w = Math.min(120, clip.width - x0), h = Math.min(120, clip.height - y0);
      const out = new PNG({ width: w, height: h });
      PNG.bitblt(clip, out, x0, y0, w, h, 0, 0);
      return cropFile(PNG.sync.write(out), size);
    };
    writeFileSync(join(outDir, `${state}-projectile-shown.png`), crop(shown));
    writeFileSync(join(outDir, `${state}-projectile-hidden.png`), crop(hidden1));
    if (signal >= Math.max(30, noise * 2 + 15)) {
      note(state, lastNote);
      return true;
    }
    fail(state, `projectile not visible on screen: ${lastNote}`);
    return false;
  }
  fail(state, `could not measure a projectile in flight (${lastNote})`);
  return false;
}

async function attackAndCheck(page, state, { special = false, spell = null, expectGraphics, expectAny = null, expectSources, farthest = 0, projectilePixels = false }) {
  await page.evaluate(sim("s.clearLogs()"));
  await page.evaluate(sim("s.toughen()"));
  const target = await page.evaluate(sim(projectilePixels ? `s.attackInView(${farthest || 12}, ${farthest ? "true" : "false"})` : "s.attackNearest()"));
  if (!target) return fail(state, "no monster to attack");
  // (choosing a target resets a pending spell selection, so select after)
  if (special) await page.evaluate(sim("s.useSpecial(true)"));
  if (spell) {
    // the player may be mid-cycle on its autocast: keep the manual selection pending until the cast lands
    for (let attempt = 0; attempt < 20; attempt++) {
      await page.evaluate(sim(`s.selectSpell(${JSON.stringify(spell)})`));
      await sleep(900);
      if (await page.evaluate(sim(`${JSON.stringify(expectAny[0])}.some((id) => s.graphicLog().some((g) => g.id === id))`))) break;
    }
    await page.evaluate(sim("s.clearSpell()")); // never leave a manual cast pending for the next state
  }
  if (projectilePixels) await checkProjectilePixels(page, state, farthest ? `long shot (${target})` : `shot at ${target}`);
  const needed = expectGraphics;
  try {
    await waitFor(
      page,
      sim(`${JSON.stringify(needed)}.every((id) => s.graphicLog().some((g) => g.id === id)) && ${JSON.stringify(expectAny ?? [])}.every((ids) => ids.some((id) => s.graphicLog().some((g) => g.id === id))) && s.projectileLog().length >= ${expectSources.length ? 1 : 0}`),
      45000,
      `graphics ${needed.join(",")}`,
    );
  } catch (error) {
    const seen = await page.evaluate(sim("({ graphics: s.graphicLog().map((g) => g.id), projectiles: s.projectileLog() })"));
    return fail(state, `${error.message}; saw ${JSON.stringify(seen)}`);
  }
  // frames of the effects, cropped around the target and around the player, while the graphics are on screen
  const save = async (name, box, pad) => {
    if (!box) return;
    const x = Math.max(0, Math.floor(box.x - pad));
    const y = Math.max(0, Math.floor(box.y - pad));
    const width = Math.min(1440 - x, Math.ceil(box.w + pad * 2));
    const height = Math.min(900 - y, Math.ceil(box.h + pad * 2));
    if (width > 20 && height > 20) writeFileSync(join(outDir, name), await page.screenshot({ clip: { x, y, width, height } }));
  };
  for (let frame = 0; frame < 4; frame++) {
    const boxes = await page.evaluate(sim("({ p: s.playerBox(), t: s.targetBox() })"));
    await save(`${state}-target-${frame}.png`, boxes.t, 110);
    await save(`${state}-player-${frame}.png`, boxes.p, 90);
    await sleep(250);
  }
  const everything = await page.evaluate(sim("s.projectileLog()"));
  const monsterSpheres = everything.filter((p) => p.from !== "player" && p.source === "sphere");
  if (monsterSpheres.length) fail(state, `a monster projectile used the sphere fallback: ${JSON.stringify(monsterSpheres.slice(0, 3))}`);
  const log = everything.filter((p) => p.from === "player");
  const spheres = log.filter((p) => p.source === "sphere");
  if (spheres.length) fail(state, `player projectile used the sphere fallback: ${JSON.stringify(spheres)}`);
  const got = new Set(log.map((p) => p.source));
  expectSources.forEach((source) => {
    if (!got.has(source)) fail(state, `expected a player projectile with source "${source}", saw ${JSON.stringify(Array.from(got))}`);
  });
  note(state, `attack on ${target}: graphics ${needed.concat((expectAny ?? []).map((g) => g.join("|"))).join(",")} seen, projectile sources ${JSON.stringify(Array.from(got))}`);
  // let the effects play so the next state starts clean, but keep a shot of them for the crops
  await page.screenshot({ path: join(outDir, `${state}-attack.png`) });
}

async function main() {
  let served = null;
  let baseUrl = urlArg;
  if (!baseUrl) {
    served = await serveDist();
    baseUrl = served.url;
  }
  const executablePath = process.env.CHROME_PATH || undefined;
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : { channel: "chrome" }),
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200));
    });
    await page.goto(new URL("?wave=1&debug", baseUrl).toString(), { waitUntil: "load" });
    await waitFor(page, "!!window.__v3Sim && !!document.querySelector('#v3_start')", 60000, "the setup screen");
    await page.evaluate(() => {
      const fs = document.querySelector("#v3_fs");
      if (fs && fs.checked) fs.click();
    });
    await page.click("#v3_start");
    // cold load: the cache model must replace the empty/legacy placeholder
    try {
      await waitFor(page, sim("s.playerModelSource() === 'cache'"), 90000, "the cache-rendered player");
    } catch (error) {
      const source = await page.evaluate(sim("s.playerModelSource()")).catch(() => "unknown");
      throw new Error(`${error.message} (model source is "${source}")`);
    }
    note("load", "cache model ready");
    // zoom in so the player is large enough to judge
    await page.mouse.move(720, 450);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -300);
      await sleep(120);
    }
    await sleep(1500);
    await page.evaluate(sim("s.freeSlots(3)"));
    await page.evaluate(sim("s.toughen()"));

    // 1. tank set with the Blood ancient sceptre (autocasting Ice Barrage)
    await checkPlayerRegion(page, "tank-sceptre");
    // a barrage that misses shows the splash (85) instead of the impact: either one proves the real graphics are used
    await attackAndCheck(page, "tank-sceptre", { expectGraphics: [], expectAny: [[369, 85]], expectSources: ["none"] });
    await attackAndCheck(page, "tank-sceptre-blood", { spell: "blood", expectGraphics: [], expectAny: [[377, 85]], expectSources: ["none"] });

    // 2. Eye of Ayak: normal attack, then Soul Rend
    await page.evaluate(sim("s.equip('Eye of Ayak')"));
    await sleep(2000);
    await checkPlayerRegion(page, "eye");
    await attackAndCheck(page, "eye", { expectGraphics: [3366, 3368], expectSources: ["cache"], projectilePixels: true });
    await attackAndCheck(page, "eye-soul-rend", { special: true, expectGraphics: [3364, 3365], expectSources: ["none"] });

    // 3. Bow of Faerdhinen with the crystal set
    for (const name of ["Bow of faerdhinen", "Crystal Helm", "Crystal Body", "Crystal Legs", "Dizana's Quiver", "Necklace of rupture"]) {
      await page.evaluate(sim(`s.equip(${JSON.stringify(name)})`));
      await sleep(400);
    }
    await sleep(2000);
    await checkPlayerRegion(page, "bowfa");
    await attackAndCheck(page, "bowfa", { expectGraphics: [1927], expectSources: ["cache"], farthest: 10, projectilePixels: true });

    // 4. Toxic blowpipe
    await page.evaluate(sim("s.equip('Toxic Blowpipe')"));
    await sleep(2000);
    await checkPlayerRegion(page, "blowpipe");
    await attackAndCheck(page, "blowpipe", { expectGraphics: [], expectSources: ["gltf"], projectilePixels: true });

    // 5. unequipped body: nothing worn, the default body must still be on screen
    await page.evaluate(sim("s.unequip(['helmet','necklace','cape','chest','legs','feet','gloves','ring','ammo','weapon','offhand'])"));
    await sleep(2500);
    await checkPlayerRegion(page, "unequipped-body");

    const source = await page.evaluate(sim("s.playerModelSource()"));
    if (source !== "cache") fail("end", `player model source ended as "${source}", not the cache render`);
    if (consoleErrors.length) notes.push(`console errors (not failing): ${consoleErrors.slice(0, 5).join(" | ")}`);
    await context.close();
  } finally {
    await browser.close();
    if (served) served.server.close();
  }
}

try {
  await main();
} catch (error) {
  fail("run", error.message);
}
writeFileSync(join(outDir, "summary.txt"), [...notes, ...failures.map((f) => `FAIL ${f}`)].join("\n") + "\n");
if (failures.length) {
  console.error(`\n${failures.length} failure(s). Screenshots: ${outDir}`);
  process.exit(1);
}
console.log(`\nAll states passed. Screenshots: ${outDir}`);
process.exit(0);

// Downloads every asset the game asks the upstream asset CDN for, so the deployed site serves its
// own copy. The upstream CDN only allows the upstream site's origins, so a different host cannot
// load from it. index.html points window.OSRS_ASSET_BASE_URL at /cdn/, and the SDK build honours it.
//
// The list comes from the code itself: every Assets.getAssetUrl("<path>") literal in this repo's src
// and in the vendored SDK bundle. Usage: node scripts/mirror-assets.mjs [outDir]  (default dist/cdn)
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(process.argv[2] ?? join(root, "dist", "cdn"));
const CDN = "https://oldschool-cdn.com/";
const LITERAL = /getAssetUrl\(\s*"([^"]+)"/g;

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|js)$/.test(entry.name)) yield full;
  }
}

export async function collectAssetPaths() {
  const found = new Set();
  const files = [join(root, "node_modules", "osrs-sdk", "_bundles", "main.js")];
  for await (const f of walk(join(root, "src"))) files.push(f);
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const m of text.matchAll(LITERAL)) found.add(m[1]);
  }
  return [...found].sort();
}

async function exists(path) {
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

async function main() {
  const paths = await collectAssetPaths();
  console.log(`${paths.length} assets to mirror into ${outDir}`);
  let fetched = 0;
  let skipped = 0;
  const failed = [];
  const queue = [...paths];
  async function worker() {
    for (let path = queue.shift(); path; path = queue.shift()) {
      const target = join(outDir, path);
      if (await exists(target)) {
        skipped++;
        continue;
      }
      const res = await fetch(CDN + path);
      if (!res.ok) {
        failed.push(`${path} (${res.status})`);
        continue;
      }
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.from(await res.arrayBuffer()));
      fetched++;
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  console.log(`fetched ${fetched}, already present ${skipped}, failed ${failed.length}`);
  if (failed.length) {
    console.error(failed.join("\n"));
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

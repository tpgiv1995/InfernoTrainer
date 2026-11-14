# V3 Inferno Sim

A personal build of the open-source [Inferno Trainer](https://github.com/OldSchoolSDK/InfernoTrainer)
(OldSchoolSDK, GPL-3.0) with a RuneLite-style interface: one bottom tab row, right-drag camera, F-key
panels, a fight setup screen, a Try again prompt, and spawn import from Inferno Stats links.
Live: https://v3-infernosim.netlify.app

The engine is `osrs-sdk` 0.1.4 (the version upstream pins) plus the patches in branch `inferno-v3` of
[tpgiv1995/osrs-sdk](https://github.com/tpgiv1995/osrs-sdk/tree/inferno-v3). Legacy mode matches upstream
for the fields and scenarios the five golden flows record (see "Golden flows" below); V3 intentionally
changes the documented combat mechanics and loadout (calculator formulas, prayers, potions, spells, the
Inferno kit). The built package is committed in `vendor/` and referenced with `file:` in `package.json`.

## What is different from upstream

| Area | Behaviour |
| --- | --- |
| Setup screen | Opens first. Wave or pasted link, loadout, on task, pillars, Zuk shield, camera sensitivity, fullscreen on start. **Start always begins a fresh reset.** The top-left menu button reopens it. |
| Controls | F1 combat, F2 inventory, F3 prayer, F4 magic, F5 equipment; the key of the open panel closes it. Right-drag turns the camera (sensitivity setting), a quick right-click opens the menu. |
| Layout | RuneLite modern layout: a single bottom tab row, larger panel, chat strip. The site sidebar sits behind the gear button. |
| Prayer | Level 93. The prayer book uses the V3 layout (switch to the stock order on the setup screen). |
| Player model | The character is drawn from the OSRS cache: the real wear model of every item it wears, over the default body (head, jaw, torso, arms, hands, legs, feet) so an item without a model leaves the body part showing. The bundle is `src/assets/player-render/` (cache revision 242, OpenRS2 2762), rebuilt with `scripts/player-render/extract.mts` in the SDK repo. |
| Death | An overlay offers Try again (Enter). |
| Spawn import | The URL accepts the Inferno Stats params (`bat`, `blob`, `melee`, `ranger`, `mager`, `copyable`). The setup screen and the sidebar have a "Paste link" box for an infernotrainer.com or infernostats link. |
| Settings | Everything persists in the browser (the engine's keys plus `v3-inferno-sim:settings`). |

## Build and run

Node 24 works with no flags (`.nvmrc` pins 24.19.0). Upstream's Node 16 note (an OpenSSL error on newer
Node) does not apply to this webpack version.

```
npm ci
npm test                 # jest: unit tests, golden flows
npm run build:site       # production build into dist/ plus a mirror of the game assets in dist/cdn/
node scripts/serve-dist.mjs 8123 dist      # preview at http://127.0.0.1:8123
```

`npm start` runs the webpack dev server on port 8000 (run `npm run assets` once first so `dist/cdn` exists).

### Why `dist/cdn`

The SDK downloads models and sounds from `oldschool-cdn.com`, which only allows the upstream site's
origins. `src/index.html` sets `window.OSRS_ASSET_BASE_URL` to `/cdn/` and the vendored SDK honours it;
`scripts/mirror-assets.mjs` downloads every `Assets.getAssetUrl("...")` path found in this repo and the
SDK bundle (57 files, about 45 MB). It needs network access and is skipped for files already present.

## Deploy (Netlify, not git-linked)

Site `v3-infernosim`, deployed from a local build:

```
npm run build:site
netlify deploy --prod --dir dist --no-build --site <site id>
```

On Git Bash set `MSYS_NO_PATHCONV=1` if an environment value that looks like a path gets rewritten.

## Tests

- `test/v3/spawnLink.test.ts` - the link parser (three real-shaped links, bad input) and exact mob placement
  (`x+11, y+14`, plus the three nibblers the site always adds).
- `test/golden/` - the golden-flow harness (see below).
- `test/simulations/` - upstream's line-of-sight tests.

### Golden flows

`test/golden/harness.ts` loads a spawn URL into the real `InfernoRegion` without a browser and plays N ticks
with a scripted player that gives no commands: it does not move, pray, pick a target or use items, and it is
topped back up to full Hitpoints after every tick so it never dies. Each tick the harness records every mob's
name, tile, hitpoints and attack timer, plus the damage the player took that tick. Randomness (`Random` and
`Math.random`, including lodash) is seeded inside the harness only.

Five flows: an Inferno Stats style link with every mob type and a double blob; native wave 63 on fixed tiles;
wave 67 (Jad only, 100 ticks, no healers recorded); wave 68 (triple Jad); wave 69 (Zuk, his shield and his first
set only, 260 ticks; no healers recorded). `test/golden/traces/*.json` were written by running the same harness
against **upstream** `beta` (commit in `traces/UPSTREAM_COMMIT.txt`, npm `osrs-sdk` 0.1.4), so a green run shows
that, for these scenarios and the recorded fields, the fork's mobs spawn, move and time their attacks the way
upstream's do. To rewrite them: check out upstream, copy `test/golden/*.ts` and `test/setupFiles.ts`, and run
`GOLDEN_WRITE=1 npx jest test/golden`.

What is compared, tick by tick: for every mob present (including Zuk and the Inferno Shield while it exists), its
name, tile (x, y), current hitpoints and attack delay; and the damage the scripted player took. For the shield
that means its position along the wall, its hitpoints (600 down to 0 when it breaks) and its attack timer. The
runs are in upstream's legacy rules (`V3Rules.calculator = false`); the V3 rules change player and monster combat
numbers on purpose and have their own tests.

Not compared: Jad healers and Zuk's healers (neither flow reaches them), the player's own attacks and targeting,
prayers, projectiles in flight, rendering, sound and UI. This is not a claim about the whole SDK.

Browser side-by-side: open the same link on https://www.infernotrainer.com/ and on the fork and compare
where the mobs stand at the end of "Get ready".

## Browser smoke test (player model and graphics)

`npm run smoke` drives a headless Chrome of its own (a fresh temporary profile; it never touches any other browser).
It cold-loads wave 1, waits for the cache-rendered player, then for the tank set with the sceptre, the Eye of Ayak,
the Bow of Faerdhinen set, the Toxic blowpipe and an unequipped body it (1) draws the frame with and without the
player model and fails if the player's screen region does not change (an empty player region), and (2) attacks a
visible monster (the farthest visible one for the BowFa, so the arrow has room to fly) and fails if any projectile used the coloured-sphere fallback, or if the real graphics for that weapon
(BowFa launch glow, Eye normal and Soul Rend graphics, Ice and Blood Barrage impacts) never appeared. (3) For the
BowFa arrow, the Eye projectile and the blowpipe dart it holds the game still while the projectile is in flight, takes
the frame with and without projectiles drawn, and fails if the region around the projectile does not change (a
projectile that is configured but never actually drawn). It exits non-zero on any failure and writes screenshots and effect crops to `test-results/smoke/`.

```
npm run build:site     # the test serves ./dist
npm run smoke          # or: node scripts/smoke/player-smoke.mjs --url https://v3-infernosim.netlify.app/
```

Chrome is found with Playwright's `chrome` channel (`playwright-core`, no browser download); set `CHROME_PATH` to use
another executable. `node scripts/smoke/graphics-gallery.mjs` plays each cache graphic on its own and saves close-ups
to `test-results/gallery/`. Both rely on the `?debug` hooks (`window.__v3Sim`).

## Rebuilding the vendored SDK

```
git clone https://github.com/tpgiv1995/osrs-sdk.git && cd osrs-sdk && git checkout inferno-v3
npm ci && npx jest
rm -rf _bundles lib lib-esm && npx webpack --config webpack.production.js
npm pack          # osrs-sdk-0.1.4.tgz
```

Rename it `vendor/osrs-sdk-<short commit>.tgz`, point `package.json` at it, run `npm install`. Never `npm link`.

## Notes

- Nothing here sends analytics: upstream's Google Analytics and New Relic snippets were removed.
- This repository is a standalone copy of upstream `beta` (history kept; remote `upstream`), not a GitHub fork,
  because GitHub maps the owner's existing fork of the sibling Colosseum trainer onto the same fork network.
- Assets belong to Jagex. This is an unofficial fan tool.

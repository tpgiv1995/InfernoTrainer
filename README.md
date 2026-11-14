# V3 Inferno Sim

A personal build of the open-source [Inferno Trainer](https://github.com/OldSchoolSDK/InfernoTrainer)
(OldSchoolSDK, GPL-3.0) with a RuneLite-style interface: one bottom tab row, right-drag camera, F-key
panels, a fight setup screen, a Try again prompt, and spawn import from Inferno Stats links.
Live: https://v3-infernosim.netlify.app

Gameplay is upstream's, unchanged: the engine is `osrs-sdk` 0.1.4 (the version upstream pins) plus a
small set of UI-only patches (branch `inferno-v3` of
[tpgiv1995/osrs-sdk](https://github.com/tpgiv1995/osrs-sdk/tree/inferno-v3)). The built package is
committed in `vendor/` and referenced with `file:` in `package.json`.

## What is different from upstream

| Area | Behaviour |
| --- | --- |
| Setup screen | Opens first. Wave or pasted link, loadout, on task, pillars, Zuk shield, camera sensitivity, fullscreen on start. **Start always begins a fresh reset.** The top-left menu button reopens it. |
| Controls | F1 combat, F2 inventory, F3 prayer, F4 magic, F5 equipment; the key of the open panel closes it. Right-drag turns the camera (sensitivity setting), a quick right-click opens the menu. |
| Layout | RuneLite modern layout: a single bottom tab row, larger panel, chat strip. The site sidebar sits behind the gear button. |
| Prayer | Level 93. The prayer book uses the V3 layout (switch to the stock order on the setup screen). |
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

`test/golden/harness.ts` loads a spawn URL into the real `InfernoRegion` without a browser, plays N ticks with
a scripted player (stands still, never dies, no prayers, never attacks) and records every mob's name, tile,
hitpoints and attack timer per tick, plus the damage the player took. Randomness (`Random` and `Math.random`, including lodash)
is seeded inside the harness only.

Five flows: an Inferno Stats style link with every mob type and a double blob, native wave 63 on fixed tiles,
wave 67 (Jad and healers), wave 68 (triple Jad), wave 69 (Zuk, 260 ticks, so sets and healers).
`test/golden/traces/*.json` were written by running the same harness against **upstream** `beta`
(commit in `traces/UPSTREAM_COMMIT.txt`, npm `osrs-sdk` 0.1.4), so a green run shows that, for these
scenarios and the recorded fields, the fork's mobs spawn, move and time their attacks the way upstream's do. To rewrite them: check out upstream, copy `test/golden/*.ts` and
`test/setupFiles.ts`, and run `GOLDEN_WRITE=1 npx jest test/golden`.

Covers (what the traces record): mob spawn tiles, movement, hitpoints, attack timers and the damage the unprotected
scripted player takes, in upstream's legacy rules (`V3Rules.calculator = false`; the V3 rules change player and
monster combat numbers on purpose and have their own tests).
Does not cover: Jad healers, Zuk's healers and shield (wave 69 never takes Zuk below 1,118 HP, so no HP threshold
is reached), the player's own attacks, targeting, prayers, projectiles, rendering, sound, UI. Legacy mode matches
upstream's combat formulas and loadout behaviour; it is not a claim about the whole SDK.

Browser side-by-side: open the same link on https://www.infernotrainer.com/ and on the fork and compare
where the mobs stand at the end of "Get ready".

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

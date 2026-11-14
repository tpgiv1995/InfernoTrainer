# V3 Inferno Sim: fork design (phase A)

Date: 2026-11-14. Status: phase A built and deployed (https://v3-infernosim.netlify.app).

## Goal

Practise the Inferno with a RuneLite-feeling interface. Gameplay stays upstream's until phase B adds the
mage-tank kit with unit tests.

## Repositories

- Trainer: `tpgiv1995/InfernoTrainer`, branch `v3`, a standalone copy of `OldSchoolSDK/InfernoTrainer` `beta`
  (history kept, remote `upstream`). A true GitHub fork was not possible: GitHub maps the owner's existing fork
  of the sibling Colosseum trainer onto the same fork network and returns that repository instead.
- SDK: `tpgiv1995/osrs-sdk`, branch `inferno-v3`, cut from upstream tag `0.1.4` (not from the Colosseum
  `v3` branch). Its built package is vendored as `vendor/osrs-sdk-<short commit>.tgz` and referenced with `file:`.

## Baseline decision

Keep the npm `osrs-sdk` 0.1.4 that upstream `beta` pins. Reasons:

1. The mob, combat and prayer code the Inferno needs is already in 0.1.4 and upstream's trainer is written against it.
2. The Colosseum fork's SDK is a different line (cache-rendered models, React shell, gameplay commits) that is
   about 1,300 commits and a render pipeline away from this trainer. Taking it would change visuals and behaviour
   for no gain in phase A.
3. Every UI contract could be ported onto 0.1.4 (the touched files differ little: `git diff 0.1.4 upstream/main`
   is 45 files). No contract forced an upgrade.

Nothing from the Colosseum gameplay commits was taken (stat drain, damage modifiers, attack-range penalty,
potions, melee styles).

## What lives where

SDK (`inferno-v3`, UI only): `ClickController` + `utils/RightClickGesture` (right-drag camera),
`Viewport3d` (sensitivity), `ControlPanelController` (F-key toggle, modern bottom row, panel start state),
`ChatStrip`, `controlpanels/PrayerControls` + `PrayerLayouts` + `PrayerBookIcons` (V3 prayer book, real prayer
points text), `Settings` (V3 key defaults, `modernLayout`, `cameraSensitivity`, `prayerLayout`, sidebar hidden by
default), `Trainer` + `Player` (death and reset listeners), `utils/Assets` (`window.OSRS_ASSET_BASE_URL`).
42 jest tests, none touching gameplay.

Trainer (`v3`): `src/v3/V3Shell.ts` (setup screen, Try again overlay, gear and fullscreen buttons, paste boxes),
`src/v3/spawnLink.ts` (parser), `src/v3/V3Settings.ts`, `src/index.ts` (start gate), `InfernoLoadout.setStats`
(prayer 93), `src/index.html`, `sidebar.html`, `scripts/mirror-assets.mjs`, `test/golden/`, `test/v3/`.

## Decisions worth knowing

- **Start gate.** `index.ts` no longer starts the world itself; it calls `V3Shell.ready()`. The setup screen opens, the
  world does not tick, and Start runs `Trainer.reset()` (a fresh `initialiseRegion`) and then `startTicking`. Changing the
  wave or pasting a link reloads the page with a session flag so the new page starts at once.
- **Spawn import.** Upstream already read the Inferno Stats params (`bat`, `blob`, `melee`, `ranger`, `mager`)
  in `InfernoRegion`; that path is untouched. `parseSpawnLink` only validates and normalises pasted text. The link
  format cannot encode nibblers, so the site always adds three, exactly as upstream does.
- **Assets.** The upstream CDN allows only the upstream origins. The site mirrors the 57 assets the code references
  into `dist/cdn` at build time and the SDK reads `window.OSRS_ASSET_BASE_URL`.
- **Analytics.** Upstream's Google Analytics and New Relic snippets are removed.
- **Prayer panel.** The panel images carry a baked "99 / 99"; the SDK repaints it with real points (93 / 93).
- **Tests.** The upstream test setup could not load the bundled SDK (it mocked `three` without `Loader`, and the
  SDK's internal asset cache cannot be reached by `jest.mock`). `test/setupFiles.ts` keeps real three.js, stubs fetch,
  gives canvases a no-op 2d context and routes `Math.random` through a hook so lodash can be seeded.

## Golden flows

Headless: `test/golden/harness.ts` plays a URL for N ticks with a scripted player and records every mob per tick.
Traces were written by the same harness on upstream `beta` (`06fc103`, npm 0.1.4) and the fork must reproduce them.
Five flows: Inferno Stats link (all types, double blob), native wave 63, wave 67, wave 68, wave 69 (260 ticks).
Not covered: rendering, sound, the player's attacks, UI.

## Out of scope for phase A

The kit (Eye of Ayak and Soul Rend, Confliction, Magus ring, Saturated heart, Armadyl brew, Mystic Vigour,
Deadeye, Blood ancient sceptre barrages, BowFa crystal set, Dizana's quiver, Necklace of rupture), the V3 Inferno
loadout, and the optional Scouter code import.

/**
 * Headless golden-flow harness. It loads a spawn URL into the real InfernoRegion, plays N ticks with
 * a scripted player (stands still, never dies, no prayers) and records what every mob does each tick.
 * Randomness is seeded inside the harness only; production code is untouched.
 *
 * The same file runs against upstream OldSchoolSDK/InfernoTrainer (to write the golden traces) and
 * against this fork (to compare), so the traces prove the fork's mob behaviour matches upstream.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { Mob, Player, Random, Settings, Trainer, V3Rules, Viewport, World } from "osrs-sdk";
import { InfernoRegion } from "../../src/content/inferno/js/InfernoRegion";
import { InfernoSettings } from "../../src/content/inferno/js/InfernoSettings";

export interface MobTick {
  name: string;
  x: number;
  y: number;
  hp: number;
  attackDelay: number;
}
export interface TickRecord {
  tick: number;
  playerDamage: number;
  mobs: MobTick[];
}
export interface Flow {
  name: string;
  url: string;
  ticks: number;
  seed: number;
  /** Where the scripted player stands (omit to keep the wave's own start tile). */
  stand?: { x: number; y: number };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SIDEBAR = readFileSync(join(__dirname, "../../src/content/inferno/sidebar.html"), "utf8");

function buildDom() {
  // The shared test setup replaces getElementById with a canvas factory; this harness needs the real one.
  const spy = document.getElementById as unknown as { mockRestore?: () => void };
  spy.mockRestore?.();
  document.body.innerHTML =
    `<canvas id="world"></canvas><div id="disclaimer_panel"></div><div id="right_panel"><div id="sidebar_content">${SIDEBAR}</div>` +
    `<input type="checkbox" id="use3dView"></div>`;
}

function snapshot(region: InfernoRegion, includePending = false): MobTick[] {
  // Mobs added during setup wait in newMobs until the first tick moves them into mobs.
  const list = includePending ? [...region.mobs, ...(region as unknown as { newMobs: Mob[] }).newMobs] : region.mobs;
  return (list as Mob[]).map((mob) => ({
    name: String(mob.mobName()),
    x: mob.location.x,
    y: mob.location.y,
    hp: mob.currentStats.hitpoint,
    attackDelay: mob.attackDelay,
  }));
}

function startFlow(flow: Flow) {
  // The traces come from upstream's formulas and monster stats: run the engine in legacy mode.
  V3Rules.calculator = false;
  window.localStorage.clear();
  buildDom();
  const seeded = mulberry32(flow.seed);
  const seededMath = mulberry32(flow.seed ^ 0x9e3779b9);
  Random.setRandom(seeded);
  const realMathRandom = (globalThis as any).__mathRandom;
  (globalThis as any).__mathRandom = seededMath;

  window.history.pushState({}, "", flow.url);
  Settings.readFromStorage();
  Settings.use3dView = false;
  Settings.loadout = "max_tbow_speed";
  InfernoSettings.shieldDirection = "west";

  const region = new InfernoRegion();
  const world = new World();
  region.world = world;
  world.addRegion(region);
  const { player } = region.initialiseRegion() as { player: Player };
  Viewport.setupViewport(region, true);
  Viewport.viewport.setPlayer(player);
  Trainer.setPlayer(player);
  world.getReadyTimer = 0;
  if (flow.stand) player.location = { ...flow.stand };
  return {
    region,
    world,
    player,
    restore: () => {
      (globalThis as any).__mathRandom = realMathRandom;
      V3Rules.calculator = true;
    },
  };
}

/** The mobs exactly as the URL placed them, before any tick. */
export function initialMobs(flow: Flow): MobTick[] {
  const { region, restore } = startFlow(flow);
  const mobs = snapshot(region, true);
  restore();
  return mobs;
}

export function playFlow(flow: Flow): TickRecord[] {
  const { region, world, player, restore } = startFlow(flow);
  const records: TickRecord[] = [];
  for (let tick = 1; tick <= flow.ticks; tick++) {
    const before = player.currentStats.hitpoint;
    world.tickWorld();
    const after = player.currentStats.hitpoint;
    player.currentStats.hitpoint = player.stats.hitpoint; // the scripted player never dies
    records.push({ tick, playerDamage: before - after, mobs: snapshot(region) });
  }
  restore();
  return records;
}

export const FLOWS: Flow[] = [
  {
    // Inferno Stats style link, every mob type, a double blob; the site adds the 3 nibblers.
    name: "link-all-types",
    url: "/?bat=[[10,12]]&blob=[[20,5],[3,22]]&melee=[[5,9]]&ranger=[[12,3]]&mager=[[8,14]]&copyable",
    ticks: 90,
    seed: 1101,
  },
  {
    // Native wave 63: 3 nibblers, 2 blobs, melee, ranger, mager on fixed spawn tiles.
    name: "wave-63-native",
    url:
      "/?wave=63&x=28&y=17&spawns=" +
      encodeURIComponent(
        JSON.stringify([
          { x: 14, y: 25 },
          { x: 34, y: 26 },
          { x: 27, y: 31 },
          { x: 16, y: 37 },
          { x: 34, y: 39 },
          { x: 12, y: 42 },
        ]),
      ),
    ticks: 90,
    seed: 1102,
  },
  { name: "wave-67-jad-healers", url: "/?wave=67", ticks: 100, seed: 1103 },
  { name: "wave-68-triple-jad", url: "/?wave=68", ticks: 100, seed: 1104 },
  { name: "wave-69-zuk", url: "/?wave=69", ticks: 260, seed: 1105 },
];

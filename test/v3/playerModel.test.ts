/**
 * Structural guard: the V3 player must never be invisible. Every equipable item in the V3 loadout either has a real
 * cache model in the shipped player-render bundle or is on the documented list of items the game itself has no
 * worn model for, and the render list built from any loadout is never empty (the default body fills in under it).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { webcrypto } from "crypto";
import { TextDecoder } from "util";
import {
  AttackStylesController,
  CacheRender,
  CacheRenderReferences,
  Equipment,
  Player,
  Settings,
  TestRegion,
  V3Rules,
  cachedPayload,
} from "osrs-sdk";
import { InfernoLoadout } from "../../src/content/inferno/js/InfernoLoadout";

const BUNDLE_DIR = join(__dirname, "../../src/assets/player-render");
const MANIFEST_URL = "http://localhost/player-render/manifest.json";

/**
 * Items the OSRS cache has no worn (male) model for. They draw nothing on the character in the real game either
 * (a ring and an ammo slot item), so there is no body part to fall back to and nothing to be missing.
 */
const NO_WORN_MODEL_IN_CACHE: Record<number, string> = {
  22947: "Rada's blessing 4 (ammo slot, the game draws nothing)",
  28313: "Magus ring (ring slot, the game draws nothing)",
};

function serveBundleFromDisk() {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
  (globalThis as any).TextDecoder = TextDecoder;
  (global as any).fetch = jest.fn().mockImplementation((url: string) => {
    const name = String(url).split("/").pop();
    try {
      const bytes = readFileSync(join(BUNDLE_DIR, name));
      const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve(JSON.parse(bytes.toString("utf8"))),
        arrayBuffer: () => Promise.resolve(body),
      });
    } catch {
      return Promise.resolve({ ok: false, status: 404, statusText: "Not Found", arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    }
  });
}

function loadoutPlayer() {
  window.localStorage.clear();
  Settings.readFromStorage();
  V3Rules.calculator = true;
  AttackStylesController.controller.stylesMap = {};
  const region = new TestRegion(60, 60);
  const player = new Player(region, { x: 30, y: 30 });
  region.addPlayer(player);
  const loadout = new InfernoLoadout(62, "v3_inferno", false);
  loadout.setStats(player);
  player.setUnitOptions(loadout.getLoadout());
  return player;
}

const manifest = JSON.parse(readFileSync(join(BUNDLE_DIR, "manifest.json"), "utf8"));

describe("V3 player model", () => {
  beforeAll(() => {
    serveBundleFromDisk();
    CacheRender.configure(MANIFEST_URL);
  });

  test("every equipable item in the V3 loadout has a cache item id and a bundle entry, with a model or a documented reason", () => {
    const player = loadoutPlayer();
    const equipables: Equipment[] = [
      ...Object.values(player.equipment).filter(Boolean),
      ...player.inventory.filter((i) => i instanceof Equipment),
    ] as Equipment[];
    // worn set (11 slots used), BowFa switch (BowFa, helm, body, legs, quiver, rupture), blowpipe, Eye
    expect(equipables.length).toBe(11 + 8);
    const withoutModel: string[] = [];
    equipables.forEach((item) => {
      const id = item.cacheItemId;
      expect(typeof id).toBe("number");
      const info = manifest.playerItemInfo[`item:${id}`];
      expect(info).toBeTruthy();
      expect(manifest.playerItems[`item:${id}`]).toBeTruthy();
      if (!info.hasModel) {
        withoutModel.push(info.name);
        expect(NO_WORN_MODEL_IN_CACHE[id as number]).toBeTruthy();
      }
    });
    // the documented list is exactly what the bundle reports: nothing stale in either direction
    const reported = Object.entries(manifest.playerItemInfo)
      .filter(([, info]: [string, any]) => !info.hasModel)
      .map(([key]) => Number(key.replace("item:", "")))
      .sort();
    expect(reported).toEqual(Object.keys(NO_WORN_MODEL_IN_CACHE).map(Number).sort());
    expect(withoutModel.length).toBe(2);
  });

  test("the worn set and the BowFa switch build a render list that is never empty and carries real geometry", async () => {
    const player = loadoutPlayer();
    const bundle = await CacheRender.bundle();
    const tank = player.cacheRenderLoadout();
    expect(tank).not.toBeNull();
    const switchSet = [
      ...tank!.filter((id) => ![28260, 23991, 4724, 12002, 21791, 11832, 30756].includes(id)),
      27729, 27721, 27725, 28951, 33639, 25886,
    ];
    for (const loadout of [tank!, switchSet]) {
      const ids = bundle.assetIds(CacheRenderReferences.player(loadout));
      expect(ids.length).toBeGreaterThan(0);
      let vertices = 0;
      for (const id of ids) vertices += (await cachedPayload(bundle, id)).positions.length / 3;
      expect(vertices).toBeGreaterThan(1000);
    }
  });

  test("an item with no model leaves its body part showing, and an empty loadout is still a whole body", async () => {
    const bundle = await CacheRender.bundle();
    const kit = Object.values(manifest.playerKit).map((part: any) => part.asset);
    expect(kit).toHaveLength(7); // head, jaw, torso, arms, hands, legs, feet
    // nothing worn: the whole default body
    expect(bundle.assetIds(CacheRenderReferences.player([])).sort()).toEqual([...kit].sort());
    // only items with no model in the cache: still the whole default body
    const bodyOnly = bundle.assetIds(CacheRenderReferences.player([22947, 28313]));
    kit.forEach((asset) => expect(bodyOnly).toContain(asset));
    // a helm with a model hides head and jaw; its body still shows
    const helmOnly = bundle.assetIds(CacheRenderReferences.player([4724]));
    expect(helmOnly).not.toContain(manifest.playerKit.head.asset);
    expect(helmOnly).not.toContain(manifest.playerKit.jaw.asset);
    expect(helmOnly).toContain(manifest.playerKit.torso.asset);
    expect(helmOnly).toContain(manifest.playerKit.legs.asset);
    // a chestplate hides torso and arms, gloves hide hands, legs hide legs, boots hide feet
    const body = bundle.assetIds(CacheRenderReferences.player([11832, 30756, 31106, 31095]));
    ["torso", "arms", "legs", "hands", "feet"].forEach((part) => expect(body).not.toContain(manifest.playerKit[part].asset));
    expect(body).toContain(manifest.playerKit.head.asset);
  });

  test("a loadout with an item that has no cache id falls back to the legacy models, not to nothing", () => {
    const player = loadoutPlayer();
    expect(player.cacheRenderLoadout()).not.toBeNull();
    // an upstream item that never got a cache id
    (player.equipment as any).helmet = { cacheItemId: null, model: "player_masori_mask__f_.glb" };
    expect(player.cacheRenderLoadout()).toBeNull();
    expect(player.create3dModel()).toBeTruthy();
  });
});

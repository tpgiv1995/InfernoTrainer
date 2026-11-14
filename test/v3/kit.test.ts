import {
  AttackBonuses,
  AttackStylesController,
  BowOfFaerdhinen,
  EyeOfAyak,
  Player,
  Random,
  RangedWeapon,
  Settings,
  TestRegion,
  V3Rules,
  stdRoll,
  fangRoll,
} from "osrs-sdk";
import { InfernoLoadout } from "../../src/content/inferno/js/InfernoLoadout";
import { JalAk } from "../../src/content/inferno/js/mobs/JalAk";
import { JalXil } from "../../src/content/inferno/js/mobs/JalXil";
import { JalZek } from "../../src/content/inferno/js/mobs/JalZek";
import { TzKalZuk } from "../../src/content/inferno/js/mobs/TzKalZuk";

/* Expected numbers are printed by osrs-advisor/tools/inferno_gear.py (python -I inferno_gear.py). */

function setup() {
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
  return { region, player };
}

function pray(player: Player, name: string) {
  const prayer = player.prayerController.findPrayerByName(name);
  prayer.isActive = true;
  prayer.isLit = true;
}

function equipByName(player: Player, name: string) {
  const item = player.inventory.find((i) => i && i.itemName === name) as { inventoryLeftClick: (p: Player) => void };
  expect(item).toBeTruthy();
  item.inventoryLeftClick(player);
}

describe("V3 Inferno loadout", () => {
  test("worn kit and inventory match the brief", () => {
    const { player } = setup();
    const worn = Object.values(player.equipment)
      .filter(Boolean)
      .map((e) => e.itemName)
      .sort();
    expect(worn).toEqual(
      [
        "Blood ancient sceptre", "Crystal Shield", "Guthan's helm", "Occult necklace", "Imbued Saradomin cape",
        "Rada's blessing 4", "Bandos chestplate", "Oathplate legs", "Avernic treads (pr)(et)",
        "Confliction gauntlets", "Magus ring",
      ].sort(),
    );
    const inv = player.inventory.filter(Boolean).map((i) => i.itemName);
    expect(inv).toHaveLength(28);
    const count = (name: string) => inv.filter((n) => n === name).length;
    expect(count("Saradomin Brew")).toBe(7);
    expect(count("Super Restore")).toBe(7);
    expect(count("Prayer regeneration potion")).toBe(3);
    expect(count("Ranging potion")).toBe(1);
    expect(count("Divine ranging potion")).toBe(0);
    expect(count("Bastion Potion")).toBe(0);
    ["Bow of faerdhinen", "Crystal Helm", "Crystal Body", "Crystal Legs", "Dizana's Quiver", "Necklace of rupture",
      "Toxic Blowpipe", "Eye of Ayak", "Saturated heart", "Divine rune pouch (l)"].forEach((n) => expect(count(n)).toBe(1));
    expect(inv).not.toContain("Armadyl brew");
    // all 28 slots in the saved setup's order (item ids from goals/inferno-v2-inventory-setup.txt, slot 1 first)
    const SAVED_SLOTS: [number, string][] = [
      [25886, "Bow of faerdhinen"], [27721, "Crystal Body"], [28951, "Dizana's Quiver"], [27729, "Crystal Helm"],
      [12926, "Toxic Blowpipe"], [33639, "Necklace of rupture"], [27725, "Crystal Legs"], [6685, "Saradomin Brew"],
      [30125, "Prayer regeneration potion"],
      ...Array.from({ length: 7 }, (): [number, string] => [3024, "Super Restore"]),
      [2444, "Ranging potion"], [30125, "Prayer regeneration potion"],
      ...Array.from({ length: 6 }, (): [number, string] => [6685, "Saradomin Brew"]),
      [30125, "Prayer regeneration potion"], [31113, "Eye of Ayak"], [27641, "Saturated heart"],
      [27509, "Divine rune pouch (l)"],
    ];
    expect(SAVED_SLOTS).toHaveLength(28);
    expect(player.inventory.map((i) => (i ? i.itemName : null))).toEqual(SAVED_SLOTS.map(([, name]) => name));
    expect(player.stats.prayer).toBe(93);
    expect(player.stats.magic).toBe(99);
  });

  test("the rune pouch is the Divine rune pouch (l) with the four saved stacks", () => {
    const { player } = setup();
    const pouch = player.inventory.find((i) => i && i.itemName === "Divine rune pouch (l)") as unknown as {
      stacks: { rune: string; id: number; quantity: number }[];
    };
    expect(pouch.stacks.map((s) => [s.rune, s.id, s.quantity])).toEqual([
      ["Water", 555, 15000],
      ["Death", 560, 2525],
      ["Blood", 565, 8000],
      ["Soul", 566, 8000],
    ]);
  });

  test("tank set totals: Magic attack +60 (with the Eye), Ranged defence +371, prayer bonus 9, magic damage 18%", () => {
    const { player } = setup();
    equipByName(player, "Eye of Ayak");
    expect(player.bonuses.attack.magic).toBe(60);
    expect(player.bonuses.defence.range).toBe(371);
    expect(player.bonuses.other.prayer).toBe(9);
    expect(Math.round((player.bonuses.other.magicDamage - 1) * 1000)).toBe(180);
  });

  test("Eye of Ayak vs Jal-Ak, Jal-Xil, Jal-Zek and TzKal-Zuk at Magic 112 with Mystic Vigour", () => {
    const { player, region } = setup();
    equipByName(player, "Eye of Ayak");
    expect(player.useSaturatedHeart()).toBe(true);
    expect(player.currentStats.magic).toBe(112);
    pray(player, "Mystic Vigour");
    const eye = player.equipment.weapon as EyeOfAyak;
    const cases: [string, unknown, number, number, number][] = [
      ["Jal-Ak", new JalAk(region, { x: 33, y: 30 }, {}), 15041, 37, 0],
      ["Jal-Xil", new JalXil(region, { x: 33, y: 30 }, {}), 6336, 37, 0],
      ["Jal-Zek", new JalZek(region, { x: 33, y: 30 }, {}), 19776, 37, 0],
      ["TzKal-Zuk", new TzKalZuk(region, { x: 33, y: 30 }, {}), 65826, 37, 3],
    ];
    cases.forEach(([name, mob, defRoll, max]) => {
      const m = mob as never;
      const longrange = name === "TzKal-Zuk";
      const bonuses: AttackBonuses = { isAccurate: !longrange, voidMultiplier: 1, gearMageMultiplier: 1 };
      eye._calculatePrayerEffects(player, m, bonuses);
      const a = eye._attackRoll(player, m, bonuses);
      const d = eye._defenceRoll(player, m, bonuses);
      expect(a).toBe(longrange ? 17484 : 17732);
      expect(d).toBe(defRoll);
      expect(eye._maxHit(player, m, bonuses)).toBe(max);
      expect(eye._hitChance(player, m, bonuses)).toBeCloseTo(stdRoll(a, d), 12);
    });
    // spot-check the published single-roll chances
    expect(stdRoll(17732, 15041)).toBeCloseTo(0.5758472903626008, 12);
    expect(stdRoll(17732, 6336)).toBeCloseTo(0.8212936333389725, 12);
    expect(stdRoll(17732, 19776)).toBeCloseTo(0.44829852859382113, 12);
    expect(stdRoll(17484, 65826)).toBeCloseTo(0.13280264936880004, 12);
    // Confliction after a miss, Soul Rend roll: Jal-Zek 0.8963348972103302
    expect(fangRoll(35464, 19776)).toBeCloseTo(0.8963348972103302, 12);
  });

  test("Soul Rend max hit 48 at Magic 112 and Eye max 32 at Magic 99", () => {
    const { player, region } = setup();
    equipByName(player, "Eye of Ayak");
    player.useSaturatedHeart();
    pray(player, "Mystic Vigour");
    const eye = player.equipment.weapon as EyeOfAyak;
    const zek = new JalZek(region, { x: 33, y: 30 }, {}) as never;
    const spec: AttackBonuses = { isAccurate: true, isSpecialAttack: true, voidMultiplier: 1, gearMageMultiplier: 1 };
    eye._calculatePrayerEffects(player, zek, spec);
    expect(eye._attackRoll(player, zek, spec)).toBe(35464);
    expect(eye._maxHit(player, zek, spec)).toBe(48);
    player.currentStats.magic = 99;
    const plain: AttackBonuses = { isAccurate: true, voidMultiplier: 1, gearMageMultiplier: 1 };
    eye._calculatePrayerEffects(player, zek, plain);
    expect(eye._maxHit(player, zek, plain)).toBe(32);
  });

  test("BowFa switch vs Zuk (Deadeye, Ranged 112): roll 54418, Zuk defence roll 44116, accuracy 59.465%, max 46", () => {
    const { player, region } = setup();
    // The inventory is full: a two-hander cannot swap in while the shield is worn (it would have nowhere to go).
    equipByName(player, "Bow of faerdhinen");
    expect(player.equipment.weapon.itemName).toBe("Blood ancient sceptre");
    expect(player.equipment.offhand).toBeTruthy();
    // Emptying a vial (here: one potion gone) opens the slot the shield needs.
    const brew = player.inventory.find((i) => i && i.itemName === "Saradomin Brew");
    player.inventory[player.inventory.indexOf(brew)] = null;
    equipByName(player, "Bow of faerdhinen");
    expect(player.equipment.weapon.itemName).toBe("Bow of faerdhinen");
    expect(player.equipment.offhand).toBeNull();
    expect(player.inventory.some((i) => i && i.itemName === "Crystal Shield")).toBe(true);
    equipByName(player, "Crystal Helm");
    equipByName(player, "Crystal Body");
    equipByName(player, "Crystal Legs");
    equipByName(player, "Dizana's Quiver");
    equipByName(player, "Necklace of rupture");
    player.currentStats.range = 112;
    pray(player, "Deadeye");
    expect(player.bonuses.attack.range).toBe(235);
    expect(player.bonuses.other.rangedStrength).toBe(119);
    expect(player.bonuses.other.prayer).toBe(14);
    const bowfa = player.equipment.weapon as BowOfFaerdhinen;
    const zuk = new TzKalZuk(region, { x: 33, y: 30 }, {}) as never;
    const bonuses: AttackBonuses = { voidMultiplier: 1, gearRangeMultiplier: 1 };
    bowfa._calculatePrayerEffects(player, zuk, bonuses);
    expect(bowfa._attackRoll(player, zuk, bonuses)).toBe(54418);
    expect(bowfa._defenceRoll(player, zuk, bonuses)).toBe(44116);
    expect(bowfa._hitChance(player, zuk, bonuses)).toBeCloseTo(0.5946452525772249, 12);
    expect(bowfa._maxHit(player, zuk, bonuses)).toBe(46);
  });

  test("Jal-Xil hit chance on the player in the tank set: Defence 99 and 120 with Mystic Vigour", () => {
    const { player, region } = setup();
    equipByName(player, "Eye of Ayak");
    player.useSaturatedHeart();
    pray(player, "Mystic Vigour");
    const xil = new JalXil(region, { x: 33, y: 30 }, {}) as never;
    const ranged = new RangedWeapon();
    const bonuses: AttackBonuses = { voidMultiplier: 1, gearRangeMultiplier: 1, attackStyle: "range" };
    ranged._calculatePrayerEffects(xil, player, bonuses);
    expect(ranged._attackRoll(xil, player, bonuses)).toBe(26936);
    expect(ranged._defenceRoll(xil, player, bonuses)).toBe(48285);
    expect(ranged._hitChance(xil, player, bonuses)).toBeCloseTo(0.2789214265004349, 10);
    player.currentStats.defence = 120;
    expect(ranged._defenceRoll(xil, player, bonuses)).toBe(58290);
    expect(ranged._hitChance(xil, player, bonuses)).toBeCloseTo(0.23104767459813694, 10);
  });

  test("default loadout is V3 Inferno", () => {
    // the sidebar offers it first and the shell seeds it as the saved choice (see V3Shell.seedKitDefaults)
    const html = require("fs").readFileSync(require("path").join(__dirname, "../../src/content/inferno/sidebar.html"), "utf8");
    expect(html.indexOf('value="v3_inferno"')).toBeGreaterThan(-1);
    expect(html.indexOf('value="v3_inferno"')).toBeLessThan(html.indexOf('value="max_tbow_speed"'));
  });
});

afterAll(() => {
  Random.reset();
});

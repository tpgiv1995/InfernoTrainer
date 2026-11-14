import { describeSpawn, parseSpawnLink, spawnQuery, spawnToTrainerPath, SpawnLinkError } from "../../src/v3/spawnLink";
import { FLOWS, initialMobs } from "../golden/harness";

// Shapes written by the Inferno Stats plugin (WaveStatsPanel.generateURL): bat, blob, melee, ranger, mager, copyable.
const ALL_TYPES =
  "https://www.infernotrainer.com/?bat=[[14,3],[9,20]]&blob=[[20,5]]&melee=[[5,9]]&ranger=[[12,3]]&mager=[[8,14]]&copyable";
const LOS_LINK_ENCODED =
  "https://infernostats.github.io/inferno.html?blob=%5B%5B14,9%5D%5D&ranger=%5B%5B4,20%5D%5D&mager=%5B%5B22,24%5D%5D&copyable";
const BATS_ONLY = "https://www.infernotrainer.com/?bat=[[3,3],[24,10]]&copyable";

describe("spawn link parser", () => {
  test("a link with every mob type", () => {
    const parsed = parseSpawnLink(ALL_TYPES);
    expect(parsed.total).toBe(6);
    expect(parsed.spawns.bat).toEqual([[14, 3], [9, 20]]);
    expect(parsed.spawns.blob).toEqual([[20, 5]]);
    expect(parsed.spawns.melee).toEqual([[5, 9]]);
    expect(parsed.spawns.ranger).toEqual([[12, 3]]);
    expect(parsed.spawns.mager).toEqual([[8, 14]]);
    expect(describeSpawn(parsed)).toBe("2 bats, 1 blob, 1 melee, 1 ranger, 1 mager");
  });

  test("an Inferno Stats line-of-sight link with url-encoded lists", () => {
    const parsed = parseSpawnLink(LOS_LINK_ENCODED);
    expect(parsed.spawns.blob).toEqual([[14, 9]]);
    expect(parsed.spawns.ranger).toEqual([[4, 20]]);
    expect(parsed.spawns.mager).toEqual([[22, 24]]);
    expect(parsed.spawns.bat).toEqual([]);
    expect(parsed.total).toBe(3);
  });

  test("a bats-only link", () => {
    const parsed = parseSpawnLink(BATS_ONLY);
    expect(parsed.total).toBe(2);
    expect(spawnToTrainerPath(parsed)).toBe("/?bat=[[3,3],[24,10]]&copyable");
  });

  test("the rewritten query keeps the exact Inferno Stats param names and order", () => {
    expect(spawnQuery(parseSpawnLink(ALL_TYPES))).toBe(
      "bat=[[14,3],[9,20]]&blob=[[20,5]]&melee=[[5,9]]&ranger=[[12,3]]&mager=[[8,14]]&copyable",
    );
  });

  test("a bare query string and a ?query are accepted", () => {
    expect(parseSpawnLink("?blob=[[1,2]]&copyable").total).toBe(1);
    expect(parseSpawnLink("blob=[[1,2]]&copyable").total).toBe(1);
  });

  test("the link format carries no nibblers, so a nibbler-only wave has nothing to import", () => {
    // InfernoStats writes only bat, blob, melee, ranger and mager; the site adds the nibblers itself.
    expect(() => parseSpawnLink("https://www.infernotrainer.com/?copyable")).toThrow(SpawnLinkError);
  });

  test.each([
    ["", "Paste a link first."],
    ["hello world", "That does not look like an Inferno Trainer or Inferno Stats link."],
    ["https://www.infernotrainer.com/?bat=[[99,3]]&copyable", "A bat tile is outside the arena."],
    ["https://www.infernotrainer.com/?blob=[[1,2],[3]]&copyable", "A blob tile is outside the arena."],
    ["https://www.infernotrainer.com/?mager=not-json&copyable", "The mager list is not valid."],
  ])("rejects %p", (input, message) => {
    expect(() => parseSpawnLink(input)).toThrow(message);
  });
});

describe("the engine places an imported link at the Inferno Stats tiles plus the trainer offset", () => {
  test("every mob in the link starts at x+11, y+14, and the site adds 3 nibblers", () => {
    const flow = FLOWS.find((f) => f.name === "link-all-types");
    const parsed = parseSpawnLink(flow.url);
    const mobs = initialMobs(flow);
    const names = {
      bat: "Jal-MejRah",
      blob: "Jal-Ak",
      melee: "Jal-ImKot",
      ranger: "Jal-Xil",
      mager: "Jal-Zek",
    };
    (Object.keys(names) as (keyof typeof names)[]).forEach((type) => {
      const placed = mobs
        .filter((m) => m.name === names[type])
        .map((m) => [m.x, m.y])
        .sort();
      const expected = parsed.spawns[type].map(([x, y]) => [x + 11, y + 14]).sort();
      expect(placed).toEqual(expected);
    });
    expect(mobs.filter((m) => m.name === "Jal-Nib")).toHaveLength(3);
    expect(mobs).toHaveLength(parsed.total + 3);
  });
});

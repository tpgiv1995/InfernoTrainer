/**
 * Spawn links from the Inferno Stats RuneLite plugin and from infernotrainer.com.
 *
 * Both use the same query format, written by InfernoStats' WaveStatsPanel.generateURL:
 *   <base>?bat=[[x,y],...]&blob=[[x,y]]&melee=...&ranger=...&mager=...&copyable
 * with x = worldX - 17 and y = 46 - worldY (website tile 0,0 is the north-west corner of the
 * arena). The trainer adds +11,+14 when it places the mobs. Bases seen in the wild:
 *   https://www.infernotrainer.com/?   https://infernostats.github.io/inferno.html?
 * Only the five mob params are read. Order does not matter and unknown params are dropped.
 */

export const SPAWN_MOB_TYPES = ["bat", "blob", "melee", "ranger", "mager"] as const;
export type SpawnMobType = (typeof SPAWN_MOB_TYPES)[number];

export type SpawnTiles = Record<SpawnMobType, [number, number][]>;

/** Website tile bounds of the arena (29 wide, 30 deep). */
export const MAX_TILE_X = 28;
export const MAX_TILE_Y = 29;

export interface ParsedSpawn {
  spawns: SpawnTiles;
  total: number;
}

export class SpawnLinkError extends Error {
  constructor(message: string) {
    super(message);
    // The build targets ES5, where subclasses of Error lose their prototype without this.
    Object.setPrototypeOf(this, SpawnLinkError.prototype);
    this.name = "SpawnLinkError";
  }
}

function emptySpawns(): SpawnTiles {
  return { bat: [], blob: [], melee: [], ranger: [], mager: [] };
}

function extractQuery(input: string): string {
  const text = input.trim();
  if (!text) throw new SpawnLinkError("Paste a link first.");
  const mark = text.indexOf("?");
  if (mark >= 0) return text.slice(mark + 1).split("#")[0];
  // A bare query string such as "bat=[[1,2]]&copyable".
  if (/(^|&)(bat|blob|melee|ranger|mager)=/.test(text)) return text;
  throw new SpawnLinkError("That does not look like an Inferno Trainer or Inferno Stats link.");
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseTiles(type: SpawnMobType, raw: string): [number, number][] {
  let json: unknown;
  try {
    json = JSON.parse(decode(raw));
  } catch {
    throw new SpawnLinkError(`The ${type} list is not valid.`);
  }
  if (!Array.isArray(json)) throw new SpawnLinkError(`The ${type} list is not valid.`);
  return json.map((tile) => {
    if (
      !Array.isArray(tile) ||
      tile.length !== 2 ||
      !Number.isInteger(tile[0]) ||
      !Number.isInteger(tile[1]) ||
      tile[0] < 0 ||
      tile[0] > MAX_TILE_X ||
      tile[1] < 0 ||
      tile[1] > MAX_TILE_Y
    ) {
      throw new SpawnLinkError(`A ${type} tile is outside the arena.`);
    }
    return [tile[0], tile[1]] as [number, number];
  });
}

/** Parse a full link, a "?query" or a bare query string. Throws SpawnLinkError with a player-readable message. */
export function parseSpawnLink(input: string): ParsedSpawn {
  const query = extractQuery(input);
  const spawns = emptySpawns();
  let total = 0;
  for (const part of query.split("&")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq) as SpawnMobType;
    if (!SPAWN_MOB_TYPES.includes(key)) continue;
    spawns[key] = parseTiles(key, part.slice(eq + 1));
  }
  for (const type of SPAWN_MOB_TYPES) total += spawns[type].length;
  if (total === 0) throw new SpawnLinkError("That link has no mobs in it.");
  return { spawns, total };
}

/** The query the trainer itself reads (same params and order Inferno Stats writes, plus copyable). */
export function spawnQuery(parsed: ParsedSpawn): string {
  const parts: string[] = [];
  for (const type of SPAWN_MOB_TYPES) {
    const tiles = parsed.spawns[type];
    if (tiles.length > 0) parts.push(`${type}=${JSON.stringify(tiles)}`);
  }
  parts.push("copyable");
  return parts.join("&");
}

/** Relative URL for this site that opens the parsed spawn. */
export function spawnToTrainerPath(parsed: ParsedSpawn): string {
  return `/?${spawnQuery(parsed)}`;
}

export function describeSpawn(parsed: ParsedSpawn): string {
  const names: Record<SpawnMobType, string> = {
    bat: "bat",
    blob: "blob",
    melee: "melee",
    ranger: "ranger",
    mager: "mager",
  };
  return SPAWN_MOB_TYPES.filter((t) => parsed.spawns[t].length > 0)
    .map((t) => `${parsed.spawns[t].length} ${names[t]}${parsed.spawns[t].length === 1 ? "" : "s"}`)
    .join(", ");
}

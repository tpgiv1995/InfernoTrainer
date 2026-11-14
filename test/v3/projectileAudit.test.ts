/**
 * Monster projectile audit: waves 1, 16, 31, 65, 68 and 69 are played headlessly with the player standing still,
 * and every projectile a monster creates must have a real model (a baked model or a cache graphic), never the
 * coloured-sphere fallback. Melee swings and invisible bookkeeping projectiles are "none" (nothing is drawn).
 */
import { Projectile, V3Rules } from "osrs-sdk";
import { Flow, playFlow } from "../golden/harness";

const WAVES: Flow[] = [1, 3, 7, 10, 16, 31, 65, 68, 69].map((wave, index) => ({
  name: `audit-wave-${wave}`,
  url: `/?wave=${wave}`,
  ticks: wave === 69 ? 420 : 160,
  seed: 4200 + index,
}));

describe("monster projectiles never use the sphere fallback", () => {
  WAVES.forEach((flow) => {
    test(flow.name, () => {
      Projectile.debugLog.length = 0;
      Projectile.debugLogging = true;
      try {
        playFlow(flow);
      } finally {
        Projectile.debugLogging = false;
        V3Rules.calculator = true;
      }
      const log = Projectile.debugLog.filter((p) => p.from !== "player");
      const sources = new Map<string, Set<string>>();
      log.forEach((p) => {
        const key = `${p.from} ${p.style}`;
        sources.set(key, (sources.get(key) ?? new Set()).add(p.source));
      });
      const summary = Array.from(sources.entries()).map(([key, set]) => `${key}: ${Array.from(set).join("/")}`).sort();
      // eslint-disable-next-line no-console
      console.info(`${flow.name}\n  ${summary.join("\n  ")}`);
      const spheres = summary.filter((line) => line.includes("sphere"));
      expect(spheres).toEqual([]);
    });
  });
});

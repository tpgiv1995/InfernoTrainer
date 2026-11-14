import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { FLOWS, playFlow } from "./harness";

const GOLDEN_DIR = join(__dirname, "traces");

describe("golden flows: mob behaviour matches the upstream trace", () => {
  FLOWS.forEach((flow) => {
    test(flow.name, () => {
      const trace = playFlow(flow);
      const file = join(GOLDEN_DIR, `${flow.name}.json`);
      if (process.env.GOLDEN_WRITE === "1") {
        mkdirSync(GOLDEN_DIR, { recursive: true });
        writeFileSync(file, JSON.stringify(trace));
        return;
      }
      expect(existsSync(file)).toBe(true);
      const golden = JSON.parse(readFileSync(file, "utf8"));
      expect(trace.length).toBe(flow.ticks);
      expect(trace[trace.length - 1].mobs.length).toBeGreaterThan(0);
      expect(trace).toEqual(golden);
    });
  });
});

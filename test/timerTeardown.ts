/**
 * Clears every timer a test file leaves behind so the jest worker exits cleanly. The region UI starts a 1 second
 * set-timer interval and the Jal-Zek model starts flicker timeouts; nothing stops them when a test ends.
 */
const realSetInterval = global.setInterval;
const realSetTimeout = global.setTimeout;
const intervals = new Set<any>();
const timeouts = new Set<any>();

(global as any).setInterval = (...args: any[]) => {
  const id = (realSetInterval as any)(...args);
  intervals.add(id);
  return id;
};
(global as any).setTimeout = (...args: any[]) => {
  const id = (realSetTimeout as any)(...args);
  timeouts.add(id);
  return id;
};

afterAll(() => {
  intervals.forEach((id) => clearInterval(id));
  timeouts.forEach((id) => clearTimeout(id));
  intervals.clear();
  timeouts.clear();
});

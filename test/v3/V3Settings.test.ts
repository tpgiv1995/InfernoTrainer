import { V3Settings } from "../../src/v3/V3Settings";

describe("V3 shell settings", () => {
  beforeEach(() => window.localStorage.clear());

  test("fullscreen on start is the default", () => {
    expect(V3Settings.read().fullscreenOnStart).toBe(true);
  });

  test("a saved choice survives a reload", () => {
    V3Settings.read();
    V3Settings.state.fullscreenOnStart = false;
    V3Settings.persist();
    expect(V3Settings.read().fullscreenOnStart).toBe(false);
  });

  test("corrupt stored data falls back to the defaults", () => {
    window.localStorage.setItem("v3-inferno-sim:settings", "{not json");
    expect(V3Settings.read().fullscreenOnStart).toBe(true);
  });
});

describe("V3 kit seeding", () => {
  beforeEach(() => window.localStorage.clear());

  test("kit defaults are not applied until the shell seeds them, and the flag survives a reload", () => {
    expect(V3Settings.read().kitSeeded).toBe(false);
    V3Settings.state.kitSeeded = true;
    V3Settings.persist();
    expect(V3Settings.read().kitSeeded).toBe(true);
  });
});

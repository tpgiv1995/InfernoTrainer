/* eslint-disable @typescript-eslint/no-empty-function */

// A 2d context stand-in: every method is a no-op and every property can be set. Enough for the
// engine's tick logic, which only draws into off-screen canvases.
function fakeContext(): any {
  const state: Record<string, unknown> = {};
  return new Proxy(state, {
    get(target, prop: string) {
      if (prop in target) return target[prop];
      if (prop === "measureText") return () => ({ width: 0 });
      if (prop === "getImageData" || prop === "createImageData") return () => ({ data: new Uint8ClampedArray(4) });
      return () => fakeContext();
    },
    set(target, prop: string, value) {
      target[prop] = value;
      return true;
    },
  });
}
HTMLCanvasElement.prototype.getContext = jest.fn(() => fakeContext()) as any;

global.OffscreenCanvas = jest.fn().mockImplementation((width: number, height: number) => {
  return {
    height,
    width,
    oncontextlost: jest.fn(),
    oncontextrestored: jest.fn(),
    getContext: jest.fn(() => fakeContext()),
    convertToBlob: jest.fn(),
    transferToImageBitmap: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  };
});

// The SDK is a bundle, so jest.mock cannot reach its internal Assets cache: answer its preload fetches
// with an empty body instead of the network.
global.fetch = jest.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    statusText: "OK",
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  }),
);

import { Random, Settings } from "osrs-sdk";

// lodash keeps the Math.random function it sees at load time, so route Math.random through a hook
// before any test module (and lodash) loads. Tests that need determinism swap globalThis.__mathRandom.
const realMathRandom = Math.random;
(globalThis as any).__mathRandom = realMathRandom;
Math.random = () => (globalThis as any).__mathRandom();

jest.mock("osrs-sdk", () => {
  const originalModule = jest.requireActual<typeof import("osrs-sdk")>(
    "osrs-sdk",
  );
  return {
    ...originalModule,
    Assets: {
      getAssetUrl(x: any) {
        return x;
      }
    },
    SoundCache: {
      preload() {},
      play() {}
    }
  };
});

// The vendored SDK bundle extends real three.js classes (Loader, ...), so keep the real module and
// stub only what needs a GPU.
jest.mock("three", () => ({
  ...jest.requireActual<typeof import("three")>("three"),
  WebGLRenderer: class WebGlRenderer {
    public render(): void {
      return;
    }
    public setSize(): void {
      return;
    }
  },
}));
jest.spyOn(document, "getElementById").mockImplementation((elementId: string) => {
  const c = document.createElement("canvas");
  c.ariaLabel = elementId;
  return c;
});

const nextRandom = [];

Random.setRandom(() => {
  if (nextRandom.length > 0) {
    return nextRandom.shift();
  }
  Random.memory = (Random.memory + 13.37) % 180;
  return Math.abs(Math.sin(Random.memory * 0.0174533));
});

Settings.readFromStorage();

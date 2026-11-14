"use strict";

import { ControlPanelController, Settings, Trainer, V3_INFERNO_PRAYER_LAYOUT, World } from "osrs-sdk";
import { InfernoSettings } from "../content/inferno/js/InfernoSettings";
import { V3Settings } from "./V3Settings";
import { describeSpawn, parseSpawnLink, SpawnLinkError, spawnToTrainerPath } from "./spawnLink";

const AUTOSTART_KEY = "v3-inferno-sim:autostart";

const STYLE = `
#v3_setup, #v3_death { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.82); font-family: 'OSRS', monospace; color: #ff981f; }
#v3_setup.hidden, #v3_death.hidden { display: none !important; }
.v3-card { width: min(680px, 94vw); max-height: 94vh; overflow-y: auto; background: #1d1a14; border: 2px solid #5a4d36; padding: 18px 22px; box-sizing: border-box; }
.v3-card h1 { margin: 0 0 2px; font-size: 28px; font-weight: normal; color: #ffb84d; }
.v3-card .v3-sub { color: #bba878; font-size: 14px; margin-bottom: 14px; }
.v3-card h2 { font-size: 16px; font-weight: normal; margin: 14px 0 6px; color: #ffb84d; border-bottom: 1px solid #4a402c; padding-bottom: 3px; }
.v3-row { display: flex; gap: 10px; align-items: center; margin: 6px 0; flex-wrap: wrap; }
.v3-row label { color: #e6d7b2; font-size: 15px; }
.v3-card input[type="text"], .v3-card input[type="number"], .v3-card select { width: auto; flex: 1 1 160px; padding: 8px 8px; margin: 0; font-size: 15px; background: #0f0d09; color: #ff981f; border: 1px solid #6b5a3a; }
.v3-card input[type="checkbox"] { width: 18px; height: 18px; margin: 0; }
.v3-card input[type="range"] { flex: 1 1 160px; }
.v3-btn { width: auto !important; padding: 9px 16px !important; margin: 0 !important; background: #2b2416 !important; color: #ff981f !important; border: 1px solid #8a7447 !important; cursor: pointer; font-size: 15px !important; }
.v3-btn:hover { background: #3a3120 !important; }
.v3-btn.primary { background: #5b3a0c !important; color: #ffd58a !important; font-size: 20px !important; padding: 12px 28px !important; }
.v3-actions { margin-top: 16px; justify-content: flex-end; }
.v3-note { font-size: 14px; color: #bba878; min-height: 18px; }
.v3-note.error { color: #ff6b5a; }
.v3-note.ok { color: #7bd77b; }
.v3-keys { font-size: 14px; color: #e6d7b2; line-height: 1.55; }
.v3-keys b { color: #ffd58a; font-weight: normal; }
#v3_death .v3-card { text-align: center; width: min(440px, 90vw); }
#v3_death .v3-card h1 { color: #ff6b5a; }
#v3_death .v3-row { justify-content: center; }
#v3_chrome { position: fixed; top: 8px; left: 8px; z-index: 40; display: flex; gap: 6px; }
#v3_chrome button { width: 34px; height: 34px; padding: 0; margin: 0; font-size: 18px; line-height: 1; background: rgba(20,17,11,0.85); border: 1px solid #8a7447; color: #ff981f; cursor: pointer; }
#v3_chrome button:hover { background: rgba(60,48,25,0.95); }
#disclaimer_panel { bottom: 46px !important; }
`;

export interface ShellContext {
  world: World;
}

/** The V3 shell around the engine: setup screen, death overlay, gear button, fullscreen. */
export class V3Shell {
  private static ctx: ShellContext;
  private static setupEl: HTMLElement;
  private static deathEl: HTMLElement;
  private static started = false;

  static init(ctx: ShellContext) {
    V3Shell.ctx = ctx;
    V3Settings.read();
    V3Shell.seedKitDefaults();
    injectStyle();
    buildChrome();
    buildSetup();
    buildDeath();
    Trainer.onPlayerDeath(() => V3Shell.showDeath());
    Trainer.onReset(() => V3Shell.hideDeath());
  }

  /**
   * The V3 Inferno loadout and prayer book (Mystic Vigour, Deadeye) are the defaults. Settings saved by an earlier
   * visit would keep the old ones, so each browser is switched once; after that the player's own choices stand.
   */
  static seedKitDefaults() {
    if (V3Settings.state.kitSeeded) return;
    Settings.loadout = "v3_inferno";
    if (Settings.prayerLayout !== null) Settings.prayerLayout = [...V3_INFERNO_PRAYER_LAYOUT];
    Settings.persistToStorage();
    V3Settings.state.kitSeeded = true;
    V3Settings.persist();
  }

  /** Called once the engine has loaded everything. Opens the setup screen, or starts at once after a setup-driven reload. */
  static ready() {
    if (window.sessionStorage.getItem(AUTOSTART_KEY) === "1") {
      window.sessionStorage.removeItem(AUTOSTART_KEY);
      V3Shell.begin();
      return;
    }
    V3Shell.openSetup();
  }

  static openSetup() {
    if (V3Shell.started && !V3Shell.ctx.world.isPaused) V3Shell.ctx.world.stopTicking();
    refreshSetup();
    V3Shell.setupEl.classList.remove("hidden");
    ControlPanelController.controller.isUsingExternalUI = true;
  }

  static closeSetup() {
    V3Shell.setupEl.classList.add("hidden");
    ControlPanelController.controller.isUsingExternalUI = false;
  }

  /** Start = a fresh reset of the fight, then the clock runs. */
  static begin() {
    V3Shell.closeSetup();
    const { world } = V3Shell.ctx;
    if (V3Shell.started) {
      Trainer.reset();
      if (world.isPaused) world.startTicking();
    } else {
      V3Shell.started = true;
      world.startTicking();
    }
    if (V3Settings.state.fullscreenOnStart) enterFullscreen();
  }

  static showDeath() {
    V3Shell.deathEl.classList.remove("hidden");
  }

  static hideDeath() {
    V3Shell.deathEl.classList.add("hidden");
  }

  static retry() {
    V3Shell.hideDeath();
    Trainer.reset();
    if (V3Shell.ctx.world.isPaused) V3Shell.ctx.world.startTicking();
  }

  /** A paste-a-link box at the top of the site sidebar (the setup screen has the same box). */
  static addSidebarPaste() {
    const holder = document.getElementById("sidebar_content");
    const input = el("input", { type: "text", id: "sidebar_paste", placeholder: "Paste spawn link" });
    const button = el("button", { type: "button", id: "sidebar_paste_go" });
    button.textContent = "Load pasted link";
    const note = el("div", { class: "v3-note", id: "sidebar_paste_note" });
    const go = () => {
      try {
        const parsed = parseSpawnLink(input.value);
        restartWith(spawnToTrainerPath(parsed));
      } catch (e) {
        note.className = "v3-note error";
        note.textContent = e instanceof SpawnLinkError ? e.message : "Could not read that link.";
      }
    };
    button.addEventListener("click", go);
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") go();
    });
    input.addEventListener("focus", () => (ControlPanelController.controller.isUsingExternalUI = true));
    input.addEventListener("focusout", () => (ControlPanelController.controller.isUsingExternalUI = false));
    holder.prepend(input, button, note);
  }

  static toggleSidebar() {
    Settings.menuVisible = !Settings.menuVisible;
    document.getElementById("right_panel").classList.toggle("hidden", !Settings.menuVisible);
    Settings.persistToStorage();
    window.dispatchEvent(new Event("resize"));
  }
}

function injectStyle() {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.appendChild(style);
}

function enterFullscreen() {
  if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen().catch(() => undefined);
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => undefined);
  } else {
    enterFullscreen();
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, children: (Node | string)[] = []) {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props as Record<string, unknown>;
  Object.assign(node, rest);
  if (cls) node.className = cls as string;
  children.forEach((c) => node.append(c));
  return node;
}

function buildChrome() {
  const gear = el("button", { id: "v3_gear", title: "Menu", type: "button" });
  gear.textContent = "⚙";
  gear.addEventListener("click", () => V3Shell.toggleSidebar());
  const setup = el("button", { id: "v3_open_setup", title: "Fight setup", type: "button" });
  setup.textContent = "☰";
  setup.addEventListener("click", () => V3Shell.openSetup());
  const full = el("button", { id: "v3_fullscreen", title: "Fullscreen", type: "button" });
  full.textContent = "⛶";
  full.addEventListener("click", () => toggleFullscreen());
  const wrap = el("div", { id: "v3_chrome" }, [setup, full, gear]);
  document.body.appendChild(wrap);
}

function loadoutOptions(): { value: string; label: string }[] {
  const select = document.getElementById("loadouts") as HTMLSelectElement;
  return Array.from(select.options).map((o) => ({ value: o.value, label: o.text }));
}

let refreshHandlers: (() => void)[] = [];

function refreshSetup() {
  refreshHandlers.forEach((h) => h());
}

function currentWave(): number {
  const wave = new URLSearchParams(window.location.search).get("wave");
  const n = wave === null ? NaN : parseInt(wave, 10);
  return Number.isNaN(n) ? 62 : n;
}

function linkSummary(): string | null {
  try {
    return describeSpawn(parseSpawnLink(window.location.search));
  } catch {
    return null;
  }
}

function restartWith(path: string) {
  window.sessionStorage.setItem(AUTOSTART_KEY, "1");
  window.location.href = path;
}

function buildSetup() {
  refreshHandlers = [];
  const note = el("div", { class: "v3-note", id: "v3_link_note" });
  const linkInput = el("input", { type: "text", id: "v3_link", placeholder: "Paste an Inferno Trainer or Inferno Stats link" });
  const loadLink = el("button", { class: "v3-btn", type: "button", id: "v3_load_link" });
  loadLink.textContent = "Load link";
  const doLoad = () => {
    try {
      const parsed = parseSpawnLink(linkInput.value);
      note.className = "v3-note ok";
      note.textContent = `Loading ${describeSpawn(parsed)}...`;
      restartWith(spawnToTrainerPath(parsed));
    } catch (e) {
      note.className = "v3-note error";
      note.textContent = e instanceof SpawnLinkError ? e.message : "Could not read that link.";
    }
  };
  loadLink.addEventListener("click", doLoad);
  linkInput.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Enter") doLoad();
  });

  const waveInput = el("input", { type: "number", id: "v3_wave", min: "0", max: "80", placeholder: "Wave" });
  waveInput.addEventListener("keydown", (e) => e.stopPropagation());
  const loadoutSelect = el("select", { id: "v3_loadout" });
  loadoutOptions().forEach((o) => loadoutSelect.append(el("option", { value: o.value, textContent: o.label })));
  const shieldSelect = el("select", { id: "v3_shield" }, [
    el("option", { value: "random", textContent: "Random Zuk shield" }),
    el("option", { value: "west", textContent: "West Zuk shield" }),
    el("option", { value: "east", textContent: "East Zuk shield" }),
  ]);
  const check = (id: string, label: string) => {
    const box = el("input", { type: "checkbox", id });
    return { box, row: el("label", { htmlFor: id, class: "v3-row" }, [box, label]) };
  };
  const onTask = check("v3_ontask", "On task");
  const south = check("v3_south", "S pillar");
  const west = check("v3_west", "W pillar");
  const north = check("v3_north", "N pillar");
  const fullscreen = check("v3_fs", "Fullscreen on start");
  const stockPrayer = check("v3_stock_prayer", "Stock prayer book order");
  const sens = el("input", { type: "range", id: "v3_sens", min: "0.2", max: "1.6", step: "0.05" });
  const sensValue = el("span", {});
  sens.addEventListener("input", () => {
    sensValue.textContent = Number(sens.value).toFixed(2);
    Settings.cameraSensitivity = Number(sens.value);
    Settings.persistToStorage();
  });

  const start = el("button", { class: "v3-btn primary", type: "button", id: "v3_start" });
  start.textContent = "Start";
  start.addEventListener("click", () => {
    // Save every choice, then reset the fight so it begins fresh.
    Settings.loadout = loadoutSelect.value;
    Settings.onTask = onTask.box.checked;
    Settings.southPillar = south.box.checked;
    Settings.westPillar = west.box.checked;
    Settings.northPillar = north.box.checked;
    Settings.persistToStorage();
    InfernoSettings.shieldDirection = shieldSelect.value as typeof InfernoSettings.shieldDirection;
    InfernoSettings.persistToStorage();
    V3Settings.state.fullscreenOnStart = fullscreen.box.checked;
    V3Settings.persist();
    Settings.prayerLayout = stockPrayer.box.checked ? null : [...V3_INFERNO_PRAYER_LAYOUT];
    Settings.persistToStorage();
    const wantedWave = waveInput.value === "" ? currentWave() : parseInt(waveInput.value, 10);
    const hasLink = linkSummary() !== null;
    if (!hasLink && wantedWave !== currentWave()) {
      restartWith(`/?wave=${wantedWave}`);
      return;
    }
    if (hasLink && waveInput.value !== "" && wantedWave !== currentWave()) {
      restartWith(`/?wave=${wantedWave}`);
      return;
    }
    V3Shell.begin();
  });

  const keys = el("div", { class: "v3-keys" });
  keys.innerHTML =
    "<b>F1</b> combat &nbsp; <b>F2</b> inventory &nbsp; <b>F3</b> prayer &nbsp; <b>F4</b> magic &nbsp; <b>F5</b> equipment (press again to close)<br>" +
    "<b>Right-drag</b> turns the camera, a quick right-click opens the menu. <b>Enter</b> retries after a death.";

  const card = el("div", { class: "v3-card" }, [
    el("h1", { textContent: "V3 Inferno Sim" }),
    el("div", { class: "v3-sub", textContent: "Set up the fight, then press Start. Start always begins a fresh run." }),
    el("h2", { textContent: "Spawn" }),
    el("div", { class: "v3-row", id: "v3_spawn_row" }, [el("label", { textContent: "Wave" }), waveInput]),
    el("div", { class: "v3-note", id: "v3_spawn_note" }),
    el("div", { class: "v3-row" }, [linkInput, loadLink]),
    note,
    el("h2", { textContent: "Kit" }),
    el("div", { class: "v3-row" }, [el("label", { textContent: "Loadout" }), loadoutSelect]),
    el("div", { class: "v3-row" }, [onTask.row, south.row, west.row, north.row]),
    el("div", { class: "v3-row" }, [el("label", { textContent: "Zuk" }), shieldSelect]),
    el("h2", { textContent: "Controls" }),
    el("div", { class: "v3-row" }, [el("label", { textContent: "Camera sensitivity" }), sens, sensValue]),
    el("div", { class: "v3-row" }, [fullscreen.row, stockPrayer.row]),
    keys,
    el("div", { class: "v3-row v3-actions" }, [start]),
  ]);

  const root = el("div", { id: "v3_setup", class: "hidden" }, [card]);
  document.body.appendChild(root);
  V3Shell["setupEl"] = root;

  refreshHandlers.push(() => {
    waveInput.value = String(currentWave());
    loadoutSelect.value = Settings.loadout;
    onTask.box.checked = Settings.onTask;
    south.box.checked = Settings.southPillar;
    west.box.checked = Settings.westPillar;
    north.box.checked = Settings.northPillar;
    shieldSelect.value = InfernoSettings.shieldDirection;
    fullscreen.box.checked = V3Settings.state.fullscreenOnStart;
    stockPrayer.box.checked = Settings.prayerLayout === null;
    sens.value = String(Settings.cameraSensitivity);
    sensValue.textContent = Settings.cameraSensitivity.toFixed(2);
    const summary = linkSummary();
    const spawnNote = document.getElementById("v3_spawn_note");
    spawnNote.textContent = summary ? `Spawn from link: ${summary}. Change the wave number to leave the link.` : "";
  });
}

function buildDeath() {
  const retry = el("button", { class: "v3-btn primary", type: "button", id: "v3_retry" });
  retry.textContent = "Try again";
  retry.addEventListener("click", () => V3Shell.retry());
  const setup = el("button", { class: "v3-btn", type: "button", id: "v3_death_setup" });
  setup.textContent = "Setup";
  setup.addEventListener("click", () => {
    V3Shell.hideDeath();
    V3Shell.openSetup();
  });
  const card = el("div", { class: "v3-card" }, [
    el("h1", { textContent: "Oh dear, you are dead!" }),
    el("div", { class: "v3-sub", textContent: "Press Enter to try again." }),
    el("div", { class: "v3-row" }, [retry, setup]),
  ]);
  const root = el("div", { id: "v3_death", class: "hidden" }, [card]);
  document.body.appendChild(root);
  V3Shell["deathEl"] = root;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !root.classList.contains("hidden")) {
      e.preventDefault();
      V3Shell.retry();
    }
  });
}

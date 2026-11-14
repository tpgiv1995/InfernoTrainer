"use strict";

import { BloodBarrageSpell, GraphicsObject, IceBarrageSpell, CacheRender, Projectile, V3GraphicsLog, Settings, Region, World, Viewport, MapController, TileMarker, Assets, Location, Chrome, ImageLoader, Trainer, ControlPanelController } from "osrs-sdk";

import { InfernoRegion } from "./content/inferno/js/InfernoRegion";
import { InfernoSettings } from "./content/inferno/js/InfernoSettings";
import { V3Shell } from "./v3/V3Shell";

const SpecialAttackBarBackground = Assets.getAssetUrl("assets/images/attackstyles/interface/special_attack_background.png");

// The player is drawn from the OSRS cache (items + default body), served from this site (src/assets/player-render).
CacheRender.configure(window.location.origin + "/player-render/manifest.json");

Settings.readFromStorage();
InfernoSettings.readFromStorage();

// Choose the region based on the URL.
const AVAILABLE_REGIONS = {
  'inferno.html': new InfernoRegion(),
};
const DEFAULT_REGION_PATH = 'inferno.html';

const regionName = window.location.pathname.split('/').pop();
const selectedRegion: Region = (regionName in AVAILABLE_REGIONS) ? AVAILABLE_REGIONS[regionName] : AVAILABLE_REGIONS[DEFAULT_REGION_PATH];

// Create world
const world = new World();
world.getReadyTimer = 6;
selectedRegion.world = world;
world.addRegion(selectedRegion);

// Initialise UI
document.getElementById('sidebar_content').innerHTML = selectedRegion.getSidebarContent();

document.getElementById("reset").addEventListener("click", () => {
  Trainer.reset();
});

document.getElementById("settings").addEventListener("click", () => {
  ControlPanelController.controller.setActiveControl('SETTINGS');
});

const tileMarkerColor = document.getElementById("tileMarkerColor") as HTMLInputElement;
tileMarkerColor.addEventListener("input", () => {
  Settings.tileMarkerColor = tileMarkerColor.value;
  TileMarker.onSetColor(Settings.tileMarkerColor);
  Settings.persistToStorage();
}, false);
tileMarkerColor.value = Settings.tileMarkerColor;

V3Shell.init({ world });

// Live-check diagnostics, only with ?debug in the URL: frozen snapshots of plain data, never the live objects.
if (new URLSearchParams(window.location.search).has("debug")) {
  const snapshot = () => {
    const p = Trainer.player;
    const aggro = p.aggro as unknown as { currentStats: { hitpoint: number }; mobName?: () => unknown } | null;
    const pouch = p.inventory.find((i) => i && typeof (i as unknown as { spendRunes?: unknown }).spendRunes === "function") as unknown as
      | { stacks: { rune: string; quantity: number }[] }
      | undefined;
    return Object.freeze(
      JSON.parse(
        JSON.stringify({
          tick: world.globalTickCounter,
          stats: p.currentStats,
          baseStats: p.stats,
          weapon: p.equipment.weapon ? p.equipment.weapon.itemName : null,
          offhand: p.equipment.offhand ? p.equipment.offhand.itemName : null,
          worn: Object.values(p.equipment).filter(Boolean).map((e) => e.itemName),
          inventory: p.inventory.map((i) => (i ? { name: i.itemName, doses: (i as unknown as { doses?: number }).doses ?? null } : null)),
          prayers: p.prayerController.activePrayers().map((x) => x.name),
          aggro: aggro ? { name: aggro.mobName ? String(aggro.mobName()) : null, hp: aggro.currentStats.hitpoint } : null,
          attackDelay: p.attackDelay,
          bonuses: p.bonuses,
          runes: pouch ? pouch.stacks : null,
          saturatedHeart: Boolean((p as unknown as { saturatedHeart: unknown }).saturatedHeart),
        }),
      ),
    );
  };
  Projectile.debugLogging = true;
  V3GraphicsLog.enabled = true;
  const hooks = {
    snapshot,
    // --- browser smoke test hooks (debug only) ---
    /** Which model draws the player: "cache", "legacy", "pending". */
    playerModelSource: () => Viewport.viewport.modelSourceOf(Trainer.player),
    /** Where the player's model sits on screen (px in the game canvas). */
    playerBox: () => Viewport.viewport.screenBoxOf(Trainer.player),
    /** Where the player's current target sits on screen. */
    targetBox: () => (Trainer.player.aggro ? Viewport.viewport.screenBoxOf(Trainer.player.aggro as never) : null),
    /** Plays one cache graphic on its own, 3 tiles from the player, and returns where it is on screen. */
    showGraphic: (id: number, height: number, dx = 2, dy = -2) => {
      const p = Trainer.player;
      const entity = new GraphicsObject(selectedRegion, { x: p.location.x + dx, y: p.location.y + dy }, id, { height });
      selectedRegion.addEntity(entity);
      (window as unknown as { __lastGraphic?: unknown }).__lastGraphic = entity;
      return true;
    },
    lastGraphicBox: () => {
      const entity = (window as unknown as { __lastGraphic?: unknown }).__lastGraphic;
      return entity ? Viewport.viewport.screenBoxOf(entity as never) : null;
    },
    hidePlayer: (hidden: boolean) => {
      Trainer.player.debugHideModel = !!hidden;
    },
    /** Take off worn items by slot name (helmet, necklace, cape, chest, legs, feet, gloves, ring, ammo, weapon, offhand). */
    unequip: (slots: string[]) => {
      slots.forEach((slot) => {
        (Trainer.player.equipment as unknown as Record<string, unknown>)[slot] = null;
      });
      Trainer.player.equipmentChanged();
    },
    /** Equip an inventory item by name (the same code path as clicking it). */
    equip: (name: string) => {
      const item = Trainer.player.inventory.find((i) => i && i.itemName === name) as unknown as { inventoryLeftClick: (p: unknown) => void };
      if (!item) return false;
      item.inventoryLeftClick(Trainer.player);
      return true;
    },
    /** Empty the last n potion slots so two-handed swaps have room. */
    freeSlots: (n: number) => {
      let freed = 0;
      for (let i = Trainer.player.inventory.length - 1; i >= 0 && freed < n; i--) {
        const item = Trainer.player.inventory[i] as unknown as { doses?: number } | null;
        if (item && item.doses !== undefined) {
          Trainer.player.inventory[i] = null;
          freed++;
        }
      }
      return freed;
    },
    /** Aim at the nearest living monster (auto-attack with the weapon in hand). */
    attackNearest: () => {
      const p = Trainer.player;
      const mobs = selectedRegion.mobs.filter((m) => !m.isDying());
      mobs.sort((a, b) => Math.hypot(a.location.x - p.location.x, a.location.y - p.location.y) - Math.hypot(b.location.x - p.location.x, b.location.y - p.location.y));
      if (!mobs.length) return null;
      p.setAggro(mobs[0]);
      return String(mobs[0].mobName());
    },
    /** Select a barrage for the next cast on the current target (the same as picking it in the spellbook). */
    selectSpell: (which: "ice" | "blood") => {
      (Trainer.player as unknown as { manualSpellCastSelection: unknown }).manualSpellCastSelection =
        which === "blood" ? new BloodBarrageSpell() : new IceBarrageSpell();
    },
    clearSpell: () => {
      (Trainer.player as unknown as { manualSpellCastSelection: unknown }).manualSpellCastSelection = null;
    },
    /**
     * Aim at the farthest (far = true) or nearest living monster within maxRange tiles whose picture is in the open
     * part of the screen (not under the side panels), so its projectile can be measured in the rendered frame.
     */
    attackInView: (maxRange: number, far: boolean) => {
      const p = Trainer.player;
      const dist = (m: { location: { x: number; y: number } }) => Math.max(Math.abs(m.location.x - p.location.x), Math.abs(m.location.y - p.location.y));
      const inView = (m: Parameters<typeof dist>[0]) => {
        const box = Viewport.viewport.screenBoxOf(m as never);
        return !!box && box.x + box.w / 2 > 90 && box.x + box.w / 2 < 1100 && box.y + box.h / 2 > 90 && box.y + box.h / 2 < 780;
      };
      const mobs = selectedRegion.mobs.filter((m) => !m.isDying() && dist(m) <= maxRange && inView(m));
      mobs.sort((a, b) => (far ? dist(b) - dist(a) : dist(a) - dist(b)));
      if (!mobs.length) return null;
      p.setAggro(mobs[0]);
      return `${String(mobs[0].mobName())} at ${dist(mobs[0])} tiles`;
    },
    /** The player's projectiles currently in flight that draw something: screen point and model source. */
    playerProjectilePoints: () => {
      const points: { x: number; y: number; source: string }[] = [];
      selectedRegion.mobs.forEach((m) => {
        m.incomingProjectiles.forEach((pr) => {
          if (pr.from !== Trainer.player || pr.modelSource === "none" || !pr.visible(world.tickPercent)) return;
          const pt = Viewport.viewport.screenPointOf(pr);
          if (pt) points.push({ x: pt.x, y: pt.y, source: pr.modelSource });
        });
      });
      return points;
    },
    /** Hold the game still (frames keep drawing) so before/after screenshots show the same moment. */
    freeze: (on: boolean) => {
      World.debugFreeze = on ? 0.5 : null;
    },
    hideProjectiles: (hidden: boolean) => {
      Projectile.debugHide = !!hidden;
    },
    useSpecial: (on: boolean) => {
      Trainer.player.useSpecialAttack = !!on;
      Trainer.player.currentStats.specialAttack = 100;
    },
    /** Make every monster tough and heal the player, so a smoke test can watch several attacks in a row. */
    toughen: () => {
      selectedRegion.mobs.forEach((m) => {
        m.stats.hitpoint = 5000;
        m.currentStats.hitpoint = 5000;
      });
      Trainer.player.currentStats.hitpoint = Trainer.player.stats.hitpoint;
    },
    projectileLog: () => JSON.parse(JSON.stringify(Projectile.debugLog)),
    graphicLog: () => JSON.parse(JSON.stringify(V3GraphicsLog.graphics)),
    clearLogs: () => {
      Projectile.debugLog.length = 0;
      V3GraphicsLog.graphics.length = 0;
    },
  };
  (window as unknown as { __v3Sim: unknown }).__v3Sim = Object.freeze(hooks);
}
V3Shell.addSidebarPaste();

const { player } = selectedRegion.initialiseRegion();

Viewport.setupViewport(selectedRegion);
Viewport.viewport.setPlayer(player);

ImageLoader.onAllImagesLoaded(() => {
  MapController.controller.updateOrbsMask(player.currentStats, player.stats);
});
TileMarker.loadAll(selectedRegion);


player.perceivedLocation = player.location;
player.destinationLocation = player.location;
/// /////////////////////////////////////////////////////////
// UI controls

ImageLoader.onAllImagesLoaded(() =>
  MapController.controller.updateOrbsMask(Trainer.player.currentStats, Trainer.player.stats),
);

ImageLoader.onAllImagesLoaded(() => {
  drawAssetLoadingBar(loadingAssetProgress);
  imagesReady = true;
  checkStart();
});

const interval = setInterval(() => {
  ImageLoader.checkImagesLoaded(interval);
}, 50);

Assets.onAllAssetsLoaded(() => {
  // renders a single frame
  Viewport.viewport.initialise().then(() => {
    console.log("assets are preloaded");
    assetsPreloaded = true;
    checkStart();
  });
});

function drawAssetLoadingBar(loadingProgress: number) {
  const specialAttackBarBackground = ImageLoader.createImage(SpecialAttackBarBackground);
  const { width: canvasWidth, height: canvasHeight } = Chrome.size();
  const canvas = document.getElementById("world") as HTMLCanvasElement;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#FFFF00";
  context.font = "32px OSRS";
  context.textAlign = "center";
  context.fillText(`Loading models: ${Math.floor(loadingProgress * 100)}%`, canvas.width / 2, canvas.height / 2);
  const scale = 2;
  const left = canvasWidth / 2 - (specialAttackBarBackground.width * scale) / 2;
  const top = canvasHeight / 2 + 20;
  const width = specialAttackBarBackground.width * scale;
  const height = specialAttackBarBackground.height * scale;
  context.drawImage(specialAttackBarBackground, left, top, width, height);
  context.fillStyle = "#730606";
  context.fillRect(left + 2 * scale, top + 6 * scale, width - 4 * scale, height - 12 * scale);
  context.fillStyle = "#397d3b";
  context.fillRect(left + 2 * scale, top + 6 * scale, (width - 4 * scale) * loadingProgress, height - 12 * scale);
  context.fillStyle = "#000000";
  context.globalAlpha = 0.5;
  context.strokeRect(left + 2 * scale, top + 6 * scale, width - 4 * scale, height - 12 * scale);
  context.globalAlpha = 1;
}

let loadingAssetProgress = 0.0;
drawAssetLoadingBar(loadingAssetProgress);

Assets.onAssetProgress((loaded, total) => {
  loadingAssetProgress = loaded / total;
  drawAssetLoadingBar(loadingAssetProgress);
});

const assets2 = setInterval(() => {
  Assets.checkAssetsLoaded(assets2);
}, 50);

let imagesReady = false;
let assetsPreloaded = false;
let started = false;

function checkStart() {
  if (!started && imagesReady && assetsPreloaded) {
    started = true;
    // The engine ticks only after the setup screen's Start (or straight away after a setup-driven reload).
    V3Shell.ready();
  }
}

/// /////////////////////////////////////////////////////////

// UI disclaimer
const topHeaderContainer = document.getElementById("disclaimer_panel");
topHeaderContainer.innerHTML = "Work in progress. Based on the open-source Inferno Trainer.<br />" + topHeaderContainer.innerHTML;

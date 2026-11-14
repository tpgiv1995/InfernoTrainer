"use strict";

/**
 * Settings that belong to the V3 shell (not the engine). Stored under one key so a bad value
 * can never break the engine's own settings.
 */
const KEY = "v3-inferno-sim:settings";

export interface V3SettingsState {
  fullscreenOnStart: boolean;
}

const DEFAULTS: V3SettingsState = { fullscreenOnStart: true };

export class V3Settings {
  static state: V3SettingsState = { ...DEFAULTS };

  static read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      V3Settings.state = {
        fullscreenOnStart: typeof parsed.fullscreenOnStart === "boolean" ? parsed.fullscreenOnStart : DEFAULTS.fullscreenOnStart,
      };
    } catch {
      V3Settings.state = { ...DEFAULTS };
    }
    return V3Settings.state;
  }

  static persist() {
    window.localStorage.setItem(KEY, JSON.stringify(V3Settings.state));
  }
}

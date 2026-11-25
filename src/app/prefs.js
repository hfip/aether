/**
 * Player preferences, kept on this phone.
 */

const KEY = 'aether.player.prefs.v2';

export const DEFAULT_PREFS = {
  speed: 1,
  aspect: 'contain',
  autoNext: true,
  subSize: 'medium',
  subBackground: 'soft',
  subPosition: 'bottom',
  subDelay: 0,
  stats: false,
};

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const stored = JSON.parse(raw);
    if (!stored || typeof stored !== 'object') return { ...DEFAULT_PREFS };
    const merged = { ...DEFAULT_PREFS };
    for (const key of Object.keys(DEFAULT_PREFS)) {
      if (stored[key] !== undefined && typeof stored[key] === typeof DEFAULT_PREFS[key]) {
        merged[key] = stored[key];
      }
    }
    if (merged.subDelay < -10 || merged.subDelay > 10) merged.subDelay = 0;
    if (merged.speed < 0.25 || merged.speed > 4) merged.speed = 1;
    return merged;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or a full disk: preferences simply do not persist.
  }
}

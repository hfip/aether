/**
 * Shared bits for the two players that need Media Source Extensions.
 *
 * WebKit does not expose `MediaSource` on iPhone; it exposes `ManagedMediaSource`
 * (iOS 17.1+). Both dash.js and mediabunny look for `MediaSource`, so the shim
 * below is installed right before either library imports.
 */

export function ensureMediaSource() {
  if (typeof window.MediaSource === 'undefined' && typeof window.ManagedMediaSource === 'function') {
    window.MediaSource = window.ManagedMediaSource;
  }
  return typeof window.MediaSource !== 'undefined';
}

const pickDash = (mod) => (mod?.default?.MediaPlayer ? mod.default : mod);
const pickMediabunny = (mod) => (mod?.Input && mod?.Output ? mod : mod?.default);

let dashLoading = null;
let mediabunnyLoading = null;

/** dash.js, only downloaded when an MPD is opened. */
export function loadDash() {
  if (!dashLoading) {
    dashLoading = import('https://esm.sh/dashjs@4')
      .then(pickDash)
      .catch(() => import('https://cdn.jsdelivr.net/npm/dashjs@4.7.4/+esm').then(pickDash))
      .then((lib) => {
        if (!lib?.MediaPlayer) throw new Error('dashjs unavailable');
        return lib;
      })
      .catch((error) => {
        dashLoading = null;
        throw error;
      });
  }
  return dashLoading;
}

/** mediabunny, only downloaded when a Matroska/MPEG-TS file is opened. */
export function loadMediabunny() {
  if (!mediabunnyLoading) {
    mediabunnyLoading = import('https://esm.sh/mediabunny@1')
      .catch(() => import('https://cdn.jsdelivr.net/npm/mediabunny@1/+esm'))
      .then(pickMediabunny)
      .then((lib) => {
        if (!lib?.Input || !lib?.Output) throw new Error('mediabunny unavailable');
        return lib;
      })
      .catch((error) => {
        mediabunnyLoading = null;
        throw error;
      });
  }
  return mediabunnyLoading;
}

/** Wait for a MediaSource/SourceBuffer event with a deadline. */
export function waitFor(target, event, timeout = 15000) {
  return new Promise((resolve, reject) => {
    let timer = null;
    const done = () => {
      target.removeEventListener(event, done);
      if (timer) clearTimeout(timer);
      resolve();
    };
    target.addEventListener(event, done);
    timer = setTimeout(() => {
      target.removeEventListener(event, done);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeout);
  });
}

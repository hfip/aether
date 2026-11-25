const KEY = 'aether.v1';

export const emptyStore = () => ({ addons: [], progress: {}, saved: [], seeded: false, version: 1 });

export function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (!raw || typeof raw !== 'object') return emptyStore();
    const addons = Array.isArray(raw.addons) ? raw.addons.filter((addon) => addon && addon.key && addon.base && addon.manifest) : [];
    return {
      addons,
      progress: raw.progress && typeof raw.progress === 'object' ? raw.progress : {},
      saved: Array.isArray(raw.saved) ? raw.saved.filter((item) => item && item.id) : [],
      seeded: Boolean(raw.seeded) || addons.length > 0,
      version: 1,
    };
  } catch {
    return emptyStore();
  }
}

export function saveStore(store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage can be full or disabled; the app still works for this visit.
  }
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the old path: WebKit sometimes refuses the async API.
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    field.style.pointerEvents = 'none';
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, field.value.length);
    const ok = document.execCommand('copy');
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

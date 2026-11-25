/**
 * Stremio addon protocol, browser side.
 *
 * Every value here comes from somebody else's server. Keep this module strict
 * about shapes and forgiving about the optional bits: addons in the wild do not
 * all fill in the same fields.
 */

export const DEFAULT_ADDON_URL = 'https://v3-cinemeta.strem.io/manifest.json';

const REQUEST_TIMEOUT = 18000;

export class AddonError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = 'AddonError';
    this.detail = detail;
  }
}

export const normalizeBase = (input) => {
  let raw = String(input || '').trim();
  if (!raw) throw new AddonError('ألصق رابط الإضافة أولًا.');
  if (/^stremio:\/\//i.test(raw)) raw = raw.replace(/^stremio:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new AddonError('هذا الرابط غير صالح.');
  }
  if (!/^https?:$/.test(url.protocol)) throw new AddonError('يجب أن يبدأ الرابط بـ https://');
  if (!url.hostname) throw new AddonError('هذا الرابط غير صالح.');

  url.hash = '';
  url.search = '';
  let path = url.pathname.replace(/\/+$/, '');
  path = path.replace(/\/manifest\.json$/i, '');
  return `${url.origin}${path}`.replace(/\/+$/, '');
};

const manifestUrl = (base) => `${base}/manifest.json`;

/** Fetch JSON with a timeout and an error a person can read. */
export async function fetchJson(url, timeout = REQUEST_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new AddonError('انتهت مهلة الاتصال بالإضافة.');
    throw new AddonError('تعذر الاتصال بالإضافة. قد تمنع الإضافة الطلبات من المتصفح (CORS).');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new AddonError(`الإضافة ردّت بخطأ ${response.status}.`, response.status);
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new AddonError('الإضافة ردّت ببيانات غير صالحة.');
  }
}

const cleanManifest = (manifest) => ({
  id: String(manifest.id),
  version: String(manifest.version || ''),
  name: String(manifest.name || 'إضافة'),
  description: typeof manifest.description === 'string' ? manifest.description : '',
  logo: typeof manifest.logo === 'string' ? manifest.logo : '',
  resources: Array.isArray(manifest.resources) ? manifest.resources : [],
  types: Array.isArray(manifest.types) ? manifest.types.map(String) : [],
  catalogs: Array.isArray(manifest.catalogs) ? manifest.catalogs : [],
  idPrefixes: Array.isArray(manifest.idPrefixes) ? manifest.idPrefixes.map(String) : [],
  behaviorHints: manifest.behaviorHints && typeof manifest.behaviorHints === 'object' ? manifest.behaviorHints : {},
});

export async function loadAddon(input) {
  const base = normalizeBase(input);
  const raw = await fetchJson(manifestUrl(base));
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AddonError('هذا الرابط لا يحتوي على بيان إضافة.');
  if (!raw.id || !raw.name || !Array.isArray(raw.resources) || !Array.isArray(raw.types)) {
    throw new AddonError('هذا ليس بيان إضافة ستريمو صالح.');
  }
  const manifest = cleanManifest(raw);
  return {
    key: `${manifest.id}@${base}`,
    base,
    manifest,
    enabled: true,
    addedAt: Date.now(),
  };
}

export function addonSupports(addon, resourceName, type) {
  if (!addon?.enabled || !addon.manifest) return false;
  const resource = (addon.manifest.resources || []).find((entry) => (
    typeof entry === 'string' ? entry === resourceName : entry?.name === resourceName
  ));
  if (!resource) return false;
  if (typeof resource === 'object' && type) {
    if (Array.isArray(resource.types) && !resource.types.includes(type)) return false;
  }
  if (resourceName !== 'catalog' && type) {
    const types = addon.manifest.types || [];
    if (types.length && !types.includes(type)) return false;
  }
  return true;
}

const CATALOG_LABELS = {
  Popular: 'الأكثر رواجًا',
  Featured: 'مميز',
  New: 'جديد',
  Top: 'الأعلى تقييمًا',
  Trending: 'الرائج الآن',
  'Top rated': 'الأعلى تقييمًا',
  'Most popular': 'الأكثر رواجًا',
};

const isCatalogUsable = (catalog) => {
  if (!catalog || typeof catalog !== 'object' || !catalog.id || !catalog.type) return false;
  if (['last-videos', 'calendar-videos'].includes(catalog.id)) return false;
  if ((catalog.extraRequired || []).some((name) => name !== 'genre')) return false;
  return true;
};

/** Catalogs that make good home rows, with a chosen default for a required genre. */
export function homeCatalogs(addons, type) {
  const rows = [];
  for (const addon of addons || []) {
    if (!addon.enabled || !addonSupports(addon, 'catalog', type)) continue;
    for (const catalog of addon.manifest.catalogs || []) {
      if (catalog.type !== type || !isCatalogUsable(catalog)) continue;
      const extra = {};
      let usable = true;
      for (const spec of catalog.extra || []) {
        if (!spec?.isRequired) continue;
        if (spec.name === 'genre' && Array.isArray(spec.options) && spec.options.length) {
          extra.genre = spec.options[0];
        } else {
          usable = false;
        }
      }
      if (!usable) continue;
      const suffix = extra.genre ? ` · ${extra.genre}` : '';
      const name = catalog.name || catalog.id;
      rows.push({
        key: `${addon.key}|${type}|${catalog.id}|${extra.genre || ''}`,
        addonKey: addon.key,
        addonName: addon.manifest.name,
        base: addon.base,
        catalog,
        extra,
        title: `${CATALOG_LABELS[name] || name}${suffix}`,
      });
    }
  }
  // Same addon should not drown the page if it exposes many catalogs.
  return rows.slice(0, 8);
}

export function searchCatalogs(addons, type) {
  const rows = [];
  for (const addon of addons || []) {
    if (!addon.enabled || !addonSupports(addon, 'catalog', type)) continue;
    for (const catalog of addon.manifest.catalogs || []) {
      if (catalog.type !== type || !isCatalogUsable(catalog)) continue;
      const extras = catalog.extraSupported || (catalog.extra || []).map((entry) => entry.name);
      if (!extras.includes('search')) continue;
      rows.push({
        key: `${addon.key}|${type}|${catalog.id}|search`,
        addonKey: addon.key,
        addonName: addon.manifest.name,
        base: addon.base,
        catalog,
        extra: {},
        title: catalog.name || catalog.id,
      });
    }
  }
  return rows;
}

const extraString = (extra) => Object.entries(extra || {})
  .filter(([, value]) => value !== undefined && value !== null && value !== '')
  .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
  .join('&');

export const catalogUrl = (row, extra = {}) => {
  const suffix = extraString(extra);
  return `${row.base}/catalog/${row.catalog.type}/${encodeURIComponent(row.catalog.id)}${suffix ? `/${suffix}` : ''}.json`;
};

export function normalizePreview(meta, addon, type) {
  if (!meta || !meta.id) return null;
  return {
    ...meta,
    id: String(meta.id),
    type: meta.type || type,
    name: meta.name || 'بدون عنوان',
    poster: meta.poster || '',
    background: meta.background || '',
    logo: meta.logo || '',
    description: meta.description || '',
    releaseInfo: meta.releaseInfo || meta.year || '',
    year: meta.year || meta.releaseInfo || '',
    imdbRating: meta.imdbRating || '',
    genres: Array.isArray(meta.genres) ? meta.genres : (Array.isArray(meta.genre) ? meta.genre : []),
    runtime: meta.runtime || '',
    cast: Array.isArray(meta.cast) ? meta.cast : [],
    director: Array.isArray(meta.director) ? meta.director : [],
    videos: Array.isArray(meta.videos) ? meta.videos : [],
    addonKey: addon.key,
    addonName: addon.manifest.name,
  };
}

export async function fetchCatalog(row) {
  const data = await fetchJson(catalogUrl(row, row.extra), 24000);
  if (!data || !Array.isArray(data.metas)) throw new AddonError('لم تُرجع الإضافة قائمة أعمال.');
  return data.metas.map((meta) => normalizePreview(meta, {
    key: row.addonKey,
    manifest: { name: row.addonName },
  }, row.catalog.type)).filter(Boolean);
}

export async function searchCatalog(row, query, skip = 0) {
  const extra = { search: query };
  if (skip) extra.skip = String(skip);
  const data = await fetchJson(catalogUrl(row, extra), 24000);
  if (!data || !Array.isArray(data.metas)) return [];
  return data.metas.map((meta) => normalizePreview(meta, {
    key: row.addonKey,
    manifest: { name: row.addonName },
  }, row.catalog.type)).filter(Boolean);
}

export async function fetchMeta(addons, type, id, preferredKey) {
  const candidates = (addons || [])
    .filter((addon) => addonSupports(addon, 'meta', type))
    .sort((a, b) => (a.key === preferredKey ? -1 : b.key === preferredKey ? 1 : 0));
  let lastError = null;
  for (const addon of candidates) {
    try {
      const data = await fetchJson(`${addon.base}/meta/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`, 24000);
      if (!data?.meta) throw new AddonError('لا توجد بيانات لهذا العمل.');
      return {
        ...data.meta,
        type: data.meta.type || type,
        id: data.meta.id || id,
        name: data.meta.name || 'بدون عنوان',
        genres: Array.isArray(data.meta.genres) ? data.meta.genres : (Array.isArray(data.meta.genre) ? data.meta.genre : []),
        videos: Array.isArray(data.meta.videos) ? data.meta.videos : [],
        addonName: addon.manifest.name,
        addonKey: addon.key,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new AddonError('لم أجد إضافة بيانات لهذا العمل.');
}

const YOUTUBE = 'https://www.youtube.com/watch?v=';

export const youtubeUrl = (id) => `${YOUTUBE}${encodeURIComponent(id)}`;

const qualityOf = (text) => {
  if (/\b(2160p?|4k|uhd)\b/i.test(text)) return { quality: '4K', rank: 4 };
  if (/\b1080p?\b/i.test(text)) return { quality: '1080p', rank: 3 };
  if (/\b720p?\b/i.test(text)) return { quality: '720p', rank: 2 };
  if (/\b(480p?|360p?|sd)\b/i.test(text)) return { quality: 'SD', rank: 1 };
  if (/\b(cam|ts|telesync)\b/i.test(text)) return { quality: 'CAM', rank: 0 };
  return { quality: 'بث', rank: 1 };
};

const flagsOf = (text) => {
  const flags = [];
  if (/\b(dolby[ .-]?vision|dovi|\bdv\b)/i.test(text)) flags.push('Dolby Vision');
  else if (/\bhdr10\+\b/i.test(text)) flags.push('HDR10+');
  else if (/\bhdr\b/i.test(text)) flags.push('HDR');
  if (/\bremux\b/i.test(text)) flags.push('REMUX');
  else if (/\bblu[ .-]?ray\b/i.test(text)) flags.push('BluRay');
  else if (/\bweb[ .-]?dl\b/i.test(text)) flags.push('WEB-DL');
  if (/\b(atmos|truehd|dts[ .-]?x)\b/i.test(text)) flags.push('Atmos');
  return [...new Set(flags)].slice(0, 3);
};

const sizeOf = (text) => {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(TB|GB|MB)\b/i);
  return match ? `${match[1].replace(',', '.')} ${match[2].toUpperCase()}` : '';
};

const seedersOf = (text) => {
  const match = text.match(/(?:👤|👥|🌱)\s*(\d+)/) || text.match(/(?:seeders?|seeds?)\s*[:：]?\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
};

const providerOf = (text) => {
  const match = text.match(/⚙️\s*([^\n]+)/);
  return match ? match[1].trim().slice(0, 32) : '';
};

const magnetFor = (raw, title) => {
  if (!raw?.infoHash) return '';
  const parts = [`magnet:?xt=urn:btih:${encodeURIComponent(raw.infoHash)}`];
  const filename = raw.behaviorHints?.filename || title;
  if (filename) parts.push(`dn=${encodeURIComponent(filename)}`);
  for (const source of Array.isArray(raw.sources) ? raw.sources : []) {
    if (typeof source === 'string' && source.startsWith('tracker:')) {
      parts.push(`tr=${encodeURIComponent(source.slice(8))}`);
    }
  }
  return parts.join('&');
};

export function normalizeStream(raw, addon, index) {
  if (!raw || typeof raw !== 'object') return null;
  const nameLines = String(raw.name || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const titleLines = String(raw.title || raw.description || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const combined = `${raw.name || ''} ${raw.title || ''} ${raw.description || ''}`;
  const { quality, rank } = qualityOf(combined);
  const headline = titleLines[0] || nameLines[0] || 'مصدر بث';
  const streamName = nameLines[0] || addon.manifest.name;
  const directUrl = typeof raw.url === 'string' && /^https?:/i.test(raw.url) ? raw.url : '';
  const externalUrl = typeof raw.externalUrl === 'string' ? raw.externalUrl : '';
  const ytId = typeof raw.ytId === 'string' ? raw.ytId : '';
  const torrent = raw.infoHash ? String(raw.infoHash) : '';
  const size = sizeOf(combined);
  const seeders = seedersOf(combined);
  const provider = providerOf(combined);
  const flags = flagsOf(combined);

  return {
    key: `${addon.key}:${index}:${torrent || directUrl || ytId || headline}`.slice(0, 500),
    headline,
    streamName,
    description: titleLines.slice(1).join(' · ').slice(0, 220),
    addonName: addon.manifest.name,
    addonKey: addon.key,
    quality,
    qualityRank: rank,
    flags,
    size,
    seeders,
    provider,
    url: directUrl,
    externalUrl,
    ytId,
    infoHash: torrent,
    fileIdx: Number.isFinite(raw.fileIdx) ? raw.fileIdx : null,
    filename: raw.behaviorHints?.filename || titleLines[0] || '',
    magnet: magnetFor(raw, titleLines[0] || nameLines[0]),
    playable: Boolean(directUrl) || Boolean(ytId) || Boolean(externalUrl),
  };
}

/**
 * How a direct link can be played inside the app:
 * `hls` and `file` are handed straight to the video element, `dash` needs a
 * DASH reader because WebKit has no native MPD support.
 */
export function streamFormat(url) {
  const path = String(url || '').split('#')[0].split('?')[0].toLowerCase();
  if (path.includes('.mpd')) return 'dash';
  if (path.includes('.m3u8')) return 'hls';
  if (/\.(mkv|mk3d|ts|m2ts|mts)$/.test(path)) return 'remux';
  return 'file';
}

export function sortStreams(a, b) {
  const rank = (stream) => (stream.url ? 0 : stream.externalUrl || stream.ytId ? 1 : 2);
  return rank(a) - rank(b)
    || b.qualityRank - a.qualityRank
    || (b.seeders || 0) - (a.seeders || 0)
    || a.headline.localeCompare(b.headline, 'ar');
}

/**
 * Subtitle list from every addon that provides the `subtitles` resource.
 * Addons answer with `{ subtitles: [{ id, url, lang }] }`, and a few include
 * extra fields, so everything except the URL is optional.
 */
export async function fetchSubtitles(addons, type, id) {
  const candidates = (addons || []).filter((addon) => addonSupports(addon, 'subtitles', type));
  const settled = await Promise.allSettled(candidates.map(async (addon) => {
    const data = await fetchJson(`${addon.base}/subtitles/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`, 20000);
    const entries = Array.isArray(data?.subtitles) ? data.subtitles : [];
    return entries
      .filter((entry) => entry && typeof entry.url === 'string' && /^https?:/i.test(entry.url))
      .map((entry) => ({
        key: `${addon.key}:${entry.id || entry.url}`,
        url: entry.url,
        lang: String(entry.lang || ''),
        label: String(entry.label || entry.lang || ''),
        addonName: addon.manifest.name,
      }));
  }));
  const seen = new Set();
  const list = [];
  for (const result of settled) {
    if (result.status !== 'fulfilled') continue;
    for (const track of result.value) {
      if (seen.has(track.url)) continue;
      seen.add(track.url);
      list.push(track);
    }
  }
  return list;
}

export async function fetchStreams(addon, type, id) {
  if (!addonSupports(addon, 'stream', type)) return [];
  const data = await fetchJson(`${addon.base}/stream/${encodeURIComponent(type)}/${encodeURIComponent(id)}.json`, 22000);
  if (!Array.isArray(data?.streams)) return [];
  return data.streams
    .map((stream, index) => normalizeStream(stream, addon, index))
    .filter(Boolean)
    .sort(sortStreams);
}

export const typeLabel = (type) => (type === 'series' ? 'مسلسل' : 'فيلم');

export const seasonOf = (video) => Number(video?.season);
export const episodeOf = (video) => Number(video?.episode);

export function episodeLabel(video) {
  if (!video) return '';
  const season = seasonOf(video);
  const episode = episodeOf(video);
  if (!Number.isFinite(season) || !Number.isFinite(episode)) return video.name || '';
  return `الموسم ${season} · الحلقة ${episode}`;
}

export function episodesFor(meta) {
  return (meta?.videos || [])
    .filter((video) => Number.isFinite(Number(video.season)) && Number.isFinite(Number(video.episode)))
    .slice()
    .sort((a, b) => Number(a.season) - Number(b.season) || Number(a.episode) - Number(b.episode));
}

export function seasonsFor(meta) {
  const set = new Set();
  for (const video of episodesFor(meta)) {
    const season = Number(video.season);
    if (season > 0) set.add(season);
  }
  return [...set].sort((a, b) => a - b);
}

export const firstEpisodeFor = (meta, season) => {
  const all = episodesFor(meta);
  return all.find((video) => Number(video.season) === Number(season) && Number(video.episode) > 0)
    || all.find((video) => Number(video.season) > 0)
    || all[0]
    || null;
};

export const detailsLine = (meta) => {
  const bits = [];
  if (meta?.releaseInfo) bits.push(String(meta.releaseInfo));
  if (meta?.imdbRating) bits.push(`★ ${meta.imdbRating}`);
  if (meta?.runtime) bits.push(String(meta.runtime));
  return bits.join('  ·  ');
};

export const progressKey = (type, id) => `${type}:${id}`;

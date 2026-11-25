/**
 * Subtitles: Stremio addons hand out `.srt` and `.vtt` files, which are
 * parsed here and drawn by the player itself so size, background, position
 * and delay can all be adjusted while watching.
 */

const LANGUAGE_NAMES = {
  ar: 'العربية', ara: 'العربية', arabic: 'العربية',
  en: 'الإنجليزية', eng: 'الإنجليزية', english: 'الإنجليزية',
  fr: 'الفرنسية', fre: 'الفرنسية', fra: 'الفرنسية',
  es: 'الإسبانية', spa: 'الإسبانية',
  de: 'الألمانية', ger: 'الألمانية', deu: 'الألمانية',
  tr: 'التركية', tur: 'التركية',
  it: 'الإيطالية', ita: 'الإيطالية',
  ru: 'الروسية', rus: 'الروسية',
  hi: 'الهندية', hin: 'الهندية',
  ur: 'الأردية', urd: 'الأردية',
  fa: 'الفارسية', per: 'الفارسية', fas: 'الفارسية',
  pt: 'البرتغالية', por: 'البرتغالية',
  nl: 'الهولندية', dut: 'الهولندية', nld: 'الهولندية',
  ja: 'اليابانية', jpn: 'اليابانية',
  ko: 'الكورية', kor: 'الكورية',
  zh: 'الصينية', chi: 'الصينية', zho: 'الصينية',
  pl: 'البولندية', pol: 'البولندية',
  sv: 'السويدية', swe: 'السويدية',
  da: 'الدنماركية', dan: 'الدنماركية',
  no: 'النرويجية', nor: 'النرويجية',
  fi: 'الفنلندية', fin: 'الفنلندية',
  el: 'اليونانية', gre: 'اليونانية', ell: 'اليونانية',
  he: 'العبرية', heb: 'العبرية',
  id: 'الإندونيسية', ind: 'الإندونيسية',
  ms: 'الملايوية', may: 'الملايوية', msa: 'الملايوية',
  th: 'التايلاندية', tha: 'التايلاندية',
  vi: 'الفيتنامية', vie: 'الفيتنامية',
  uk: 'الأوكرانية', ukr: 'الأوكرانية',
  ro: 'الرومانية', rum: 'الرومانية', ron: 'الرومانية',
  cs: 'التشيكية', cze: 'التشيكية', ces: 'التشيكية',
  hu: 'الهنغارية', hun: 'الهنغارية',
};

export function languageLabel(code) {
  const key = String(code || '').trim().toLowerCase();
  if (!key) return 'بدون لغة';
  const first = key.split(/[-_]/)[0];
  return LANGUAGE_NAMES[key] || LANGUAGE_NAMES[first] || key.toUpperCase();
}

const isArabicLang = (code) => /^(ar|ara|arabic)/i.test(String(code || ''));

export function pickArabicTrack(tracks) {
  return (tracks || []).find((track) => isArabicLang(track.lang) || /عرب/.test(track.label || '')) || null;
}

const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
};

export function cleanCueText(line) {
  return line
    .replace(/<[^>]*>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/\{\\[^}]*$/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/&[a-z#0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/\s+$/, '')
    .trim();
}

/** "00:01:02,500" or "00:01:02.500" or "01:02.500" -> seconds. */
function stampToSeconds(stamp) {
  const match = String(stamp || '').match(/(?:(\d+):)?(\d{1,3}):(\d{2})[.,](\d{1,3})/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  const ms = Number(match[4].padEnd(3, '0'));
  return hours * 3600 + minutes * 60 + seconds + ms / 1000;
}

/** Parse WebVTT or SRT into sorted cues. */
export function parseSubtitles(text) {
  const normalized = String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/^WEBVTT[^\n]*\n/i, '')
    .replace(/^NOTE[\s\S]*?\n\n/gm, '');
  const cues = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.split('\n').filter((line) => line.trim() !== '');
    if (!lines.length) continue;
    let index = 0;
    if (/^\d+$/.test(lines[0].trim()) && lines[1]?.includes('-->')) index = 1;
    const timing = lines[index] || '';
    if (!timing.includes('-->')) continue;
    const [from, to] = timing.split('-->');
    const start = stampToSeconds(from);
    const end = stampToSeconds(String(to || '').trim().split(/\s+/)[0]);
    if (start == null || end == null || end <= start) continue;
    const body = lines.slice(index + 1).map(cleanCueText).filter(Boolean);
    if (!body.length) continue;
    cues.push({ start, end, text: body.join('\n') });
  }
  cues.sort((a, b) => a.start - b.start);
  return cues;
}

/** The text visible at `time`, including anything just past its end. */
export function cueTextAt(cues, time) {
  if (!cues?.length) return '';
  let low = 0;
  let high = cues.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (cues[mid].start <= time) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (found < 0) return '';
  const active = [];
  for (let i = found; i >= Math.max(0, found - 6); i -= 1) {
    const cue = cues[i];
    if (cue.start <= time && cue.end > time) active.unshift(cue.text);
    if (cue.end <= time && active.length) break;
  }
  return active.join('\n');
}

export async function fetchSubtitleCues(url, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('subtitle fetch failed');
    const buffer = await response.arrayBuffer();
    let text = new TextDecoder('utf-8').decode(buffer);
    if (text.includes('\uFFFD')) {
      try { text = new TextDecoder('windows-1252').decode(buffer); } catch { /* keep utf-8 */ }
    }
    const cues = parseSubtitles(text);
    if (!cues.length) throw new Error('empty subtitle');
    return cues;
  } finally {
    clearTimeout(timer);
  }
}

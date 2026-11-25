/**
 * Matroska / MPEG-TS playback.
 *
 * WebKit refuses containers it has no demuxer for, so an MKV link is remuxed
 * (no re-encode) into a fragmented MP4 and fed to the video element through
 * Media Source Extensions. Reading, packet copying and muxing all happen in
 * the page with mediabunny; the source must allow cross-origin reads.
 *
 * Playback is progressive: the conversion runs a little ahead of the
 * playhead, old buffered ranges are evicted, and seeking outside the buffer
 * restarts the conversion at the requested time.
 */

import { ensureMediaSource, loadMediabunny, waitFor } from './media.js';

const CHUNK_SECONDS = 20;     // how much output each conversion call produces
const READ_AHEAD = 45;        // seconds kept ahead of the playhead
const KEEP_BEHIND = 25;       // seconds kept behind the playhead
const MAX_BUFFERED = 150;     // hard cap before old ranges are evicted
const SEEK_DEBOUNCE = 260;

const COPYABLE_VIDEO = ['avc', 'hevc'];
const COPYABLE_AUDIO = ['aac', 'mp3', 'ac3', 'eac3'];

export class RemuxError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'RemuxError';
    this.kind = kind;
  }
}

const fallbackVideoCodec = (codec) => (codec === 'hevc' ? 'hvc1.1.6.L93.B0' : 'avc1.42E01E');

function concatParts(parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    merged.set(part, offset);
    offset += part.byteLength;
  }
  return merged;
}

/** WebKit stalls if the init segment is appended in pieces: wait for ftyp+moov. */
function hasMoovBox(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  while (offset + 8 <= bytes.byteLength) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === 'moov') return true;
    if (size < 8) return false;
    offset += size;
  }
  return false;
}

async function appendBuffer(sb, data) {
  if (sb.updating) await waitFor(sb, 'updateend', 15000);
  sb.appendBuffer(data);
  await waitFor(sb, 'updateend', 15000);
}

export class Remuxer {
  constructor(video, url, handlers = {}) {
    this.video = video;
    this.url = url;
    this.onStatus = handlers.onStatus || (() => {});
    this.onError = handlers.onError || (() => {});
    this.onProgress = handlers.onProgress || (() => {});

    this.destroyed = false;
    this.generation = 0;
    this.input = null;
    this.mb = null;
    this.mediaSource = null;
    this.sb = null;
    this.conv = null;
    this.output = null;
    this.objectUrl = '';
    this.mime = '';
    this.duration = 0;
    this.startAt = 0;
    this.produced = 0;
    this.finished = false;
    this.appendQueue = Promise.resolve();
    this.seekTimer = null;
    this.pendingSeek = null;
    this.notice = '';
    this.aligned = false;
    this.resumePlay = false;
    this.initDone = false;
    this.initHeld = [];

    const remember = () => { this.wasPlaying = !this.video.paused; };
    this.video.addEventListener('play', remember);
    this.video.addEventListener('pause', remember);
  }

  /** Read the container, decide what can be copied into MP4. */
  async open() {
    let mb;
    try {
      mb = await loadMediabunny();
    } catch {
      throw new RemuxError('lib', 'تعذر تحميل محرك MKV. تحقق من اتصالك بالإنترنت.');
    }
    this.mb = mb;

    let input;
    try {
      input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.UrlSource(this.url) });
      this.duration = await input.computeDuration();
    } catch {
      throw new RemuxError(
        'source',
        'تعذر قراءة الملف. قد لا يسمح الخادم بالوصول من المتصفح (CORS)، أو أن الرابط منتهي.',
      );
    }
    this.input = input;

    const videoTrack = await input.getPrimaryVideoTrack().catch(() => null);
    const audioTrack = await input.getPrimaryAudioTrack().catch(() => null);
    if (!videoTrack) throw new RemuxError('novideo', 'هذا الملف لا يحتوي على مسار فيديو.');

    let videoCodec = await videoTrack.getCodecParameterString().catch(() => null);
    if (!COPYABLE_VIDEO.includes(videoTrack.codec)) {
      throw new RemuxError(
        'codec',
        `ترميز الفيديو ${String(videoTrack.codec || '').toUpperCase()} غير مدعوم في المشغل المدمج. جرّب مصدرًا آخر أو AetherPlayer.`,
      );
    }
    if (!videoCodec) videoCodec = fallbackVideoCodec(videoTrack.codec);

    let audio = null;
    let audioCodec = null;
    const notices = [];
    if (audioTrack) {
      audio = {};
      if (COPYABLE_AUDIO.includes(audioTrack.codec)) {
        audioCodec = await audioTrack.getCodecParameterString().catch(() => null) || 'mp4a.40.2';
      } else if (mb.canEncodeAudio?.('aac')) {
        audio = { codec: 'aac' };
        audioCodec = 'mp4a.40.2';
        notices.push('يُحوَّل الصوت إلى AAC أثناء التشغيل.');
      } else {
        audio = { discard: true };
        notices.push('مسار الصوت بهذا الترميز لا يعمل هنا؛ سيعمل الفيديو بدون صوت.');
      }
    }

    const withAudio = `video/mp4; codecs="${videoCodec}${audioCodec ? `,${audioCodec}` : ''}"`;
    let mime = withAudio;
    if (!(ensureMediaSource() && window.MediaSource.isTypeSupported(withAudio))) {
      const videoOnly = `video/mp4; codecs="${videoCodec}"`;
      if (!(ensureMediaSource() && window.MediaSource.isTypeSupported(videoOnly))) {
        throw new RemuxError('codec', 'هذا الترميز لا يدعمه نظام التشغيل داخل هذا التطبيق.');
      }
      mime = videoOnly;
      audio = { discard: true };
      audioCodec = null;
      notices.push('مسار الصوت لا يعمل هنا؛ سيعمل الفيديو بدون صوت.');
    }

    this.mime = mime;
    this.videoOptions = {};
    this.audioOptions = audio || { discard: true };
    this.notice = notices.join(' ');
    return {
      duration: this.duration,
      mime,
      width: videoTrack.displayWidth || videoTrack.codedWidth || 0,
      height: videoTrack.displayHeight || videoTrack.codedHeight || 0,
      videoCodec: videoTrack.codec,
      audioCodec: audioTrack ? audioTrack.codec : null,
      notice: this.notice,
    };
  }

  async start(startAt = 0, play = true) {
    if (this.destroyed) return;
    this.resumePlay = play;
    await this.setup(startAt);
    if (this.destroyed) return;
    this.pump(this.generation).catch(() => {});
  }

  async setup(startAt, resumePlay = true) {
    ensureMediaSource();
    const gen = ++this.generation;
    this.startAt = Math.max(0, startAt || 0);
    this.produced = 0;
    this.finished = false;
    this.aligned = false;
    this.resumePlay = resumePlay;
    this.initDone = false;
    this.initHeld = [];
    this.appendQueue = Promise.resolve();

    const sb = await this.ensureSourceBuffer();
    if (!sb || gen !== this.generation || this.destroyed) return;
    await this.clearBuffer(sb);
    sb.timestampOffset = this.startAt;

    const output = new this.mb.Output({
      format: new this.mb.Mp4OutputFormat({ fastStart: 'fragmented' }),
      target: new this.mb.StreamTarget(new WritableStream({
        write: (chunk) => this.enqueue(gen, chunk.data),
      })),
    });

    const conv = await this.mb.Conversion.init({
      input: this.input,
      output,
      composable: true,
      // A forced copy drops anything that would need a transcode; when the
      // audio is being transcoded to AAC, a preferred copy is required.
      copy: { mode: this.audioOptions?.codec ? 'preferred' : 'forced' },
      video: this.videoOptions,
      audio: this.audioOptions,
      trim: this.startAt > 0 ? { start: this.startAt } : undefined,
      showWarnings: false,
    });
    if (gen !== this.generation || this.destroyed) {
      try { await conv.cancel(); } catch { /* gone */ }
      try { await output.cancel(); } catch { /* gone */ }
      return;
    }
    if (!conv.isValid) {
      const reasons = (conv.discardedTracks || []).map((entry) => entry.reason).join(', ');
      throw new RemuxError('convert', `تعذر تحويل هذا الملف (${reasons || 'سبب غير معروف'}).`);
    }

    this.conv = conv;
    this.output = output;
    await output.start();
  }

  /**
   * One MediaSource per session: iOS limits how many a page may open, so a
   * seek reuses this one instead of building another.
   */
  async ensureSourceBuffer() {
    const ms = this.mediaSource;
    if (ms && ms.readyState === 'open' && this.sb) return this.sb;

    const fresh = new MediaSource();
    this.mediaSource = fresh;
    try { this.video.disableRemotePlayback = true; } catch { /* older WebKit */ }
    this.releaseUrl();
    this.objectUrl = URL.createObjectURL(fresh);
    this.video.src = this.objectUrl;

    await waitFor(fresh, 'sourceopen', 15000).catch(() => {});
    if (this.destroyed) return null;
    if (fresh.readyState !== 'open') throw new RemuxError('mse', 'تعذر بدء مشغل MKV على هذا الجهاز.');

    const sb = fresh.addSourceBuffer(this.mime);
    sb.mode = 'segments';
    this.sb = sb;
    return sb;
  }

  async clearBuffer(sb) {
    if (!sb || this.destroyed) return;
    const total = sb.buffered.length;
    if (!total) return;
    const start = sb.buffered.start(0);
    const end = sb.buffered.end(total - 1);
    try {
      while (sb.updating) await waitFor(sb, 'updateend', 5000);
      sb.remove(start, end);
      await waitFor(sb, 'updateend', 5000);
    } catch { /* the buffer is already empty */ }
  }

  /**
   * Media Source only allows seeking inside a buffered range, and the first
   * fragment lands a moment after the conversion starts. Put the playhead on
   * the requested second as soon as that range exists.
   */
  align() {
    if (this.aligned || this.destroyed) return;
    const { buffered } = this.video;
    for (let i = 0; i < buffered.length; i += 1) {
      const start = buffered.start(i);
      const end = buffered.end(i);
      if (this.startAt + 0.05 < start || this.startAt > end - 0.2) continue;
      const target = Math.max(start, Math.min(this.startAt, end - 0.2));
      try {
        if (Math.abs(this.video.currentTime - target) > 0.3) this.video.currentTime = target;
      } catch { /* not ready */ }
      this.aligned = true;
      if (this.resumePlay) {
        const attempt = this.video.play?.();
        if (attempt?.catch) attempt.catch(() => this.onStatus('blocked'));
      }
      this.onStatus('ready');
      return;
    }
  }

  enqueue(gen, data) {
    // StreamTarget may reuse its buffer once `write` resolves, so keep a copy
    // for the (asynchronous) SourceBuffer append.
    const bytes = data.slice();

    if (!this.initDone) {
      this.initHeld.push(bytes);
      const size = this.initHeld.reduce((total, part) => total + part.byteLength, 0);
      if (size < 4 * 1024 * 1024 && !hasMoovBox(concatParts(this.initHeld))) {
        return Promise.resolve();
      }
      const init = concatParts(this.initHeld);
      this.initHeld = [];
      this.initDone = true;
      const run = () => {
        if (gen !== this.generation || this.destroyed) return Promise.resolve();
        return this.append(init);
      };
      this.appendQueue = this.appendQueue.then(run, run);
      return this.appendQueue;
    }

    const run = () => {
      if (gen !== this.generation || this.destroyed) return Promise.resolve();
      return this.append(bytes);
    };
    this.appendQueue = this.appendQueue.then(run, run);
    return this.appendQueue;
  }

  async append(data) {
    const sb = this.sb;
    if (!sb) return;
    try {
      await appendBuffer(sb, data);
      this.align();
      return;
    } catch (error) {
      if (error?.name !== 'QuotaExceededError') throw error;
    }
    await this.evict(true);
    const retry = this.sb;
    if (retry) {
      await appendBuffer(retry, data).catch(() => {});
      this.align();
    }
  }

  async pump(gen) {
    const conv = this.conv;
    if (!conv) return;
    const total = Math.max(0.2, this.duration - this.startAt);

    while (!this.destroyed && gen === this.generation) {
      const playhead = Math.max(0, this.video.currentTime - this.startAt);
      const ahead = playhead + READ_AHEAD;
      let until = Math.min(total, Math.max(this.produced + CHUNK_SECONDS, ahead));
      if (until <= this.produced + 0.05) {
        if (this.produced >= total - 0.2) break;
        until = Math.min(total, this.produced + CHUNK_SECONDS);
      }

      // eslint-disable-next-line no-await-in-loop
      const result = await conv.execute({ until }).then(() => null).catch((error) => error);
      if (this.destroyed || gen !== this.generation) return;
      if (result) {
        if (result.name === 'ConversionCanceledError') return;
        throw result;
      }
      // eslint-disable-next-line no-await-in-loop
      await this.appendQueue.catch(() => {});
      this.produced = until;
      // eslint-disable-next-line no-await-in-loop
      await this.evict(false);
      this.emitProgress();

      if (this.produced >= total - 0.2) {
        await this.finish();
        return;
      }
      if (this.produced > playhead + READ_AHEAD + CHUNK_SECONDS) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
    }
  }

  async evict(force) {
    const sb = this.sb;
    if (!sb || this.destroyed) return;
    const { buffered } = this.video;
    if (!buffered.length) return;
    const start = buffered.start(0);
    const end = buffered.end(buffered.length - 1);
    const playhead = this.video.currentTime;
    if (!force && (end - start < MAX_BUFFERED || playhead - start < KEEP_BEHIND + 15)) return;
    const cutoff = Math.max(start + 1, playhead - KEEP_BEHIND);
    if (cutoff <= start + 1) return;
    while (sb.updating) {
      // eslint-disable-next-line no-await-in-loop
      await waitFor(sb, 'updateend', 5000).catch(() => {});
    }
    try {
      sb.remove(start, cutoff);
      await waitFor(sb, 'updateend', 5000).catch(() => {});
    } catch { /* removing an already-gone range is fine */ }
  }

  async finish() {
    if (this.finished) return;
    this.finished = true;
    try { await this.output?.finalize(); } catch { /* already done */ }
    const ms = this.mediaSource;
    if (ms && ms.readyState === 'open') {
      try { ms.endOfStream(); } catch { /* live edge */ }
    }
    this.onStatus('ended');
    this.emitProgress();
  }

  emitProgress() {
    this.onProgress({
      produced: this.produced,
      duration: this.duration,
      startAt: this.startAt,
      buffered: this.produced + this.startAt,
    });
  }

  /** Called from the video's seeking event; restart only when needed. */
  seek(time) {
    if (this.destroyed) return;
    const target = Math.max(0, Math.min(time, this.duration || time));
    this.pendingSeek = target;
    if (this.seekTimer) clearTimeout(this.seekTimer);
    this.seekTimer = setTimeout(() => {
      this.seekTimer = null;
      const next = this.pendingSeek;
      this.pendingSeek = null;
      if (next != null) this.applySeek(next).catch(() => {});
    }, SEEK_DEBOUNCE);
  }

  async applySeek(time) {
    if (this.destroyed) return;
    if (Math.abs(this.video.currentTime - time) < 0.3 && !this.video.seeking) return;
    const { buffered } = this.video;
    for (let i = 0; i < buffered.length; i += 1) {
      if (time >= buffered.start(i) && time <= buffered.end(i) - 0.2) {
        this.video.currentTime = time;
        return;
      }
    }
    const wasPlaying = !this.video.paused;
    this.onStatus('seeking');
    await this.stopConversion();
    await this.setup(time, wasPlaying);
    if (this.destroyed) return;
    this.pump(this.generation).catch((error) => {
      if (error?.kind) this.onError(error);
    });
  }

  async stopConversion() {
    const conv = this.conv;
    const output = this.output;
    this.conv = null;
    this.output = null;
    try { await conv?.cancel(); } catch { /* gone */ }
    try { await output?.cancel(); } catch { /* gone */ }
  }

  async teardownPipeline() {
    await this.stopConversion();
    const ms = this.mediaSource;
    this.mediaSource = null;
    this.sb = null;
    if (ms && ms.readyState === 'open') {
      try { ms.endOfStream(); } catch { /* ignore */ }
    }
    this.releaseUrl();
  }

  releaseUrl() {
    if (this.objectUrl) {
      try { URL.revokeObjectURL(this.objectUrl); } catch { /* ignore */ }
      this.objectUrl = '';
    }
  }

  async destroy() {
    this.destroyed = true;
    this.generation += 1;
    if (this.seekTimer) clearTimeout(this.seekTimer);
    await this.teardownPipeline();
    try { this.input?.dispose?.(); } catch { /* ignore */ }
    try { this.input?.close?.(); } catch { /* ignore */ }
    this.input = null;
  }
}

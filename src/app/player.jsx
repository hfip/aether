import { useCallback, useEffect, useRef, useState } from 'react';
import { episodeLabel, fetchSubtitles, streamFormat } from './api.js';
import { Icon, Spinner } from './components.jsx';
import { loadDash } from './media.js';
import { Remuxer } from './remux.js';
import { loadPrefs, savePrefs } from './prefs.js';
import { cueTextAt, fetchSubtitleCues, languageLabel, pickArabicTrack } from './subtitles.js';
import { PlayerSettingsSheet, SubtitlePickerSheet } from './player-settings.jsx';

const ERROR_TEXT = {
  1: 'تم إلغاء التحميل.',
  2: 'تعذر تحميل الشبكة. قد يكون الرابط منتهيًا أو محميًا.',
  3: 'تعذر فك ترميز الفيديو. الصيغة قد لا يدعمها WebKit.',
  4: 'هذا المصدر غير مدعوم في المشغل المدمج.',
};

function dashErrorText(event) {
  const error = event?.error || event || {};
  const raw = `${error.message || ''} ${error.code || ''} ${error.data || ''}`;
  if (/cenc|widevine|playready|clearkey|drm|content[ _-]?protection/i.test(raw)) {
    return 'هذا البث مشفّر (DRM) ولا يمكن تشغيله داخل أثير.';
  }
  if (/manifest|mpd|4\d\d|network|failed to load|xhr|bad response/i.test(raw)) {
    return 'تعذر تحميل ملف البث (DASH). قد يكون الرابط منتهيًا أو محميًا.';
  }
  if (/codec|not supported|unsupported|MEDIA_ERR/i.test(raw)) {
    return 'ترميز هذا البث لا يدعمه WebKit.';
  }
  return 'تعذر تشغيل هذا المصدر في المشغل المدمج.';
}

export default function Player({
  session, addons = [], initialProgress = 0, onClose, onProgress, copy, toast,
  nextEpisode = null, onPlayNext,
}) {
  const { stream, meta, type, id, episode } = session;
  const sourceFormat = streamFormat(stream.url);
  const initialMode = sourceFormat === 'dash' ? 'dash' : sourceFormat === 'remux' ? 'remux' : 'native';

  const videoRef = useRef(null);
  const remuxRef = useRef(null);
  const lastSave = useRef(0);
  const resumedRef = useRef(false);
  const startAtRef = useRef(initialProgress);
  const durationRef = useRef(0);
  const subsTouched = useRef(false);
  const nextTimer = useRef(null);

  const [mode, setMode] = useState(initialMode);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [resumed, setResumed] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  const [sheet, setSheet] = useState('');
  const [mediaInfo, setMediaInfo] = useState(null);
  const [bufferedAhead, setBufferedAhead] = useState(0);
  const [pipReady, setPipReady] = useState(false);
  const [statsRows, setStatsRows] = useState([]);

  const [subTracks, setSubTracks] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsError, setSubsError] = useState('');
  const [activeSub, setActiveSub] = useState(null);
  const [cues, setCues] = useState(null);
  const [subText, setSubText] = useState('');

  const [sleepMinutes, setSleepMinutes] = useState(0);
  const [sleepKey, setSleepKey] = useState(0);
  const [sleepRemaining, setSleepRemaining] = useState(null);

  const [upNextIn, setUpNextIn] = useState(0);
  const [ended, setEnded] = useState(false);

  const totalDuration = mode === 'remux' && durationRef.current > 0
    ? durationRef.current
    : (Number.isFinite(videoRef.current?.duration) && videoRef.current.duration > 0
      ? videoRef.current.duration
      : durationRef.current);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  const patchPrefs = (patch) => setPrefs((current) => ({ ...current, ...patch }));

  /* ------------------------------------------------------------- session */

  useEffect(() => {
    const nextMode = streamFormat(stream.url) === 'dash'
      ? 'dash'
      : streamFormat(stream.url) === 'remux' ? 'remux' : 'native';
    setMode(nextMode);
    setError('');
    setReady(false);
    setSyncing(false);
    setBlocked(false);
    setResumed(false);
    setMediaInfo(null);
    setBufferedAhead(0);
    setCues(null);
    setSubText('');
    setActiveSub(null);
    setUpNextIn(0);
    setEnded(false);
    resumedRef.current = false;
    subsTouched.current = false;
    startAtRef.current = initialProgress;
    lastSave.current = 0;
    durationRef.current = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stream.key]);

  const save = (force = false) => {
    const video = videoRef.current;
    if (!video) return;
    const duration = mode === 'remux' && durationRef.current > 0 ? durationRef.current : video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const now = Date.now();
    if (!force && now - lastSave.current < 4500) return;
    lastSave.current = now;
    onProgress({
      key: `${type}:${id}`,
      type,
      metaId: meta.id,
      playId: id,
      name: meta.name,
      poster: meta.poster || '',
      background: meta.background || '',
      season: episode ? Number(episode.season) : null,
      episode: episode ? Number(episode.episode) : null,
      episodeId: episode?.id || '',
      episodeName: episode?.name || '',
      episodeLabel: episode ? episodeLabel(episode) : '',
      time: Math.min(video.currentTime, duration - 1),
      duration,
      updated: now,
      completed: false,
    });
  };

  const close = () => {
    save(true);
    onClose();
  };

  const updateBuffered = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const time = video.currentTime;
    let end = time;
    for (let i = 0; i < video.buffered.length; i += 1) {
      if (video.buffered.start(i) <= time + 0.5 && video.buffered.end(i) > end) end = video.buffered.end(i);
    }
    setBufferedAhead(Math.max(0, end - time));
  }, []);

  const applyResume = () => {
    const video = videoRef.current;
    if (!video || resumedRef.current || mode === 'remux') return;
    const target = startAtRef.current;
    if (!(target > 20)) return;
    if (Number.isFinite(video.duration) && video.duration > 0 && video.duration <= target + 30) return;
    try {
      video.currentTime = target;
      resumedRef.current = true;
      setResumed(true);
    } catch {
      // Some streams refuse early seeks; playback still starts.
    }
  };

  const startPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    const attempt = video.play?.();
    if (attempt?.then) attempt.then(() => setBlocked(false)).catch(() => setBlocked(true));
  };

  /* ---------------------------------------------------------------- DASH */

  useEffect(() => {
    if (mode !== 'dash') return undefined;
    const video = videoRef.current;
    if (!video) return undefined;

    let dead = false;
    let player = null;
    const fail = (message) => { if (!dead) setError(message); };

    (async () => {
      const lib = await loadDash().catch(() => null);
      if (dead) return;
      if (!lib) { fail('تعذر تحميل مشغل DASH. تحقق من اتصالك بالإنترنت.'); return; }
      try {
        try { video.disableRemotePlayback = true; } catch { /* older WebKit */ }
        player = lib.MediaPlayer().create();
        player.on('error', (event) => fail(dashErrorText(event)));
        player.on('playbackMetaDataLoaded', () => {
          if (dead) return;
          setReady(true);
          applyResume();
        });
        player.on('canPlay', () => {
          if (dead) return;
          setReady(true);
          applyResume();
          startPlayback();
        });
        player.initialize(video, stream.url, false);
      } catch {
        fail('تعذر بدء مشغل DASH لهذا الرابط.');
      }
    })();

    return () => {
      dead = true;
      try { player?.reset(); } catch { /* already torn down */ }
      try {
        video.removeAttribute('src');
        video.load?.();
      } catch { /* going away */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, stream.key, stream.url]);

  /* --------------------------------------------------------------- remux */

  useEffect(() => {
    if (mode !== 'remux') return undefined;
    const video = videoRef.current;
    if (!video) return undefined;

    let dead = false;
    let remuxer = null;

    (async () => {
      try {
        remuxer = new Remuxer(video, stream.url, {
          onStatus: (next) => {
            if (dead) return;
            if (next === 'seeking') setSyncing(true);
            if (next === 'ready') { setSyncing(false); setReady(true); }
            if (next === 'blocked') setBlocked(true);
          },
          onError: (failure) => {
            if (!dead) setError(failure?.message || 'تعذر تشغيل هذا الملف.');
          },
          onProgress: (progress) => {
            if (dead) return;
            setBufferedAhead(Math.max(0, progress.buffered - video.currentTime));
          },
        });
        remuxRef.current = remuxer;
        const info = await remuxer.open();
        if (dead) { remuxer.destroy(); return; }
        setMediaInfo(info);
        durationRef.current = info.duration;
        if (info.notice) toast(info.notice);
        if (startAtRef.current > 20) setResumed(true);
        await remuxer.start(startAtRef.current, true);
      } catch (failure) {
        if (!dead) setError(failure?.message || 'تعذر تشغيل ملف MKV.');
      }
    })();

    return () => {
      dead = true;
      remuxRef.current = null;
      remuxer?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, stream.key, stream.url]);

  /* ------------------------------------------------------------- player */

  useEffect(() => {
    if (!videoRef.current) return;
    if (videoRef.current.playbackRate !== prefs.speed) {
      videoRef.current.playbackRate = prefs.speed;
    }
  }, [prefs.speed, ready, mode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setPipReady(typeof video.webkitSetPresentationMode === 'function' || typeof video.requestPictureInPicture === 'function');
  }, [mode, ready]);

  useEffect(() => {
    if (!prefs.stats) return undefined;
    const tick = () => {
      const video = videoRef.current;
      if (!video) return;
      const quality = typeof video.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null;
      const rows = [
        { label: 'الوضع', value: mode === 'remux' ? 'MKV → MP4' : mode === 'dash' ? 'DASH' : 'مباشر' },
        { label: 'الجودة', value: video.videoWidth ? `${video.videoWidth}×${video.videoHeight}` : '—' },
        { label: 'الصوت', value: mediaInfo?.audioCodec || (mode === 'remux' ? '—' : 'WebKit') },
        { label: 'المخزون', value: `${bufferedAhead.toFixed(0)} ث` },
        { label: 'المدة', value: totalDuration ? `${Math.floor(totalDuration / 60)} د` : '—' },
      ];
      if (quality) rows.push({ label: 'إطارات مسقطة', value: String(quality.droppedVideoFrames || 0) });
      setStatsRows(rows);
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [prefs.stats, mode, bufferedAhead, mediaInfo, totalDuration]);

  /* ---------------------------------------------------------- subtitles */

  const loadSubtitleList = useCallback(async () => {
    setSubsLoading(true);
    setSubsError('');
    try {
      const tracks = await fetchSubtitles(addons, type, id);
      setSubTracks(tracks);
      if (!subsTouched.current && !activeSub) {
        const arabic = pickArabicTrack(tracks);
        if (arabic) selectSubtitle(arabic);
      }
      if (!tracks.length) setSubsError('');
    } catch {
      setSubsError('تعذر جلب الترجمات من الإضافات.');
    } finally {
      setSubsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id, addons, activeSub]);

  // Stremio hands the subtitle resource to addons, so the list is fetched
  // once per title and refreshed only when the addon set changes.
  useEffect(() => {
    if (!addons.length) return;
    loadSubtitleList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id]);

  const selectSubtitle = async (track) => {
    subsTouched.current = true;
    setActiveSub(track);
    setSheet('');
    if (!track) {
      setCues(null);
      setSubText('');
      return;
    }
    setSubsLoading(true);
    setSubsError('');
    try {
      const parsed = await fetchSubtitleCues(track.url);
      setCues(parsed);
      setSubText('');
      toast(`الترجمة: ${track.addonName}`);
    } catch {
      setCues(null);
      setActiveSub(null);
      toast('تعذر تحميل ملف الترجمة.');
    } finally {
      setSubsLoading(false);
    }
  };

  useEffect(() => {
    if (!cues) return undefined;
    let frame = 0;
    const timer = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const text = cueTextAt(cues, video.currentTime + prefs.subDelay);
      if (text !== frame) {
        frame = text;
        setSubText(text);
      }
    }, 250);
    return () => clearInterval(timer);
  }, [cues, prefs.subDelay]);

  /* -------------------------------------------------------- sleep timer */

  useEffect(() => {
    if (!sleepMinutes) {
      setSleepRemaining(null);
      return undefined;
    }
    const deadline = Date.now() + sleepMinutes * 60000;
    setSleepRemaining(sleepMinutes * 60);
    const timer = setInterval(() => {
      const left = Math.max(0, Math.round((deadline - Date.now()) / 1000));
      setSleepRemaining(left);
      if (left <= 0) {
        clearInterval(timer);
        videoRef.current?.pause?.();
        setSleepMinutes(0);
        toast('مؤقت النوم: أُوقف التشغيل.');
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepMinutes, sleepKey]);

  /* ----------------------------------------------------------- up next */

  useEffect(() => () => {
    if (nextTimer.current) clearInterval(nextTimer.current);
  }, []);

  const startNextCountdown = () => {
    if (!nextEpisode || !onPlayNext) return;
    let left = 8;
    setUpNextIn(left);
    if (nextTimer.current) clearInterval(nextTimer.current);
    nextTimer.current = setInterval(() => {
      left -= 1;
      setUpNextIn(left > 0 ? left : 0);
      if (left <= 0) {
        clearInterval(nextTimer.current);
        nextTimer.current = null;
        onPlayNext(nextEpisode);
      }
    }, 1000);
  };

  const cancelNext = () => {
    if (nextTimer.current) clearInterval(nextTimer.current);
    nextTimer.current = null;
    setUpNextIn(0);
  };

  /* ------------------------------------------------------------ events */

  const onLoadedMetadata = () => {
    setReady(true);
    applyResume();
    updateBuffered();
  };

  const onVideoError = () => {
    const code = videoRef.current?.error?.code;
    if (mode === 'native' && sourceFormat === 'file' && code === 4) {
      // A container WebKit cannot demux (MKV under another name, TS, …):
      // hand it to the remuxer once before giving up.
      setReady(false);
      setMode('remux');
      return;
    }
    setError(ERROR_TEXT[code] || 'تعذر تشغيل هذا المصدر في المشغل المدمج.');
  };

  const onEnded = () => {
    setEnded(true);
    const duration = totalDuration || videoRef.current?.duration || 0;
    onProgress({
      key: `${type}:${id}`,
      type,
      metaId: meta.id,
      playId: id,
      name: meta.name,
      poster: meta.poster || '',
      background: meta.background || '',
      season: episode ? Number(episode.season) : null,
      episode: episode ? Number(episode.episode) : null,
      episodeId: episode?.id || '',
      episodeName: episode?.name || '',
      episodeLabel: episode ? episodeLabel(episode) : '',
      time: 0,
      duration,
      updated: Date.now(),
      completed: true,
    });
    if (nextEpisode && prefs.autoNext) startNextCountdown();
    else if (nextEpisode) setUpNextIn(0);
  };

  const togglePip = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (typeof video.webkitSetPresentationMode === 'function') {
        video.webkitSetPresentationMode(
          video.webkitPresentationMode === 'picture-in-picture' ? 'inline' : 'picture-in-picture',
        );
      } else if (typeof video.requestPictureInPicture === 'function') {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else await video.requestPictureInPicture();
      }
    } catch {
      toast('تعذر فتح صورة داخل صورة.');
    }
  };

  const handleSeeking = () => {
    if (mode !== 'remux') return;
    const video = videoRef.current;
    if (!video) return;
    remuxRef.current?.seek(video.currentTime);
  };

  const copyForEngine = async () => {
    const ok = await copy(stream.url);
    toast(ok ? 'تم نسخ الرابط. افتح AetherPlayer ← Open ← ألصق الرابط.' : 'تعذر نسخ الرابط.');
  };

  /* -------------------------------------------------------------- view */

  const title = meta.name;
  const subtitle = episode ? episodeLabel(episode) : (type === 'series' ? 'مسلسل' : 'فيلم');
  const loading = !ready && !error && !syncing;
  const isLoadingRemux = mode === 'remux' && !ready && !error;
  const aspectClass = prefs.aspect === 'cover' ? ' cover' : '';

  return (
    <div className="player" dir="rtl">
      <video
        key={`${mode}:${stream.key}`}
        ref={videoRef}
        className={`player-video${aspectClass}`}
        src={mode === 'native' ? stream.url : undefined}
        controls
        autoPlay
        playsInline
        preload="metadata"
        poster={meta.background || meta.poster || undefined}
        onLoadedMetadata={onLoadedMetadata}
        onCanPlay={() => { setReady(true); applyResume(); updateBuffered(); }}
        onTimeUpdate={() => { save(false); updateBuffered(); }}
        onSeeking={handleSeeking}
        onPause={() => save(true)}
        onEnded={onEnded}
        onError={onVideoError}
      />

      <div className="player-top">
        <button type="button" className="player-close" onClick={close} aria-label="إغلاق المشغل">
          <Icon name="close" size={21} />
        </button>
        <div className="player-meta">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <button
          type="button"
          className={`player-copy ${activeSub ? 'on' : ''}`}
          onClick={() => setSheet('subs')}
          aria-label="الترجمة"
        >
          <Icon name="captions" size={19} />
        </button>
        <button
          type="button"
          className="player-copy"
          onClick={() => setSheet('settings')}
          aria-label="إعدادات المشغل"
        >
          <Icon name="settings" size={18} />
        </button>
      </div>

      {loading && (
        <div className="player-loading">
          <Spinner size={30} />
          <span>{isLoadingRemux ? 'أفتح MKV وأحوّله أثناء التشغيل…' : 'أفتح البث…'}</span>
        </div>
      )}

      {syncing && !error && (
        <div className="player-loading">
          <Spinner size={26} />
          <span>أعيد المزامنة من هذا الموضع…</span>
        </div>
      )}

      {blocked && !error && ready && (
        <button type="button" className="player-start" onClick={startPlayback} aria-label="تشغيل">
          <Icon name="play" size={30} />
        </button>
      )}

      {resumed && !error && (
        <div className="player-resume-note">تمت المتابعة من {Math.floor(startAtRef.current / 60)} دقيقة</div>
      )}

      {prefs.stats && ready && !error && statsRows.length > 0 && (
        <div className="player-stats" dir="ltr">
          {statsRows.map((row) => (
            <div key={row.label}>
              <span>{row.label}</span>
              <b>{row.value}</b>
            </div>
          ))}
        </div>
      )}

      {subText && !error && (
        <div className={`player-subs pos-${prefs.subPosition} size-${prefs.subSize} bg-${prefs.subBackground}`}>
          {subText.split('\n').map((line, index) => (
            <span key={`${index}-${line}`} className="player-sub-line">{line}</span>
          ))}
        </div>
      )}

      {sleepRemaining != null && sleepRemaining > 0 && !error && (
        <div className="player-sleep">مؤقت النوم · {Math.floor(sleepRemaining / 60)}:{String(sleepRemaining % 60).padStart(2, '0')}</div>
      )}

      {upNextIn > 0 && !error && (
        <div className="player-next">
          <div>
            <small>بعد {upNextIn} ثانية</small>
            <strong>{nextEpisode ? episodeLabel(nextEpisode) : 'الحلقة التالية'}</strong>
            {nextEpisode?.name && <span>{nextEpisode.name}</span>}
          </div>
          <div className="player-next-actions">
            <button type="button" className="btn-primary compact" onClick={() => { cancelNext(); onPlayNext?.(nextEpisode); }}>شغّل الآن</button>
            <button type="button" className="btn-quiet" onClick={cancelNext}>إلغاء</button>
          </div>
        </div>
      )}

      {!upNextIn && nextEpisode && ended && !error && (
        <div className="player-next">
          <div>
            <small>انتهت الحلقة</small>
            <strong>{episodeLabel(nextEpisode)}</strong>
          </div>
          <div className="player-next-actions">
            <button type="button" className="btn-primary compact" onClick={() => onPlayNext?.(nextEpisode)}>الحلقة التالية</button>
          </div>
        </div>
      )}

      {error && (
        <div className="player-error">
          <span className="player-error-icon"><Icon name="info" size={27} /></span>
          <h2>لم يعمل هذا المصدر هنا</h2>
          <p>{error}</p>
          <p className="player-error-help">
            الملفات المشفّرة (DRM) أو التي لا تسمح بالوصول من المتصفح (CORS) تحتاج AetherEngine.
            {' '}انسخ الرابط وشغّله في AetherPlayer.
          </p>
          <button type="button" className="btn-primary full" onClick={copyForEngine}>
            <Icon name="copy" size={17} /> نسخ الرابط لـ AetherPlayer
          </button>
          <button type="button" className="btn-quiet" onClick={close}>إغلاق</button>
        </div>
      )}

      {sheet === 'settings' && (
        <PlayerSettingsSheet
          prefs={prefs}
          patch={patchPrefs}
          onClose={() => setSheet('')}
          stats={{ rows: statsRows }}
          mode={mode}
          pipAvailable={pipReady}
          onPip={() => { setSheet(''); togglePip(); }}
          onCopy={copyForEngine}
          sleepMinutes={sleepMinutes}
          sleepRemaining={sleepRemaining}
          onSleep={(minutes) => { setSleepMinutes(minutes); setSleepKey((key) => key + 1); }}
          subtitleLabel={activeSub ? `${activeSub.addonName} · ${languageLabel(activeSub.lang)}` : null}
          onOpenSubtitles={() => setSheet('subs')}
        />
      )}

      {sheet === 'subs' && (
        <SubtitlePickerSheet
          tracks={subTracks}
          loading={subsLoading}
          error={subsError}
          activeKey={activeSub?.key || ''}
          onPick={selectSubtitle}
          onClose={() => setSheet('')}
        />
      )}
    </div>
  );
}

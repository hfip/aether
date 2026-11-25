import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_ADDON_URL,
  addonSupports,
  episodeLabel,
  episodesFor,
  fetchCatalog,
  fetchMeta,
  fetchStreams,
  firstEpisodeFor,
  homeCatalogs,
  loadAddon,
  searchCatalog,
  searchCatalogs,
  seasonsFor,
  typeLabel,
  youtubeUrl,
} from './api.js';
import {
  AddonAvatar,
  Chip,
  EmptyState,
  Icon,
  MetaCard,
  Poster,
  Rating,
  preferredImage,
  SectionHead,
  Segmented,
  Sheet,
  SkeletonHero,
  SkeletonShelf,
  Spinner,
  Toggle,
  formatTime,
} from './components.jsx';

/* ------------------------------------------------------------------ home */

function Hero({ meta, onPlay, onDetails }) {
  const isSeries = meta.type === 'series';
  const [backgroundFailed, setBackgroundFailed] = useState(false);
  useEffect(() => setBackgroundFailed(false), [meta.id]);
  const background = preferredImage(meta.background);
  return (
    <article className="hero">
      {background && !backgroundFailed ? (
        <img
          className="hero-image"
          src={background}
          alt=""
          referrerPolicy="no-referrer"
          onError={(event) => {
            if (meta.background && event.currentTarget.src !== meta.background) event.currentTarget.src = meta.background;
            else setBackgroundFailed(true);
          }}
        />
      ) : (
        <Poster src={meta.poster} alt="" className="hero-image hero-poster" />
      )}
      <div className="hero-shade" />
      <div className="hero-content">
        <span className="hero-kicker"><span className="live-dot" /> {isSeries ? 'مسلسل مميز' : 'فيلم مميز'}</span>
        <h2>{meta.name}</h2>
        <div className="hero-meta">
          {meta.imdbRating ? <span className="hero-rating"><Icon name="star" size={12} /> {meta.imdbRating}</span> : null}
          {meta.releaseInfo ? <span>{meta.releaseInfo}</span> : null}
          {meta.runtime ? <span>{meta.runtime}</span> : null}
          {meta.genres?.[0] ? <span>{meta.genres[0]}</span> : null}
        </div>
        {meta.description && <p className="hero-description">{meta.description}</p>}
        <div className="hero-actions">
          <button type="button" className="btn-primary" onClick={() => onPlay(meta)}>
            <Icon name={isSeries ? 'tv' : 'play'} size={19} />
            {isSeries ? 'الحلقات' : 'تشغيل'}
          </button>
          <button type="button" className="btn-round" onClick={() => onDetails(meta)} aria-label="التفاصيل">
            <Icon name="info" size={21} />
          </button>
        </div>
      </div>
    </article>
  );
}

function ContinueCard({ item, onResume }) {
  const progress = item.duration > 0 ? Math.min(100, Math.max(2, (item.time / item.duration) * 100)) : 3;
  return (
    <button type="button" className="continue-card" onClick={() => onResume(item)}>
      <Poster src={item.background || item.poster} alt="" wide className="continue-art">
        <span className="continue-play"><Icon name="play" size={17} /></span>
        <span className="continue-progress" style={{ width: `${progress}%` }} />
      </Poster>
      <span className="continue-title">{item.name}</span>
      <span className="continue-sub">{item.episodeLabel || typeLabel(item.type)} · {formatTime(item.time)}</span>
    </button>
  );
}

function ContinueShelf({ items, onResume }) {
  if (!items.length) return null;
  return (
    <section className="shelf continue-shelf">
      <SectionHead title="متابعة المشاهدة" meta={`${items.length} ${items.length === 1 ? 'عمل' : 'أعمال'}`} />
      <div className="shelf-track continue-track">
        {items.map((item) => <ContinueCard key={item.key} item={item} onResume={onResume} />)}
      </div>
    </section>
  );
}

export function Home({ addons, continueItems, onOpenMeta, onPlayMeta, onResume, onSettings, onRetry, bootError, booting, refresh }) {
  const [type, setType] = useState('movie');
  const rows = useMemo(() => homeCatalogs(addons, type), [addons, type]);
  const signature = rows.map((row) => row.key).join('|');
  const [data, setData] = useState({});
  const [phase, setPhase] = useState('loading');

  useEffect(() => {
    let dead = false;
    setData({});
    if (!rows.length) {
      setPhase('empty');
      return undefined;
    }
    setPhase('loading');
    let pending = rows.length;
    const finish = () => {
      pending -= 1;
      if (!dead && pending <= 0) setPhase('ready');
    };
    rows.forEach((row) => {
      fetchCatalog(row)
        .then((items) => {
          if (dead) return;
          setData((current) => ({ ...current, [row.key]: { items, error: '' } }));
        })
        .catch((error) => {
          if (dead) return;
          setData((current) => ({ ...current, [row.key]: { items: [], error: error.message || 'تعذر تحميل هذا الصف.' } }));
        })
        .finally(finish);
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, refresh]);

  const entries = rows.map((row) => ({ row, ...(data[row.key] || {}) }));
  const filled = entries.filter((entry) => entry.items?.length);
  const pool = filled.slice(0, 2).flatMap((entry) => entry.items.slice(0, 5));
  const featured = pool.find((meta) => meta.background) || pool[0] || null;
  const failed = rows.length > 0 && phase === 'ready' && filled.length === 0;

  return (
    <div className="page home-page">
      <header className="topbar">
        <div className="brand">
          <span className="brand-orb" aria-hidden="true"><span /></span>
          <div>
            <h1>أثير</h1>
            <p>STREMIO ADDONS</p>
          </div>
        </div>
        <button type="button" className="icon-button" onClick={onSettings} aria-label="الإضافات">
          <Icon name="settings" size={20} />
          {addons.length > 0 && <span className="count-dot">{addons.length}</span>}
        </button>
      </header>

      <Segmented
        value={type}
        onChange={setType}
        options={[{ value: 'movie', label: 'أفلام' }, { value: 'series', label: 'مسلسلات' }]}
      />

      {booting && !addons.length && <SkeletonHero />}

      {!booting && !addons.length && (
        <div className="onboarding">
          <EmptyState
            icon={bootError ? 'info' : 'sparkle'}
            title={bootError ? 'تعذر تجهيز البداية' : 'أضف إضافتك الأولى'}
            text={bootError || 'أضف رابط إضافة ستريمو لتبدأ الاكتشاف. Cinemeta تأتي جاهزة عادةً، ويمكنك إضافة مصادر البث التي تثق بها.'}
            action={bootError ? 'إعادة المحاولة' : 'فتح الإضافات'}
            onAction={bootError ? onRetry : onSettings}
          />
        </div>
      )}

      {!!addons.length && phase === 'loading' && !filled.length && (
        <>
          <SkeletonHero />
          <SkeletonShelf />
          <SkeletonShelf />
        </>
      )}

      {!!addons.length && phase === 'ready' && failed && (
        <div className="onboarding">
          <EmptyState
            icon="globe"
            title="تعذر تحميل الكتالوجات"
            text="الإضافات موجودة لكنها لم ترد. تحقق من الاتصال أو من أن الإضافة تسمح بالطلبات من المتصفح."
            action="إعادة المحاولة"
            onAction={onRetry}
            secondary="إدارة الإضافات"
            onSecondary={onSettings}
          />
        </div>
      )}

      {!!addons.length && phase === 'empty' && (
        <div className="onboarding">
          <EmptyState
            icon="settings"
            title="لا كتالوجات ظاهرة"
            text="الإضافات مثبتة لكن لا توجد كتالوجات مفعّلة لهذا النوع. فعّل إضافة أو أضف أخرى."
            action="إدارة الإضافات"
            onAction={onSettings}
          />
        </div>
      )}

      {!!addons.length && featured && (
        <Hero
          meta={featured}
          onPlay={onPlayMeta}
          onDetails={onOpenMeta}
        />
      )}

      {!!addons.length && !failed && <ContinueShelf items={continueItems} onResume={onResume} />}

      {!!addons.length && entries.map(({ row, items, error }) => (
        items?.length ? (
          <section className="shelf" key={row.key}>
            <SectionHead title={row.title} meta={row.addonName} />
            <div className="shelf-track">
              {items.slice(0, 20).map((meta) => <MetaCard key={`${meta.addonKey}:${meta.type}:${meta.id}`} meta={meta} onOpen={onOpenMeta} />)}
            </div>
          </section>
        ) : error ? (
          <section className="shelf" key={row.key}>
            <SectionHead title={row.title} meta={row.addonName} />
            <p className="row-error">{error}</p>
          </section>
        ) : null
      ))}

      {!!addons.length && filled.length > 0 && (
        <p className="home-footnote">المحتوى والبيانات من الإضافات التي تضيفها. أثير لا يستضيف وسائط.</p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- search */

const QUICK_SEARCHES = ['Dune', 'Batman', 'Breaking Bad', 'The Bear', 'Oppenheimer', 'Severance'];

export function Search({ addons, onOpenMeta, onSettings }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState('movie');
  const [results, setResults] = useState([]);
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const requestNo = useRef(0);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) {
      requestNo.current += 1;
      setPhase('idle');
      setResults([]);
      setError('');
      return undefined;
    }
    const current = ++requestNo.current;
    setPhase('searching');
    setError('');
    const timer = setTimeout(async () => {
      const rows = searchCatalogs(addons, type);
      if (!rows.length) {
        if (current === requestNo.current) {
          setResults([]);
          setPhase('done');
          setError('لا توجد إضافة مفعّلة تدعم البحث في هذا النوع.');
        }
        return;
      }
      const batches = await Promise.all(rows.map(async (row) => {
        try {
          return await searchCatalog(row, text);
        } catch {
          return [];
        }
      }));
      if (current !== requestNo.current) return;
      const seen = new Set();
      const merged = [];
      for (const meta of batches.flat()) {
        const key = `${meta.type}:${meta.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(meta);
      }
      setResults(merged.slice(0, 60));
      setPhase('done');
    }, 380);
    return () => clearTimeout(timer);
  }, [query, type, addons]);

  return (
    <div className="page search-page">
      <header className="page-head">
        <div>
          <span className="eyebrow">اكتشف</span>
          <h1>البحث</h1>
        </div>
        <button type="button" className="icon-button" onClick={onSettings} aria-label="الإضافات">
          <Icon name="settings" size={20} />
        </button>
      </header>

      <div className="search-box">
        <Icon name="search" size={19} />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ابحث عن فيلم أو مسلسل"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          aria-label="البحث"
        />
        {query && (
          <button type="button" className="clear-search" onClick={() => setQuery('')} aria-label="مسح البحث">
            <Icon name="close" size={15} />
          </button>
        )}
      </div>

      <Segmented
        value={type}
        onChange={setType}
        options={[{ value: 'movie', label: 'أفلام' }, { value: 'series', label: 'مسلسلات' }]}
      />

      {phase === 'idle' && (
        <div className="search-idle">
          <p className="eyebrow">جرّب</p>
          <div className="quick-row">
            {QUICK_SEARCHES.map((word) => (
              <button key={word} type="button" className="quick-chip" onClick={() => setQuery(word)}>{word}</button>
            ))}
          </div>
          <div className="search-hint">
            <Icon name="globe" size={22} />
            <p>البحث يمر عبر إضافاتك المفعّلة، وليس عبر خدمة واحدة.</p>
          </div>
        </div>
      )}

      {phase === 'searching' && (
        <div className="search-loading"><Spinner size={24} /><span>أبحث في إضافاتك…</span></div>
      )}

      {phase === 'done' && results.length > 0 && (
        <>
          <div className="results-head"><span>{results.length} نتيجة</span><span>{query}</span></div>
          <div className="meta-grid">
            {results.map((meta) => <MetaCard key={`${meta.addonKey}:${meta.type}:${meta.id}`} meta={meta} onOpen={onOpenMeta} />)}
          </div>
        </>
      )}

      {phase === 'done' && results.length === 0 && (
        <EmptyState
          icon="search"
          title="لا نتائج"
          text={error || 'جرّب كلمة أخرى، أو بدّل بين الأفلام والمسلسلات.'}
          action="إدارة الإضافات"
          onAction={onSettings}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- library */

export function Library({ continueItems, saved, onResume, onOpenMeta, onExplore }) {
  return (
    <div className="page library-page">
      <header className="page-head">
        <div>
          <span className="eyebrow">على هذا الجهاز</span>
          <h1>قائمتي</h1>
        </div>
        <span className="head-count">{saved.length + continueItems.length}</span>
      </header>

      {!continueItems.length && !saved.length && (
        <EmptyState
          icon="bookmark"
          title="قائمتك فارغة"
          text="احفظ الأعمال التي تعجبك، وستجد هنا ما توقفت عنده."
          action="اكتشف الآن"
          onAction={onExplore}
        />
      )}

      <ContinueShelf items={continueItems} onResume={onResume} />

      {saved.length > 0 && (
        <section className="library-saved">
          <SectionHead title="محفوظاتك" meta={`${saved.length}`} />
          <div className="meta-grid">
            {saved.map((meta) => <MetaCard key={`${meta.type}:${meta.id}`} meta={{ ...meta, addonKey: meta.addonKey || '' }} onOpen={onOpenMeta} />)}
          </div>
        </section>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- settings */

function AddonRow({ addon, onToggle, onRefresh, onRemove, busy }) {
  return (
    <div className={`addon-row ${addon.enabled ? '' : 'off'}`}>
      <AddonAvatar addon={addon} size={46} />
      <div className="addon-info">
        <div className="addon-title-line">
          <strong>{addon.manifest.name}</strong>
          {addon.manifest.version && <span className="addon-version">v{addon.manifest.version}</span>}
        </div>
        <p className="addon-desc">{addon.manifest.description || new URL(addon.base).hostname}</p>
        <p className="addon-host" dir="ltr">{new URL(addon.base).hostname}</p>
      </div>
      <div className="addon-actions">
        <Toggle checked={addon.enabled} onChange={() => onToggle(addon.key)} label={`تفعيل ${addon.manifest.name}`} />
        <div className="addon-buttons">
          <button type="button" className="mini-icon" onClick={() => onRefresh(addon)} aria-label="تحديث" disabled={busy}>
            {busy ? <Spinner size={14} /> : <Icon name="refresh" size={16} />}
          </button>
          <button type="button" className="mini-icon danger" onClick={() => onRemove(addon)} aria-label="إزالة">
            <Icon name="trash" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AddonSheet({ onClose, onAdd, toast }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const addon = await loadAddon(url);
      await onAdd(addon);
      toast(`تمت إضافة ${addon.manifest.name}`);
      onClose();
    } catch (err) {
      setError(err.message || 'تعذرت إضافة الإضافة.');
      setBusy(false);
    }
  };

  return (
    <Sheet onClose={onClose} label="إضافة جديدة">
      <div className="sheet-head">
        <div>
          <span className="eyebrow">STREMIO ADDON</span>
          <h2>إضافة جديدة</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="إغلاق"><Icon name="close" size={19} /></button>
      </div>
      <form className="sheet-body" onSubmit={submit}>
        <label className="field-label" htmlFor="addon-url">رابط البيان</label>
        <input
          id="addon-url"
          className="field"
          type="url"
          inputMode="url"
          dir="ltr"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com/manifest.json"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
          disabled={busy}
        />
        <p className="field-help">ألصق رابط <code>manifest.json</code> أو رابط صفحة الإضافة. يجب أن تسمح الإضافة بالوصول من المتصفح (CORS).</p>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn-primary full" disabled={busy || !url.trim()}>
          {busy ? <><Spinner size={18} /> جارٍ التحقق…</> : <><Icon name="plus" size={18} /> تحقق وأضف</>}
        </button>
        <button type="button" className="suggest-row" onClick={() => setUrl(DEFAULT_ADDON_URL)} disabled={busy}>
          <span className="suggest-logo">C</span>
          <span><strong>Cinemeta</strong><small>بيانات الأفلام والمسلسلات — رسمية</small></span>
          <Icon name="plus" size={17} />
        </button>
        <p className="privacy-note"><Icon name="lock" size={14} /> لا نرسل عنوانك إلى أي خدمة وسيطة؛ الطلبات تذهب مباشرة إلى الإضافة.</p>
      </form>
    </Sheet>
  );
}

function EngineSheet({ onClose }) {
  return (
    <Sheet onClose={onClose} label="AetherEngine وAetherPlayer">
      <div className="sheet-head">
        <div>
          <span className="eyebrow">المشغل</span>
          <h2>AetherEngine في أثير</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="إغلاق"><Icon name="close" size={19} /></button>
      </div>
      <div className="sheet-body">
        <div className="engine-banner">
          <span className="engine-logo"><Icon name="sparkle" size={25} /></span>
          <div>
            <strong>محرك Swift أصلي</strong>
            <p>FFmpeg · VideoToolbox · Dolby Vision · TrueHD</p>
          </div>
        </div>
        <p className="prose">AetherEngine مكتبة Swift لتطبيقات Apple. لا يمكن تشغيلها داخل تطبيق ويب مصغّر؛ لذلك يستخدم أثير مشغل WebKit المدمج.</p>
        <ol className="steps">
          <li><b>انسخ رابط البث</b><span>من زر النسخ في المشغل أو في قائمة المصادر.</span></li>
          <li><b>افتح AetherPlayer</b><span>ثم تبويب Open ← Open URL.</span></li>
          <li><b>ألصق الرابط</b><span>سيتولى AetherEngine باقي الصيغ: MKV، Dolby Vision، TrueHD وغيرها.</span></li>
        </ol>
        <p className="privacy-note"><Icon name="info" size={14} /> هذا التطبيق واجهة مستقلة ولا يمثل AetherEngine أو AetherPlayer.</p>
        <button type="button" className="btn-primary full" onClick={onClose}>فهمت</button>
      </div>
    </Sheet>
  );
}

export function Settings({
  addons,
  saved,
  progress,
  onAddAddon,
  onUpdateAddon,
  onRemoveAddon,
  onToggleAddon,
  onClearProgress,
  onClearSaved,
  toast,
  onRefresh,
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [engineOpen, setEngineOpen] = useState(false);
  const [busyKey, setBusyKey] = useState('');

  const update = async (addon) => {
    setBusyKey(addon.key);
    try {
      const next = await loadAddon(addon.base);
      await onUpdateAddon(next);
      toast(`تم تحديث ${next.manifest.name}`);
    } catch (error) {
      toast(error.message || 'تعذر تحديث الإضافة');
    } finally {
      setBusyKey('');
    }
  };

  const remove = (addon) => {
    if (!window.confirm(`إزالة «${addon.manifest.name}»؟ ستبقى أعمالك المحفوظة.`)) return;
    onRemoveAddon(addon.key);
    toast('تمت إزالة الإضافة');
  };

  const clearProgress = () => {
    if (!window.confirm('مسح سجل المشاهدة وكل نقاط المتابعة؟')) return;
    onClearProgress();
    toast('تم مسح سجل المشاهدة');
  };

  const clearSaved = () => {
    if (!window.confirm(`مسح ${saved.length} من المحفوظات؟`)) return;
    onClearSaved();
    toast('تم مسح المحفوظات');
  };

  return (
    <div className="page settings-page">
      <header className="page-head">
        <div>
          <span className="eyebrow">إعدادات</span>
          <h1>الإضافات</h1>
        </div>
        <button type="button" className="btn-primary compact" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size={17} /> إضافة
        </button>
      </header>

      <div className="addon-summary">
        <div className="summary-ring"><span>{addons.filter((addon) => addon.enabled).length}</span><small>مفعّلة</small></div>
        <div>
          <strong>{addons.length ? `${addons.length} إضافة مثبتة` : 'لا توجد إضافات'}</strong>
          <p>الكتالوجات والبيانات والمصادر كلها من الإضافات.</p>
        </div>
        <button type="button" className="mini-icon" onClick={onRefresh} aria-label="تحديث الكل"><Icon name="refresh" size={17} /></button>
      </div>

      <div className="addon-list">
        {addons.length === 0 && (
          <EmptyState
            icon="plus"
            title="ابدأ بإضافة"
            text="ابدأ بـ Cinemeta لبيانات الأفلام، ثم أضف إضافات المصادر التي تستخدمها."
            action="إضافة الآن"
            onAction={() => setAddOpen(true)}
          />
        )}
        {addons.map((addon) => (
          <AddonRow
            key={addon.key}
            addon={addon}
            busy={busyKey === addon.key}
            onToggle={onToggleAddon}
            onRefresh={update}
            onRemove={remove}
          />
        ))}
      </div>

      <section className="settings-section">
        <SectionHead title="المشغل" meta="كيف يُعرض الفيديو" />
        <button type="button" className="setting-card" onClick={() => setEngineOpen(true)}>
          <span className="setting-icon"><Icon name="sparkle" size={21} /></span>
          <span className="setting-text">
            <strong>AetherEngine / AetherPlayer</strong>
            <small>تشغيل الصيغ الصعبة خارج تطبيق الويب</small>
          </span>
          <Icon name="back" size={18} className="flip-rtl" />
        </button>
        <div className="setting-card static">
          <span className="setting-icon plain"><Icon name="globe" size={20} /></span>
          <span className="setting-text">
            <strong>المشغل المدمج</strong>
            <small>WebKit · MP4 وHLS وDASH وMKV مباشرة داخل أثير</small>
          </span>
          <span className="status-pill">نشط</span>
        </div>
      </section>

      <section className="settings-section">
        <SectionHead title="البيانات" meta="محفوظة على هذا الجهاز فقط" />
        <button type="button" className="setting-row" onClick={clearProgress} disabled={!Object.keys(progress).length}>
          <span>سجل المشاهدة</span><small>{Object.keys(progress).length} عنصر</small><Icon name="trash" size={16} />
        </button>
        <button type="button" className="setting-row" onClick={clearSaved} disabled={!saved.length}>
          <span>المحفوظات</span><small>{saved.length} عنصر</small><Icon name="trash" size={16} />
        </button>
      </section>

      <section className="settings-section about-section">
        <p className="privacy-note"><Icon name="info" size={14} /> أثير واجهة مستقلة لإضافات ستريمو. لا يستضيف محتوى ولا يبيع اشتراكات. استخدم إضافات ومصادر تحترم الحقوق.</p>
        <p className="version-line">أثير · نسخة ويب مصغّرة · <span dir="ltr">v1.0</span></p>
      </section>

      {addOpen && <AddonSheet onClose={() => setAddOpen(false)} onAdd={onAddAddon} toast={toast} />}
      {engineOpen && <EngineSheet onClose={() => setEngineOpen(false)} />}
    </div>
  );
}

/* ---------------------------------------------------------------- detail */

export function Detail({ detail, addons, saved, onClose, onOpenStreams, onToggleSaved, toast, onSettings }) {
  const { type, id, preview } = detail;
  const [meta, setMeta] = useState(preview);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [season, setSeason] = useState(null);

  useEffect(() => {
    let dead = false;
    setMeta(preview);
    setSeason(null);
    setError('');
    setLoading(true);
    fetchMeta(addons, type, id, preview?.addonKey)
      .then((next) => { if (!dead) setMeta(next); })
      .catch((err) => { if (!dead) setError(err.message || 'تعذر تحميل التفاصيل.'); })
      .finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id]);

  const seasons = seasonsFor(meta);
  const activeSeason = seasons.includes(season) ? season : seasons[0];
  const episodes = useMemo(
    () => episodesFor(meta).filter((video) => Number(video.season) === Number(activeSeason)),
    [meta, activeSeason],
  );
  const isSeries = type === 'series';
  const isSaved = saved.some((item) => item.id === meta.id && item.type === type);
  const trailerId = meta.trailerStreams?.[0]?.ytId || meta.trailers?.[0]?.source || '';
  const primaryEpisode = isSeries ? firstEpisodeFor(meta, activeSeason) : null;

  const play = () => {
    if (isSeries && !primaryEpisode) {
      toast('لم تصل الحلقات بعد. جرّب إضافة بيانات أخرى.');
      return;
    }
    onOpenStreams(meta, primaryEpisode);
  };

  return (
    <div className="detail-screen">
      <div className="detail-nav">
        <button type="button" className="glass-button" onClick={onClose} aria-label="رجوع"><Icon name="back" size={22} /></button>
        <button
          type="button"
          className={`glass-button ${isSaved ? 'active' : ''}`}
          onClick={() => onToggleSaved(meta)}
          aria-label={isSaved ? 'إزالة من المحفوظات' : 'حفظ'}
        >
          <Icon name="bookmark" size={20} />
        </button>
      </div>

      <div className="detail-hero">
        {meta.background || meta.poster ? (
          <img
            src={preferredImage(meta.background || meta.poster)}
            alt=""
            referrerPolicy="no-referrer"
            onError={(event) => {
              const original = meta.background || meta.poster;
              if (original && event.currentTarget.src !== original) event.currentTarget.src = original;
              else if (meta.poster && event.currentTarget.src !== meta.poster) event.currentTarget.src = meta.poster;
              else event.currentTarget.style.visibility = 'hidden';
            }}
          />
        ) : null}
        <div className="detail-shade" />
      </div>

      <div className="detail-body">
        <div className="detail-lead">
          <Poster src={meta.poster} alt="" className="detail-poster" />
          <div className="detail-heading">
            <span className="eyebrow">{typeLabel(type)}{meta.addonName ? ` · ${meta.addonName}` : ''}</span>
            <h1>{meta.name}</h1>
            <div className="detail-meta">
              {meta.imdbRating ? <span className="rating-inline"><Icon name="star" size={12} /> {meta.imdbRating}</span> : null}
              {meta.releaseInfo ? <span>{meta.releaseInfo}</span> : null}
              {meta.runtime ? <span>{meta.runtime}</span> : null}
            </div>
          </div>
        </div>

        {meta.genres?.length > 0 && (
          <div className="genre-row">
            {meta.genres.slice(0, 4).map((genre) => <span className="genre" key={genre}>{genre}</span>)}
          </div>
        )}

        <div className="detail-actions">
          <button type="button" className="btn-primary" onClick={play} disabled={loading && isSeries}>
            {loading && isSeries ? <Spinner size={18} /> : <Icon name={isSeries ? 'tv' : 'play'} size={19} />}
            {isSeries ? 'اختر حلقة' : 'تشغيل'}
          </button>
          {trailerId && (
            <a className="btn-round" href={youtubeUrl(trailerId)} target="_blank" rel="noreferrer" aria-label="الإعلان">
              <Icon name="external" size={20} />
            </a>
          )}
        </div>

        {meta.description && <p className="detail-description">{meta.description}</p>}
        {error && <p className="form-error">{error}</p>}
        {loading && !error && <div className="detail-loading"><Spinner size={18} /><span>أكمل التفاصيل…</span></div>}

        {isSeries && (
          <section className="episodes-section">
            <SectionHead title="الحلقات" meta={episodes.length ? `${episodes.length} حلقة` : 'بانتظار البيانات'} />
            {seasons.length > 0 && (
              <div className="season-row">
                {seasons.map((number) => (
                  <Chip key={number} active={number === activeSeason} onClick={() => setSeason(number)}>
                    الموسم {number}
                  </Chip>
                ))}
              </div>
            )}
            <div className="episode-list">
              {episodes.map((video) => (
                <button type="button" className="episode-row" key={video.id || `${video.season}:${video.episode}`} onClick={() => onOpenStreams(meta, video)}>
                  <Poster src={video.thumbnail} alt="" wide className="episode-art">
                    <span className="episode-play"><Icon name="play" size={14} /></span>
                  </Poster>
                  <span className="episode-text">
                    <span className="episode-num">{episodeLabel(video)}</span>
                    <strong>{video.name || `الحلقة ${video.episode}`}</strong>
                    {video.overview && <small>{video.overview}</small>}
                  </span>
                  <Icon name="back" size={18} className="episode-chevron flip-rtl" />
                </button>
              ))}
              {!episodes.length && !loading && (
                <EmptyState
                  icon="tv"
                  title="لا توجد حلقات"
                  text="إضافة البيانات لم ترسل قائمة الحلقات. جرّب إضافة بيانات أخرى أو شغّل معرف المسلسل مباشرة."
                  action="فتح المصادر"
                  onAction={() => onOpenStreams(meta, null)}
                />
              )}
            </div>
          </section>
        )}

        {meta.cast?.length > 0 && (
          <section className="cast-section">
            <SectionHead title="طاقم العمل" />
            <div className="cast-row">
              {meta.cast.slice(0, 10).map((person) => <span className="cast-pill" key={person}>{person}</span>)}
            </div>
          </section>
        )}

        <div className="detail-footer">
          <button type="button" className="link-button" onClick={onSettings}>إدارة الإضافات <Icon name="back" size={14} className="flip-rtl" /></button>
          <span>البيانات من {meta.addonName || 'إضافة ستريمو'}</span>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- streams */

function StreamCard({ stream, onPlay, copy, toast }) {
  const metaLine = [stream.provider, stream.size, stream.seeders ? `👤 ${stream.seeders}` : ''].filter(Boolean).join(' · ');
  const isTorrent = !stream.url && !stream.externalUrl && !stream.ytId && stream.infoHash;
  const external = stream.externalUrl || (stream.ytId ? youtubeUrl(stream.ytId) : '');

  const content = (
    <>
      <span className={`stream-quality q-${stream.quality.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'sd'}`}>{stream.quality}</span>
      <span className="stream-main">
        <span className="stream-headline">{stream.headline}</span>
        <span className="stream-sub">
          {metaLine || stream.streamName}
          {stream.flags.length > 0 && <em>{stream.flags.join(' · ')}</em>}
        </span>
      </span>
      <span className="stream-action">
        <Icon name={stream.url ? 'play' : isTorrent ? 'magnet' : 'external'} size={18} />
      </span>
    </>
  );

  if (stream.url) {
    return (
      <button type="button" className="stream-card" onClick={() => onPlay(stream)}>
        {content}
      </button>
    );
  }

  if (external) {
    return (
      <a className="stream-card" href={external} target="_blank" rel="noreferrer">
        {content}
      </a>
    );
  }

  if (isTorrent) {
    return (
      <button
        type="button"
        className="stream-card torrent"
        onClick={async () => {
          if (!stream.magnet) {
            toast('لا يوجد رابط مغناطيسي لهذا المصدر.');
            return;
          }
          const ok = await copy(stream.magnet);
          toast(ok ? 'تم نسخ رابط التورنت. افتحه في تطبيق تورنت.' : 'تعذر النسخ.');
        }}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="stream-card disabled">
      {content}
    </div>
  );
}

export function StreamSheet({ target, addons, onClose, onPlay, onNeedAddons, copy, toast, initialProgress }) {
  const { meta, type, id, episode } = target;
  const candidates = useMemo(() => addons.filter((addon) => addonSupports(addon, 'stream', type)), [addons, type]);
  const [groups, setGroups] = useState([]);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let dead = false;
    setGroups([]);
    setErrors([]);
    setLoading(true);
    setFilter('all');
    if (!candidates.length) {
      setLoading(false);
      return undefined;
    }
    const order = new Map(candidates.map((addon, index) => [addon.key, index]));
    Promise.allSettled(candidates.map(async (addon) => {
      try {
        const streams = await fetchStreams(addon, type, id);
        if (dead) return;
        setGroups((current) => [
          ...current.filter((group) => group.addon.key !== addon.key),
          { addon, streams },
        ].sort((a, b) => (order.get(a.addon.key) ?? 99) - (order.get(b.addon.key) ?? 99)));
      } catch (error) {
        if (!dead) setErrors((current) => [...current, { name: addon.manifest.name, message: error.message || 'تعذر جلب المصادر.' }]);
      }
    })).finally(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type, candidates.map((addon) => addon.key).join('|'), attempt]);

  const allStreams = groups.flatMap((group) => group.streams);
  const visible = allStreams.filter((stream) => {
    if (filter === 'direct') return Boolean(stream.url);
    if (filter === 'external') return !stream.url && Boolean(stream.externalUrl || stream.ytId);
    if (filter === 'torrent') return !stream.url && !stream.externalUrl && !stream.ytId && Boolean(stream.infoHash);
    return true;
  });
  const total = allStreams.length;

  return (
    <Sheet onClose={onClose} label="المصادر" className="stream-sheet">
      <div className="sheet-head stream-head">
        <div className="stream-title-block">
          <span className="eyebrow">{episode ? episodeLabel(episode) : typeLabel(type)}</span>
          <h2>{meta.name}</h2>
          {episode?.name && <p className="stream-episode-name">{episode.name}</p>}
          {initialProgress > 30 && <p className="resume-line"><Icon name="clock" size={12} /> متابعة من {formatTime(initialProgress)}</p>}
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="إغلاق"><Icon name="close" size={19} /></button>
      </div>

      <div className="sheet-body stream-body">
        <div className="engine-note">
          <Icon name="sparkle" size={16} />
          <p>بث مشفّر (DRM) أو Dolby Vision أو TrueHD؟ انسخ الرابط وشغّله في AetherPlayer عبر AetherEngine.</p>
        </div>

        {!candidates.length && (
          <EmptyState
            icon="download"
            title="لا توجد إضافة مصادر"
            text="أضف إضافة مصادر (Stream) من إعدادات الإضافات، ثم عد إلى هنا."
            action="إدارة الإضافات"
            onAction={onNeedAddons}
          />
        )}

        {!!candidates.length && (
          <div className="filter-row">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>الكل {total ? `· ${total}` : ''}</Chip>
            <Chip active={filter === 'direct'} onClick={() => setFilter('direct')}>مباشر</Chip>
            <Chip active={filter === 'external'} onClick={() => setFilter('external')}>خارجي</Chip>
            <Chip active={filter === 'torrent'} onClick={() => setFilter('torrent')}>تورنت</Chip>
          </div>
        )}

        {loading && !groups.length && (
          <div className="stream-loading">
            <Spinner size={22} />
            <span>أجمع المصادر من {candidates.length} إضافة…</span>
          </div>
        )}

        {groups.map((group) => {
          const streams = group.streams.filter((stream) => {
            if (filter === 'direct') return Boolean(stream.url);
            if (filter === 'external') return !stream.url && Boolean(stream.externalUrl || stream.ytId);
            if (filter === 'torrent') return !stream.url && !stream.externalUrl && !stream.ytId && Boolean(stream.infoHash);
            return true;
          });
          if (!streams.length) return null;
          return (
            <section className="stream-group" key={group.addon.key}>
              <div className="stream-group-head">
                <AddonAvatar addon={group.addon} size={24} />
                <h3>{group.addon.manifest.name}</h3>
                <span>{streams.length}</span>
              </div>
              {streams.map((stream) => (
                <StreamCard
                  key={stream.key}
                  stream={stream}
                  onPlay={onPlay}
                  copy={copy}
                  toast={toast}
                />
              ))}
            </section>
          );
        })}

        {!loading && !total && !!candidates.length && (
          <EmptyState
            icon="search"
            title="لا مصادر لهذا العمل"
            text={errors.length ? errors[0].message : 'جرّب إضافة مصادر أخرى، أو تأكد أن العمل متاح في الإضافة.'}
            action="تحديث"
            onAction={() => setAttempt((value) => value + 1)}
          />
        )}

        {errors.length > 0 && total > 0 && (
          <p className="stream-errors">{errors.map((error) => `${error.name}: ${error.message}`).join(' · ')}</p>
        )}

        {!loading && total > 0 && visible.length === 0 && (
          <p className="stream-errors">لا مصدر بهذا التصنيف. جرّب «الكل».</p>
        )}
      </div>
    </Sheet>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import './style.css';
import { DEFAULT_ADDON_URL, addonSupports, episodesFor, fetchStreams, loadAddon, sortStreams } from './api.js';
import { copyText, loadStore, saveStore } from './store.js';
import { Icon } from './components.jsx';
import { Detail, Home, Library, Search, Settings, StreamSheet } from './views.jsx';
import Player from './player.jsx';

const TABS = [
  { id: 'home', label: 'الرئيسية', icon: 'home' },
  { id: 'search', label: 'البحث', icon: 'search' },
  { id: 'library', label: 'قائمتي', icon: 'bookmark' },
  { id: 'settings', label: 'الإعدادات', icon: 'settings' },
];

export default function App() {
  const [store, setStore] = useState(loadStore);
  const [tab, setTab] = useState('home');
  const [detail, setDetail] = useState(null);
  const [streamTarget, setStreamTarget] = useState(null);
  const [player, setPlayer] = useState(null);
  const [toast, setToast] = useState(null);
  const [booting, setBooting] = useState(() => {
    const initial = loadStore();
    return initial.addons.length === 0 && !initial.seeded;
  });
  const [bootError, setBootError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const booted = useRef(false);
  const toastTimer = useRef(null);

  useEffect(() => {
    saveStore(store);
  }, [store]);

  useEffect(() => {
    if (tab !== 'detail') window.scrollTo(0, 0);
  }, [tab]);

  const showToast = (message) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const installDefault = async () => {
    setBooting(true);
    setBootError('');
    try {
      const addon = await loadAddon(DEFAULT_ADDON_URL);
      setStore((current) => (current.addons.length ? { ...current, seeded: true } : { ...current, addons: [addon], seeded: true }));
    } catch (error) {
      setBootError(error.message || 'تعذر الاتصال بإضافة البداية.');
    } finally {
      setBooting(false);
    }
  };

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    if (store.addons.length || store.seeded) {
      setBooting(false);
      return;
    }
    installDefault();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addAddon = async (addon) => {
    setStore((current) => {
      const index = current.addons.findIndex((entry) => entry.base === addon.base || entry.key === addon.key);
      if (index >= 0) {
        const previous = current.addons[index];
        const next = current.addons.slice();
        next[index] = { ...addon, enabled: previous.enabled, addedAt: previous.addedAt || addon.addedAt };
        return { ...current, addons: next, seeded: true };
      }
      return { ...current, addons: [addon, ...current.addons], seeded: true };
    });
    setRefresh((value) => value + 1);
  };

  const updateAddon = async (addon) => {
    setStore((current) => ({
      ...current,
      addons: current.addons.map((entry) => (
        entry.key === addon.key || entry.base === addon.base
          ? { ...addon, enabled: entry.enabled, addedAt: entry.addedAt || addon.addedAt }
          : entry
      )),
    }));
    setRefresh((value) => value + 1);
  };

  const removeAddon = (key) => {
    setStore((current) => ({ ...current, addons: current.addons.filter((addon) => addon.key !== key) }));
    setRefresh((value) => value + 1);
  };

  const toggleAddon = (key) => {
    setStore((current) => ({
      ...current,
      addons: current.addons.map((addon) => (addon.key === key ? { ...addon, enabled: !addon.enabled } : addon)),
    }));
    setRefresh((value) => value + 1);
  };

  const retry = () => {
    setRefresh((value) => value + 1);
    if (!store.addons.length) installDefault();
  };

  const copy = async (text) => {
    const ok = await copyText(text);
    if (!ok) showToast('تعذر النسخ. حدّد النص وانسخه يدويًا.');
    return ok;
  };

  const openMeta = (meta) => {
    setDetail({ type: meta.type || 'movie', id: meta.id, preview: meta, addonKey: meta.addonKey || '' });
  };

  const openStreams = (meta, episode = null) => {
    const type = meta.type || 'movie';
    const id = episode?.id || (episode ? `${meta.id}:${episode.season}:${episode.episode}` : meta.id);
    setStreamTarget({ meta, type, id, episode });
  };

  const playMeta = (meta) => {
    if ((meta.type || 'movie') === 'series') openMeta(meta);
    else openStreams(meta, null);
  };

  const resume = (item) => {
    const episode = item.season
      ? {
        id: item.episodeId || `${item.metaId}:${item.season}:${item.episode}`,
        season: item.season,
        episode: item.episode,
        name: item.episodeName || '',
      }
      : null;
    const meta = {
      id: item.metaId,
      type: item.type,
      name: item.name,
      poster: item.poster,
      background: item.background,
    };
    openStreams(meta, episode);
  };

  const nextEpisodeOf = (session) => {
    if (!session?.episode || !session.meta) return null;
    const episodes = episodesFor(session.meta);
    if (!episodes.length) return null;
    const current = session.episode;
    const index = episodes.findIndex((entry) => String(entry.id) === String(current.id)
      || (Number(entry.season) === Number(current.season) && Number(entry.episode) === Number(current.episode)));
    return index >= 0 ? episodes[index + 1] || null : null;
  };

  /** Autoplay: find a direct source for the next episode and start it. */
  const playEpisode = async (meta, episode) => {
    if (!meta || !episode) return;
    const type = meta.type || 'series';
    const episodeId = episode.id || `${meta.id}:${episode.season}:${episode.episode}`;
    const candidates = store.addons.filter((addon) => addon.enabled && addonSupports(addon, 'stream', type));
    setPlayer(null);
    if (!candidates.length) {
      openStreams(meta, episode);
      return;
    }
    showToast('أبحث عن مصدر للحلقة التالية…');
    const results = await Promise.allSettled(candidates.map((addon) => fetchStreams(addon, type, episodeId)));
    const direct = results
      .flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
      .filter((stream) => stream.url)
      .sort(sortStreams);
    if (!direct.length) {
      showToast('لا يوجد مصدر مباشر للحلقة التالية. اختر مصدرًا يدويًا.');
      openStreams(meta, episode);
      return;
    }
    setPlayer({ meta, type, id: episodeId, episode, stream: direct[0] });
  };

  const saveProgress = (entry) => {
    setStore((current) => ({ ...current, progress: { ...current.progress, [entry.key]: entry } }));
  };

  const toggleSaved = (meta) => {
    const isSaved = store.saved.some((item) => item.id === meta.id && item.type === meta.type);
    if (isSaved) {
      setStore((current) => ({ ...current, saved: current.saved.filter((item) => !(item.id === meta.id && item.type === meta.type)) }));
      showToast('أُزيل من المحفوظات');
      return;
    }
    setStore((current) => ({
      ...current,
      saved: [{
        id: meta.id,
        type: meta.type,
        name: meta.name,
        poster: meta.poster || '',
        background: meta.background || '',
        releaseInfo: meta.releaseInfo || '',
        imdbRating: meta.imdbRating || '',
        genres: meta.genres || [],
        addonKey: meta.addonKey || '',
        addedAt: Date.now(),
      }, ...current.saved].slice(0, 100),
    }));
    showToast('حُفظ في قائمتك');
  };

  const clearProgress = () => setStore((current) => ({ ...current, progress: {} }));
  const clearSaved = () => setStore((current) => ({ ...current, saved: [] }));

  const continueItems = useMemo(() => Object.values(store.progress)
    .filter((item) => item && item.time > 15 && item.duration > 30 && item.time < item.duration - 20 && !item.completed)
    .sort((a, b) => (b.updated || 0) - (a.updated || 0))
    .slice(0, 12), [store.progress]);

  const initialProgress = player ? store.progress[`${player.type}:${player.id}`]?.time || 0 : 0;

  const tabbar = !player && !streamTarget && !detail;

  return (
    <div className="app" dir="rtl">
      <div className="ambient" aria-hidden="true">
        <span className="ambient-one" />
        <span className="ambient-two" />
      </div>

      {tab === 'home' && (
        <Home
          addons={store.addons}
          continueItems={continueItems}
          onOpenMeta={openMeta}
          onPlayMeta={playMeta}
          onResume={resume}
          onSettings={() => setTab('settings')}
          onRetry={retry}
          bootError={bootError}
          booting={booting}
          refresh={refresh}
        />
      )}

      {tab === 'search' && <Search addons={store.addons} onOpenMeta={openMeta} onSettings={() => setTab('settings')} />}

      {tab === 'library' && (
        <Library
          continueItems={continueItems}
          saved={store.saved}
          onResume={resume}
          onOpenMeta={openMeta}
          onExplore={() => setTab('home')}
        />
      )}

      {tab === 'settings' && (
        <Settings
          addons={store.addons}
          saved={store.saved}
          progress={store.progress}
          onAddAddon={addAddon}
          onUpdateAddon={updateAddon}
          onRemoveAddon={removeAddon}
          onToggleAddon={toggleAddon}
          onClearProgress={clearProgress}
          onClearSaved={clearSaved}
          toast={showToast}
          onRefresh={retry}
        />
      )}

      {tabbar && (
        <nav className="tabbar" aria-label="التنقل">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tab ${tab === item.id ? 'on' : ''}`}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              <Icon name={item.icon} size={22} />
              <span>{item.label}</span>
              {item.id === 'library' && continueItems.length > 0 && <i className="tab-dot" />}
            </button>
          ))}
        </nav>
      )}

      {detail && (
        <Detail
          detail={detail}
          addons={store.addons}
          saved={store.saved}
          onClose={() => setDetail(null)}
          onOpenStreams={openStreams}
          onToggleSaved={toggleSaved}
          toast={showToast}
          onSettings={() => { setDetail(null); setTab('settings'); }}
        />
      )}

      {streamTarget && (
        <StreamSheet
          target={streamTarget}
          addons={store.addons}
          onClose={() => setStreamTarget(null)}
          onPlay={(stream) => {
            setPlayer({ ...streamTarget, stream });
            setStreamTarget(null);
          }}
          onNeedAddons={() => { setStreamTarget(null); setTab('settings'); }}
          copy={copy}
          toast={showToast}
          initialProgress={store.progress[`${streamTarget.type}:${streamTarget.id}`]?.time || 0}
        />
      )}

      {player && (
        <Player
          session={player}
          addons={store.addons}
          initialProgress={initialProgress}
          nextEpisode={nextEpisodeOf(player)}
          onPlayNext={(episode) => playEpisode(player.meta, episode)}
          onClose={() => setPlayer(null)}
          onProgress={saveProgress}
          copy={copy}
          toast={showToast}
        />
      )}

      {toast && <div className="toast" role="status">{toast.message}</div>}
    </div>
  );
}

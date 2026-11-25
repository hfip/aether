import { useEffect, useState } from 'react';

const PATHS = {
  home: <><path d="M3.5 10.7 12 3.6l8.5 7.1" /><path d="M5.5 9.4V20a.8.8 0 0 0 .8.8h4.1v-6.2h3.2v6.2h4.1a.8.8 0 0 0 .8-.8V9.4" /></>,
  search: <><circle cx="11" cy="11" r="6.6" /><path d="m16 16 4.2 4.2" /></>,
  bookmark: <path d="M6.4 3.8h11.2a.8.8 0 0 1 .8.8v16l-6.4-3.8-6.4 3.8v-16a.8.8 0 0 1 .8-.8Z" />,
  settings: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></>,
  play: <path d="M8 5.3v13.4a.7.7 0 0 0 1.07.6l10.5-6.7a.7.7 0 0 0 0-1.2L9.07 4.7A.7.7 0 0 0 8 5.3Z" fill="currentColor" stroke="none" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  back: <path d="M9 18l6-6-6-6" />,
  forward: <path d="M15 18l-6-6 6-6" />,
  star: <path d="m12 3.6 2.55 5.17 5.7.83-4.12 4.02.97 5.68L12 16.62 6.9 19.3l.97-5.68L3.75 9.6l5.7-.83L12 3.6Z" fill="currentColor" stroke="none" />,
  copy: <><rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.3" /><path d="M15.5 8.5v-2A2.5 2.5 0 0 0 13 4H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5h2" /></>,
  external: <><path d="M14 4h6v6M20 4l-8.5 8.5" /><path d="M19 14.5v4A2.5 2.5 0 0 1 16.5 21h-11A2.5 2.5 0 0 1 3 18.5v-11A2.5 2.5 0 0 1 5.5 5h4" /></>,
  check: <path d="m4.5 12.5 5 5 10-11" />,
  trash: <><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 13h9.4l.8-13" /><path d="M10 11v5M14 11v5" /></>,
  refresh: <><path d="M20 5v5h-5" /><path d="M19 10a7.5 7.5 0 1 0 .4 4" /></>,
  film: <><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4" /></>,
  tv: <><rect x="3" y="5" width="18" height="13" rx="2.4" /><path d="m8 21 4-3 4 3" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.2M12 7.6v.1" /></>,
  link: <><path d="M9.5 14.5 14.5 9.5" /><path d="M7.2 17.8 5.9 19a3.5 3.5 0 0 1-5-5l3.2-3.1a3.5 3.5 0 0 1 5 0" transform="translate(2.2 0)" /><path d="m16.8 6.2 1.3-1.2a3.5 3.5 0 0 1 5 5l-3.2 3.1a3.5 3.5 0 0 1-5 0" transform="translate(-2.2 0)" /></>,
  sparkle: <><path d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5Z" /><path d="M18.5 15.5c.3 2 1 2.8 3 3-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.2 2.7-1 3-3Z" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.3l3.4 2" /></>,
  magnet: <><path d="M4 4v7.5a8 8 0 0 0 16 0V4" /><path d="M4 10h4.5M15.5 10H20" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2.4" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3.5 12h17M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  download: <><path d="M12 3v12M7.5 11 12 15.5 16.5 11" /><path d="M5 20h14" /></>,
  arrowRight: <><path d="M4 12h15M14 7l5 5-5 5" /></>,
  captions: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10 10.2a2.4 2.4 0 1 0 0 3.6M17 10.2a2.4 2.4 0 1 0 0 3.6" /></>,
};

export function Icon({ name, size = 21, strokeWidth = 1.8, className = '' }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] || PATHS.info}
    </svg>
  );
}

export function Spinner({ size = 20, className = '' }) {
  return <span className={`spinner ${className}`} style={{ width: size, height: size }} aria-label="جارٍ التحميل" />;
}

export const preferredImage = (url = '') => (
  url.includes('://images.metahub.space/')
    ? url.replace('://images.metahub.space/', '://live.metahub.space/')
    : url
);

export function Poster({ src, alt = '', className = '', children, wide = false }) {
  const [failed, setFailed] = useState(false);
  const preferred = preferredImage(src);
  const [source, setSource] = useState(preferred);
  useEffect(() => {
    setFailed(false);
    setSource(preferredImage(src));
  }, [src]);
  const alternate = src && src !== preferred ? src : '';
  return (
    <div className={`poster ${wide ? 'poster-wide' : ''} ${className}`}>
      {source && !failed ? (
        <img
          src={source}
          alt={alt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => {
            if (alternate && source === preferred) setSource(alternate);
            else setFailed(true);
          }}
        />
      ) : (
        <span className="poster-fallback" aria-hidden="true"><Icon name="film" size={24} /></span>
      )}
      {children}
    </div>
  );
}

export function Rating({ value }) {
  const rating = Number.parseFloat(value);
  if (!Number.isFinite(rating) || rating <= 0) return null;
  return <span className="rating"><Icon name="star" size={10} /> {rating.toFixed(1)}</span>;
}

export function MetaCard({ meta, onOpen }) {
  if (!meta) return null;
  return (
    <button className="card" type="button" onClick={() => onOpen(meta)} aria-label={`${meta.name}، ${meta.type === 'series' ? 'مسلسل' : 'فيلم'}`}>
      <Poster src={meta.poster} alt="" className="card-poster">
        <Rating value={meta.imdbRating} />
        {meta.type === 'series' && <span className="type-dot">مسلسل</span>}
      </Poster>
      <span className="card-title">{meta.name}</span>
      <span className="card-sub">{[meta.releaseInfo, meta.genres?.[0]].filter(Boolean).join(' · ') || ' '}</span>
    </button>
  );
}

export function SectionHead({ title, meta, action, onAction }) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {meta && <p>{meta}</p>}
      </div>
      {action && <button type="button" className="link-button" onClick={onAction}>{action}<Icon name="chevronDown" size={14} className="flip-rtl" /></button>}
    </div>
  );
}

export function EmptyState({ icon = 'sparkle', title, text, action, onAction, secondary, onSecondary }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon name={icon} size={28} /></span>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action && <button type="button" className="btn-primary compact" onClick={onAction}>{action}</button>}
      {secondary && <button type="button" className="btn-quiet" onClick={onSecondary}>{secondary}</button>}
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="tablist" aria-label="نوع المحتوى">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={value === option.value}
          className={value === option.value ? 'on' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, children, onClick, as = 'button', href }) {
  if (as === 'a') {
    return <a className={`chip ${active ? 'on' : ''}`} href={href} target="_blank" rel="noreferrer">{children}</a>;
  }
  return <button type="button" className={`chip ${active ? 'on' : ''}`} onClick={onClick}>{children}</button>;
}

export function AddonAvatar({ addon, size = 46 }) {
  const [failed, setFailed] = useState(false);
  const logo = addon?.manifest?.logo;
  const initial = (addon?.manifest?.name || '?').trim().charAt(0).toUpperCase();
  return (
    <span className="addon-avatar" style={{ width: size, height: size }}>
      {logo && !failed ? <img src={logo} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initial}
    </span>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span />
    </button>
  );
}

export function Sheet({ children, onClose, label, className = '' }) {
  return (
    <div
      className="sheet-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}
    >
      <section className={`sheet ${className}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="sheet-grip" aria-hidden="true" />
        {children}
      </section>
    </div>
  );
}

export function SkeletonHero() {
  return (
    <div className="hero skeleton-hero">
      <div className="sk hero-sk" />
      <div className="hero-content">
        <div className="sk" style={{ width: 80, height: 12, borderRadius: 8 }} />
        <div className="sk" style={{ width: '70%', height: 40, borderRadius: 12, marginTop: 14 }} />
        <div className="sk" style={{ width: '50%', height: 12, borderRadius: 8, marginTop: 12 }} />
        <div className="sk" style={{ width: '88%', height: 12, borderRadius: 8, marginTop: 18 }} />
        <div className="sk" style={{ width: '80%', height: 12, borderRadius: 8, marginTop: 7 }} />
        <div className="sk" style={{ width: '100%', height: 50, borderRadius: 15, marginTop: 22 }} />
      </div>
    </div>
  );
}

export function SkeletonShelf() {
  return (
    <section className="shelf">
      <div className="section-head"><div className="sk" style={{ width: 120, height: 18, borderRadius: 7 }} /></div>
      <div className="shelf-track">
        {[0, 1, 2, 3].map((index) => (
          <div className="card" key={index}>
            <div className="sk card-poster" style={{ borderRadius: 14 }} />
            <div className="sk" style={{ width: 90, height: 10, borderRadius: 6, marginTop: 9 }} />
            <div className="sk" style={{ width: 58, height: 8, borderRadius: 5, marginTop: 7 }} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${secs}`;
  return `${minutes}:${secs}`;
}

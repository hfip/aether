import { Toggle, Icon } from './components.jsx';
import { languageLabel } from './subtitles.js';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEPS = [0, 15, 30, 45, 60, 90];
const SUB_SIZES = [{ id: 'small', label: 'صغير' }, { id: 'medium', label: 'متوسط' }, { id: 'large', label: 'كبير' }];
const SUB_BACKGROUNDS = [{ id: 'none', label: 'بدون' }, { id: 'soft', label: 'خفيف' }, { id: 'box', label: 'مربع' }];
const SUB_POSITIONS = [{ id: 'bottom', label: 'أسفل' }, { id: 'top', label: 'أعلى' }];

const speedLabel = (speed) => (speed === 1 ? 'عادي' : `${String(speed).replace('.', '٫')}×`);

function Row({ label, value, children }) {
  return (
    <div className="ps-row">
      <div className="ps-row-head">
        <span>{label}</span>
        {value != null && <small>{value}</small>}
      </div>
      {children}
    </div>
  );
}

function Chips({ options, value, onPick }) {
  return (
    <div className="ps-chips">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`ps-chip ${value === option.id ? 'on' : ''}`}
          onClick={() => onPick(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SheetFrame({ title, onClose, children }) {
  return (
    <div className="ps-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="ps-sheet" role="dialog" aria-modal="true" aria-label={title} dir="rtl">
        <div className="ps-grip" aria-hidden="true" />
        <header className="ps-head">
          <h2>{title}</h2>
          <button type="button" className="ps-close" onClick={onClose} aria-label="إغلاق">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="ps-body">{children}</div>
      </section>
    </div>
  );
}

export function PlayerSettingsSheet({
  prefs, patch, onClose, stats, mode, pipAvailable, onPip, onCopy,
  sleepMinutes, sleepRemaining, onSleep, subtitleLabel, onOpenSubtitles,
}) {
  const statRows = stats?.rows || [];
  return (
    <SheetFrame title="إعدادات المشغل" onClose={onClose}>
      <section className="ps-section">
        <h3>الفيديو</h3>
        <Row label="ملء الشاشة">
          <Chips
            options={[{ id: 'contain', label: 'احتواء' }, { id: 'cover', label: 'ملء' }]}
            value={prefs.aspect}
            onPick={(aspect) => patch({ aspect })}
          />
        </Row>
        {pipAvailable && (
          <button type="button" className="ps-action" onClick={onPip}>
            <Icon name="tv" size={17} /> صورة داخل صورة
          </button>
        )}
      </section>

      <section className="ps-section">
        <h3>التشغيل</h3>
        <Row label="سرعة التشغيل" value={speedLabel(prefs.speed)}>
          <div className="ps-chips">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                className={`ps-chip ${prefs.speed === speed ? 'on' : ''}`}
                onClick={() => patch({ speed })}
              >
                {speed === 1 ? '1×' : `${speed}×`}
              </button>
            ))}
          </div>
        </Row>

        <div className="ps-row inline">
          <span>الحلقة التالية تلقائيًا</span>
          <Toggle
            checked={prefs.autoNext}
            label="الحلقة التالية تلقائيًا"
            onChange={(autoNext) => patch({ autoNext })}
          />
        </div>

        <Row label="مؤقت النوم" value={sleepRemaining != null ? `${Math.ceil(sleepRemaining / 60)} دقيقة` : null}>
          <div className="ps-chips">
            {SLEEPS.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`ps-chip ${sleepMinutes === minutes ? 'on' : ''}`}
                onClick={() => onSleep(minutes)}
              >
                {minutes === 0 ? 'إيقاف' : `${minutes}`}
              </button>
            ))}
          </div>
        </Row>
      </section>

      <section className="ps-section">
        <h3>الترجمة</h3>
        <button type="button" className="ps-action wide" onClick={onOpenSubtitles}>
          <Icon name="captions" size={18} />
          <span className="ps-action-text">{subtitleLabel || 'بدون ترجمة'}</span>
          <Icon name="back" size={15} className="flip-rtl" />
        </button>

        <Row label="حجم الخط">
          <Chips options={SUB_SIZES} value={prefs.subSize} onPick={(subSize) => patch({ subSize })} />
        </Row>
        <Row label="الخلفية">
          <Chips options={SUB_BACKGROUNDS} value={prefs.subBackground} onPick={(subBackground) => patch({ subBackground })} />
        </Row>
        <Row label="الموضع">
          <Chips options={SUB_POSITIONS} value={prefs.subPosition} onPick={(subPosition) => patch({ subPosition })} />
        </Row>
        <Row label="تأخير الترجمة" value={`${prefs.subDelay > 0 ? '+' : ''}${prefs.subDelay.toFixed(1)} ث`}>
          <div className="ps-stepper">
            <button type="button" onClick={() => patch({ subDelay: Math.max(-10, Math.round((prefs.subDelay - 0.5) * 10) / 10) })} aria-label="تقديم الترجمة">
              −
            </button>
            <button type="button" onClick={() => patch({ subDelay: 0 })}>تصفير</button>
            <button type="button" onClick={() => patch({ subDelay: Math.min(10, Math.round((prefs.subDelay + 0.5) * 10) / 10) })} aria-label="تأخير الترجمة">
              +
            </button>
          </div>
        </Row>
      </section>

      <section className="ps-section">
        <h3>الإحصائيات</h3>
        <div className="ps-row inline">
          <span>إظهار الإحصائيات فوق الفيديو</span>
          <Toggle checked={prefs.stats} label="إظهار الإحصائيات" onChange={(statsOn) => patch({ stats: statsOn })} />
        </div>
        {statRows.length > 0 && (
          <dl className="ps-stats">
            {statRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="ps-section">
        <button type="button" className="ps-action" onClick={onCopy}>
          <Icon name="copy" size={17} /> نسخ رابط المصدر
        </button>
        <p className="ps-foot">
          المشغل المدمج: {mode === 'remux' ? 'MKV يُعاد تغليفه كـ MP4' : mode === 'dash' ? 'DASH عبر MSE' : 'WebKit مباشر'}
        </p>
      </section>
    </SheetFrame>
  );
}

export function SubtitlePickerSheet({
  tracks, loading, error, activeKey, onPick, onClose,
}) {
  return (
    <SheetFrame title="الترجمة" onClose={onClose}>
      {loading && <p className="ps-note">أجمع الترجمات من الإضافات…</p>}
      {!loading && error && <p className="ps-note">{error}</p>}
      {!loading && !error && !tracks.length && (
        <p className="ps-note">لا توجد ترجمات لهذا العمل. أضف إضافة ترجمة (Subtitles) من الإعدادات.</p>
      )}
      {!loading && !error && tracks.length > 0 && (
        <div className="ps-list">
          <button
            type="button"
            className={`ps-list-row ${!activeKey ? 'on' : ''}`}
            onClick={() => onPick(null)}
          >
            <span>بدون ترجمة</span>
            {!activeKey && <Icon name="check" size={16} />}
          </button>
          {tracks.map((track) => (
            <button
              key={track.key}
              type="button"
              className={`ps-list-row ${activeKey === track.key ? 'on' : ''}`}
              onClick={() => onPick(track)}
            >
              <span>
                <strong>{languageLabel(track.lang)}</strong>
                <small>{track.addonName}{track.label && track.label !== track.lang ? ` · ${track.label}` : ''}</small>
              </span>
              {activeKey === track.key && <Icon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
    </SheetFrame>
  );
}

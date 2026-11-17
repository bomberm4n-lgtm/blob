import { useEffect, useRef, useSyncExternalStore } from 'react';
import { voice } from './voice';

export const useVoice = () => {
  useSyncExternalStore(voice.subscribe, voice.getVersion);
  return voice;
};

const P = {
  mic: 'M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z',
  micOff: 'M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5a3 3 0 0 0-6 0v.18l5.98 5.99zM4.27 3 3 4.27l6.01 6.01V11a3 3 0 0 0 3 3c.22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52a5 5 0 0 1-5-5H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z',
  head: 'M12 3a9 9 0 0 0-9 9v7a2 2 0 0 0 2 2h2v-7H5v-2a7 7 0 0 1 14 0v2h-2v7h2a2 2 0 0 0 2-2v-7a9 9 0 0 0-9-9z',
  headOff: 'M12 3a9 9 0 0 0-7.9 4.7l1.5 1.5A7 7 0 0 1 19 12v2h-2v1.2l2.9 2.9c.06-.2.1-.4.1-.6v-7.5A9 9 0 0 0 12 3zM2.7 2.7 1.3 4.1 3.5 6.3C3.2 7.5 3 8.7 3 10v9a2 2 0 0 0 2 2h2v-7H5v-2c0-.8.1-1.5.4-2.2L19.9 22.7l1.4-1.4L2.7 2.7z',
  gear: 'M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9c-.6.2-1.2.6-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1c.5.4 1.1.7 1.7 1L11 21h4l.4-2.9c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.5L19.4 13zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z',
  hash: 'M10 3 9 8H5l-.3 2h4l-.8 4H4l-.3 2h4L7 21h2l.8-5h4L13 21h2l.8-5h4l.3-2h-4l.8-4h4l.3-2h-4l1-5h-2l-1 5h-4l1-5h-2zm1.5 7h4l-.8 4h-4l.8-4z',
  speaker: 'M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z',
  plus: 'M19 11h-6V5h-2v6H5v2h6v6h2v-6h6z',
  screen: 'M20 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6v2H8v2h8v-2h-2v-2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 13H4V5h16v11zm-9-3h2V9.8l1.6 1.6 1.4-1.4L12 6 8 10l1.4 1.4L11 9.8V13z',
  screenOff: 'M20 3H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6v2H8v2h8v-2h-2v-2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 13H4V5h16v11zM9.4 13.4 12 10.8l2.6 2.6 1.4-1.4-2.6-2.6L16 6.8l-1.4-1.4L12 8 9.4 5.4 8 6.8l2.6 2.6L8 12z',
  hangup: 'M21.5 13.4c-.3-1.6-4-3.4-9.5-3.4S2.8 11.8 2.5 13.4l-.5 2.8c-.1.6.4 1.1 1 1.1h3.3c.5 0 .9-.4 1-.9l.4-2.1c1.4-.5 2.8-.7 4.3-.7s2.9.2 4.3.7l.4 2.1c.1.5.5.9 1 .9H21c.6 0 1.1-.5 1-1.1l-.5-2.8z',
  cam: 'M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z',
  sound: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 14.5v-9l6 4.5-6 4.5z',
  sb: 'M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z',
  people: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C15 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z',
  close: 'M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z',
  full: 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z',
  upload: 'M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z',
  trash: 'M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z',
  edit: 'M3 17.2V21h3.8l11-11-3.8-3.8-11 11zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.8 3.8L20.7 7z',
  smile: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-3.5 6a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM12 17.5c-2.3 0-4.3-1.5-5-3.5h10c-.7 2-2.7 3.5-5 3.5z',
  chevron: 'M7 10l5 5 5-5z',
  eye: 'M12 5C7 5 2.7 8.1 1 12c1.7 3.9 6 7 11 7s9.3-3.1 11-7c-1.7-3.9-6-7-11-7zm0 11.5a4.5 4.5 0 1 1 0-9 4.5 4.5 0 0 1 0 9zm0-7a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  logout: 'M10 17l1.4-1.4L8.8 13H20v-2H8.8l2.6-2.6L10 7l-5 5 5 5zM4 5h8V3H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8v-2H4V5z',
  copy: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z',
  stop: 'M6 6h12v12H6z',
};

export function Icon({ name, size = 20, className, style }) {
  return (
    <svg className={className} style={style} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

export function Avatar({ user, size = 32, speaking, status }) {
  const name = user?.username || '?';
  return (
    <div className={'avatar' + (speaking ? ' speaking' : '')} style={{ width: size, height: size, minWidth: size }}>
      {user?.avatar ? (
        <img src={user.avatar} alt="" />
      ) : (
        <div className="avatar-fallback" style={{ background: user?.color || '#555', fontSize: size * 0.42 }}>
          {name.slice(0, 1).toUpperCase()}
        </div>
      )}
      {status && <span className={'status-dot ' + status} style={{ width: size * 0.36, height: size * 0.36 }} />}
    </div>
  );
}

export function Modal({ title, onClose, children, wide, className }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={'modal' + (wide ? ' wide' : '') + (className ? ' ' + className : '')}>
        {title && (
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose}><Icon name="close" /></button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

export function Tooltip({ text, children, side = 'top' }) {
  return (
    <span className={'tt tt-' + side} data-tip={text}>
      {children}
    </span>
  );
}

// Context menu (right click).
export function ContextMenu({ x, y, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    const h = (e) => !ref.current?.contains(e.target) && onClose();
    setTimeout(() => window.addEventListener('mousedown', h));
    return () => window.removeEventListener('mousedown', h);
  }, [onClose]);
  const style = { left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 320) };
  return (
    <div ref={ref} className="ctx-menu" style={style}>
      {children}
    </div>
  );
}

export function Slider({ value, min = 0, max = 200, onChange, label, suffix = '%' }) {
  return (
    <div className="slider">
      {label && (
        <div className="slider-label">
          <span>{label}</span>
          <span>{Math.round(value)}{suffix}</span>
        </div>
      )}
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--pct': ((value - min) / (max - min)) * 100 + '%' }} />
    </div>
  );
}

export function fmtTime(ts) {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const hm = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return 'Today at ' + hm;
  if (d.toDateString() === y.toDateString()) return 'Yesterday at ' + hm;
  return d.toLocaleDateString('en-US') + ' ' + hm;
}

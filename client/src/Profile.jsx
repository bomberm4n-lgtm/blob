// Profile cards with animated background themes and animated avatar effects, plus the editor to pick them.
import { useEffect, useState } from 'react';
import { api } from './api';
import { Avatar, Icon, Modal } from './ui';
import { PixelIcon } from './pixelIcons';
import { TagPills } from './Tags';

export const THEMES = {
  none: { label: 'Classic' },
  surf: { label: 'Surf' },
  student: { label: 'Student' },
  gamer: { label: 'Gamer' },
  space: { label: 'Space' },
  sakura: { label: 'Sakura' },
  lava: { label: 'Lava' },
  slime: { label: 'Blob' },
  aurora: { label: 'Aurora' },
};

export const AVATAR_FX = {
  none: { label: 'None' },
  rainbow: { label: 'Rainbow' },
  fire: { label: 'Fire' },
  sparkles: { label: 'Sparkles' },
  orbit: { label: 'Orbit' },
  pulse: { label: 'Neon' },
  hearts: { label: 'Hearts' },
};

const range = (n) => Array.from({ length: n }, (_, i) => i);

// Decorative animated layers for each theme (pure CSS animation, no images).
function ThemeLayers({ theme }) {
  switch (theme) {
    case 'surf':
      return (<>
        <div className="th-sun" />
        <div className="th-wave th-wave-back" />
        <div className="th-wave th-wave-front" />
        <div className="th-board"><PixelIcon name="surf" size={34} /></div>
      </>);
    case 'student':
      return (<>
        {['A+', 'π', 'E=mc²', '∑', 'x²', '✎', '√2', '★'].map((t, i) => <span key={i} className="th-chalk" style={{ '--i': i }}>{t}</span>)}
      </>);
    case 'gamer':
      return (<>
        <div className="th-neon-sun" />
        <div className="th-grid" />
        <div className="th-pad"><PixelIcon name="gamepad" size={30} /></div>
      </>);
    case 'space':
      return (<>
        <div className="th-stars th-stars-1" />
        <div className="th-stars th-stars-2" />
        <div className="th-planet" />
        <div className="th-shooting" />
      </>);
    case 'sakura':
      return range(14).map((i) => <i key={i} className="th-petal" style={{ '--i': i }} />);
    case 'lava':
      return (<>
        <div className="th-lava-glow" />
        {range(14).map((i) => <i key={i} className="th-ember" style={{ '--i': i }} />)}
      </>);
    case 'slime':
      return (<>
        {range(12).map((i) => <i key={i} className="th-bubble" style={{ '--i': i }} />)}
        <div className="th-slime-icon"><PixelIcon name="slime" size={34} /></div>
      </>);
    case 'aurora':
      return (<>
        <div className="th-aurora-band th-aurora-1" />
        <div className="th-aurora-band th-aurora-2" />
        <div className="th-aurora-band th-aurora-3" />
        <div className="th-stars th-stars-1" />
      </>);
    default:
      return null;
  }
}

// Animated effect drawn around an avatar.
export function AvatarFx({ fx, size, children }) {
  if (!fx || fx === 'none') return children;
  return (
    <div className={'afx afx-' + fx} style={{ '--s': size + 'px' }}>
      {fx === 'sparkles' && range(4).map((i) => <i key={i} className="afx-spark" style={{ '--i': i }} />)}
      {fx === 'orbit' && <div className="afx-orbiter"><PixelIcon name="slime" size={Math.max(12, size * 0.28)} /></div>}
      {fx === 'hearts' && range(5).map((i) => <i key={i} className="afx-heart" style={{ '--i': i }} />)}
      {fx === 'fire' && range(6).map((i) => <i key={i} className="afx-ember" style={{ '--i': i }} />)}
      {children}
    </div>
  );
}

export function ProfileCard({ user, server, presence, children, size = 80 }) {
  const theme = user?.theme && user.theme !== 'none' ? user.theme : null;
  return (
    <div className={'pcard' + (theme ? ' pcard-themed th-' + theme : '')} style={{ '--accent-user': user?.color || '#3ecf8e' }}>
      <div className="pcard-bg"><ThemeLayers theme={theme} /></div>
      <div className="pcard-banner" style={theme ? undefined : { background: user?.color }} />
      <div className="pcard-avatar">
        <AvatarFx fx={user?.fx} size={size}>
          <Avatar user={user} size={size} status={presence} />
        </AvatarFx>
      </div>
      <div className="pcard-body">
        <div className="pcard-name">{user?.username}</div>
        {user?.status && <div className="pcard-status">{user.status}</div>}
        <TagPills user={user} server={server} />
        {children}
      </div>
    </div>
  );
}

const PRESENCE_OPTIONS = [
  ['online', 'Online', ''],
  ['idle', 'Idle', 'You look away from keyboard'],
  ['dnd', 'Do Not Disturb', "You won't get desktop notifications"],
  ['invisible', 'Invisible', 'You look offline, but can still use Blob'],
];
export const PRESENCE_LABEL = Object.fromEntries(PRESENCE_OPTIONS.map(([k, l]) => [k, l]));

// The popout you get when clicking your own avatar in the bottom-left panel.
export function MyProfilePopout({ me, server, presence, onPresence, onEditProfile, onSettings, onClose }) {
  const [statusOpen, setStatusOpen] = useState(false);
  useEffect(() => {
    const close = (e) => { if (!e.target.closest?.('.my-popout, .user-panel-avatar')) onClose(); };
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [onClose]);
  return (
    <div className="my-popout">
      <ProfileCard user={me} server={server} presence={presence} size={80}>
        <div className="pop-menu">
          <div className="pop-row" onClick={onEditProfile}><Icon name="edit" size={18} /><span>Edit profile</span><span className="pop-new">LOOKS</span></div>
          <div className="pop-sep" />
          <div className={'pop-row' + (statusOpen ? ' open' : '')} onClick={() => setStatusOpen((x) => !x)}>
            <span className={'status-icon ' + presence} /><span>{PRESENCE_LABEL[presence]}</span><span className="pop-chevron">›</span>
          </div>
          {statusOpen && (
            <div className="pop-sub">
              {PRESENCE_OPTIONS.map(([k, label, desc]) => (
                <div key={k} className={'status-opt' + (presence === k ? ' active' : '')} onClick={() => { onPresence(k); setStatusOpen(false); }}>
                  <span className={'status-icon ' + k} />
                  <div><b>{label}</b>{desc && <small>{desc}</small>}</div>
                </div>
              ))}
            </div>
          )}
          <div className="pop-sep" />
          <div className="pop-row" onClick={onSettings}><Icon name="gear" size={18} /><span>Settings</span></div>
        </div>
      </ProfileCard>
    </div>
  );
}

const ACCENTS = ['#3ecf8e', '#8ed8f5', '#5865f2', '#f5c518', '#ff8a3d', '#f23f43', '#eb459e', '#9b59b6', '#ffffff'];

export function ProfileEditor({ me, server, presence, onClose }) {
  const [form, setForm] = useState({ theme: me.theme || 'none', fx: me.fx || 'none', color: me.color, status: me.status || '' });
  const [busy, setBusy] = useState(false);
  const preview = { ...me, ...form };
  const save = async () => {
    setBusy(true);
    try { await api('/api/me', { method: 'PATCH', body: form }); onClose(); } catch (e) { alert(e.message); }
    setBusy(false);
  };
  return (
    <Modal title="Edit profile" onClose={onClose} wide className="profile-editor">
      <div className="pe-wrap">
        <div className="pe-options">
          <div className="quality-label">Card theme</div>
          <div className="pe-grid">
            {Object.entries(THEMES).map(([k, t]) => (
              <button key={k} type="button" className={'pe-theme' + (form.theme === k ? ' sel' : '')} onClick={() => setForm({ ...form, theme: k })}>
                <div className={'pe-thumb' + (k !== 'none' ? ' pcard-themed th-' + k : '')} style={k === 'none' ? { background: form.color } : undefined}>
                  <div className="pcard-bg"><ThemeLayers theme={k === 'none' ? null : k} /></div>
                </div>
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          <div className="quality-label">Avatar effect</div>
          <div className="pe-grid pe-grid-fx">
            {Object.entries(AVATAR_FX).map(([k, f]) => (
              <button key={k} type="button" className={'pe-fx' + (form.fx === k ? ' sel' : '')} onClick={() => setForm({ ...form, fx: k })}>
                <AvatarFx fx={k} size={40}><Avatar user={me} size={40} /></AvatarFx>
                <span>{f.label}</span>
              </button>
            ))}
          </div>
          <div className="quality-label">Accent color</div>
          <div className="color-picker">
            {ACCENTS.map((c) => <button type="button" key={c} className={'color-dot' + (form.color === c ? ' sel' : '')} style={{ background: c }} onClick={() => setForm({ ...form, color: c })} />)}
            <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} title="Custom color" />
          </div>
          <label>Custom status<input value={form.status} maxLength={80} placeholder="What are you up to?" onChange={(e) => setForm({ ...form, status: e.target.value })} /></label>
        </div>
        <div className="pe-preview">
          <div className="quality-label">Preview</div>
          <ProfileCard user={preview} server={server} presence={presence} size={80} />
        </div>
      </div>
      <div className="modal-foot pe-foot">
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
    </Modal>
  );
}

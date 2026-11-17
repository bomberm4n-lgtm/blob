// Member tags: little pixel-art badges the server owner creates and hands out to friends.
import { useState } from 'react';
import { api } from './api';
import { Icon, Modal, Tooltip } from './ui';
import { PIXEL_ICONS, PixelIcon } from './pixelIcons';

const TAG_COLORS = ['#3ecf8e', '#8ed8f5', '#5865f2', '#f5c518', '#ff8a3d', '#f23f43', '#eb459e', '#b07a45', '#949ba4'];

// The badges shown after a username.
// Tags belong to a server, so always read the member as they are in THIS server.
const memberIn = (server, user) => server?.members?.find((m) => m.id === user?.id) || user;

export function TagBadges({ user, server, size = 16 }) {
  user = memberIn(server, user);
  if (!user?.tags?.length || !server?.tags?.length) return null;
  const tags = user.tags.map((id) => server.tags.find((t) => t.id === id)).filter(Boolean);
  if (!tags.length) return null;
  return (
    <span className="tag-badges" onClick={(e) => e.stopPropagation()}>
      {tags.map((t) => (
        <Tooltip key={t.id} text={t.name}>
          <span className="tag-badge"><PixelIcon name={t.icon} size={size} /></span>
        </Tooltip>
      ))}
    </span>
  );
}

// Tag list with name + colored pill, used on the user card.
export function TagPills({ user, server }) {
  user = memberIn(server, user);
  const tags = (user?.tags || []).map((id) => server?.tags?.find((t) => t.id === id)).filter(Boolean);
  if (!tags.length) return null;
  return (
    <div className="tag-pills">
      {tags.map((t) => (
        <span key={t.id} className="tag-pill" style={{ '--tag': t.color }}><PixelIcon name={t.icon} size={14} />{t.name}</span>
      ))}
    </div>
  );
}

// Owner-only checklist on a member's right-click menu.
export function AssignTags({ user, server, onManage }) {
  const has = new Set(user.tags || []);
  const toggle = (t) => api(`/api/tags/${t.id}/users/${user.id}`, { method: has.has(t.id) ? 'DELETE' : 'PUT' }).catch((e) => alert(e.message));
  return (
    <>
      <div className="ctx-label">Tags</div>
      {(server.tags || []).map((t) => (
        <label key={t.id} className="ctx-item check tag-check">
          <span className="tag-check-name"><PixelIcon name={t.icon} size={16} /><span style={{ color: t.color }}>{t.name}</span></span>
          <input type="checkbox" checked={has.has(t.id)} onChange={() => toggle(t)} />
        </label>
      ))}
      <div className="ctx-item" onClick={onManage}>{server.tags?.length ? 'Manage tags…' : 'Create a tag…'}</div>
    </>
  );
}

function IconPicker({ value, onChange }) {
  return (
    <div className="icon-picker">
      {Object.entries(PIXEL_ICONS).map(([k, ic]) => (
        <Tooltip key={k} text={ic.label}>
          <button type="button" className={'icon-pick' + (value === k ? ' sel' : '')} onClick={() => onChange(k)}><PixelIcon name={k} size={32} /></button>
        </Tooltip>
      ))}
    </div>
  );
}

function ColorPicker({ value, onChange }) {
  return (
    <div className="color-picker">
      {TAG_COLORS.map((c) => <button type="button" key={c} className={'color-dot' + (value === c ? ' sel' : '')} style={{ background: c }} onClick={() => onChange(c)} />)}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} title="Custom color" />
    </div>
  );
}

export function ManageTagsModal({ server, onClose }) {
  const [editing, setEditing] = useState(null); // tag being edited, or 'new'
  const [form, setForm] = useState({ name: '', icon: 'crown', color: TAG_COLORS[0] });
  const [err, setErr] = useState('');
  const tags = server.tags || [];
  const counts = Object.fromEntries(tags.map((t) => [t.id, server.members.filter((m) => m.tags?.includes(t.id)).length]));

  const startNew = () => { setEditing('new'); setForm({ name: '', icon: 'crown', color: TAG_COLORS[0] }); setErr(''); };
  const startEdit = (t) => { setEditing(t); setForm({ name: t.name, icon: t.icon, color: t.color }); setErr(''); };
  const save = async () => {
    setErr('');
    try {
      if (editing === 'new') await api(`/api/servers/${server.id}/tags`, { method: 'POST', body: form });
      else await api(`/api/tags/${editing.id}`, { method: 'PATCH', body: form });
      setEditing(null);
    } catch (e) { setErr(e.message); }
  };
  const remove = async (t) => {
    if (!confirm(`Delete the tag "${t.name}"? It will be removed from everyone who has it.`)) return;
    await api(`/api/tags/${t.id}`, { method: 'DELETE' }).catch((e) => alert(e.message));
    if (editing?.id === t.id) setEditing(null);
  };

  return (
    <Modal title="Member tags" onClose={onClose}>
      <div className="modal-body tags-modal">
        <p className="muted small">Create tags with a pixel-art icon, then right-click a friend to give it to them. The icon shows up next to their name.</p>
        <div className="tag-list">
          {tags.map((t) => (
            <div key={t.id} className={'tag-row' + (editing?.id === t.id ? ' sel' : '')}>
              <PixelIcon name={t.icon} size={28} />
              <div className="tag-row-name"><b style={{ color: t.color }}>{t.name}</b><small>{counts[t.id]} {counts[t.id] === 1 ? 'member' : 'members'}</small></div>
              <button className="icon-btn" title="Edit" onClick={() => startEdit(t)}><Icon name="edit" size={18} /></button>
              <button className="icon-btn danger" title="Delete" onClick={() => remove(t)}><Icon name="trash" size={18} /></button>
            </div>
          ))}
          {!tags.length && <p className="muted">No tags yet.</p>}
        </div>

        {editing ? (
          <div className="tag-form">
            <div className="tag-preview">
              <PixelIcon name={form.icon} size={48} />
              <span className="tag-pill" style={{ '--tag': form.color }}><PixelIcon name={form.icon} size={14} />{form.name || 'Tag name'}</span>
            </div>
            <label>Name<input value={form.name} autoFocus maxLength={24} placeholder="e.g. Gym Rat" onChange={(e) => setForm({ ...form, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && save()} /></label>
            <div className="quality-label">Icon</div>
            <IconPicker value={form.icon} onChange={(icon) => setForm({ ...form, icon })} />
            <div className="quality-label">Color</div>
            <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
            {err && <div className="form-error">{err}</div>}
            <div className="modal-foot">
              <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
              <button className="btn primary" disabled={!form.name.trim()} onClick={save}>{editing === 'new' ? 'Create tag' : 'Save'}</button>
            </div>
          </div>
        ) : (
          <button className="btn primary" onClick={startNew}><Icon name="plus" size={18} /> New tag</button>
        )}
      </div>
    </Modal>
  );
}

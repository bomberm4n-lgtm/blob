import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, connectSocket, setToken } from './api';
import { voice } from './voice';
import { Avatar, ContextMenu, Icon, Modal, Slider, Tooltip, useVoice } from './ui';
import { slimeLogo } from './theme';
import Chat from './Chat';
import VoiceView from './VoiceView';
import { SettingsModal, ShareModal, Soundboard } from './Settings';
import { AssignTags, ManageTagsModal, TagBadges } from './Tags';
import { AvatarFx, MyProfilePopout, ProfileCard, ProfileEditor } from './Profile';

export default function App() {
  const [data, setData] = useState(null);
  const [serverId, setServerId] = useState(() => Number(localStorage.getItem('blob_server')) || null);
  const [lastChannel, setLastChannel] = useState(() => JSON.parse(localStorage.getItem('blob_lastch') || '{}'));
  const [presence, setPresence] = useState({}); // userId -> online | idle | dnd (missing = offline)
  const [myPresence, setMyPresence] = useState('online');
  const [statusMenu, setStatusMenu] = useState(false);
  const [voiceStates, setVoiceStates] = useState({});
  const [updateReady, setUpdateReady] = useState(false);

  // Any mouse/keyboard use of the app counts as activity (for the AWAY channel).
  useEffect(() => {
    let last = 0;
    const bump = () => { const n = Date.now(); if (n - last > 5000) { last = n; voice.lastActivity = n; } };
    const evs = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart'];
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => evs.forEach((e) => window.removeEventListener(e, bump));
  }, []);
  const [messages, setMessages] = useState({});
  const [typing, setTyping] = useState({});
  const [unread, setUnread] = useState(new Set());
  const [modal, setModal] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [connected, setConnected] = useState(true);
  const [showMembers, setShowMembers] = useState(true);
  const socketRef = useRef();
  const stateRef = useRef({});
  const v = useVoice();

  const load = useCallback(async () => {
    const d = await api('/api/bootstrap');
    setData(d);
    setPresence(d.presence || Object.fromEntries(d.online.map((id) => [id, 'online'])));
    setMyPresence(d.user.presence || 'online');
    setVoiceStates(d.voice);
  }, []);

  useEffect(() => {
    load();
    const sock = connectSocket((m) => {
      const s = stateRef.current;
      if (m.t === 'hello') {
        // New Blob version on the server: reload (or show a banner if in a call).
        if (!window.__blobVersion) window.__blobVersion = m.version;
        else if (window.__blobVersion !== m.version) {
          if (voice.channelId) setUpdateReady(true); else location.reload();
        }
      } else if (m.t === 'refresh') load();
      else if (m.t === 'presence') setPresence((p) => { const n = { ...p }; const st = m.status || (m.online ? 'online' : 'offline'); if (st === 'offline') delete n[m.userId]; else n[m.userId] = st; return n; });
      else if (m.t === 'voice') setVoiceStates((vs) => { const n = { ...vs }; if (m.state) n[m.userId] = m.state; else delete n[m.userId]; return n; });
      else if (m.t === 'message') {
        setMessages((ms) => (ms[m.msg.channel_id] ? { ...ms, [m.msg.channel_id]: [...ms[m.msg.channel_id], m.msg] } : ms));
        setTyping((t) => { const c = { ...(t[m.msg.channel_id] || {}) }; delete c[m.msg.user_id]; return { ...t, [m.msg.channel_id]: c }; });
        if (m.msg.channel_id !== s.channelId) setUnread((u) => new Set(u).add(m.msg.channel_id));
        if (m.msg.user_id !== s.me && (document.hidden || m.msg.channel_id !== s.channelId)) notify(m.msg);
      } else if (m.t === 'message_update') {
        setMessages((ms) => (ms[m.msg.channel_id] ? { ...ms, [m.msg.channel_id]: ms[m.msg.channel_id].map((x) => (x.id === m.msg.id ? m.msg : x)) } : ms));
      } else if (m.t === 'message_delete') {
        setMessages((ms) => (ms[m.channelId] ? { ...ms, [m.channelId]: ms[m.channelId].filter((x) => x.id !== m.id) } : ms));
      } else if (m.t === 'typing') {
        if (m.userId === s.me) return;
        setTyping((t) => ({ ...t, [m.channelId]: { ...(t[m.channelId] || {}), [m.userId]: Date.now() } }));
      }
    }, (ok) => { setConnected(ok); if (ok) load(); });
    socketRef.current = sock;
    voice.socket = sock;
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    return () => sock.close();
  }, [load]);

  // Push-to-talk and shortcuts
  useEffect(() => {
    const down = (e) => {
      if (e.code === voice.settings.pttKey && !e.repeat && !/INPUT|TEXTAREA/.test(e.target.tagName)) voice.pttDown();
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyM') { e.preventDefault(); voice.setMuted(!voice.muted); }
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') { e.preventDefault(); voice.setDeafened(!voice.deafened); }
    };
    const up = (e) => e.code === voice.settings.pttKey && voice.pttUp();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.blobDesktop?.onGlobalPtt?.((pressed) => (pressed ? voice.pttDown() : voice.pttUp()));
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const servers = data?.servers || [];
  const server = servers.find((s) => s.id === serverId) || servers[0];
  const channels = server?.channels || [];
  const channelId = lastChannel[server?.id] && channels.some((c) => c.id === lastChannel[server.id])
    ? lastChannel[server.id]
    : channels.find((c) => c.type === 'text')?.id;
  const channel = channels.find((c) => c.id === channelId);
  const me = data?.user;
  const usersById = useMemo(() => {
    const m = {};
    for (const s of servers) for (const u of s.members) m[u.id] = u;
    return m;
  }, [servers]);
  stateRef.current = { channelId, me: me?.id, myPresence };

  // Inactive for 10 minutes in a call (not talking, not streaming, not using the app) -> move to AWAY, muted.
  useEffect(() => {
    const id = setInterval(() => {
      if (!voice.channelId || voice.status !== 'connected' || voice.screenStream) return;
      if (Date.now() - voice.lastActivity < AWAY_AFTER_MS) return;
      const srv = servers.find((s) => s.id === voice.serverId);
      const away = srv?.channels.find((c) => c.afk);
      if (!away || away.id === voice.channelId) return;
      voice.join(away.id, srv.id, true).catch(() => {});
    }, 15000);
    return () => clearInterval(id);
  }, [servers]);

  useEffect(() => { if (server) localStorage.setItem('blob_server', server.id); }, [server]);

  const selectChannel = (c) => {
    const n = { ...lastChannel, [server.id]: c.id };
    setLastChannel(n);
    localStorage.setItem('blob_lastch', JSON.stringify(n));
    setUnread((u) => { const x = new Set(u); x.delete(c.id); return x; });
  };

  const joinVoice = (c) => {
    if (v.channelId !== c.id) voice.join(c.id, server.id, !!c.afk);
    selectChannel(c);
  };

  function notify(msg) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (stateRef.current.myPresence === 'dnd') return;
    try { new Notification(msg.username, { body: msg.content || 'Sent a file', icon: slimeLogo, silent: false }); } catch { /* ignore */ }
  }

  if (!data) return <div className="loading"><img src={slimeLogo} alt="" className="loading-blob" /><p>Loading Blob…</p></div>;

  const voiceChannel = v.channelId ? servers.flatMap((s) => s.channels).find((c) => c.id === v.channelId) : null;
  const voiceServer = v.channelId ? servers.find((s) => s.channels.some((c) => c.id === v.channelId)) : null;
  const typingNames = Object.entries(typing[channelId] || {})
    .filter(([, ts]) => Date.now() - ts < 6000)
    .map(([id]) => usersById[id]?.username)
    .filter(Boolean);

  return (
    <div className="app">
      {!connected && <div className="conn-banner">Reconnecting to the Blob server…</div>}
      {updateReady && <div className="conn-banner update-banner">A new version of Blob is available! <button className="btn small" onClick={() => location.reload()}>Update now</button></div>}
      {/* Server bar */}
      <nav className="rail">
        <Tooltip text="Blob" side="right">
          <div className="rail-item home"><img src={slimeLogo} alt="" /></div>
        </Tooltip>
        <div className="rail-sep" />
        {servers.map((s) => (
          <Tooltip key={s.id} text={s.name} side="right">
            <div className={'rail-item' + (s.id === server?.id ? ' active' : '')} onClick={() => setServerId(s.id)}
              onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, type: 'server', server: s }); }}>
              <span className="rail-pill" />
              {s.icon ? <img src={s.icon} alt="" /> : <div className="rail-letter" style={{ background: s.color }}>{initials(s.name)}</div>}
            </div>
          </Tooltip>
        ))}
        <Tooltip text="Create or join a server" side="right">
          <div className="rail-item add" onClick={() => setModal({ type: 'addServer' })}><Icon name="plus" size={24} /></div>
        </Tooltip>
      </nav>

      {/* Channels */}
      <aside className="sidebar">
        <header className="sidebar-head" onClick={(e) => setCtx({ x: e.currentTarget.getBoundingClientRect().left + 10, y: 52, type: 'server', server })}>
          <span>{server?.name}</span>
          <Icon name="chevron" />
        </header>
        <div className="channel-list">
          {server && (
            <>
              <ChannelGroup title="Text channels" onAdd={() => setModal({ type: 'addChannel', kind: 'text' })} />
              {channels.filter((c) => c.type === 'text').map((c) => (
                <div key={c.id} className={'channel' + (c.id === channelId ? ' active' : '') + (unread.has(c.id) ? ' unread' : '')}
                  onClick={() => selectChannel(c)}
                  onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, type: 'channel', channel: c }); }}>
                  <Icon name="hash" size={20} className="ch-icon" />
                  <span>{c.name}</span>
                </div>
              ))}
              <ChannelGroup title="Voice channels" onAdd={() => setModal({ type: 'addChannel', kind: 'voice' })} />
              {channels.filter((c) => c.type === 'voice').sort((x, y) => (x.afk || 0) - (y.afk || 0)).map((c) => {
                const inCh = Object.entries(voiceStates).filter(([, st]) => st.channelId === c.id);
                return (
                  <div key={c.id}>
                    <div className={'channel' + (c.id === channelId ? ' active' : '') + (v.channelId === c.id ? ' connected' : '')}
                      onClick={() => joinVoice(c)}
                      onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, type: 'channel', channel: c }); }}
                      title={c.afk ? 'People inactive for 10 minutes are moved here automatically' : undefined}>
                      {c.afk ? <span className="ch-icon ch-away">💤</span> : <Icon name="speaker" size={20} className="ch-icon" />}
                      <span>{c.name}</span>
                    </div>
                    {inCh.map(([uid, st]) => {
                      const u = usersById[uid];
                      const speaking = v.channelId === c.id && v.speaking.has(String(uid));
                      return (
                        <div key={uid} className="voice-user"
                          onContextMenu={(e) => { e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY, type: 'user', user: u }); }}>
                          <Avatar user={u} size={24} speaking={speaking} />
                          <span className={speaking ? 'speaking-name' : ''}>{u?.username}</span>
                          <TagBadges user={u} server={server} size={14} />
                          <span className="voice-user-icons">
                            {st.streaming && <span className="live-badge">LIVE</span>}
                            {st.video && <Icon name="cam" size={14} />}
                            {st.deafened ? <Icon name="headOff" size={14} className="red" /> : st.muted && <Icon name="micOff" size={14} className="red" />}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Connected voice panel */}
        {v.channelId && (
          <div className="voice-panel">
            <div className="voice-panel-top">
              <div className="voice-status">
                <div className={'voice-conn ' + v.status}>
                  <Icon name="sound" size={16} />
                  {v.status === 'connected' ? 'Voice connected' : v.status === 'reconnecting' ? 'Reconnecting…' : 'Connecting…'}
                  {v.joinedAt && <CallTimer since={v.joinedAt} />}
                  {v.ping != null && <span className="ping">{v.ping} ms</span>}
                </div>
                <div className="voice-where" onClick={() => { setServerId(voiceServer.id); selectChannel(voiceChannel); }}>
                  {voiceChannel?.name} / {voiceServer?.name}
                </div>
              </div>
              <Tooltip text="Disconnect">
                <button className="icon-btn hang" onClick={() => voice.leave()}><Icon name="hangup" /></button>
              </Tooltip>
            </div>
            <div className="voice-panel-actions">
              <Tooltip text={v.local?.isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}>
                <button className={'vp-btn' + (v.local?.isCameraEnabled ? ' on' : '')} onClick={() => voice.toggleCamera().catch((e) => alert(e.message))}><Icon name="cam" /></button>
              </Tooltip>
              <Tooltip text={v.shareInfo ? 'Stop streaming' : 'Share screen'}>
                <button className={'vp-btn' + (v.shareInfo ? ' on' : '')} onClick={() => (v.shareInfo ? voice.stopScreenShare() : setModal({ type: 'share' }))}>
                  <Icon name={v.shareInfo ? 'screenOff' : 'screen'} />
                </button>
              </Tooltip>
              <Tooltip text="Soundboard">
                <button className={'vp-btn' + (modal?.type === 'soundboard' ? ' on' : '')} onClick={() => setModal(modal?.type === 'soundboard' ? null : { type: 'soundboard' })}><Icon name="sb" /></button>
              </Tooltip>
            </div>
            {v.error && <div className="voice-error">{v.error}</div>}
          </div>
        )}
        {!v.channelId && v.error && <div className="voice-error standalone">{v.error}</div>}

        {/* User panel */}
        <div className="user-panel">
          {statusMenu && (
            <MyProfilePopout me={me} server={server} presence={myPresence} onClose={() => setStatusMenu(false)}
              onPresence={(p) => { setMyPresence(p); api('/api/me', { method: 'PATCH', body: { presence: p } }).catch(() => {}); }}
              onEditProfile={() => { setStatusMenu(false); setModal({ type: 'profile' }); }}
              onSettings={() => { setStatusMenu(false); setModal({ type: 'settings' }); }} />
          )}
          <div className="user-panel-info" onClick={() => setModal({ type: 'settings', tab: 'profile' })}>
            <Tooltip text="Profile & status">
              <div className="user-panel-avatar" onClick={(e) => { e.stopPropagation(); setStatusMenu((x) => !x); }}>
                <AvatarFx fx={me.fx} size={32}><Avatar user={me} size={32} status={myPresence} speaking={v.speaking.has(String(me.id))} /></AvatarFx>
              </div>
            </Tooltip>
            <div className="user-panel-names">
              <strong>{me.username}</strong>
              <span>{v.settings.pttEnabled && v.channelId ? (v.pttActive ? 'Talking (PTT)' : 'Push-to-talk') : me.status || PRESENCE_LABEL[myPresence]}</span>
            </div>
          </div>
          <Tooltip text={v.muted ? 'Unmute' : 'Mute'}>
            <button className={'icon-btn' + (v.muted || v.deafened ? ' red' : '')} onClick={() => voice.setMuted(!v.muted)}>
              <Icon name={v.muted || v.deafened ? 'micOff' : 'mic'} />
            </button>
          </Tooltip>
          <Tooltip text={v.deafened ? 'Undeafen' : 'Deafen'}>
            <button className={'icon-btn' + (v.deafened ? ' red' : '')} onClick={() => voice.setDeafened(!v.deafened)}>
              <Icon name={v.deafened ? 'headOff' : 'head'} />
            </button>
          </Tooltip>
          <Tooltip text="Settings">
            <button className="icon-btn" onClick={() => setModal({ type: 'settings' })}><Icon name="gear" /></button>
          </Tooltip>
        </div>
      </aside>

      {/* Content */}
      <main className="main">
        {channel?.type === 'voice' ? (
          <VoiceView channel={channel} server={server} usersById={usersById} voiceStates={voiceStates}
            onJoin={() => joinVoice(channel)} onShare={() => setModal({ type: 'share' })}
            onSoundboard={() => setModal({ type: 'soundboard' })}
            onUserMenu={(e, u) => setCtx({ x: e.clientX, y: e.clientY, type: 'user', user: u })} />
        ) : channel ? (
          <Chat key={channel.id} channel={channel} server={server} me={me} usersById={usersById}
            messages={messages[channel.id]} setMessages={(fn) => setMessages((ms) => ({ ...ms, [channel.id]: fn(ms[channel.id]) }))}
            typingNames={typingNames} socket={socketRef.current}
            showMembers={showMembers} toggleMembers={() => setShowMembers((x) => !x)}
            members={showMembers && <MemberList server={server} presence={{ ...presence, [me.id]: myPresence }} voiceStates={voiceStates} onUser={(e, u) => setCtx({ x: e.clientX, y: e.clientY, type: 'user', user: u })} />} />
        ) : (
          <div className="empty-main"><img src={slimeLogo} alt="" /><p>Create a channel to get started.</p></div>
        )}
      </main>

      {ctx && (
        <ContextMenu x={ctx.x} y={ctx.y} onClose={() => setCtx(null)} className={ctx.type === 'user' ? 'ctx-card' : ''}>
          <CtxContent ctx={ctx} me={me} server={server} presence={{ ...presence, [me.id]: myPresence }} close={() => setCtx(null)} setModal={setModal} />
        </ContextMenu>
      )}

      {modal?.type === 'settings' && <SettingsModal me={me} tab={modal.tab} onClose={() => setModal(null)}
        onLogout={async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); await voice.leave(true); setToken(null); location.reload(); }} />}
      {modal?.type === 'share' && <ShareModal onClose={() => setModal(null)} />}
      {modal?.type === 'soundboard' && <Soundboard server={voiceServer || server} onClose={() => setModal(null)} />}
      {modal?.type === 'addServer' && <AddServerModal onClose={() => setModal(null)} onDone={(id) => { setModal(null); setServerId(id); load(); }} />}
      {modal?.type === 'addChannel' && <AddChannelModal server={server} kind={modal.kind} onClose={() => setModal(null)} />}
      {modal?.type === 'invite' && <InviteModal server={modal.server} onClose={() => setModal(null)} />}
      {modal?.type === 'rename' && <RenameModal {...modal} onClose={() => setModal(null)} />}
      {modal?.type === 'tags' && server && <ManageTagsModal server={server} onClose={() => setModal(null)} />}
      {modal?.type === 'profile' && <ProfileEditor me={me} server={server} presence={myPresence} onClose={() => setModal(null)} />}
    </div>
  );
}

function initials(name) {
  return name.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase();
}

function ChannelGroup({ title, onAdd }) {
  return (
    <div className="channel-group">
      <span><Icon name="chevron" size={12} /> {title}</span>
      <Tooltip text="Create channel"><button className="icon-btn tiny" onClick={onAdd}><Icon name="plus" size={18} /></button></Tooltip>
    </div>
  );
}

const PRESENCE_LABEL = { online: 'Online', idle: 'Idle', dnd: 'Do Not Disturb', invisible: 'Invisible' };
const AWAY_AFTER_MS = 10 * 60 * 1000;

function CallTimer({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return <span className="call-timer" title="Time in this call">{hh ? hh + ':' + pad(mm) : mm}:{pad(ss)}</span>;
}

function MemberList({ server, presence, voiceStates, onUser }) {
  const statusOf = (u) => presence[u.id] || 'offline';
  const isOnline = (u) => !['offline', 'invisible'].includes(statusOf(u));
  const on = server.members.filter(isOnline);
  const off = server.members.filter((u) => !isOnline(u));
  const row = (u, isOn) => (
    <div key={u.id} className={'member' + (isOn ? '' : ' offline')} onClick={(e) => onUser(e, u)} onContextMenu={(e) => { e.preventDefault(); onUser(e, u); }}>
      <AvatarFx fx={u.fx} size={32}><Avatar user={u} size={32} status={statusOf(u)} /></AvatarFx>
      <div className="member-names">
        <span className="member-name" style={{ color: isOn ? u.color : undefined }}>{u.username}{u.id === server.owner_id && ' 👑'}<TagBadges user={u} server={server} /></span>
        {voiceStates[u.id] ? <small>🔊 In a call{voiceStates[u.id].streaming && ' • streaming'}</small> : u.status && <small>{u.status}</small>}
      </div>
    </div>
  );
  return (
    <aside className="members">
      <h3>Online — {on.length}</h3>
      {on.map((u) => row(u, true))}
      <h3>Offline — {off.length}</h3>
      {off.map((u) => row(u, false))}
    </aside>
  );
}

function CtxContent({ ctx, me, server, presence = {}, close, setModal }) {
  const v = useVoice();
  if (ctx.type === 'server') {
    const s = ctx.server;
    const owner = s.owner_id === me.id;
    return (
      <>
        <div className="ctx-item" onClick={() => { setModal({ type: 'invite', server: s }); close(); }}>Invite people</div>
        {owner && <div className="ctx-item" onClick={() => { setModal({ type: 'rename', what: 'server', item: s }); close(); }}>Rename server</div>}
        {owner && <div className="ctx-item" onClick={() => { setModal({ type: 'tags' }); close(); }}>Member tags</div>}
        {owner && (
          <label className="ctx-item">Change icon
            <input type="file" accept="image/*" hidden onChange={async (e) => {
              const f = new FormData(); f.append('file', e.target.files[0]);
              await api(`/api/servers/${s.id}/icon`, { method: 'POST', form: f }).catch((x) => alert(x.message)); close();
            }} />
          </label>
        )}
        <div className="ctx-sep" />
        {owner
          ? <div className="ctx-item danger" onClick={async () => { if (confirm(`Delete the server "${s.name}"? This cannot be undone.`)) await api('/api/servers/' + s.id, { method: 'DELETE' }); close(); }}>Delete server</div>
          : <div className="ctx-item danger" onClick={async () => { if (confirm(`Leave "${s.name}"?`)) await api(`/api/servers/${s.id}/leave`, { method: 'POST' }); close(); }}>Leave server</div>}
      </>
    );
  }
  if (ctx.type === 'channel') {
    const c = ctx.channel;
    return (
      <>
        <div className="ctx-item" onClick={() => { setModal({ type: 'rename', what: 'channel', item: c }); close(); }}>Edit channel</div>
        <div className="ctx-item danger" onClick={async () => { if (confirm(`Delete the channel "${c.name}"?`)) await api('/api/channels/' + c.id, { method: 'DELETE' }); close(); }}>Delete channel</div>
      </>
    );
  }
  if (ctx.type === 'user') {
    // Look the user up again so tag changes show up right away while the menu is open.
    const u = server?.members.find((m) => m.id === ctx.user?.id) || ctx.user;
    if (!u) return null;
    const id = String(u.id);
    const isMe = u.id === me.id;
    return (
      <div className="ctx-user">
        <ProfileCard user={u} server={server} presence={presence[u.id] || 'offline'} size={72} />
        <div className="ctx-after">
        {server && server.owner_id === me.id && (
          <>
            <div className="ctx-sep" />
            <AssignTags user={u} server={server} onManage={() => { setModal({ type: 'tags' }); close(); }} />
          </>
        )}
        {!isMe && (
          <>
            <div className="ctx-sep" />
            <div className="ctx-slider">
              <Slider label="User volume" value={(v.settings.userVolumes[id] ?? 1) * 100} max={200} onChange={(x) => voice.setUserVolume(id, x / 100)} />
            </div>
            <div className="ctx-slider">
              <Slider label="Stream volume" value={(v.settings.streamVolumes[id] ?? 1) * 100} max={200} onChange={(x) => voice.setStreamVolume(id, x / 100)} />
            </div>
            <label className="ctx-item check">
              Mute (just for me)
              <input type="checkbox" checked={!!v.settings.userMuted[id]} onChange={(e) => voice.setUserMuted(id, e.target.checked)} />
            </label>
          </>
        )}
        </div>
      </div>
    );
  }
  return null;
}

function AddServerModal({ onClose, onDone }) {
  const [name, setName] = useState('');
  const [invite, setInvite] = useState('');
  const [err, setErr] = useState('');
  const create = async () => { try { const r = await api('/api/servers', { method: 'POST', body: { name } }); onDone(r.id); } catch (e) { setErr(e.message); } };
  const join = async () => { try { const r = await api('/api/join', { method: 'POST', body: { invite } }); onDone(r.id); } catch (e) { setErr(e.message); } };
  return (
    <Modal title="Add a server" onClose={onClose}>
      <div className="modal-body">
        <label>Create a new server<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Server name" /></label>
        <button className="btn primary" disabled={!name.trim()} onClick={create}>Create</button>
        <div className="or">ou</div>
        <label>Join with an invite code<input value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="e.g. 9f8e7d6c" /></label>
        <button className="btn" disabled={!invite.trim()} onClick={join}>Join server</button>
        {err && <div className="form-error">{err}</div>}
      </div>
    </Modal>
  );
}

function AddChannelModal({ server, kind, onClose }) {
  const [type, setType] = useState(kind);
  const [name, setName] = useState('');
  const create = async () => { await api(`/api/servers/${server.id}/channels`, { method: 'POST', body: { name, type } }).catch((e) => alert(e.message)); onClose(); };
  return (
    <Modal title="Create channel" onClose={onClose}>
      <div className="modal-body">
        <div className="radio-cards">
          <label className={type === 'text' ? 'sel' : ''}><input type="radio" checked={type === 'text'} onChange={() => setType('text')} /><Icon name="hash" /> Text</label>
          <label className={type === 'voice' ? 'sel' : ''}><input type="radio" checked={type === 'voice'} onChange={() => setType('voice')} /><Icon name="speaker" /> Voice</label>
        </div>
        <label>Channel name<input value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} placeholder={type === 'text' ? 'new-channel' : 'Room 3'} /></label>
        <button className="btn primary" disabled={!name.trim()} onClick={create}>Create channel</button>
      </div>
    </Modal>
  );
}

function InviteModal({ server, onClose }) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal title={`Invite friends to ${server.name}`} onClose={onClose}>
      <div className="modal-body">
        <p className="muted">Send this code to your friend. They click <b>+</b> on the left bar and paste the code.</p>
        <div className="invite-box">
          <code>{server.invite}</code>
          <button className="btn primary" onClick={() => { navigator.clipboard.writeText(server.invite); setCopied(true); }}>{copied ? 'Copied!' : 'Copy'}</button>
        </div>
      </div>
    </Modal>
  );
}

function RenameModal({ what, item, onClose }) {
  const [name, setName] = useState(item.name);
  const save = async () => {
    await api(what === 'server' ? '/api/servers/' + item.id : '/api/channels/' + item.id, { method: 'PATCH', body: { name } }).catch((e) => alert(e.message));
    onClose();
  };
  return (
    <Modal title={what === 'server' ? 'Rename server' : 'Edit channel'} onClose={onClose}>
      <div className="modal-body">
        <label>Name<input value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} /></label>
        <button className="btn primary" onClick={save}>Save</button>
      </div>
    </Modal>
  );
}

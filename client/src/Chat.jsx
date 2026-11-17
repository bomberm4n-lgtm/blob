import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { api } from './api';
import { Avatar, Icon, Tooltip, fmtTime } from './ui';

const QUICK = ['👍', '😂', '❤️', '🔥', '😮', '😢', '💀', '🤡', '👀', '🎉', '😡', '🙏'];
const EMOJIS = '😀😃😄😁😆😅🤣😂🙂🙃😉😊😇🥰😍🤩😘😋😛😜🤪😝🤑🤗🤭🤫🤔🤐🤨😐😑😶😏😒🙄😬🤥😌😔😪🤤😴😷🤒🤕🤢🤮🤧🥵🥶🥴😵🤯🤠🥳😎🤓🧐😕😟🙁😮😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖😺😸😹😻😼😽🙀😿😾🙈🙉🙊💋💯💢💥💫💦💨🕳️💣💬👋🤚🖐️✋🖖👌🤌🤏✌️🤞🤟🤘🤙👈👉👆🖕👇☝️👍👎✊👊🤛🤜👏🙌👐🤲🤝🙏💪🧠👀👁️👅👄❤️🧡💛💚💙💜🖤🤍🤎💔🔥⭐🌟✨⚡🎉🎊🏆🎮🕹️🎲🍕🍔🍟🌭🍺🍻☕🚀💎'.match(/\p{Extended_Pictographic}️?/gu);

function renderText(text) {
  // Simple markdown: **bold**, *italic*, `code`, ```block```, links and ||spoiler||
  const parts = [];
  const re = /```([\s\S]+?)```|`([^`]+)`|\*\*(.+?)\*\*|\*(.+?)\*|\|\|(.+?)\|\||(https?:\/\/[^\s<]+)/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<pre key={k++}><code>{m[1].replace(/^\w*\n/, '')}</code></pre>);
    else if (m[2]) parts.push(<code key={k++} className="inline-code">{m[2]}</code>);
    else if (m[3]) parts.push(<strong key={k++}>{m[3]}</strong>);
    else if (m[4]) parts.push(<em key={k++}>{m[4]}</em>);
    else if (m[5]) parts.push(<Spoiler key={k++}>{m[5]}</Spoiler>);
    else if (m[6]) parts.push(<a key={k++} href={m[6]} target="_blank" rel="noreferrer">{m[6]}</a>);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function Spoiler({ children }) {
  const [open, setOpen] = useState(false);
  return <span className={'spoiler' + (open ? ' open' : '')} onClick={() => setOpen(true)}>{children}</span>;
}

function Attachment({ a }) {
  if (!a) return null;
  if (a.type?.startsWith('image/')) return <a href={a.url} target="_blank" rel="noreferrer"><img className="att-img" src={a.url} alt={a.name} loading="lazy" /></a>;
  if (a.type?.startsWith('video/')) return <video className="att-video" src={a.url} controls preload="metadata" />;
  if (a.type?.startsWith('audio/')) return <audio className="att-audio" src={a.url} controls preload="metadata" />;
  return (
    <a className="att-file" href={a.url} target="_blank" rel="noreferrer" download={a.name}>
      <Icon name="upload" /> <span>{a.name}</span> <small>{(a.size / 1024 / 1024).toFixed(2)} MB</small>
    </a>
  );
}

export default function Chat({ channel, server, me, messages, setMessages, typingNames, socket, members, toggleMembers, showMembers }) {
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [editing, setEditing] = useState(null);
  const [picker, setPicker] = useState(null); // {msgId} | 'input'
  const [dragging, setDragging] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const listRef = useRef();
  const inputRef = useRef();
  const stickRef = useRef(true);
  const lastTyping = useRef(0);
  const prevHeight = useRef(null);

  useEffect(() => {
    if (!messages) api(`/api/channels/${channel.id}/messages`).then((m) => { setMessages(() => m); setHasMore(m.length >= 60); });
    inputRef.current?.focus();
  }, [channel.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prevHeight.current != null) {
      el.scrollTop = el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = async () => {
    const el = listRef.current;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 100 && hasMore && messages?.length && !prevHeight.current) {
      prevHeight.current = el.scrollHeight;
      const older = await api(`/api/channels/${channel.id}/messages?before=${messages[0].id}`);
      if (older.length < 60) setHasMore(false);
      if (older.length) setMessages((m) => [...older, ...(m || [])]);
      else prevHeight.current = null;
    }
  };

  const send = async () => {
    if (sending || (!text.trim() && !file)) return;
    setSending(true);
    const f = new FormData();
    f.append('content', text);
    if (file) f.append('file', file);
    try {
      stickRef.current = true;
      await api(`/api/channels/${channel.id}/messages`, { method: 'POST', form: f });
      setText('');
      setFile(null);
    } catch (e) {
      alert(e.message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'ArrowUp' && !text) {
      const mine = [...(messages || [])].reverse().find((m) => m.user_id === me.id);
      if (mine) setEditing({ id: mine.id, text: mine.content });
    }
    if (Date.now() - lastTyping.current > 3000) { lastTyping.current = Date.now(); socket?.send({ t: 'typing', channelId: channel.id }); }
  };

  const onPaste = (e) => {
    const f = [...e.clipboardData.files][0];
    if (f) { e.preventDefault(); setFile(f); }
  };

  const saveEdit = async () => {
    await api('/api/messages/' + editing.id, { method: 'PATCH', body: { content: editing.text } }).catch((e) => alert(e.message));
    setEditing(null);
  };

  const react = (id, emoji) => api(`/api/messages/${id}/react`, { method: 'POST', body: { emoji } });

  const list = messages || [];
  return (
    <div className="chat-wrap">
      <header className="main-head">
        <Icon name="hash" className="ch-icon" />
        <h3>{channel.name}</h3>
        <span className="head-sep" />
        <span className="muted small">{server.name}</span>
        <div className="head-actions">
          <Tooltip text={showMembers ? 'Hide members' : 'Show members'} side="bottom">
            <button className={'icon-btn' + (showMembers ? ' on' : '')} onClick={toggleMembers}><Icon name="people" /></button>
          </Tooltip>
        </div>
      </header>
      <div className="chat-body">
        <div className="chat"
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}>
          <div className="messages" ref={listRef} onScroll={onScroll}>
            {!hasMore && (
              <div className="chat-start">
                <div className="chat-start-icon"><Icon name="hash" size={40} /></div>
                <h1>Welcome to #{channel.name}!</h1>
                <p className="muted">This is the start of the #{channel.name} channel.</p>
              </div>
            )}
            {list.map((m, i) => {
              const prev = list[i - 1];
              const grouped = prev && prev.user_id === m.user_id && m.created_at - prev.created_at < 5 * 60 * 1000;
              const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
              const att = m.attachment ? JSON.parse(m.attachment) : null;
              const mention = m.content.includes('@' + me.username) || m.content.includes('@everyone');
              return (
                <Fragment key={m.id}>
                  {newDay && <div className="day-sep"><span>{new Date(m.created_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div>}
                  <div className={'msg' + (grouped && !newDay ? ' grouped' : '') + (mention ? ' mention' : '')}>
                    {grouped && !newDay ? (
                      <span className="msg-time-side">{new Date(m.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                    ) : (
                      <Avatar user={{ username: m.username, color: m.color, avatar: m.avatar }} size={40} />
                    )}
                    <div className="msg-content">
                      {!(grouped && !newDay) && (
                        <div className="msg-head">
                          <span className="msg-author" style={{ color: m.color }}>{m.username}</span>
                          <span className="msg-time">{fmtTime(m.created_at)}</span>
                        </div>
                      )}
                      {editing?.id === m.id ? (
                        <div className="msg-edit">
                          <textarea autoFocus value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); } if (e.key === 'Escape') setEditing(null); }} />
                          <small className="muted">Esc to cancel • Enter to save</small>
                        </div>
                      ) : (
                        m.content && <div className="msg-text">{renderText(m.content)}{m.edited_at && <span className="edited"> (edited)</span>}</div>
                      )}
                      <Attachment a={att} />
                      {Object.keys(m.reactions || {}).length > 0 && (
                        <div className="reactions">
                          {Object.entries(m.reactions).map(([emo, users]) => (
                            <button key={emo} className={'reaction' + (users.includes(me.id) ? ' mine' : '')} onClick={() => react(m.id, emo)}>
                              {emo} <span>{users.length}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="msg-actions">
                      {QUICK.slice(0, 3).map((e) => <button key={e} onClick={() => react(m.id, e)}>{e}</button>)}
                      <Tooltip text="React"><button onClick={() => setPicker({ msgId: m.id })}><Icon name="smile" size={18} /></button></Tooltip>
                      {m.user_id === me.id && <Tooltip text="Edit"><button onClick={() => setEditing({ id: m.id, text: m.content })}><Icon name="edit" size={18} /></button></Tooltip>}
                      {(m.user_id === me.id || server.owner_id === me.id) && (
                        <Tooltip text="Delete"><button className="danger" onClick={(e) => (e.shiftKey || confirm('Delete this message?')) && api('/api/messages/' + m.id, { method: 'DELETE' })}><Icon name="trash" size={18} /></button></Tooltip>
                      )}
                    </div>
                    {picker?.msgId === m.id && <EmojiPicker onPick={(e) => { react(m.id, e); setPicker(null); }} onClose={() => setPicker(null)} />}
                  </div>
                </Fragment>
              );
            })}
          </div>
          {dragging && <div className="drop-overlay"><div>Drop the file to send it in #{channel.name}</div></div>}
          <div className="composer-wrap">
            {file && (
              <div className="file-preview">
                {file.type.startsWith('image/') ? <img src={URL.createObjectURL(file)} alt="" /> : <Icon name="upload" size={32} />}
                <span>{file.name}</span>
                <button className="icon-btn" onClick={() => setFile(null)}><Icon name="close" /></button>
              </div>
            )}
            <div className="composer">
              <label className="icon-btn composer-add">
                <Icon name="plus" />
                <input type="file" hidden onChange={(e) => { setFile(e.target.files[0]); e.target.value = ''; }} />
              </label>
              <textarea ref={inputRef} rows={1} value={text} placeholder={`Message #${channel.name}`}
                onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onPaste={onPaste} />
              <button className="icon-btn" onClick={() => setPicker(picker === 'input' ? null : 'input')}><Icon name="smile" /></button>
              {picker === 'input' && <EmojiPicker anchor="input" onPick={(e) => { setText((t) => t + e); inputRef.current?.focus(); }} onClose={() => setPicker(null)} />}
            </div>
            <div className="typing">
              {typingNames.length > 0 && (
                <><span className="dots"><i /><i /><i /></span><b>{typingNames.join(', ')}</b> {typingNames.length > 1 ? 'are' : 'is'} typing…</>
              )}
            </div>
          </div>
        </div>
        {members}
      </div>
    </div>
  );
}

function EmojiPicker({ onPick, onClose, anchor }) {
  const ref = useRef();
  useEffect(() => {
    const h = (e) => !ref.current?.contains(e.target) && onClose();
    setTimeout(() => window.addEventListener('mousedown', h));
    return () => window.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div ref={ref} className={'emoji-picker' + (anchor === 'input' ? ' at-input' : '')}>
      {EMOJIS.map((e, i) => <button key={i} onClick={() => onPick(e)}>{e}</button>)}
    </div>
  );
}

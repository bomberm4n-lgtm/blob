// "Add sound" dialog for the soundboard: pick a file, trim it to at most 5 seconds on a waveform,
// preview it, pick an emoji, name and volume, then upload the trimmed clip as a WAV.
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
import { voice } from './voice';
import { Icon, Modal, Slider } from './ui';

export const MAX_SOUND_SECONDS = 5;
export const EMOJIS = ['🔊', '😂', '💀', '🤣', '😭', '🔥', '💩', '👏', '🎉', '😡', '😱', '🤡', '👀', '🗿', '🐐', '🐒', '🦆', '🐸', '🍆', '💥', '📢', '🎺', '🥁', '🎸', '🚨', '⚡', '❤️', '👑', '🤬', '😴', '🙏', '🤓'];

const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

// Encode an AudioBuffer slice as 16-bit PCM WAV, with tiny fades so the cut points don't click.
function encodeWav(buffer, start, end) {
  const rate = buffer.sampleRate;
  const channels = Math.min(2, buffer.numberOfChannels);
  const from = Math.floor(start * rate);
  const len = Math.max(1, Math.floor((end - start) * rate));
  const fade = Math.min(Math.floor(rate * 0.006), Math.floor(len / 2));
  const dataBytes = len * channels * 2;
  const view = new DataView(new ArrayBuffer(44 + dataBytes));
  const str = (o, s) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, 36 + dataBytes, true); str(8, 'WAVE');
  str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  str(36, 'data'); view.setUint32(40, dataBytes, true);
  const data = [...Array(channels)].map((_, c) => buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    const g = i < fade ? i / fade : i > len - fade ? (len - i) / fade : 1;
    for (let c = 0; c < channels; c++) {
      const v = Math.max(-1, Math.min(1, (data[c][from + i] || 0) * g));
      view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view], { type: 'audio/wav' });
}

function Waveform({ buffer, start, end, playhead, onChange }) {
  const canvasRef = useRef();
  const wrapRef = useRef();
  const dur = buffer.duration;

  useEffect(() => {
    const cv = canvasRef.current;
    const w = (cv.width = cv.clientWidth * devicePixelRatio);
    const h = (cv.height = cv.clientHeight * devicePixelRatio);
    const ctx = cv.getContext('2d');
    const d = buffer.getChannelData(0);
    const step = Math.max(1, Math.floor(d.length / w));
    ctx.clearRect(0, 0, w, h);
    const bar = 3 * devicePixelRatio;
    for (let x = 0; x < w; x += bar) {
      let peak = 0;
      const i0 = Math.floor((x / w) * d.length);
      for (let i = i0; i < i0 + step * bar && i < d.length; i += 4) peak = Math.max(peak, Math.abs(d[i]));
      const t = (x / w) * dur;
      ctx.fillStyle = t >= start && t <= end ? '#3ecf8e' : '#4e5058';
      const bh = Math.max(2, peak * h * 0.92);
      ctx.fillRect(x, (h - bh) / 2, bar - devicePixelRatio, bh);
    }
  }, [buffer, start, end, dur]);

  // Drag a handle ('start' | 'end') or the whole selection ('move').
  const drag = (kind) => (e) => {
    e.preventDefault();
    const rect = wrapRef.current.getBoundingClientRect();
    const t0 = ((e.clientX - rect.left) / rect.width) * dur;
    const s0 = start;
    const e0 = end;
    const move = (ev) => {
      const t = Math.max(0, Math.min(dur, ((ev.clientX - rect.left) / rect.width) * dur));
      if (kind === 'start') onChange(Math.max(0, Math.max(e0 - MAX_SOUND_SECONDS, Math.min(t, e0 - 0.1))), e0);
      else if (kind === 'end') onChange(s0, Math.min(dur, Math.min(s0 + MAX_SOUND_SECONDS, Math.max(t, s0 + 0.1))));
      else {
        const len = e0 - s0;
        const ns = Math.max(0, Math.min(dur - len, s0 + (t - t0)));
        onChange(ns, ns + len);
      }
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  // Clicking outside the selection moves it there (keeping its length).
  const jump = (e) => {
    if (e.target !== wrapRef.current && e.target !== canvasRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const t = ((e.clientX - rect.left) / rect.width) * dur;
    const len = end - start;
    const ns = Math.max(0, Math.min(dur - len, t - len / 2));
    onChange(ns, ns + len);
  };

  const pct = (t) => (t / dur) * 100 + '%';
  return (
    <div className="wave" ref={wrapRef} onMouseDown={jump}>
      <canvas ref={canvasRef} />
      <div className="wave-sel" style={{ left: pct(start), width: `calc(${pct(end)} - ${pct(start)})` }} onMouseDown={drag('move')}>
        <div className="wave-handle left" onMouseDown={(e) => { e.stopPropagation(); drag('start')(e); }} />
        <div className="wave-handle right" onMouseDown={(e) => { e.stopPropagation(); drag('end')(e); }} />
      </div>
      {playhead != null && <div className="wave-playhead" style={{ left: pct(playhead) }} />}
    </div>
  );
}

export function AddSoundModal({ server, onClose }) {
  const [file, setFile] = useState(null);
  const [buffer, setBuffer] = useState(null);
  const [sel, setSel] = useState([0, 0]);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🔊');
  const [volume, setVolume] = useState(100);
  const [playhead, setPlayhead] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const audioRef = useRef(null); // { ctx, src, raf }

  const stop = () => {
    const a = audioRef.current;
    if (!a) return;
    cancelAnimationFrame(a.raf);
    try { a.src.stop(); } catch { /* already stopped */ }
    a.ctx.close().catch(() => {});
    audioRef.current = null;
    setPlayhead(null);
  };
  useEffect(() => stop, []);

  const load = async (f) => {
    stop();
    setErr('');
    if (!f) return;
    if (!f.type.startsWith('audio/') && !/\.(mp3|ogg|wav|m4a|aac|flac|webm|opus)$/i.test(f.name)) return setErr('Please choose an audio file.');
    if (f.size > 40 * 1024 * 1024) return setErr('File too large (max 40 MB before trimming).');
    try {
      const ctx = new AudioContext();
      const buf = await ctx.decodeAudioData(await f.arrayBuffer());
      ctx.close();
      setFile(f);
      setBuffer(buf);
      setSel([0, Math.min(MAX_SOUND_SECONDS, buf.duration)]);
      if (!name) setName(f.name.replace(/\.[^.]+$/, '').slice(0, 32));
    } catch {
      setErr("Couldn't read that audio file.");
    }
  };

  const play = () => {
    if (audioRef.current) return stop();
    const ctx = new AudioContext();
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = (volume / 100) * (voice.settings.soundVolume ?? 0.6);
    src.connect(g).connect(ctx.destination);
    const [s, e] = sel;
    const t0 = ctx.currentTime;
    src.start(0, s, e - s);
    src.onended = stop;
    const tick = () => {
      setPlayhead(s + (ctx.currentTime - t0));
      audioRef.current.raf = requestAnimationFrame(tick);
    };
    audioRef.current = { ctx, src, raf: 0 };
    tick();
  };

  const upload = async () => {
    setBusy(true);
    setErr('');
    try {
      const wav = encodeWav(buffer, sel[0], sel[1]);
      const f = new FormData();
      f.append('file', wav, (name || 'sound') + '.wav');
      f.append('name', name.trim() || file.name.replace(/\.[^.]+$/, ''));
      f.append('emoji', emoji);
      f.append('volume', String(volume / 100));
      await api(`/api/servers/${server.id}/sounds`, { method: 'POST', form: f });
      onClose();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const len = sel[1] - sel[0];
  return (
    <Modal title="Add a sound" onClose={() => { stop(); onClose(); }} className="sound-modal">
      <div className="modal-body">
        {!buffer ? (
          <label className={'sound-drop' + (dragOver ? ' over' : '')}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); load(e.dataTransfer.files[0]); }}>
            <Icon name="upload" size={36} />
            <b>Drop an audio file here or click to browse</b>
            <small>MP3, OGG, WAV, M4A… You'll trim it to {MAX_SOUND_SECONDS} seconds next.</small>
            <input type="file" accept="audio/*" hidden onChange={(e) => { load(e.target.files[0]); e.target.value = ''; }} />
          </label>
        ) : (
          <>
            <div className="sound-file">
              <span className="sound-file-name">{file.name}</span>
              <label className="btn small">Change file<input type="file" accept="audio/*" hidden onChange={(e) => { load(e.target.files[0]); e.target.value = ''; }} /></label>
            </div>
            <Waveform buffer={buffer} start={sel[0]} end={sel[1]} playhead={playhead} onChange={(s, e) => { stop(); setSel([s, e]); }} />
            <div className="sound-times">
              <button className="btn primary small sound-play" onClick={play}>{playhead != null ? '■ Stop' : '▶ Preview'}</button>
              <span>{fmt(sel[0])} – {fmt(sel[1])}</span>
              <span className={'sound-len' + (len > MAX_SOUND_SECONDS - 0.05 ? ' max' : '')}>{len.toFixed(1)}s / {MAX_SOUND_SECONDS}s max</span>
            </div>
            <p className="muted small">Drag the green edges to trim, or drag the middle to move the clip.</p>
          </>
        )}

        <div className="sound-meta">
          <div className="sound-emoji-pick">
            <div className="quality-label">Emoji</div>
            <div className="emoji-grid">
              {EMOJIS.map((e) => <button key={e} type="button" className={'emoji-cell' + (emoji === e ? ' sel' : '')} onClick={() => setEmoji(e)}>{e}</button>)}
            </div>
            <input className="emoji-input" value={emoji} maxLength={8} onChange={(e) => setEmoji(e.target.value)} title="Or type/paste any emoji" />
          </div>
          <div className="sound-fields">
            <label>Sound name<input value={name} maxLength={32} placeholder="e.g. bonk" onChange={(e) => setName(e.target.value)} /></label>
            <Slider label="Volume" value={volume} max={200} onChange={setVolume} />
            <div className="sb-btn sound-preview-btn"><span className="sb-emoji">{emoji}</span><span className="sb-name">{name || 'Sound name'}</span></div>
          </div>
        </div>

        {err && <div className="form-error">{err}</div>}
        <div className="modal-foot">
          <button className="btn" onClick={() => { stop(); onClose(); }}>Cancel</button>
          <button className="btn primary" disabled={!buffer || busy || !name.trim()} onClick={upload}>{busy ? 'Uploading…' : 'Upload'}</button>
        </div>
      </div>
    </Modal>
  );
}

// Edit an existing sound: name, emoji and volume (0–200%), with a preview at the chosen volume.
export function EditSoundModal({ sound, onClose }) {
  const [name, setName] = useState(sound.name);
  const [emoji, setEmoji] = useState(sound.emoji || '🔊');
  const [volume, setVolume] = useState(Math.round((sound.volume ?? 1) * 100));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setErr('');
    try {
      await api('/api/sounds/' + sound.id, { method: 'PATCH', body: { name: name.trim(), emoji, volume: volume / 100 } });
      onClose();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const remove = async () => {
    if (!confirm(`Delete the sound "${sound.name}"?`)) return;
    await api('/api/sounds/' + sound.id, { method: 'DELETE' }).catch((e) => alert(e.message));
    onClose();
  };
  return (
    <Modal title="Edit sound" onClose={onClose} className="sound-modal">
      <div className="modal-body">
        <div className="sound-meta">
          <div className="sound-emoji-pick">
            <div className="quality-label">Emoji</div>
            <div className="emoji-grid">
              {EMOJIS.map((e) => <button key={e} type="button" className={'emoji-cell' + (emoji === e ? ' sel' : '')} onClick={() => setEmoji(e)}>{e}</button>)}
            </div>
            <input className="emoji-input" value={emoji} maxLength={8} onChange={(e) => setEmoji(e.target.value)} title="Or type/paste any emoji" />
          </div>
          <div className="sound-fields">
            <label>Sound name<input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} /></label>
            <Slider label="Volume" value={volume} max={200} onChange={setVolume} />
            <button type="button" className="btn small sound-play" onClick={() => voice.playSoundLocal(sound.file, volume / 100)}>▶ Preview</button>
            <div className="sb-btn sound-preview-btn"><span className="sb-emoji">{emoji}</span><span className="sb-name">{name || 'Sound name'}</span></div>
          </div>
        </div>
        {err && <div className="form-error">{err}</div>}
        <div className="modal-foot">
          <button className="btn danger-text" onClick={remove} style={{ marginRight: 'auto' }}><Icon name="trash" size={16} /> Delete</button>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy || !name.trim()} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </Modal>
  );
}

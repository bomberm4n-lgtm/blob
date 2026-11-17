import { useEffect, useState } from 'react';
import { api } from './api';
import { voice, SHARE_RESOLUTIONS } from './voice';
import { startMicMeter } from './noise';
import { Avatar, Icon, Modal, Slider, useVoice } from './ui';

function useDevices() {
  const [devices, setDevices] = useState([]);
  useEffect(() => {
    const load = async () => {
      try {
        let list = await navigator.mediaDevices.enumerateDevices();
        if (!list.some((d) => d.label)) {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
          s?.getTracks().forEach((t) => t.stop());
          list = await navigator.mediaDevices.enumerateDevices();
        }
        setDevices(list);
      } catch { /* ignore */ }
    };
    load();
    navigator.mediaDevices?.addEventListener('devicechange', load);
    return () => navigator.mediaDevices?.removeEventListener('devicechange', load);
  }, []);
  return devices;
}

export function SettingsModal({ me, tab: initialTab, onClose, onLogout }) {
  const [tab, setTab] = useState(initialTab || 'voice');
  return (
    <div className="settings-page">
      <nav className="settings-nav">
        <div className="settings-nav-inner">
          <h4>Configurações de usuário</h4>
          <div className={'snav' + (tab === 'profile' ? ' active' : '')} onClick={() => setTab('profile')}>Minha conta</div>
          <h4>Configurações do app</h4>
          <div className={'snav' + (tab === 'voice' ? ' active' : '')} onClick={() => setTab('voice')}>Voz e vídeo</div>
          <div className={'snav' + (tab === 'keys' ? ' active' : '')} onClick={() => setTab('keys')}>Atalhos</div>
          <div className="snav-sep" />
          <div className="snav danger" onClick={onLogout}>Sair <Icon name="logout" size={16} /></div>
        </div>
      </nav>
      <div className="settings-content">
        <div className="settings-inner">
          {tab === 'profile' && <ProfileTab me={me} />}
          {tab === 'voice' && <VoiceTab />}
          {tab === 'keys' && <KeysTab />}
        </div>
        <button className="settings-close" onClick={onClose}><Icon name="close" size={22} /><span>ESC</span></button>
      </div>
      <EscClose onClose={onClose} />
    </div>
  );
}

function EscClose({ onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return null;
}

// Recorta a foto no centro em quadrado 256x256 (GIF animado é mantido como está).
async function squareAvatar(file) {
  if (file.type === 'image/gif') return file;
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 256, 256);
  return new Promise((r) => c.toBlob((b) => r(b || file), 'image/webp', 0.9));
}

function ProfileTab({ me }) {
  const [status, setStatus] = useState(me.status || '');
  const [color, setColor] = useState(me.color);
  const save = () => api('/api/me', { method: 'PATCH', body: { status, color } });
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const pickAvatar = async (file) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) return alert('Imagem muito grande (máx. 8 MB).');
    setBusy(true);
    try {
      const blob = await squareAvatar(file);
      const f = new FormData(); f.append('file', blob, blob === file ? file.name : 'avatar.webp');
      await api('/api/me/avatar', { method: 'POST', form: f });
      setPreview(URL.createObjectURL(blob));
    } catch (x) { alert(x.message); }
    setBusy(false);
  };
  const removeAvatar = async () => {
    await api('/api/me/avatar', { method: 'DELETE' }).catch((x) => alert(x.message));
    setPreview(null);
  };
  return (
    <>
      <h2>Minha conta</h2>
      <div className="profile-card">
        <div className="profile-banner" style={{ background: color }} />
        <div className="profile-row">
          <label className="avatar-upload" title="Trocar foto">
            <Avatar user={{ ...me, color, avatar: preview || me.avatar }} size={80} />
            <span><Icon name="cam" size={22} /></span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { pickAvatar(e.target.files[0]); e.target.value = ''; }} />
          </label>
          <h3>{me.username}</h3>
          <div className="avatar-actions">
            <label className="btn primary small">{busy ? 'Enviando…' : 'Alterar foto'}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => { pickAvatar(e.target.files[0]); e.target.value = ''; }} />
            </label>
            {(preview || me.avatar) && <button className="btn small" onClick={removeAvatar}>Remover</button>}
          </div>
        </div>
        <div className="profile-fields">
          <label>Status personalizado<input value={status} onChange={(e) => setStatus(e.target.value)} placeholder="O que você está fazendo?" maxLength={80} /></label>
          <label>Cor do perfil<input type="color" value={color} onChange={(e) => setColor(e.target.value)} /></label>
          <button className="btn primary" onClick={save}>Salvar alterações</button>
        </div>
      </div>
    </>
  );
}

function VoiceTab() {
  const v = useVoice();
  const s = v.settings;
  const devices = useDevices();
  const [level, setLevel] = useState(-100);
  const [testing, setTesting] = useState(false);
  const inputs = devices.filter((d) => d.kind === 'audioinput');
  const outputs = devices.filter((d) => d.kind === 'audiooutput');
  const cams = devices.filter((d) => d.kind === 'videoinput');

  useEffect(() => {
    if (!testing) return;
    let stop;
    startMicMeter(s.inputDevice, setLevel).then((f) => (stop = f)).catch(() => setTesting(false));
    return () => stop?.();
  }, [testing, s.inputDevice]);

  const set = (patch, restart = true) => {
    voice.saveSettings(patch);
    if (restart) voice.restartMic();
  };
  const meterPct = Math.max(0, Math.min(100, ((level + 100) / 100) * 100));
  const gatePct = ((s.gateDb + 100) / 100) * 100;

  return (
    <>
      <h2>Voz e vídeo</h2>
      <div className="grid2">
        <label>Dispositivo de entrada
          <select value={s.inputDevice} onChange={(e) => set({ inputDevice: e.target.value })}>
            <option value="">Padrão</option>
            {inputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microfone'}</option>)}
          </select>
        </label>
        <label>Dispositivo de saída
          <select value={s.outputDevice} onChange={(e) => voice.setOutputDevice(e.target.value)}>
            <option value="">Padrão</option>
            {outputs.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Alto-falante'}</option>)}
          </select>
        </label>
        <Slider label="Volume de entrada" value={s.inputGain * 100} max={300} onChange={(x) => { voice.saveSettings({ inputGain: x / 100 }); voice.micProcessor?.setGain(x / 100); }} />
        <Slider label="Volume do soundboard" value={s.soundVolume * 100} max={100} onChange={(x) => voice.saveSettings({ soundVolume: x / 100 })} />
      </div>

      <div className="mic-test">
        <button className="btn" onClick={() => setTesting(!testing)}>{testing ? 'Parar teste' : 'Testar microfone'}</button>
        <div className="meter"><div className="meter-fill" style={{ width: meterPct + '%' }} />{s.gateEnabled && <div className="meter-gate" style={{ left: gatePct + '%' }} />}</div>
      </div>

      <div className="divider" />
      <h3>Supressão de ruído</h3>
      <div className="radio-list">
        {[
          ['deepfilter', 'Blob IA Pro (DeepFilterNet3)', 'IA de última geração: tira teclado, ventilador, cachorro, rua e eco da sala, mantendo a voz natural. Recomendado.'],
          ['rnnoise', 'Blob IA Leve (RNNoise)', 'Mais leve, para PCs fracos. Remove menos ruído.'],
          ['browser', 'Padrão do sistema', 'Supressão básica do navegador/Windows.'],
          ['off', 'Nenhuma', 'Áudio puro do microfone.'],
        ].map(([val, title, desc]) => (
          <label key={val} className={'radio-row' + (s.noise === val ? ' sel' : '')}>
            <input type="radio" checked={s.noise === val} onChange={() => set({ noise: val })} />
            <div><b>{title}</b><small>{desc}</small></div>
          </label>
        ))}
      </div>

      <div className="toggles">
        <Toggle label="Cancelamento de eco" checked={s.echo} onChange={(x) => set({ echo: x })} />
        <Toggle label="Controle automático de ganho" checked={s.agc} onChange={(x) => set({ agc: x })} />
        <Toggle label="Sensibilidade de entrada manual (noise gate)" checked={s.gateEnabled} onChange={(x) => set({ gateEnabled: x })} />
      </div>
      {s.gateEnabled && (
        <Slider label="Limite do noise gate" value={s.gateDb} min={-100} max={0} suffix=" dB" onChange={(x) => voice.saveSettings({ gateDb: x })} />
      )}
      {s.gateEnabled && <button className="btn small" onClick={() => voice.restartMic()}>Aplicar limite</button>}

      <div className="divider" />
      <h3>Modo de entrada</h3>
      <div className="radio-cards">
        <label className={!s.pttEnabled ? 'sel' : ''}><input type="radio" checked={!s.pttEnabled} onChange={() => set({ pttEnabled: false })} />Detecção de voz</label>
        <label className={s.pttEnabled ? 'sel' : ''}><input type="radio" checked={s.pttEnabled} onChange={() => set({ pttEnabled: true })} />Aperte para falar</label>
      </div>

      <div className="divider" />
      <h3>Câmera</h3>
      <label>Câmera
        <select value={s.videoDevice} onChange={(e) => voice.saveSettings({ videoDevice: e.target.value })}>
          <option value="">Padrão</option>
          {cams.map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Câmera'}</option>)}
        </select>
      </label>
    </>
  );
}

function KeysTab() {
  const v = useVoice();
  const [capturing, setCapturing] = useState(false);
  useEffect(() => {
    if (!capturing) return;
    const k = (e) => { e.preventDefault(); voice.saveSettings({ pttKey: e.code }); window.blobDesktop?.setPttKey?.(e.code); setCapturing(false); };
    window.addEventListener('keydown', k, { once: true });
    return () => window.removeEventListener('keydown', k);
  }, [capturing]);
  return (
    <>
      <h2>Atalhos</h2>
      <div className="keybind">
        <span>Aperte para falar</span>
        <button className={'btn' + (capturing ? ' primary' : '')} onClick={() => setCapturing(true)}>{capturing ? 'Pressione uma tecla…' : v.settings.pttKey}</button>
      </div>
      <div className="keybind"><span>Silenciar / ativar microfone</span><kbd>Ctrl + Shift + M</kbd></div>
      <div className="keybind"><span>Desativar / ativar áudio</span><kbd>Ctrl + Shift + D</kbd></div>
      <p className="muted small">O aperte-para-falar funciona com a janela do Blob em foco.</p>
      {window.blobDesktop && (
        <>
          <div className="divider" />
          <h3>Servidor</h3>
          <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={() => {
            const url = prompt('Endereço do servidor Blob (ex: 100.101.102.103:3000)', location.host);
            if (url) window.blobDesktop.setServer(url);
          }}>Trocar endereço do servidor</button>
        </>
      )}
    </>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <span className={'toggle' + (checked ? ' on' : '')} onClick={(e) => { e.preventDefault(); onChange(!checked); }}><i /></span>
    </label>
  );
}

// ---------- Compartilhar tela ----------
const FPS = [5, 15, 30, 60, 90, 120, 144, 165, 240];
const CODECS = [
  ['h264', 'H.264 (mais compatível, usa a placa de vídeo)'],
  ['vp8', 'VP8'],
  ['vp9', 'VP9 (melhor qualidade por Mbps)'],
  ['av1', 'AV1 (melhor de todos, exige PC recente)'],
];

export function ShareModal({ onClose }) {
  const v = useVoice();
  const [o, setO] = useState({ ...v.settings.share });
  const [sources, setSources] = useState(null);
  const [tab, setTab] = useState('screen');
  const [sourceId, setSourceId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const desktop = !!window.blobDesktop;

  useEffect(() => {
    if (!desktop) return;
    const load = () => window.blobDesktop.getSources().then(setSources);
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [desktop]);

  const go = async () => {
    setBusy(true);
    setErr('');
    try {
      await voice.startScreenShare({ ...o, sourceId });
      onClose();
    } catch (e) {
      if (e.name !== 'NotAllowedError') setErr(e.message);
      setBusy(false);
    }
  };

  const list = (sources || []).filter((s) => (tab === 'screen' ? s.id.startsWith('screen') : !s.id.startsWith('screen')));
  const estUpload = o.bitrate;

  return (
    <Modal title="Compartilhar tela" onClose={onClose} wide className="share-modal">
      <div className="modal-body">
        {desktop && (
          <>
            <div className="tabs">
              <button className={tab === 'screen' ? 'on' : ''} onClick={() => setTab('screen')}>Telas</button>
              <button className={tab === 'window' ? 'on' : ''} onClick={() => setTab('window')}>Aplicativos</button>
            </div>
            <div className="source-grid">
              {!sources && <p className="muted">Carregando…</p>}
              {list.map((s) => (
                <div key={s.id} className={'source' + (sourceId === s.id ? ' sel' : '')} onClick={() => setSourceId(s.id)}>
                  <img src={s.thumbnail} alt="" />
                  <span>{s.appIcon && <img src={s.appIcon} alt="" className="app-icon" />}{s.name}</span>
                </div>
              ))}
            </div>
          </>
        )}
        {!desktop && <p className="muted">O navegador vai abrir a janela dele para você escolher a tela ou janela.</p>}

        <h3>Qualidade da transmissão</h3>
        <div className="quality-label">Resolução</div>
        <div className="chip-row">
          {Object.entries(SHARE_RESOLUTIONS).map(([k, r]) => (
            <button key={k} className={'chip' + (o.res === k ? ' on' : '')} onClick={() => setO({ ...o, res: k })}>{r.label}</button>
          ))}
        </div>
        <div className="quality-label">Taxa de quadros</div>
        <div className="chip-row">
          {FPS.map((f) => (
            <button key={f} className={'chip' + (o.fps === f ? ' on' : '')} onClick={() => setO({ ...o, fps: f })}>{f} FPS</button>
          ))}
        </div>
        <Slider label="Bitrate (qualidade da imagem)" value={o.bitrate} min={1} max={60} suffix=" Mbps" onChange={(x) => setO({ ...o, bitrate: x })} />
        <div className="grid2">
          <label>Codec
            <select value={o.codec} onChange={(e) => setO({ ...o, codec: e.target.value })}>
              {CODECS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label>Otimizar para
            <select value={o.hint} onChange={(e) => setO({ ...o, hint: e.target.value })}>
              <option value="motion">Movimento (jogos, vídeos)</option>
              <option value="detail">Nitidez (texto, código)</option>
            </select>
          </label>
        </div>
        <div className="toggles">
          <Toggle label="Transmitir o áudio do PC" checked={o.audio} onChange={(x) => setO({ ...o, audio: x })} />
        </div>
        <p className="muted small">
          Cada pessoa assistindo usa ~{estUpload} Mbps do seu upload. Se travar, baixe o bitrate ou os FPS.
          {o.res === 'source' && ' "Original" envia na resolução real do seu monitor.'}
        </p>
        {err && <div className="form-error">{err}</div>}
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy || (desktop && !sourceId) || !v.channelId} onClick={go}>
            {busy ? 'Iniciando…' : 'Transmitir ao vivo'}
          </button>
        </div>
        {!v.channelId && <p className="form-error">Entre em um canal de voz primeiro.</p>}
      </div>
    </Modal>
  );
}

// ---------- Soundboard ----------
export function Soundboard({ server, onClose }) {
  const v = useVoice();
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🔊');
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('');
  const sounds = (server?.sounds || []).filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()));

  const upload = async () => {
    setErr('');
    const f = new FormData();
    f.append('file', file);
    f.append('name', name || file.name.replace(/\.[^.]+$/, ''));
    f.append('emoji', emoji);
    try {
      await api(`/api/servers/${server.id}/sounds`, { method: 'POST', form: f });
      setAdding(false); setFile(null); setName('');
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="soundboard-pop">
      <div className="sb-head">
        <input placeholder="Procurar um som" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="icon-btn" title="Parar todos os sons" onClick={() => voice.stopAllSounds()}><Icon name="stop" /></button>
        <button className="icon-btn" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div className="sb-vol"><Slider label="Volume" value={v.settings.soundVolume * 100} max={100} onChange={(x) => voice.saveSettings({ soundVolume: x / 100 })} /></div>
      {!v.channelId && <p className="muted small sb-warn">Entre em um canal de voz para tocar sons pra galera. Clique direito pra ouvir só você.</p>}
      <div className="sb-section">{server?.name}</div>
      <div className="sb-grid">
        {sounds.map((s) => (
          <button key={s.id} className="sb-btn"
            onClick={() => (v.channelId ? voice.playSound(s) : voice.playSoundLocal(s.file, s.volume))}
            onContextMenu={(e) => { e.preventDefault(); voice.playSoundLocal(s.file, s.volume); }}>
            <span className="sb-emoji">{s.emoji}</span>
            <span className="sb-name">{s.name}</span>
            <span className="sb-del" title="Apagar som" onClick={(e) => { e.stopPropagation(); if (confirm(`Apagar o som "${s.name}"?`)) api('/api/sounds/' + s.id, { method: 'DELETE' }); }}>
              <Icon name="close" size={12} />
            </span>
          </button>
        ))}
        <button className="sb-btn add" onClick={() => setAdding(true)}><Icon name="plus" /> <span className="sb-name">Adicionar som</span></button>
      </div>
      {adding && (
        <div className="sb-add">
          <label className="btn">{file ? file.name : 'Escolher arquivo (mp3, ogg, wav — até 5MB)'}
            <input type="file" accept="audio/*" hidden onChange={(e) => { setFile(e.target.files[0]); if (!name) setName(e.target.files[0]?.name.replace(/\.[^.]+$/, '').slice(0, 32)); }} />
          </label>
          <div className="sb-add-row">
            <input className="emoji-input" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do som" maxLength={32} />
          </div>
          {err && <div className="form-error">{err}</div>}
          <div className="sb-add-row">
            <button className="btn" onClick={() => setAdding(false)}>Cancelar</button>
            <button className="btn primary" disabled={!file} onClick={upload}>Enviar</button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { Track } from 'livekit-client';
import { voice } from './voice';
import { Avatar, Icon, Slider, Tooltip, useVoice } from './ui';

function VideoEl({ track, mirror, contain, onStats }) {
  const ref = useRef();
  useEffect(() => {
    if (!track || !ref.current) return;
    track.attach(ref.current);
    return () => { track.detach(ref.current); };
  }, [track]);
  useEffect(() => {
    if (!onStats) return;
    const id = setInterval(() => {
      const el = ref.current;
      if (!el) return;
      const q = el.getVideoPlaybackQuality?.();
      const frames = q?.totalVideoFrames ?? 0;
      const now = performance.now();
      const prev = ref.prev;
      ref.prev = { frames, now };
      const fps = prev ? Math.round(((frames - prev.frames) * 1000) / (now - prev.now)) : null;
      const s = { w: el.videoWidth, h: el.videoHeight, fps, mbps: track?.currentBitrate ? (track.currentBitrate / 1e6).toFixed(1) : null };
      // Quem transmite: mostra o que REALMENTE está sendo enviado e o motivo de limitação.
      if (track?.getSenderStats) {
        track.getSenderStats().then((arr) => {
          const st = Array.isArray(arr) ? arr[0] : arr;
          if (st?.frameWidth) { s.w = st.frameWidth; s.h = st.frameHeight; }
          if (st?.framesPerSecond != null) s.fps = Math.round(st.framesPerSecond);
          s.limit = st?.qualityLimitationReason && st.qualityLimitationReason !== 'none' ? st.qualityLimitationReason : null;
          onStats(s);
        }).catch(() => onStats(s));
      } else onStats(s);
    }, 1000);
    return () => clearInterval(id);
  }, [onStats, track]);
  return <video ref={ref} autoPlay playsInline muted className={(mirror ? 'mirror ' : '') + (contain ? 'contain' : '')} />;
}

function StreamTile({ p, user, isLocal, watching, focused, onFocus }) {
  const v = useVoice();
  const ref = useRef();
  const [stats, setStats] = useState(null);
  const pub = p.getTrackPublication(Track.Source.ScreenShare);
  const track = pub?.track;
  const id = p.identity;

  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen());

  if (!isLocal && !watching) {
    return (
      <div className="tile stream-tile not-watching" onClick={onFocus}>
        <div className="stream-preview-bg" style={{ background: user?.color }} />
        <div className="tile-center">
          <Avatar user={user} size={56} />
          <span className="live-badge big">AO VIVO</span>
          <button className="btn primary" onClick={(e) => { e.stopPropagation(); voice.watch(id, true); }}><Icon name="eye" size={18} /> Assistir transmissão</button>
        </div>
        <div className="tile-name"><Icon name="screen" size={14} /> {user?.username}</div>
      </div>
    );
  }

  return (
    <div ref={ref} className={'tile stream-tile' + (focused ? ' focused' : '')} onDoubleClick={fullscreen} onClick={onFocus}>
      {track ? <VideoEl track={track} contain onStats={setStats} /> : <div className="tile-center muted">Carregando transmissão…</div>}
      <div className="tile-name"><span className="live-badge">AO VIVO</span> {user?.username}{isLocal && ' (você)'}</div>
      {stats && stats.w > 0 && (
        <div className="stream-stats">{stats.w}×{stats.h}{stats.fps != null && ` • ${stats.fps} fps`}{stats.mbps != null && ` • ${stats.mbps} Mbps`}{isLocal && v.shareInfo && ` (máx ${v.shareInfo.bitrate}) • ${v.shareInfo.codec.toUpperCase()}`}{stats.limit && ` • limitado por ${stats.limit === 'cpu' ? 'CPU' : stats.limit === 'bandwidth' ? 'rede' : stats.limit}`}</div>
      )}
      <div className="tile-controls" onClick={(e) => e.stopPropagation()}>
        {!isLocal && (
          <div className="tile-vol">
            <Icon name="speaker" size={18} />
            <Slider value={(v.settings.streamVolumes[id] ?? 1) * 100} max={200} onChange={(x) => voice.setStreamVolume(id, x / 100)} />
          </div>
        )}
        {!isLocal && <Tooltip text="Parar de assistir"><button className="icon-btn" onClick={() => voice.watch(id, false)}><Icon name="close" /></button></Tooltip>}
        {isLocal && <Tooltip text="Parar transmissão"><button className="icon-btn red" onClick={() => voice.stopScreenShare()}><Icon name="stop" /></button></Tooltip>}
        <Tooltip text="Tela cheia"><button className="icon-btn" onClick={fullscreen}><Icon name="full" /></button></Tooltip>
      </div>
    </div>
  );
}

function UserTile({ p, user, state, speaking, onMenu, focused, onFocus }) {
  const cam = p.getTrackPublication(Track.Source.Camera)?.track;
  const isLocal = p === voice.local;
  return (
    <div className={'tile user-tile' + (speaking ? ' speaking' : '') + (focused ? ' focused' : '')} onClick={onFocus}
      onContextMenu={(e) => { e.preventDefault(); onMenu(e, user); }} style={{ '--tile-color': user?.color }}>
      {cam ? <VideoEl track={cam} mirror={isLocal} /> : (
        <div className="tile-center"><Avatar user={user} size={80} speaking={speaking} /></div>
      )}
      <div className="tile-name">
        {state?.deafened ? <Icon name="headOff" size={14} className="red" /> : state?.muted && <Icon name="micOff" size={14} className="red" />}
        {user?.username || p.name}
      </div>
    </div>
  );
}

export default function VoiceView({ channel, server, usersById, voiceStates, onJoin, onShare, onSoundboard, onUserMenu }) {
  const v = useVoice();
  const [focus, setFocus] = useState(null);
  const inThis = v.channelId === channel.id;
  const others = Object.entries(voiceStates).filter(([, s]) => s.channelId === channel.id);

  if (!inThis) {
    return (
      <div className="voice-view lobby">
        <header className="main-head"><Icon name="speaker" className="ch-icon" /><h3>{channel.name}</h3></header>
        <div className="lobby-body">
          <div className="lobby-avatars">
            {others.length ? others.map(([uid]) => <Avatar key={uid} user={usersById[uid]} size={64} />) : <img src="/blob.svg" alt="" className="lobby-blob" />}
          </div>
          <h2>{channel.name}</h2>
          <p className="muted">{others.length ? `${others.map(([u]) => usersById[u]?.username).join(', ')} ${others.length > 1 ? 'estão' : 'está'} na call` : 'Ninguém está aqui ainda.'}</p>
          <button className="btn primary big" onClick={onJoin}>Entrar na chamada</button>
        </div>
      </div>
    );
  }

  const parts = v.participants();
  const streams = parts.filter((p) => p.getTrackPublication(Track.Source.ScreenShare));
  const tiles = [
    ...streams.map((p) => ({ key: 's' + p.identity, kind: 'stream', p })),
    ...parts.map((p) => ({ key: 'u' + p.identity, kind: 'user', p })),
  ];
  const focusTile = tiles.find((t) => t.key === focus);
  const renderTile = (t, focused) => {
    const user = usersById[t.p.identity];
    const isLocal = t.p === v.local;
    const toggleFocus = () => setFocus(focused ? null : t.key);
    if (t.kind === 'stream') return <StreamTile key={t.key} p={t.p} user={user} isLocal={isLocal} watching={v.watching.has(t.p.identity)} focused={focused} onFocus={toggleFocus} />;
    return <UserTile key={t.key} p={t.p} user={user} state={voiceStates[t.p.identity]} speaking={v.speaking.has(t.p.identity)} onMenu={onUserMenu} focused={focused} onFocus={toggleFocus} />;
  };

  return (
    <div className="voice-view">
      <header className="main-head dark">
        <Icon name="speaker" className="ch-icon" /><h3>{channel.name}</h3>
        <span className="head-sep" /><span className="muted small">{server.name}</span>
        {v.ping != null && <span className="ping-chip">{v.ping} ms</span>}
      </header>
      <div className={'tiles-area' + (focusTile ? ' has-focus' : '')}>
        {focusTile ? (
          <>
            <div className="focus-main">{renderTile(focusTile, true)}</div>
            <div className="focus-strip">{tiles.filter((t) => t !== focusTile).map((t) => renderTile(t, false))}</div>
          </>
        ) : (
          <div className={'tiles n' + Math.min(tiles.length, 9)}>{tiles.map((t) => renderTile(t, false))}</div>
        )}
      </div>
      <div className="call-bar">
        <Tooltip text={v.local?.isCameraEnabled ? 'Desligar câmera' : 'Ligar câmera'}>
          <button className={'call-btn' + (v.local?.isCameraEnabled ? ' on' : '')} onClick={() => voice.toggleCamera().catch((e) => alert(e.message))}><Icon name="cam" size={24} /></button>
        </Tooltip>
        <Tooltip text={v.shareInfo ? 'Parar transmissão' : 'Compartilhar tela'}>
          <button className={'call-btn' + (v.shareInfo ? ' on' : '')} onClick={() => (v.shareInfo ? voice.stopScreenShare() : onShare())}><Icon name={v.shareInfo ? 'screenOff' : 'screen'} size={24} /></button>
        </Tooltip>
        <Tooltip text={v.muted ? 'Ativar microfone' : 'Silenciar'}>
          <button className={'call-btn' + (v.muted || v.deafened ? ' off' : '')} onClick={() => voice.setMuted(!v.muted)}><Icon name={v.muted || v.deafened ? 'micOff' : 'mic'} size={24} /></button>
        </Tooltip>
        <Tooltip text={v.deafened ? 'Ativar áudio' : 'Desativar áudio'}>
          <button className={'call-btn' + (v.deafened ? ' off' : '')} onClick={() => voice.setDeafened(!v.deafened)}><Icon name={v.deafened ? 'headOff' : 'head'} size={24} /></button>
        </Tooltip>
        <Tooltip text="Soundboard">
          <button className="call-btn" onClick={onSoundboard}><Icon name="sb" size={24} /></button>
        </Tooltip>
        <Tooltip text="Desconectar">
          <button className="call-btn hang" onClick={() => voice.leave()}><Icon name="hangup" size={24} /></button>
        </Tooltip>
      </div>
    </div>
  );
}

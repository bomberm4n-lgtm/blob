// Manages the voice connection (LiveKit): microphone, screen, camera, soundboard and per-user volumes.
import { Room, RoomEvent, Track, createLocalAudioTrack, createLocalVideoTrack, VideoPresets } from 'livekit-client';
import { api } from './api';
import { BlobMicProcessor, startSpeakingDetector, preloadDeepFilter } from './noise';

const SETTINGS_KEY = 'blob_settings';
const defaults = {
  inputDevice: '', outputDevice: '', videoDevice: '',
  noise: 'deepfilter', // 'deepfilter' | 'rnnoise' | 'browser' | 'off'
  noiseV: 2,
  echo: true, agc: true,
  gateEnabled: false, gateDb: -50,
  inputGain: 1,
  userVolumes: {}, // userId -> 0..2
  userMuted: {}, // userId -> bool (muted just for me)
  streamVolumes: {}, // userId -> 0..2
  soundVolume: 0.6,
  pttEnabled: false, pttKey: 'KeyV',
  share: { res: '1080', fps: 60, bitrate: 8, codec: 'h264', hint: 'motion', audio: true },
};

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    // Migration: users on RNNoise move to DeepFilterNet (better).
    if (s.noiseV !== 2) { if (!s.noise || s.noise === 'rnnoise') s.noise = 'deepfilter'; s.noiseV = 2; }
    return { ...defaults, ...s, share: { ...defaults.share, ...(s.share || {}) } };
  } catch {
    return { ...defaults };
  }
}

export const SHARE_RESOLUTIONS = {
  '480': { w: 854, h: 480, label: '480p' },
  '720': { w: 1280, h: 720, label: '720p' },
  '1080': { w: 1920, h: 1080, label: '1080p' },
  '1440': { w: 2560, h: 1440, label: '1440p (2K)' },
  '2160': { w: 3840, h: 2160, label: '2160p (4K)' },
  source: { w: 0, h: 0, label: 'Source (native)' },
};

class VoiceManager {
  room = null;
  channelId = null;
  serverId = null;
  status = 'idle'; // idle | connecting | connected | reconnecting
  muted = false;
  deafened = false;
  speaking = new Set();
  lkSpeaking = new Set(); // server-side detection (fallback)
  spk = new Map(); // identity -> expires at (ms) — instant detection sent by each client
  spkCapable = new Set(); // clients that send instant detection
  localSpeaking = false;
  inAway = false; // currently in the AWAY channel (forced mute + deafen)
  joinedAt = null; // when this call started (for the call timer)
  lastActivity = Date.now(); // last time we talked or touched the app (for the AWAY channel)
  watching = new Set(); // userIds whose screens I'm watching
  settings = loadSettings();
  ping = null;
  error = null;
  version = 0;
  listeners = new Set();
  audioEls = new Map();
  socket = null;
  sounds = new Set();

  subscribe = (fn) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  getVersion = () => this.version;
  emit() { this.version++; for (const l of this.listeners) l(); }

  saveSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    this.emit();
  }

  get local() { return this.room?.localParticipant; }

  participants() {
    if (!this.room) return [];
    return [this.room.localParticipant, ...this.room.remoteParticipants.values()];
  }

  pushState() {
    if (!this.socket) return;
    this.socket.send({
      t: 'voice',
      state: this.channelId ? {
        channelId: this.channelId, muted: this.muted || this.deafened, deafened: this.deafened,
        streaming: !!this.local?.isScreenShareEnabled, video: !!this.local?.isCameraEnabled,
      } : null,
    });
  }

  // isAway: the AWAY channel — you're fully muted AND deafened there; going back to any other channel restores both.
  async join(channelId, serverId, isAway = false) {
    if (this.channelId === channelId && this.room) return;
    const wasAway = this.inAway;
    this.inAway = isAway;
    if (isAway) { this.muted = true; this.deafened = true; }
    else if (wasAway) { this.muted = false; this.deafened = false; }
    // Switching rooms: play a "leaving" swoop now; the join chime plays once the new room connects.
    if (this.channelId && this.channelId !== channelId) this.playUiSound('switch');
    await this.leave(true);
    this.channelId = channelId;
    this.serverId = serverId;
    this.status = 'connecting';
    this.error = null;
    this.emit();
    try {
      if (this.settings.noise === 'deepfilter') preloadDeepFilter(); // download the AI model while connecting
      const { token, url } = await api('/api/voice/token?channelId=' + channelId);
      const room = new Room({
        adaptiveStream: false,
        dynacast: true,
        webAudioMix: true,
        disconnectOnPageLeave: true,
      });
      this.room = room;
      this.bindRoom(room);
      await room.connect(url, token, { autoSubscribe: false });
      if (this.room !== room) return room.disconnect();
      // Auto-subscribe to audio (voice) only; screens only after clicking "Watch".
      for (const p of room.remoteParticipants.values()) for (const pub of p.trackPublications.values()) this.autoSub(pub);
      if (this.settings.outputDevice) await room.switchActiveDevice('audiooutput', this.settings.outputDevice).catch(() => {});
      try {
        await this.publishMic();
      } catch (micErr) {
        console.warn('No microphone', micErr);
        this.muted = true;
        this.error = 'Microphone unavailable (' + micErr.message + '). You joined listen-only.';
      }
      this.status = 'connected';
      this.joinedAt = Date.now();
      if (isAway || wasAway) await this.setDeafened(this.deafened, true);
      this.lastActivity = Date.now();
      this.playUiSound('join');
      this.pushState();
      this.emit();
      this.startPing();
    } catch (e) {
      console.error(e);
      this.error = 'Failed to connect to voice: ' + (e.message || e);
      await this.leave(true);
      this.error = 'Failed to connect to voice: ' + (e.message || e);
      this.emit();
    }
  }

  autoSub(pub) {
    if (pub.source === Track.Source.Microphone) pub.setSubscribed(true);
    else if (pub.source === Track.Source.Camera) pub.setSubscribed(true);
  }

  bindRoom(room) {
    const e = () => this.emit();
    room
      .on(RoomEvent.TrackPublished, (pub, p) => {
        this.autoSub(pub);
        if ((pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) && this.watching.has(p.identity)) pub.setSubscribed(true);
        e();
      })
      .on(RoomEvent.TrackUnpublished, e)
      .on(RoomEvent.TrackSubscribed, (track, pub, p) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.dataset.sid = track.sid;
          document.body.appendChild(el);
          this.audioEls.set(track.sid, el);
          this.applyVolume(p);
        }
        e();
      })
      .on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
        this.audioEls.delete(track.sid);
        e();
      })
      .on(RoomEvent.ParticipantConnected, (p) => { this.playUiSound('join'); this.applyVolume(p); e(); })
      .on(RoomEvent.ParticipantDisconnected, (p) => { this.watching.delete(p.identity); this.playUiSound('leave'); e(); })
      .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        this.lkSpeaking = new Set(speakers.map((s) => s.identity));
        this.updateSpeaking();
      })
      .on(RoomEvent.TrackMuted, e)
      .on(RoomEvent.TrackUnmuted, e)
      .on(RoomEvent.LocalTrackPublished, e)
      .on(RoomEvent.LocalTrackUnpublished, (pub) => {
        if (pub.source === Track.Source.ScreenShare) this.pushState();
        e();
      })
      .on(RoomEvent.DataReceived, (payload, p) => {
        try {
          const m = JSON.parse(new TextDecoder().decode(payload));
          if (m.t === 'sound') this.playSoundLocal(m.url, m.vol, p?.identity);
          if (m.t === 'spk' && p) {
            this.spkCapable.add(p.identity);
            if (m.on) this.spk.set(p.identity, Date.now() + 1500); else this.spk.delete(p.identity);
            this.updateSpeaking();
          }
        } catch { /* ignore */ }
      })
      .on(RoomEvent.Reconnecting, () => { this.status = 'reconnecting'; e(); })
      .on(RoomEvent.Reconnected, () => { this.status = 'connected'; e(); })
      .on(RoomEvent.Disconnected, () => {
        if (this.room === room) this.leave(true);
      })
      .on(RoomEvent.MediaDevicesError, (err) => { this.error = 'Device error: ' + err.message; e(); });
  }

  startPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      const engine = this.room?.engine;
      const pc = engine?.pcManager?.subscriber?.pc || engine?.pcManager?.publisher?.pc;
      if (!pc) return;
      pc.getStats().then((stats) => {
        stats.forEach((r) => {
          if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.currentRoundTripTime != null) {
            this.ping = Math.round(r.currentRoundTripTime * 1000);
          }
        });
        this.emit();
      }).catch(() => {});
    }, 3000);
  }

  async publishMic() {
    const s = this.settings;
    const old = this.local.getTrackPublication(Track.Source.Microphone);
    if (old?.track) {
      await this.local.unpublishTrack(old.track, true);
    }
    const track = await createLocalAudioTrack({
      deviceId: s.inputDevice || undefined,
      echoCancellation: s.echo,
      autoGainControl: s.agc,
      noiseSuppression: s.noise === 'browser',
      channelCount: 1,
    });
    if (s.noise === 'rnnoise' || s.noise === 'deepfilter' || s.gateEnabled || s.inputGain !== 1) {
      try {
        this.micProcessor = new BlobMicProcessor(s);
        await track.setProcessor(this.micProcessor);
      } catch (err) {
        console.warn('Audio processor failed, using raw microphone', err);
      }
    }
    await this.local.publishTrack(track, { source: Track.Source.Microphone, dtx: true, red: true, audioPreset: { maxBitrate: 96000 } });
    if (this.muted || this.deafened || s.pttEnabled) await track.mute();
    this.startLocalDetector(track);
  }

  // ---------- Speaking indicator (green ring) ----------
  startLocalDetector(track) {
    this.stopDetector?.();
    const mst = track.getProcessor?.()?.processedTrack || track.mediaStreamTrack;
    try {
      this.stopDetector = startSpeakingDetector(mst, (on) => {
        on = on && !track.isMuted && !this.muted && !this.deafened;
        if (on) this.lastActivity = Date.now();
        if (on === this.localSpeaking) return;
        this.localSpeaking = on;
        this.sendSpk();
        this.updateSpeaking();
      }, { thresholdDb: () => this.settings.gateDb ?? -50 }); // same threshold as the slider in Voice settings
    } catch (err) { console.warn('speaking detector failed', err); }
    clearInterval(this.spkTimer);
    this.spkTimer = setInterval(() => {
      if (this.localSpeaking && (this.muted || this.deafened || track.isMuted)) { this.localSpeaking = false; this.sendSpk(); }
      else if (this.localSpeaking) this.sendSpk(); // refresh (so late joiners see it too)
      const now = Date.now();
      for (const [id, exp] of this.spk) if (exp < now) this.spk.delete(id);
      this.updateSpeaking();
    }, 500);
  }

  sendSpk() {
    this.local?.publishData(new TextEncoder().encode(JSON.stringify({ t: 'spk', on: this.localSpeaking })), { reliable: true }).catch(() => {});
  }

  updateSpeaking() {
    const next = new Set();
    const me = this.local?.identity;
    if (me && this.localSpeaking) next.add(me);
    for (const id of this.spk.keys()) next.add(id);
    // Clients that don't send instant detection yet: use the server's.
    for (const id of this.lkSpeaking) if (id !== me && !this.spkCapable.has(id)) next.add(id);
    const same = next.size === this.speaking.size && [...next].every((x) => this.speaking.has(x));
    if (!same) { this.speaking = next; this.emit(); }
  }

  async restartMic() {
    if (this.room && this.status === 'connected') await this.publishMic().catch((e) => { this.error = e.message; });
    this.emit();
  }

  micTrack() {
    return this.local?.getTrackPublication(Track.Source.Microphone)?.track;
  }

  async setMuted(m) {
    if (!m && this.inAway) return; // stays muted while in AWAY
    this.muted = m;
    this.lastActivity = Date.now();
    if (!m && this.deafened) this.setDeafened(false, true);
    const t = this.micTrack();
    if (!m && !t && this.room && this.status === 'connected') {
      try { await this.publishMic(); this.error = null; } catch (e) { this.muted = true; this.error = 'Microphone unavailable: ' + e.message; this.emit(); return; }
    }
    if (t && !this.settings.pttEnabled) m ? await t.mute() : await t.unmute();
    this.playUiSound(m ? 'mute' : 'unmute');
    this.pushState();
    this.emit();
  }

  async setDeafened(d, silent) {
    if (!d && this.inAway) return; // can't undeafen while in AWAY (leave the channel to come back)
    this.deafened = d;
    for (const p of this.room?.remoteParticipants.values() || []) this.applyVolume(p);
    const t = this.micTrack();
    if (t && !this.settings.pttEnabled) (d || this.muted) ? await t.mute() : await t.unmute();
    if (!silent) this.playUiSound(d ? 'mute' : 'unmute');
    this.pushState();
    this.emit();
  }

  // Push-to-talk
  async pttDown() {
    if (!this.settings.pttEnabled || this.muted || this.deafened) return;
    const t = this.micTrack();
    if (t?.isMuted) await t.unmute();
    this.pttActive = true;
    this.emit();
  }
  async pttUp() {
    if (!this.settings.pttEnabled) return;
    const t = this.micTrack();
    if (t && !t.isMuted) await t.mute();
    this.pttActive = false;
    this.emit();
  }

  applyVolume(p) {
    if (!p || p === this.local) return;
    const id = p.identity;
    const muted = this.deafened || this.settings.userMuted[id];
    const v = muted ? 0 : this.settings.userVolumes[id] ?? 1;
    const sv = this.deafened ? 0 : this.settings.streamVolumes[id] ?? 1;
    try { p.setVolume(v, Track.Source.Microphone); } catch { /* ignore */ }
    try { p.setVolume(sv, Track.Source.ScreenShareAudio); } catch { /* ignore */ }
  }

  setUserVolume(id, v) {
    this.saveSettings({ userVolumes: { ...this.settings.userVolumes, [id]: v } });
    this.applyVolume(this.room?.remoteParticipants.get(id));
  }
  setUserMuted(id, m) {
    this.saveSettings({ userMuted: { ...this.settings.userMuted, [id]: m } });
    this.applyVolume(this.room?.remoteParticipants.get(id));
  }
  setStreamVolume(id, v) {
    this.saveSettings({ streamVolumes: { ...this.settings.streamVolumes, [id]: v } });
    this.applyVolume(this.room?.remoteParticipants.get(id));
  }

  async setOutputDevice(id) {
    this.saveSettings({ outputDevice: id });
    await this.room?.switchActiveDevice('audiooutput', id).catch(() => {});
  }

  // ---------- Watching screens ----------
  watch(uid, on) {
    const p = this.room?.remoteParticipants.get(uid);
    if (on) this.watching.add(uid); else this.watching.delete(uid);
    if (p) {
      for (const pub of p.trackPublications.values()) {
        if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) pub.setSubscribed(on);
      }
      this.applyVolume(p);
    }
    this.emit();
  }

  // ---------- Screen share ----------
  async startScreenShare(opts) {
    if (!this.room) return;
    const o = { ...this.settings.share, ...opts };
    this.saveSettings({ share: { res: o.res, fps: o.fps, bitrate: o.bitrate, codec: o.codec, hint: o.hint, audio: o.audio } });
    const r = SHARE_RESOLUTIONS[o.res] || SHARE_RESOLUTIONS['1080'];
    const video = { frameRate: { ideal: o.fps, max: o.fps } };
    if (r.w) { video.width = { max: r.w }; video.height = { max: r.h }; }
    if (window.blobDesktop && o.sourceId) await window.blobDesktop.selectSource(o.sourceId, !!o.audio);
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video,
      audio: o.audio ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true, suppressLocalAudioPlayback: false } : false,
      systemAudio: 'include',
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    });
    const vt = stream.getVideoTracks()[0];
    vt.contentHint = o.hint === 'detail' ? 'detail' : 'motion';
    vt.addEventListener('ended', () => this.stopScreenShare());
    const maxBitrate = Math.round(o.bitrate * 1_000_000);
    await this.local.publishTrack(vt, {
      source: Track.Source.ScreenShare,
      simulcast: false,
      videoCodec: o.codec,
      videoEncoding: { maxBitrate, maxFramerate: o.fps, priority: 'high' },
      screenShareEncoding: { maxBitrate, maxFramerate: o.fps, priority: 'high' },
      // Never let the encoder drop resolution on its own (that's what made the image blurry).
      degradationPreference: o.hint === 'detail' ? 'maintain-resolution' : 'balanced',
      // VP9/AV1: a single full-resolution layer (no smaller layers the server could pick instead).
      scalabilityMode: o.codec === 'vp9' || o.codec === 'av1' ? 'L1T3' : undefined,
      backupCodec: false,
    });
    const at = stream.getAudioTracks()[0];
    if (at) {
      await this.local.publishTrack(at, { source: Track.Source.ScreenShareAudio, dtx: false, red: false, audioPreset: { maxBitrate: 192000 }, forceStereo: true });
    }
    this.screenStream = stream;
    this.shareInfo = { ...o, actualW: vt.getSettings().width, actualH: vt.getSettings().height };
    this.playUiSound('stream');
    this.pushState();
    this.emit();
  }

  async stopScreenShare() {
    for (const src of [Track.Source.ScreenShare, Track.Source.ScreenShareAudio]) {
      const pub = this.local?.getTrackPublication(src);
      if (pub?.track) await this.local.unpublishTrack(pub.track, true).catch(() => {});
    }
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    this.shareInfo = null;
    this.pushState();
    this.emit();
  }

  // ---------- Camera ----------
  async toggleCamera() {
    if (!this.room) return;
    const pub = this.local.getTrackPublication(Track.Source.Camera);
    if (pub?.track) {
      await this.local.unpublishTrack(pub.track, true);
    } else {
      const t = await createLocalVideoTrack({ deviceId: this.settings.videoDevice || undefined, resolution: VideoPresets.h720.resolution });
      await this.local.publishTrack(t, { source: Track.Source.Camera, simulcast: true });
    }
    this.pushState();
    this.emit();
  }

  // ---------- Soundboard ----------
  async playSound(sound) {
    if (!this.room || this.status !== 'connected') return;
    const msg = { t: 'sound', url: sound.file, vol: sound.volume ?? 1, name: sound.name };
    await this.local.publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true });
    this.playSoundLocal(msg.url, msg.vol, this.local.identity);
  }

  playSoundLocal(url, vol = 1, from) {
    if (this.deafened) return;
    if (from && this.settings.userMuted[from]) return;
    // No overlap: if this same sound is still playing, stop it and start it over from the beginning.
    for (const old of this.sounds) {
      if (old.dataset?.src === url || old.blobSrc === url) { old.pause(); old.currentTime = 0; this.sounds.delete(old); }
    }
    const a = new Audio(url);
    a.blobSrc = url;
    const level = Math.max(0, this.settings.soundVolume * vol);
    if (level <= 1) {
      a.volume = level;
      if (this.settings.outputDevice && a.setSinkId) a.setSinkId(this.settings.outputDevice).catch(() => {});
    } else {
      // Above 100%: boost through Web Audio (an <audio> element can't go louder than 1.0).
      a.crossOrigin = 'anonymous';
      const ctx = (this.sbCtx ||= new AudioContext());
      if (this.settings.outputDevice && ctx.setSinkId && ctx.sinkId !== this.settings.outputDevice) ctx.setSinkId(this.settings.outputDevice).catch(() => {});
      ctx.resume().catch(() => {});
      const gain = ctx.createGain();
      gain.gain.value = level;
      ctx.createMediaElementSource(a).connect(gain).connect(ctx.destination);
    }
    this.sounds.add(a);
    a.onended = () => this.sounds.delete(a);
    a.play().catch(() => {});
    if (from) {
      this.soundFrom = { id: from, at: Date.now() };
      this.emit();
    }
  }

  stopAllSounds() {
    for (const a of this.sounds) a.pause();
    this.sounds.clear();
  }

  // Short synthesized UI sounds (join/leave/mute).
  playUiSound(kind) {
    try {
      const ctx = (this.uiCtx ||= new AudioContext());
      const notes = { join: [523, 784], leave: [784, 523], switch: [880, 698, 523], mute: [440, 330], unmute: [330, 440], stream: [660, 880, 990] }[kind];
      if (!notes) return;
      const t0 = ctx.currentTime;
      notes.forEach((f, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f;
        g.gain.setValueAtTime(0, t0 + i * 0.08);
        g.gain.linearRampToValueAtTime(0.08, t0 + i * 0.08 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.08 + 0.12);
        o.connect(g).connect(ctx.destination);
        o.start(t0 + i * 0.08);
        o.stop(t0 + i * 0.08 + 0.13);
      });
    } catch { /* ignore */ }
  }

  async leave(silent) {
    const room = this.room;
    const wasIn = !!this.channelId;
    this.room = null;
    clearInterval(this.pingTimer);
    this.screenStream?.getTracks().forEach((t) => t.stop());
    this.screenStream = null;
    this.shareInfo = null;
    for (const el of this.audioEls.values()) el.remove();
    this.audioEls.clear();
    this.watching.clear();
    this.stopDetector?.();
    this.stopDetector = null;
    clearInterval(this.spkTimer);
    this.localSpeaking = false;
    this.joinedAt = null;
    this.spk.clear();
    this.spkCapable.clear();
    this.lkSpeaking = new Set();
    this.speaking = new Set();
    this.channelId = null;
    this.serverId = null;
    this.status = 'idle';
    this.ping = null;
    if (room) await room.disconnect().catch(() => {});
    if (wasIn && !silent) this.playUiSound('leave');
    this.pushState();
    this.emit();
  }
}

export const voice = new VoiceManager();
window.__blobVoice = voice;

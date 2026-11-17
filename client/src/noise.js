// Microphone processor: input gain + noise suppression (DeepFilterNet3 / RNNoise) + noise gate (sensitivity).
import { RnnoiseWorkletNode, NoiseGateWorkletNode, loadRnnoise } from '@sapphi-red/web-noise-suppressor';
import rnnoiseWorkletUrl from '@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url';
import noiseGateWorkletUrl from '@sapphi-red/web-noise-suppressor/noiseGateWorklet.js?url';
import rnnoiseWasmUrl from '@sapphi-red/web-noise-suppressor/rnnoise.wasm?url';
import rnnoiseSimdUrl from '@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url';

let wasmPromise;
const getWasm = () => (wasmPromise ||= loadRnnoise({ url: rnnoiseWasmUrl, simdUrl: rnnoiseSimdUrl }));

// DeepFilterNet3 (open-source, Krisp-level AI noise suppression). Files are served by the Blob server itself.
let dfModulePromise;
const getDfModule = () => (dfModulePromise ||= (async () => {
  const res = await fetch('/dfn/df_bg.wasm');
  if (!res.ok) throw new Error('DeepFilterNet not found (' + res.status + ')');
  return WebAssembly.compileStreaming ? WebAssembly.compileStreaming(res).catch(async () => WebAssembly.compile(await (await fetch('/dfn/df_bg.wasm')).arrayBuffer())) : WebAssembly.compile(await res.arrayBuffer());
})().catch((e) => { dfModulePromise = null; throw e; }));
export const preloadDeepFilter = () => getDfModule().catch(() => {});

export class BlobMicProcessor {
  name = 'blob-mic';
  processedTrack = undefined;

  constructor(settings) {
    this.settings = settings;
  }

  async init(opts) {
    await this.build(opts.track);
  }

  async restart(opts) {
    await this.destroy();
    await this.build(opts.track);
  }

  async build(track) {
    const s = this.settings;
    const ctx = new AudioContext({ sampleRate: 48000 });
    this.ctx = ctx;
    const src = ctx.createMediaStreamSource(new MediaStream([track]));
    this.mode = s.noise === 'off' || s.noise === 'browser' ? s.noise : null;
    this.gain = ctx.createGain();
    this.gain.gain.value = s.inputGain ?? 1;
    this.preAi = this.gain; // mic after the input volume, before any noise removal
    let node = src;
    node.connect(this.gain);
    node = this.gain;
    let useRnnoise = s.noise === 'rnnoise';
    if (s.noise === 'deepfilter') {
      try {
        const [wasmModule] = await Promise.all([getDfModule(), ctx.audioWorklet.addModule('/dfn/worklet.js')]);
        const dfn = new AudioWorkletNode(ctx, 'deepfilternet-processor', {
          numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit',
          processorOptions: { wasmModule, attenuationLimit: s.dfAtten ?? 60 },
        });
        // The worklet tells us if the AI really started; if not it would pass raw (noisy) audio through.
        const status = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ type: 'blob-timeout' }), 4000);
          dfn.port.onmessage = (e) => { if (e.data?.type?.startsWith('blob-')) { clearTimeout(timer); resolve(e.data); } };
        });
        if (status.type !== 'blob-ready') throw new Error('DeepFilterNet did not start: ' + (status.message || status.type));
        this.dfn = dfn;
        node.connect(dfn);
        node = dfn;
        this.mode = 'deepfilter';
      } catch (err) {
        console.warn('DeepFilterNet failed, falling back to RNNoise', err);
        useRnnoise = true;
      }
    }
    if (useRnnoise) {
      this.mode = s.noise === 'deepfilter' ? 'rnnoise-fallback' : 'rnnoise';
      const [wasmBinary] = await Promise.all([getWasm(), ctx.audioWorklet.addModule(rnnoiseWorkletUrl)]);
      this.rnnoise = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 });
      node.connect(this.rnnoise);
      node = this.rnnoise;
    }
    this.preGate = node; // what the noise gate "sees" (after volume + AI)
    // The gate on top of DeepFilterNet chops words (the AI already silences the gaps), so it's skipped there.
    if (s.gateEnabled && this.mode !== 'deepfilter') {
      await ctx.audioWorklet.addModule(noiseGateWorkletUrl);
      const gate = new NoiseGateWorkletNode(ctx, { openThreshold: s.gateDb ?? -50, closeThreshold: (s.gateDb ?? -50) - 5, holdMs: 200, maxChannels: 1 });
      node.connect(gate);
      node = gate;
    }
    // Force true mono: some processors output 2 channels with only the left one filled (left-ear-only audio).
    // 'discrete' keeps channel 0 only; a mono node then plays in both ears.
    const mono = ctx.createGain();
    mono.channelCount = 1;
    mono.channelCountMode = 'explicit';
    mono.channelInterpretation = 'discrete';
    node.connect(mono);
    node = mono;
    this.out = node; // what everyone else hears
    const dest = ctx.createMediaStreamDestination();
    node.connect(dest);
    this.processedTrack = dest.stream.getAudioTracks()[0];
    if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  }

  setGain(v) {
    if (this.gain) this.gain.gain.value = v;
  }

  async destroy() {
    try { this.rnnoise?.destroy?.(); } catch { /* ignore */ }
    this.rnnoise = null;
    try { this.dfn?.disconnect(); } catch { /* ignore */ }
    this.dfn = null;
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

// Instant speaking detector: measures the audio that ACTUALLY goes out to others (after suppression/gate).
// Lights up as soon as there is sound and turns off ~150 ms after it stops.
// thresholdDb can be a number or a function (read on every check, so slider changes apply instantly).
export function startSpeakingDetector(mediaStreamTrack, onChange, { thresholdDb = -50, releaseMs = 150 } = {}) {
  const limit = typeof thresholdDb === 'function' ? thresholdDb : () => thresholdDb;
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  an.fftSize = 512;
  ctx.createMediaStreamSource(new MediaStream([mediaStreamTrack])).connect(an);
  const buf = new Float32Array(an.fftSize);
  let on = false;
  let lastLoud = 0;
  const id = setInterval(() => {
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9);
    const now = performance.now();
    if (db > limit()) lastLoud = now;
    const next = now - lastLoud < releaseMs;
    if (next !== on) { on = next; onChange(on); }
  }, 20);
  return () => { clearInterval(id); ctx.close().catch(() => {}); if (on) onChange(false); };
}

// Mic test for the settings screen: same capture constraints and the SAME processing chain as a call.
// Reports three levels (dB): before the AI, what the gate sees, and what others actually hear.
export async function startMicTest(settings, { onLevels, monitor = false, outputDevice } = {}) {
  const s = settings;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: {
    deviceId: s.inputDevice ? { exact: s.inputDevice } : undefined,
    echoCancellation: s.echo, autoGainControl: s.agc, noiseSuppression: s.noise === 'browser', channelCount: 1,
  } });
  const track = stream.getAudioTracks()[0];
  const proc = new BlobMicProcessor({ ...s });
  await proc.build(track);
  const ctx = proc.ctx;
  const mk = (node) => { const a = ctx.createAnalyser(); a.fftSize = 1024; node.connect(a); return a; };
  const an = { raw: mk(proc.preAi), gate: mk(proc.preGate), out: mk(proc.out) };
  const buf = new Float32Array(1024);
  const db = (a) => { a.getFloatTimeDomainData(buf); let sum = 0; for (const v of buf) sum += v * v; return Math.max(-100, 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-9)); };
  // "Hear yourself": play exactly what others hear on your output device.
  const mon = ctx.createGain();
  mon.gain.value = monitor ? 1 : 0;
  proc.out.connect(mon).connect(ctx.destination);
  if (outputDevice && ctx.setSinkId) ctx.setSinkId(outputDevice).catch(() => {});
  let raf;
  const tick = () => { onLevels({ raw: db(an.raw), gate: db(an.gate), out: db(an.out), mode: proc.mode }); raf = requestAnimationFrame(tick); };
  tick();
  return {
    mode: proc.mode,
    setMonitor: (on) => { mon.gain.value = on ? 1 : 0; },
    setGain: (g) => proc.setGain(g),
    stop: () => { cancelAnimationFrame(raf); stream.getTracks().forEach((t) => t.stop()); proc.destroy(); },
  };
}

// Microphone level meter (for the settings screen).
export async function startMicMeter(deviceId, onLevel) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true });
  const ctx = new AudioContext();
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  let raf;
  const tick = () => {
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (const v of buf) sum += v * v;
    const db = 20 * Math.log10(Math.sqrt(sum / buf.length) + 1e-8);
    onLevel(Math.max(-100, db));
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelAnimationFrame(raf);
    stream.getTracks().forEach((t) => t.stop());
    ctx.close();
  };
}

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
    this.gain = ctx.createGain();
    this.gain.gain.value = s.inputGain ?? 1;
    let node = src;
    node.connect(this.gain);
    node = this.gain;
    let useRnnoise = s.noise === 'rnnoise';
    if (s.noise === 'deepfilter') {
      try {
        const [wasmModule] = await Promise.all([getDfModule(), ctx.audioWorklet.addModule('/dfn/worklet.js')]);
        this.dfn = new AudioWorkletNode(ctx, 'deepfilternet-processor', {
          numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit',
          processorOptions: { wasmModule, attenuationLimit: s.dfAtten ?? 100 },
        });
        node.connect(this.dfn);
        node = this.dfn;
      } catch (err) {
        console.warn('DeepFilterNet failed, falling back to RNNoise', err);
        useRnnoise = true;
      }
    }
    if (useRnnoise) {
      const [wasmBinary] = await Promise.all([getWasm(), ctx.audioWorklet.addModule(rnnoiseWorkletUrl)]);
      this.rnnoise = new RnnoiseWorkletNode(ctx, { wasmBinary, maxChannels: 1 });
      node.connect(this.rnnoise);
      node = this.rnnoise;
    }
    if (s.gateEnabled) {
      await ctx.audioWorklet.addModule(noiseGateWorkletUrl);
      const gate = new NoiseGateWorkletNode(ctx, { openThreshold: s.gateDb ?? -50, closeThreshold: (s.gateDb ?? -50) - 5, holdMs: 200, maxChannels: 1 });
      node.connect(gate);
      node = gate;
    }
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
export function startSpeakingDetector(mediaStreamTrack, onChange, { thresholdDb = -52, releaseMs = 150 } = {}) {
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
    if (db > thresholdDb) lastLoud = now;
    const next = now - lastLoud < releaseMs;
    if (next !== on) { on = next; onChange(on); }
  }, 20);
  return () => { clearInterval(id); ctx.close().catch(() => {}); if (on) onChange(false); };
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

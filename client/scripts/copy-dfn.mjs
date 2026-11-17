// Copies DeepFilterNet3 (AI noise suppression) from node_modules to public/dfn,
// applying the TextDecoder shim Chrome's AudioWorklet needs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'node_modules', '@lofcz', 'deepfilternet-web', 'dist');
const out = path.join(root, 'public', 'dfn');
fs.mkdirSync(out, { recursive: true });
fs.copyFileSync(path.join(src, 'df_bg.wasm'), path.join(out, 'df_bg.wasm'));
const shim = '// Blob: AudioWorkletGlobalScope has no TextDecoder; minimal stand-in (only used for error messages).\n'
  + 'if (typeof globalThis.TextDecoder === "undefined") globalThis.TextDecoder = class { decode(b) { if (!b) return ""; let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return s; } };\n';
let worklet = fs.readFileSync(path.join(src, 'worklet.js'), 'utf8');
// Report success/failure to the page, so the app can fall back to RNNoise instead of leaking raw audio.
const patches = [
  [
    /this\.#ready = true;(\s*)\} catch \{(\s*)this\.#ready = false;/,
    'this.#ready = true;$1this.port.postMessage({ type: "blob-ready" });$1} catch (e) {$2this.#ready = false;$2this.port.postMessage({ type: "blob-error", message: String((e && e.message) || e) });',
  ],
  // Choppy audio fix: the original starts playing as soon as 128 samples exist, then runs dry between
  // 480-sample frames and outputs silence for a quantum (audible "stutter"). Buffer one extra frame first.
  [/#bypass = false;/, '#bypass = false;\n    #primed = false;'],
  [
    /if \(this\.#available\(this\.#writeOut, this\.#readOut\) >= WORKLET_QUANTUM\) \{/,
    'if (!this.#primed && this.#available(this.#writeOut, this.#readOut) >= this.#frameLength + WORKLET_QUANTUM) this.#primed = true;\n      if (this.#primed && this.#available(this.#writeOut, this.#readOut) >= WORKLET_QUANTUM) {',
  ],
];
for (const [a, b] of patches) {
  if (!a.test(worklet)) throw new Error('DeepFilterNet worklet changed, patch not applied');
  worklet = worklet.replace(a, b);
}
fs.writeFileSync(path.join(out, 'worklet.js'), shim + worklet);
console.log('[blob] DeepFilterNet copied to public/dfn');

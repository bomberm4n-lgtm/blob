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
fs.writeFileSync(path.join(out, 'worklet.js'), shim + fs.readFileSync(path.join(src, 'worklet.js'), 'utf8'));
console.log('[blob] DeepFilterNet copied to public/dfn');

// Gera config.json (chaves do LiveKit) e livekit.yaml na primeira execução.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = path.join(root, 'config.json');

let cfg = {};
if (fs.existsSync(cfgPath)) cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

cfg.port ??= 3000;
cfg.livekitPort ??= 7880;
cfg.livekitApiKey ??= 'blob' + crypto.randomBytes(4).toString('hex');
cfg.livekitApiSecret ??= crypto.randomBytes(32).toString('hex');
// Código exigido para criar conta. Deixe "" para qualquer um poder se registrar.
cfg.registerCode ??= crypto.randomBytes(3).toString('hex');

fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));

const yaml = `# Gerado automaticamente por src/setup.js
port: ${cfg.livekitPort}
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 50200
  use_external_ip: false
keys:
  ${cfg.livekitApiKey}: ${cfg.livekitApiSecret}
logging:
  level: warn
`;
fs.writeFileSync(path.join(root, 'livekit', 'livekit.yaml'), yaml);
console.log('[blob] config ok. Codigo de registro:', cfg.registerCode || '(aberto)');

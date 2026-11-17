// Blob color theme: picked at random once per app launch (the intro slime shows it first),
// then applied as the app's accent color so the whole app matches the intro.

export const PALETTES = {
  blue: { o: '#0b3a5c', b: '#4fc8ff', s: '#1f9ee8', h: '#dff6ff', e: '#0b3a5c', logoEdge: '#061a2c' },
  red: { o: '#5c0b14', b: '#ff4d5e', s: '#d6203a', h: '#ffd6db', e: '#5c0b14', logoEdge: '#2a0509' },
  yellow: { o: '#5c470b', b: '#ffd93d', s: '#f0a800', h: '#fff7c8', e: '#5c470b', logoEdge: '#2a2005' },
  green: { o: '#0b5c2e', b: '#3dff8a', s: '#12c25c', h: '#d6ffe6', e: '#0b5c2e', logoEdge: '#05291a' },
  purple: { o: '#3a0b5c', b: '#b86bff', s: '#8a2ee6', h: '#f0dcff', e: '#3a0b5c', logoEdge: '#1a0529' },
};

const KEY = 'blob_palette';

// Same color for the whole session (also survives the automatic reloads after an update).
export function currentPalette() {
  let name = null;
  try { name = sessionStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (!PALETTES[name]) {
    const names = Object.keys(PALETTES);
    name = names[Math.floor(Math.random() * names.length)];
    try { sessionStorage.setItem(KEY, name); } catch { /* storage blocked */ }
  }
  return PALETTES[name];
}

export function applyAccent(p = currentPalette()) {
  const root = document.documentElement.style;
  root.setProperty('--accent', p.b);
  root.setProperty('--accent-2', p.s);
  root.setProperty('--accent-text', p.logoEdge);
}

// The slime logo drawn in the session color (used on the login screen, sidebar, loading screen and favicon).
const SLIME = [
  '.....oooooo.....', '...oobbbbbboo...', '..obbbbbbhhhbo..', '.obbbbbbbbhhbbo.', '.obbbbbbbbbbbbo.',
  'obbbbbbbbbbbbbbo', 'obbbebbbbbbebbbo', 'obbbebbbbbbebbbo', 'obbbbbbbbbbbbbso', 'obbbbbbbbbbbbsso',
  'osbbbbbbbbbbssso', '.osssssssssssso.', '..oooooooooooo..',
];
export function slimeLogoUrl(p = currentPalette()) {
  let rects = '';
  SLIME.forEach((row, y) => [...row].forEach((ch, x) => { if (p[ch]) rects += `<rect x="${x}" y="${y + 1.5}" width="1.02" height="1.02" fill="${p[ch]}"/>`; }));
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>`);
}
export const slimeLogo = slimeLogoUrl();

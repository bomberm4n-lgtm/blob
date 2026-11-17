// Hand-drawn 12x12 pixel-art icons for member tags. Each letter is a color from that icon's palette; '.' is transparent.

export const PIXEL_ICONS = {
  poop: {
    label: 'Poop',
    colors: { k: '#3b2414', b: '#8b5a2b', h: '#c48a50', w: '#ffffff' },
    grid: [
      '.....kk.....',
      '....kbbk....',
      '....kbhbk...',
      '...kkbbbkk..',
      '..kbbbbbbbk.',
      '..kbhbbbbbk.',
      '.kkbbbbbbbkk',
      'kbbwkbbwkbbk',
      'kbbbbbbbbbbk',
      'kbhbkkkkbbbk',
      'kbbbbbbbbbbk',
      '.kkkkkkkkkk.',
    ],
  },
  crown: {
    label: 'Crown',
    colors: { k: '#5a3d00', y: '#f5c518', h: '#fff1a8', r: '#e0245e', d: '#c9960c', b: '#3ba0ff' },
    grid: [
      '............',
      'k....kk....k',
      'ky..kyyk..yk',
      'kyykyyyykyyk',
      'kyyyyyyyyyyk',
      'kyyhyyyyhyyk',
      'kyyyyyyyyyyk',
      'kyryybbyyryk',
      'kyyyyyyyyyyk',
      'kddddddddddk',
      'kkkkkkkkkkkk',
      '............',
    ],
  },
  muscle: {
    label: 'Gym arm',
    colors: { k: '#7a3e1d', s: '#f2b48a', h: '#ffd9bd', r: '#e0245e' },
    grid: [
      '.kkkk.......',
      'kssssk......',
      'krrrrk......',
      '.kssk.......',
      '.kssk..kkk..',
      '.ksskkksssk.',
      '.ksssssssssk',
      '.kssshhssssk',
      '.ksssssssssk',
      '..kssssssssk',
      '...kkkkkkkk.',
      '............',
    ],
  },
  gamepad: {
    label: 'Gamer',
    colors: { k: '#1e1f22', g: '#6d6f78', l: '#8e909a', w: '#ffffff', r: '#f23f43', b: '#3ba55d' },
    grid: [
      '............',
      '............',
      '..kkkkkkkk..',
      '.kllllllllk.',
      'kggwggggrggk',
      'kgwwwggbgrgk',
      'kggwggggbggk',
      'kggggkkggggk',
      'kgggk..kgggk',
      '.kkk....kkk.',
      '............',
      '............',
    ],
  },
  surf: {
    label: 'Surfer',
    colors: { k: '#0d3b66', o: '#ff8a3d', w: '#ffffff', a: '#4fc3f7' },
    grid: [
      '.........kk.',
      '........kook',
      '.......kowok',
      '......kowok.',
      '.....kowok..',
      '....kowok...',
      '...kowok....',
      '..kowok.....',
      '.kowok......',
      'kowok.......',
      'kook.a.a.a.a',
      '.kk.a.a.a.a.',
    ],
  },
  bald: {
    // "Calvo de cria": top shaved bald and shiny, hair left only as little wings above the ears.
    label: 'Calvo de Cria',
    colors: { k: '#3d1f10', z: '#d9a988', H: '#f6d9c2', h: '#1a120d', s: '#e8b48c', b: '#2a1a10', S: '#c98e66', w: '#ffffff', e: '#111111', m: '#9c3b2c' },
    grid: [
      '.....kkkkkk.....',
      '....kzHHzzzk....',
      '...kzHzzzzzzk...',
      '..kzzzzzzzzzzk..',
      '.hhhzzzzzzzzhhh.',
      '.hhhsssssssshhh.',
      '..hhsssssssshh..',
      'kkhhbbssssbbhhkk',
      'kSkswessssewskSk',
      'kSkssssSSsssskSk',
      'kkksssssssssskkk',
      '..ksssmmmmsssk..',
      '...kssssssssk...',
      '....kssssssk....',
      '.....kkkkkk.....',
      '................',
    ],
  },
  monkey: {
    label: 'Monkey',
    colors: { k: '#3d2210', b: '#7b4a2a', f: '#e8b98a', e: '#1b1b1b', w: '#ffffff' },
    grid: [
      '...kkkkkk...',
      '..kbbbbbbk..',
      '.kbbbbbbbbk.',
      'kbbffbbffbbk',
      'kbfwefbfwefk',
      'kbffffffffbk',
      'kbffkffkffbk',
      'kbfkffffkfbk',
      'kbffkkkkffbk',
      '.kbffffffbk.',
      '..kbbbbbbk..',
      '...kkkkkk...',
    ],
  },
  slime: {
    label: 'Blob',
    colors: { o: '#1b4a5e', b: '#8ed8f5', s: '#5cb6df', h: '#e6f8ff', e: '#1b4a5e' },
    grid: [
      '............',
      '............',
      '....oooo....',
      '..oobbbhoo..',
      '.obbbbbbhho.',
      '.obbbbbbbbo.',
      'obbebbbbebbo',
      'obbebbbbebbo',
      'obbbbbbbbbso',
      'osbbbbbbbsso',
      '.osssssssso.',
      '..oooooooo..',
    ],
  },
};


export function PixelIcon({ name, size = 16, title }) {
  const icon = PIXEL_ICONS[name];
  if (!icon) return null;
  const rows = icon.grid.length;
  const cols = icon.grid[0].length;
  const rects = [];
  icon.grid.forEach((row, y) => [...row].forEach((ch, x) => {
    const fill = icon.colors[ch];
    if (fill) rects.push(<rect key={x + '-' + y} x={x} y={y} width={1.02} height={1.02} fill={fill} />);
  }));
  return (
    <svg className="pixel-icon" width={size} height={size} viewBox={`0 0 ${cols} ${rows}`} shapeRendering="crispEdges" aria-label={title || icon.label}>
      {title && <title>{title}</title>}
      {rects}
    </svg>
  );
}

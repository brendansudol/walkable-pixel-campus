// Small helpers for drawing crisp pixel art into canvases at 1 unit = 1 pixel.
// Interiors are painted procedurally with these at load time, then scaled up
// with nearest-neighbour sampling by the main renderer.
(() => {
  'use strict';

  // 3×5 pixel font for signage.
  const FONT = {
    A: ['.#.', '#.#', '###', '#.#', '#.#'],
    B: ['##.', '#.#', '##.', '#.#', '##.'],
    C: ['.##', '#..', '#..', '#..', '.##'],
    D: ['##.', '#.#', '#.#', '#.#', '##.'],
    E: ['###', '#..', '##.', '#..', '###'],
    F: ['###', '#..', '##.', '#..', '#..'],
    G: ['.##', '#..', '#.#', '#.#', '.##'],
    H: ['#.#', '#.#', '###', '#.#', '#.#'],
    I: ['###', '.#.', '.#.', '.#.', '###'],
    J: ['..#', '..#', '..#', '#.#', '.#.'],
    K: ['#.#', '#.#', '##.', '#.#', '#.#'],
    L: ['#..', '#..', '#..', '#..', '###'],
    M: ['#.#', '###', '###', '#.#', '#.#'],
    N: ['##.', '#.#', '#.#', '#.#', '#.#'],
    O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
    P: ['##.', '#.#', '##.', '#..', '#..'],
    Q: ['.#.', '#.#', '#.#', '##.', '.##'],
    R: ['##.', '#.#', '##.', '#.#', '#.#'],
    S: ['.##', '#..', '.#.', '..#', '##.'],
    T: ['###', '.#.', '.#.', '.#.', '.#.'],
    U: ['#.#', '#.#', '#.#', '#.#', '###'],
    V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
    W: ['#.#', '#.#', '###', '###', '#.#'],
    X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
    Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
    Z: ['###', '..#', '.#.', '#..', '###'],
    0: ['###', '#.#', '#.#', '#.#', '###'],
    1: ['.#.', '##.', '.#.', '.#.', '###'],
    2: ['##.', '..#', '.#.', '#..', '###'],
    3: ['##.', '..#', '.#.', '..#', '##.'],
    4: ['#.#', '#.#', '###', '..#', '..#'],
    5: ['###', '#..', '##.', '..#', '##.'],
    6: ['.##', '#..', '###', '#.#', '###'],
    7: ['###', '..#', '.#.', '.#.', '.#.'],
    8: ['###', '#.#', '###', '#.#', '###'],
    9: ['###', '#.#', '###', '..#', '##.'],
    '.': ['...', '...', '...', '...', '.#.'],
    '-': ['...', '...', '###', '...', '...'],
    '!': ['.#.', '.#.', '.#.', '...', '.#.'],
    "'": ['.#.', '.#.', '...', '...', '...'],
    '&': ['.#.', '#.#', '.#.', '#.#', '.##'],
    '$': ['.##', '##.', '.#.', '.##', '##.'],
    '/': ['..#', '..#', '.#.', '#..', '#..'],
    ':': ['...', '.#.', '...', '.#.', '...'],
    ' ': ['...', '...', '...', '...', '...']
  };

  // 5×7 pixel font for larger signage.
  const FONT7 = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
    J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####']
  };

  function text7Width(str) {
    return [...str].reduce((sum, char) => sum + (char === ' ' ? 4 : 6), 0) - 1;
  }

  function text7(g, str, x, y, color) {
    g.fillStyle = color;
    let cursor = x;
    for (const char of str.toUpperCase()) {
      const glyph = FONT7[char];
      if (glyph) {
        glyph.forEach((row, rowIndex) => {
          for (let col = 0; col < 5; col += 1) if (row[col] === '#') g.fillRect(cursor + col, y + rowIndex, 1, 1);
        });
        cursor += 6;
      } else {
        cursor += 4;
      }
    }
    return cursor - x - 1;
  }

  function makeCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width));
    canvas.height = Math.max(1, Math.ceil(height));
    return canvas;
  }

  function rect(g, x, y, w, h, color) {
    g.fillStyle = color;
    g.fillRect(x, y, w, h);
  }

  function textWidth(str, scale = 1) {
    return str.length ? str.length * 4 * scale - scale : 0;
  }

  function text(g, str, x, y, color, scale = 1) {
    g.fillStyle = color;
    let cursor = x;
    for (const char of str.toUpperCase()) {
      const glyph = FONT[char] || FONT[' '];
      glyph.forEach((row, rowIndex) => {
        for (let col = 0; col < 3; col += 1) {
          if (row[col] === '#') g.fillRect(cursor + col * scale, y + rowIndex * scale, scale, scale);
        }
      });
      cursor += 4 * scale;
    }
    return cursor - x - scale;
  }

  // Filled ellipse inside the box (x, y, w, h), drawn as hard-edged scanlines.
  function ellipseRect(g, x, y, w, h, color) {
    g.fillStyle = color;
    const cx = x + w / 2;
    for (let row = 0; row < h; row += 1) {
      const v = (row + 0.5 - h / 2) / (h / 2);
      const half = (w / 2) * Math.sqrt(Math.max(0, 1 - v * v));
      const left = Math.round(cx - half);
      const right = Math.round(cx + half);
      if (right > left) g.fillRect(left, y + row, right - left, 1);
    }
  }

  function disc(g, cx, cy, r, color) {
    ellipseRect(g, cx - r, cy - r, r * 2, r * 2, color);
  }

  // Rectangle with a semicircular top (windows, fireplace openings).
  function arch(g, x, y, w, h, color) {
    g.fillStyle = color;
    const r = w / 2;
    for (let row = 0; row < h; row += 1) {
      if (row < r) {
        const v = (r - row - 0.5) / r;
        const half = r * Math.sqrt(Math.max(0, 1 - v * v));
        const left = Math.round(x + r - half);
        const right = Math.round(x + r + half);
        if (right > left) g.fillRect(left, y + row, right - left, 1);
      } else {
        g.fillRect(x, y + row, w, 1);
      }
    }
  }

  function line(g, x0, y0, x1, y1, color) {
    g.fillStyle = color;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      g.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // Deterministic random numbers so decoration (book spines, bricks) is stable.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- Characters ----------
  // Left half of a front-facing 24×32 character; each row is mirrored.
  const CHARACTER_LEFT = [
    '............',
    '........oooo',
    '......oohhhh',
    '.....ohhhhhh',
    '.....ohhhhhh',
    '.....ohhssss',
    '.....ohsssss',
    '.....ohssess',
    '.....ohssess',
    '.....oSsssss',
    '......oSsssm',
    '.......ooSSS',
    '......ooTtcc',
    '....ooTttttc',
    '...oTTottttt',
    '...oTTottttt',
    '...oTTottttt',
    '...osSottttt',
    '...osSottttt',
    '...oSSoTTTTT',
    '....oooppppp',
    '......oppppp',
    '......oppppo',
    '......oPpppo',
    '......oPpppo',
    '......oPpppo',
    '.....obbbbbo',
    '.....obbbbbo',
    '......oooooo',
    '............',
    '............',
    '............'
  ];

  const CHARACTER_TEMPLATE = CHARACTER_LEFT.map((left) => left + [...left].reverse().join(''));

  function buildCharacter(look) {
    const palette = {
      o: look.outline || '#2a1f1b',
      h: look.hair,
      H: look.hairHi || look.hair,
      s: look.skin,
      S: look.skinShade,
      e: look.eye || '#2a1f1b',
      m: look.skinShade,
      t: look.shirt,
      T: look.shirtShade,
      c: look.collar || look.shirt,
      p: look.pants,
      P: look.pantsShade || look.pants,
      b: look.shoes || '#2a2322'
    };

    const grid = CHARACTER_TEMPLATE.map((row) => [...row].map((code) => palette[code] || null));
    const set = (x, y, color) => { if (grid[y] && x >= 0 && x < 24) grid[y][x] = color; };

    // Hair highlight, slightly off-centre so the head doesn't look flat.
    set(9, 3, palette.H); set(10, 3, palette.H); set(8, 4, palette.H);

    if (look.beanie) {
      for (let y = 2; y <= 4; y += 1) {
        for (let x = 6; x <= 17; x += 1) if (grid[y][x] !== palette.o) set(x, y, y === 4 ? look.beanie.cuff : look.beanie.color);
      }
      set(11, 0, palette.o); set(12, 0, palette.o); set(11, 1, look.beanie.cuff); set(12, 1, look.beanie.cuff);
    }

    if (look.bun) {
      for (let x = 10; x <= 13; x += 1) set(x, 0, palette.o);
      set(9, 1, palette.o); set(14, 1, palette.o);
      for (let x = 10; x <= 13; x += 1) set(x, 1, palette.h);
      set(11, 1, palette.H);
    }

    if (look.longHair) {
      for (let y = 5; y <= 13; y += 1) {
        set(4, y, palette.o); set(5, y, palette.h);
        set(19, y, palette.o); set(18, y, palette.h);
      }
      set(4, 14, palette.o); set(19, 14, palette.o);
    }

    if (look.beard) {
      for (let x = 7; x <= 16; x += 1) {
        set(x, 10, x === 11 || x === 12 ? palette.S : palette.h);
        if (x >= 8 && x <= 15) set(x, 11, palette.h);
      }
      set(6, 9, palette.h); set(17, 9, palette.h);
    }

    if (look.cardigan) {
      for (let y = 13; y <= 19; y += 1) {
        set(11, y, look.cardigan); set(12, y, look.cardigan);
      }
      set(10, 12, look.cardigan); set(13, 12, look.cardigan);
    }

    if (look.apron) {
      const { color, shade } = look.apron;
      set(8, 12, color); set(15, 12, color);
      set(8, 13, color); set(15, 13, color);
      for (let y = 14; y <= 20; y += 1) {
        for (let x = 8; x <= 15; x += 1) set(x, y, (x === 8 || x === 15 || y === 20) ? shade : color);
      }
      for (let x = 10; x <= 13; x += 1) set(x, 17, shade);
      set(10, 18, shade); set(13, 18, shade);
    }

    if (look.glasses) {
      for (const ex of [9, 14]) {
        for (let x = ex - 1; x <= ex + 1; x += 1) { set(x, 6, look.glasses); set(x, 9, look.glasses); }
        set(ex - 2, 7, look.glasses); set(ex - 2, 8, look.glasses);
        set(ex + 2, 7, look.glasses); set(ex + 2, 8, look.glasses);
      }
      set(6, 7, look.glasses); set(17, 7, look.glasses);
    }

    const paint = (blink) => {
      const canvas = makeCanvas(24, 32);
      const g = canvas.getContext('2d');
      grid.forEach((row, y) => {
        row.forEach((color, x) => {
          if (!color) return;
          let final = color;
          if (blink && (y === 7 || y === 8) && (x === 9 || x === 14)) final = y === 8 ? palette.S : palette.s;
          g.fillStyle = final;
          g.fillRect(x, y, 1, 1);
        });
      });
      return canvas;
    };

    return [paint(false), paint(true)];
  }

  // ---------- Held items ----------
  function drawCup(g, x, y, time) {
    rect(g, x, y, 5, 1, '#2a1f1b');
    rect(g, x, y + 1, 5, 6, '#2a1f1b');
    rect(g, x + 1, y + 1, 3, 5, '#f4ead6');
    rect(g, x + 1, y + 3, 3, 2, '#9a6a42');
    rect(g, x - 1, y, 7, 1, '#3a3533');
    if (time !== undefined) {
      const phase = Math.floor(time * 3) % 3;
      g.fillStyle = 'rgba(255, 255, 255, 0.7)';
      g.fillRect(x + 1 + (phase === 1 ? 1 : 0), y - 3 - phase, 1, 2);
      g.fillRect(x + 3 - (phase === 2 ? 1 : 0), y - 5 + phase % 2, 1, 2);
    }
  }

  function drawBook(g, x, y, color = '#9c3431') {
    rect(g, x, y, 6, 8, '#2a1f1b');
    rect(g, x + 1, y + 1, 4, 6, color);
    rect(g, x + 1, y + 1, 1, 6, '#f4ead6');
    rect(g, x + 2, y + 3, 3, 1, '#d8a64a');
  }

  window.PixelKit = {
    FONT,
    makeCanvas,
    rect,
    text,
    textWidth,
    text7,
    text7Width,
    ellipseRect,
    disc,
    arch,
    line,
    rng,
    buildCharacter,
    drawCup,
    drawBook
  };
})();

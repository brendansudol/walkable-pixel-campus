// Interior scenes. Each one is painted procedurally in the same warm pixel
// palette as the campus map, using world coordinates at 1 unit = 1 pixel.
//
// Scene shape (see app.js for how these are consumed):
//   paint(g)                 static floor + walls, painted once
//   props[]                  furniture, depth-sorted against the player by sortY
//     bounds [x, y, w, h]    pixels the prop may draw into
//     footprint [x, y, w, h] floor area the player cannot walk through
//     draw(g) / live(ctx, t) static pixels / per-frame pixels
//   npcs[]                   front-facing characters, sorted by their feet
//   hotspots[]               interaction points; `target` rects make art clickable
//   doors[]                  trigger zones that switch scenes
//   drawUnder / drawOver     per-frame effects below / above characters
(() => {
  'use strict';

  const K = window.PixelKit;
  const { rect, text, textWidth, ellipseRect, disc, arch, line, rng } = K;

  const OUT = '#2a1f1b';
  const BACKDROP = '#f4dfc6';
  const WOOD = { hi: '#b27c50', light: '#9b6a42', mid: '#7d4d31', base: '#6b4129', dark: '#5d3822', deep: '#4a2c1a', shadow: '#3a2415' };
  const BRASS = { hi: '#f0c872', base: '#d8a64a', dark: '#a87a2a' };
  const STONE = { hi: '#efe2c8', base: '#d9c9ae', mid: '#c2b091', dark: '#a8957a' };
  const CAP = { top: '#4a403b', hi: '#6a5b52', lo: '#2c2522' };
  const BASE = { top: '#524b47', face: '#34302e', lo: '#252220' };
  const BOOKS = [
    ['#9c3431', '#6e2220', '#c0544a'],
    ['#2f4f6b', '#1f3448', '#4a7090'],
    ['#4f6b3a', '#364a27', '#6d8a52'],
    ['#c79a3a', '#94701f', '#e0bc62'],
    ['#6b3f5e', '#4a2a40', '#8a5a7c'],
    ['#3a3533', '#262220', '#5a524d'],
    ['#a8623a', '#7a4426', '#c47e52'],
    ['#e3d3b0', '#bfae8a', '#f4e8cc'],
    ['#2f6b64', '#1f4a45', '#4a8a82']
  ];

  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function strokeRect(g, x, y, w, h, color) {
    rect(g, x, y, w, 1, color);
    rect(g, x, y + h - 1, w, 1, color);
    rect(g, x, y, 1, h, color);
    rect(g, x + w - 1, y, 1, h, color);
  }

  function diamond(g, cx, cy, r, color) {
    for (let i = 0; i <= r; i += 1) {
      rect(g, cx - i, cy - r + i, i * 2 + 1, 1, color);
      rect(g, cx - i, cy + r - i, i * 2 + 1, 1, color);
    }
  }

  // Tapered flame tongue, widest at the base.
  function flame(g, cx, baseY, height, width, color) {
    for (let row = 0; row < height; row += 1) {
      const w = Math.max(1, Math.round(width * (1 - row / height) ** 0.7));
      rect(g, Math.round(cx - w / 2), baseY - row, w, 1, color);
    }
  }

  // ---------- Room shell shared by every interior ----------
  function paintShell(g, room) {
    const { x, y, w, h, door } = room;
    g.fillStyle = 'rgba(92, 62, 42, 0.16)';
    g.fillRect(x + 8, y + 18, w, h + 10);
    rect(g, x, y + h, w, 14, BASE.face);
    rect(g, x, y + h, w, 1, BASE.top);
    rect(g, x, y + h + 13, w, 1, BASE.lo);
    // Front steps outside the door.
    rect(g, door.x - 6, y + h, door.w + 12, 7, STONE.mid);
    rect(g, door.x - 6, y + h, door.w + 12, 1, STONE.hi);
    rect(g, door.x - 10, y + h + 7, door.w + 20, 8, STONE.dark);
    rect(g, door.x - 10, y + h + 7, door.w + 20, 1, STONE.base);
    rect(g, door.x - 10, y + h + 14, door.w + 20, 1, OUT);
  }

  function paintFloorShadows(g, room) {
    const left = room.x + room.cap;
    const width = room.w - room.cap * 2;
    const floorH = room.y + room.h - room.cap - room.wallBottom;
    g.fillStyle = 'rgba(34, 18, 10, 0.26)';
    g.fillRect(left, room.wallBottom, width, 3);
    g.fillStyle = 'rgba(34, 18, 10, 0.12)';
    g.fillRect(left, room.wallBottom + 3, width, 4);
    g.fillRect(left, room.wallBottom, 4, floorH);
  }

  function paintCaps(g, room) {
    const { x, y, w, h, cap, door } = room;
    const bottom = y + h - cap;
    rect(g, x, y, w, cap, CAP.top);
    rect(g, x, y, w, 1, CAP.hi);
    rect(g, x + cap, y + cap - 1, w - cap * 2, 1, CAP.lo);
    rect(g, x, y, cap, h, CAP.top);
    rect(g, x, y, 1, h, CAP.hi);
    rect(g, x + cap - 1, y + cap, 1, h - cap * 2, CAP.lo);
    rect(g, x + w - cap, y, cap, h, CAP.top);
    rect(g, x + w - 1, y, 1, h, CAP.lo);
    rect(g, x + w - cap, y + cap, 1, h - cap * 2, CAP.hi);
    rect(g, x, bottom, door.x - x, cap, CAP.top);
    rect(g, door.x + door.w, bottom, x + w - door.x - door.w, cap, CAP.top);
    rect(g, x + cap, bottom, door.x - x - cap, 1, CAP.hi);
    rect(g, door.x + door.w, bottom, x + w - cap - door.x - door.w, 1, CAP.hi);
    rect(g, x, y + h - 1, w, 1, CAP.lo);
    // Door jambs and threshold.
    rect(g, door.x - 3, bottom - 2, 3, cap + 2, STONE.base);
    rect(g, door.x - 3, bottom - 2, 3, 1, STONE.hi);
    rect(g, door.x + door.w, bottom - 2, 3, cap + 2, STONE.base);
    rect(g, door.x + door.w, bottom - 2, 3, 1, STONE.hi);
    rect(g, door.x, bottom, door.w, cap, STONE.mid);
    rect(g, door.x, bottom, door.w, 1, STONE.hi);
    rect(g, door.x, bottom + cap - 1, door.w, 1, STONE.dark);
  }

  function paintPlankFloor(g, area, colors, seed) {
    const rand = rng(seed);
    const { x, y, w, h } = area;
    for (let row = 0, py = y; py < y + h; row += 1, py += 8) {
      const rh = Math.min(8, y + h - py);
      rect(g, x, py, w, rh, row % 2 ? colors.a : colors.b);
      rect(g, x, py, w, 1, colors.hi);
      if (rh === 8) rect(g, x, py + 7, w, 1, colors.seam);
      let sx = x - Math.floor(rand() * 60);
      while (sx < x + w) {
        sx += 44 + Math.floor(rand() * 40);
        if (sx > x && sx < x + w) rect(g, sx, py + 1, 1, rh - 2, colors.seam);
        const fx = sx - 12 - Math.floor(rand() * 22);
        if (fx > x && fx < x + w - 8) rect(g, fx, py + 3 + Math.floor(rand() * 3), 3 + Math.floor(rand() * 5), 1, colors.grain);
      }
    }
  }

  function bookRow(g, x, y, w, h, rand) {
    let cx = x;
    while (cx < x + w - 1) {
      const bw = 2 + Math.floor(rand() * 4);
      if (cx + bw > x + w) break;
      if (rand() < 0.05) { cx += bw + 1; continue; }
      const [base, dark, light] = BOOKS[Math.floor(rand() * BOOKS.length)];
      const bh = h - 1 - Math.floor(rand() * 5);
      const top = y + h - bh;
      rect(g, cx, top, bw, bh, base);
      rect(g, cx, top, bw, 1, light);
      rect(g, cx + bw - 1, top, 1, bh, dark);
      if (bh > 8 && bw > 2) {
        const band = rand() < 0.5 ? '#d8b25a' : light;
        rect(g, cx, top + 2, bw - 1, 1, band);
        rect(g, cx, y + h - 3, bw - 1, 1, band);
      }
      cx += bw;
    }
  }

  function pottedPlant(x, y, style = 'fern') {
    return {
      bounds: [x - 2, y - 2, 30, 36],
      sortY: y + 31,
      footprint: [x + 5, y + 24, 16, 7],
      draw(g) {
        // Leaves first; the pot overlaps their base.
        const leaf = style === 'fern'
          ? ['#4f6b30', '#6f8a3f', '#93aa55']
          : ['#2f5a34', '#447a45', '#62985a'];
        const clusters = style === 'fern'
          ? [[13, 2, 7], [5, 7, 6], [21, 8, 6], [9, 12, 7], [18, 13, 7], [13, 9, 7]]
          : [[13, 1, 6], [6, 6, 6], [20, 5, 6], [8, 13, 6], [19, 13, 6], [13, 8, 7]];
        for (const [cx, cy, r] of clusters) disc(g, x + cx, y + cy, r + 1, OUT);
        for (const [cx, cy, r] of clusters) disc(g, x + cx, y + cy, r, leaf[0]);
        for (const [cx, cy, r] of clusters) disc(g, x + cx - 1, y + cy - 1, r - 2, leaf[1]);
        for (const [cx, cy] of clusters) rect(g, x + cx - 2, y + cy - 3, 2, 1, leaf[2]);
        // Pot.
        const potColor = style === 'fern' ? ['#b8643f', '#94492c', '#d27d52'] : ['#efe6d4', '#cfc3ac', '#fffaf0'];
        rect(g, x + 4, y + 18, 18, 14, OUT);
        rect(g, x + 3, y + 18, 20, 4, OUT);
        rect(g, x + 4, y + 19, 18, 2, potColor[2]);
        rect(g, x + 5, y + 22, 16, 9, potColor[0]);
        rect(g, x + 18, y + 22, 3, 9, potColor[1]);
        rect(g, x + 6, y + 22, 1, 8, potColor[2]);
      }
    };
  }

  // =====================================================================
  // LIBRARY
  // =====================================================================
  const LIB_ROOM = { x: 16, y: 24, w: 480, h: 452, cap: 12, wallBottom: 124, door: { x: 232, w: 48 } };
  const libraryFx = { spinStart: -100, spinBase: 0 };

  function bookcase(g, x, y, w, h, seed) {
    const rand = rng(seed);
    rect(g, x - 1, y, w + 2, h, OUT);
    rect(g, x, y + 1, w, h - 1, WOOD.dark);
    const inner = x + 4;
    const innerW = w - 8;
    const rowH = 15;
    let rowY = y + 7;
    while (rowY + rowH + 3 <= y + h) {
      rect(g, inner, rowY, innerW, rowH, '#2a180f');
      bookRow(g, inner, rowY, innerW, rowH, rand);
      rect(g, inner - 1, rowY + rowH, innerW + 2, 3, WOOD.base);
      rect(g, inner - 1, rowY + rowH, innerW + 2, 1, WOOD.hi);
      rowY += rowH + 3;
    }
    rect(g, x, y + 6, 4, h - 6, WOOD.dark);
    rect(g, x, y + 6, 1, h - 6, WOOD.mid);
    rect(g, x + w - 4, y + 6, 4, h - 6, WOOD.dark);
    rect(g, x + w - 1, y + 6, 1, h - 6, WOOD.deep);
    const mid = x + Math.floor(w / 2) - 1;
    rect(g, mid, y + 6, 3, h - 6, WOOD.dark);
    rect(g, mid, y + 6, 1, h - 6, WOOD.mid);
    rect(g, x - 2, y, w + 4, 5, WOOD.base);
    rect(g, x - 2, y, w + 4, 1, WOOD.hi);
    rect(g, x - 2, y + 5, w + 4, 1, OUT);
  }

  function drape(g, x, y, w, h) {
    rect(g, x, y, w, h, OUT);
    rect(g, x + 1, y, w - 2, h - 1, '#8e2f2d');
    for (let fx = x + 2; fx < x + w - 1; fx += 3) rect(g, fx, y, 1, h - 1, '#6e2220');
    rect(g, x + 1, y, 1, h - 1, '#b04440');
    rect(g, x, y + Math.round(h * 0.62), w, 2, BRASS.base);
  }

  function drapedWindow(g, x, y, w, h) {
    arch(g, x - 2, y - 2, w + 4, h + 4, OUT);
    arch(g, x - 1, y - 1, w + 2, h + 2, STONE.base);
    arch(g, x + 2, y + 2, w - 4, h - 2, '#9fc6d0');
    arch(g, x + 2, y + 2, w - 4, 20, '#c3e0e5');
    g.save();
    g.beginPath();
    g.rect(x + 2, y + 2, w - 4, h - 2);
    g.clip();
    for (let i = 0; i < 6; i += 1) disc(g, x + 2 + i * 7, y + h - 6 + (i % 2) * 3, 7, '#5f7a38');
    for (let i = 0; i < 6; i += 1) disc(g, x + 4 + i * 7, y + h - 8 + (i % 2) * 3, 4, '#7f9a48');
    g.restore();
    rect(g, x + w / 2 - 1, y + 2, 2, h - 2, STONE.hi);
    rect(g, x + 2, y + 22, w - 4, 2, STONE.hi);
    rect(g, x + 2, y + 38, w - 4, 2, STONE.hi);
    rect(g, x + 4, y + 6, 1, 12, 'rgba(255,255,255,0.65)');
    rect(g, x + 6, y + 8, 1, 6, 'rgba(255,255,255,0.45)');
    rect(g, x - 4, y + h, w + 8, 3, STONE.hi);
    rect(g, x - 4, y + h + 3, w + 8, 1, STONE.dark);
    drape(g, x - 8, y - 5, 8, h + 10);
    drape(g, x + w, y - 5, 8, h + 10);
    rect(g, x - 9, y - 8, w + 18, 5, OUT);
    rect(g, x - 8, y - 7, w + 16, 3, '#8e2f2d');
    rect(g, x - 8, y - 7, w + 16, 1, '#b04440');
    for (let sx = x - 8; sx < x + w + 8; sx += 6) rect(g, sx + 1, y - 4, 4, 2, '#8e2f2d');
    rect(g, x - 10, y - 9, w + 20, 2, BRASS.dark);
  }

  function candle(g, x, y) {
    rect(g, x - 2, y + 5, 5, 1, BRASS.dark);
    rect(g, x, y + 1, 1, 4, BRASS.base);
    rect(g, x - 1, y - 3, 3, 4, '#f4ead6');
    rect(g, x, y - 5, 1, 2, '#f8d86a');
  }

  function fireplace(g) {
    const x = 228;
    const w = 56;
    rect(g, x, 60, w, 64, OUT);
    rect(g, x + 1, 61, w - 2, 63, STONE.base);
    for (let row = 0; row < 8; row += 1) {
      const y = 61 + row * 8;
      rect(g, x + 1, y + 7, w - 2, 1, STONE.mid);
      rect(g, x + 1, y, w - 2, 1, STONE.hi);
      for (let bx = x + 1 + (row % 2 ? 7 : 0); bx < x + w - 1; bx += 14) rect(g, bx, y, 1, 7, STONE.mid);
    }
    arch(g, x + 8, 78, w - 16, 44, STONE.dark);
    arch(g, x + 10, 80, w - 20, 42, '#1c1411');
    for (let y = 92; y < 120; y += 5) {
      for (let bx = x + 12 + ((y / 5) % 2 ? 4 : 0); bx < x + w - 12; bx += 8) rect(g, bx, y, 6, 1, '#2c1a14');
    }
    rect(g, 224, 120, 64, 8, OUT);
    rect(g, 225, 120, 62, 7, STONE.mid);
    rect(g, 225, 120, 62, 1, STONE.hi);
    rect(g, 225, 126, 62, 1, STONE.dark);
    rect(g, 222, 56, 68, 6, OUT);
    rect(g, 223, 56, 66, 5, WOOD.base);
    rect(g, 223, 56, 66, 1, WOOD.hi);
    rect(g, 223, 60, 66, 1, WOOD.deep);
    rect(g, 227, 62, 4, 4, WOOD.dark);
    rect(g, 281, 62, 4, 4, WOOD.dark);
    candle(g, 233, 50);
    candle(g, 279, 50);
    rect(g, 263, 51, 9, 2, '#2f4f6b');
    rect(g, 264, 53, 9, 3, '#9c3431');
    rect(g, 264, 53, 9, 1, '#c0544a');
    disc(g, 256, 48, 8, OUT);
    disc(g, 256, 48, 7, BRASS.base);
    disc(g, 256, 48, 5, '#f4ead6');
    for (const [dx, dy] of [[0, -4], [4, 0], [0, 4], [-4, 0]]) rect(g, 256 + dx, 48 + dy, 1, 1, '#7a6a5a');
  }

  function paintLibrary(g) {
    paintShell(g, LIB_ROOM);
    paintPlankFloor(g, { x: 28, y: 124, w: 456, h: 352 }, {
      a: '#8d5d3c', b: '#86573a', hi: '#9a6a47', seam: '#5e3a24', grain: '#7a4d31'
    }, 7);

    // Big reading-room rug under the study tables.
    const rug = { x: 146, y: 204, w: 220, h: 156 };
    for (let fy = rug.y + 3; fy < rug.y + rug.h - 3; fy += 2) {
      rect(g, rug.x - 3, fy, 3, 1, '#e8d8bc');
      rect(g, rug.x + rug.w, fy, 3, 1, '#e8d8bc');
    }
    rect(g, rug.x, rug.y, rug.w, rug.h, '#5e1d1d');
    rect(g, rug.x + 2, rug.y + 2, rug.w - 4, rug.h - 4, '#c99a45');
    rect(g, rug.x + 5, rug.y + 5, rug.w - 10, rug.h - 10, '#6e2220');
    rect(g, rug.x + 7, rug.y + 7, rug.w - 14, rug.h - 14, '#94302d');
    strokeRect(g, rug.x + 12, rug.y + 12, rug.w - 24, rug.h - 24, '#c99a45');
    for (let dx = rug.x + 20; dx < rug.x + rug.w - 16; dx += 12) {
      diamond(g, dx, rug.y + 9, 1, '#c99a45');
      diamond(g, dx, rug.y + rug.h - 10, 1, '#c99a45');
    }
    diamond(g, rug.x + rug.w / 2, rug.y + rug.h / 2, 16, '#6e2220');
    diamond(g, rug.x + rug.w / 2, rug.y + rug.h / 2, 13, '#c99a45');
    diamond(g, rug.x + rug.w / 2, rug.y + rug.h / 2, 11, '#94302d');
    diamond(g, rug.x + rug.w / 2, rug.y + rug.h / 2, 5, '#2f4f6b');

    // Entry runner from the door.
    rect(g, 238, 370, 36, 96, '#5e1d1d');
    rect(g, 240, 372, 32, 92, '#c99a45');
    rect(g, 242, 374, 28, 88, '#94302d');
    for (let ry = 380; ry < 460; ry += 10) diamond(g, 256, ry, 2, '#c99a45');

    // Hearth rug.
    ellipseRect(g, 214, 128, 84, 26, '#2e4229');
    ellipseRect(g, 216, 129, 80, 23, '#c99a45');
    ellipseRect(g, 219, 131, 74, 19, '#3f5a3a');

    paintFloorShadows(g, LIB_ROOM);

    // Back wall.
    const x0 = 28;
    const x1 = 484;
    rect(g, x0, 36, x1 - x0, 88, '#7b2d2a');
    for (let x = x0 + 3; x < x1; x += 8) rect(g, x, 41, 2, 53, '#722826');
    for (let y = 46; y < 92; y += 12) {
      for (let x = x0 + 7 + ((y - 46) / 12 % 2) * 4; x < x1; x += 8) rect(g, x, y, 1, 1, '#9a4b3d');
    }
    rect(g, x0, 36, x1 - x0, 4, '#e3d2b4');
    rect(g, x0, 40, x1 - x0, 1, '#b39c7a');
    rect(g, x0, 94, x1 - x0, 3, '#a0714a');
    rect(g, x0, 94, x1 - x0, 1, '#c08a5a');
    rect(g, x0, 97, x1 - x0, 1, '#3f2617');
    rect(g, x0, 98, x1 - x0, 22, WOOD.dark);
    for (let x = x0 + 4; x + 28 < x1; x += 34) {
      rect(g, x, 101, 28, 16, WOOD.base);
      rect(g, x, 101, 28, 1, WOOD.mid);
      rect(g, x, 101, 1, 16, WOOD.mid);
      rect(g, x, 116, 28, 1, WOOD.deep);
      rect(g, x + 27, 101, 1, 16, WOOD.deep);
    }
    rect(g, x0, 120, x1 - x0, 4, '#3f2617');
    rect(g, x0, 120, x1 - x0, 1, '#5a3620');

    bookcase(g, 34, 40, 144, 84, 11);
    bookcase(g, 334, 40, 144, 84, 29);
    drapedWindow(g, 186, 46, 34, 56);
    drapedWindow(g, 292, 46, 34, 56);
    fireplace(g);

    paintCaps(g, LIB_ROOM);
  }

  const GREEN_LEATHER = { base: '#3f5a3a', hi: '#56744c', dark: '#2e4229', light: '#6d8f5e' };
  const TEAL_VELVET = { base: '#2f6b64', hi: '#428279', dark: '#1f4a45', light: '#5ea79c' };
  const RUST_VELVET = { base: '#b8643f', hi: '#cc7a50', dark: '#8e4a2c', light: '#e09466' };

  function armchair(x, y, palette = GREEN_LEATHER) {
    return {
      bounds: [x, y, 28, 31],
      sortY: y + 30,
      footprint: [x + 2, y + 20, 24, 10],
      draw(g) {
        const { base: G, hi: GH, dark: GD, light: GL } = palette;
        rect(g, x + 4, y, 20, 1, OUT);
        rect(g, x + 3, y + 1, 22, 15, OUT);
        rect(g, x + 4, y + 1, 20, 14, G);
        rect(g, x + 5, y + 2, 18, 2, GH);
        for (const [dx, dy] of [[8, 7], [14, 7], [20, 7], [11, 11], [17, 11]]) rect(g, x + dx - 1, y + dy, 1, 1, GD);
        rect(g, x, y + 10, 7, 17, OUT);
        rect(g, x + 1, y + 11, 5, 15, G);
        rect(g, x + 1, y + 11, 5, 2, GL);
        rect(g, x + 21, y + 10, 7, 17, OUT);
        rect(g, x + 22, y + 11, 5, 15, G);
        rect(g, x + 22, y + 11, 5, 2, GL);
        rect(g, x + 6, y + 15, 16, 8, OUT);
        rect(g, x + 7, y + 15, 14, 7, GH);
        rect(g, x + 7, y + 15, 14, 1, GL);
        rect(g, x + 1, y + 22, 26, 6, OUT);
        rect(g, x + 2, y + 22, 24, 4, GD);
        rect(g, x + 2, y + 28, 3, 3, WOOD.shadow);
        rect(g, x + 23, y + 28, 3, 3, WOOD.shadow);
      }
    };
  }

  function bankersLamp(g, lx, ty) {
    rect(g, lx - 4, ty + 1, 9, 2, OUT);
    rect(g, lx - 3, ty + 1, 7, 1, BRASS.base);
    rect(g, lx, ty - 6, 1, 7, BRASS.dark);
    rect(g, lx - 6, ty - 11, 13, 6, OUT);
    rect(g, lx - 5, ty - 11, 11, 4, '#2f7a4a');
    rect(g, lx - 5, ty - 11, 11, 1, '#58a672');
    rect(g, lx - 5, ty - 8, 11, 1, '#1f5a34');
    rect(g, lx - 4, ty - 6, 9, 1, '#fff2b0');
  }

  function openBook(g, x, y) {
    rect(g, x, y, 16, 7, OUT);
    rect(g, x + 1, y + 1, 7, 5, '#f4ead6');
    rect(g, x + 8, y + 1, 7, 5, '#efe2c8');
    rect(g, x + 2, y + 2, 5, 1, '#b9ab94');
    rect(g, x + 2, y + 4, 4, 1, '#b9ab94');
    rect(g, x + 9, y + 2, 5, 1, '#b9ab94');
    rect(g, x + 9, y + 4, 5, 1, '#b9ab94');
  }

  function bookStack(g, x, y, seed) {
    const rand = rng(seed);
    for (let i = 0; i < 3; i += 1) {
      const [base, dark, light] = BOOKS[Math.floor(rand() * BOOKS.length)];
      const w = 12 - Math.floor(rand() * 3);
      const bx = x + Math.floor(rand() * 2);
      const by = y - i * 3;
      rect(g, bx, by, w, 3, OUT);
      rect(g, bx + 1, by, w - 2, 2, base);
      rect(g, bx + 1, by, w - 2, 1, light);
      rect(g, bx + w - 2, by, 1, 2, dark);
    }
  }

  function studyTable(x, y, w, extras) {
    return {
      bounds: [x - 2, y - 14, w + 4, 50],
      sortY: y + 34,
      footprint: [x + 2, y + 16, w - 4, 18],
      draw(g) {
        g.fillStyle = 'rgba(30, 14, 8, 0.25)';
        g.fillRect(x + 3, y + 30, w - 6, 4);
        rect(g, x, y, w, 18, OUT);
        rect(g, x + 1, y + 1, w - 2, 16, WOOD.light);
        rect(g, x + 1, y + 1, w - 2, 1, WOOD.hi);
        for (let px = x + 46; px < x + w - 4; px += 46) rect(g, px, y + 2, 1, 14, '#8a5c38');
        rect(g, x + 1, y + 16, w - 2, 1, '#c08a5a');
        rect(g, x, y + 18, w, 7, OUT);
        rect(g, x + 1, y + 18, w - 2, 5, WOOD.base);
        rect(g, x + 1, y + 18, w - 2, 1, WOOD.mid);
        for (const lx of [x + 3, x + w / 2 - 2, x + w - 8]) {
          rect(g, lx, y + 24, 5, 10, OUT);
          rect(g, lx + 1, y + 24, 3, 9, WOOD.dark);
        }
        for (const lampX of [x + 20, x + w / 2, x + w - 20]) bankersLamp(g, lampX, y + 9);
        extras(g);
      }
    };
  }

  function libraryChair(x, y) {
    return {
      bounds: [x, y, 18, 22],
      sortY: y + 18,
      footprint: [x + 2, y + 12, 14, 8],
      draw(g) {
        rect(g, x + 1, y, 16, 4, OUT);
        rect(g, x + 2, y + 1, 14, 2, WOOD.mid);
        rect(g, x + 2, y + 1, 14, 1, WOOD.hi);
        rect(g, x + 1, y + 4, 3, 14, OUT);
        rect(g, x + 2, y + 4, 1, 13, WOOD.base);
        rect(g, x + 14, y + 4, 3, 14, OUT);
        rect(g, x + 15, y + 4, 1, 13, WOOD.base);
        rect(g, x + 6, y + 4, 2, 9, WOOD.base);
        rect(g, x + 10, y + 4, 2, 9, WOOD.base);
        rect(g, x + 2, y + 12, 14, 2, WOOD.base);
        rect(g, x, y + 16, 18, 5, OUT);
        rect(g, x + 1, y + 16, 16, 3, WOOD.light);
      }
    };
  }

  function stack(x, capY, w, label, seed) {
    return {
      bounds: [x - 1, capY - 1, w + 2, 58],
      sortY: capY + 56,
      footprint: [x, capY + 46, w, 10],
      draw(g) {
        const rand = rng(seed);
        g.fillStyle = 'rgba(30, 14, 8, 0.25)';
        g.fillRect(x + 2, capY + 52, w - 2, 4);
        rect(g, x - 1, capY - 1, w + 2, 57, OUT);
        rect(g, x, capY, w, 8, WOOD.light);
        rect(g, x, capY, w, 1, WOOD.hi);
        rect(g, x, capY + 7, w, 1, WOOD.mid);
        rect(g, x, capY + 8, w, 46, WOOD.dark);
        rect(g, x, capY + 8, w, 3, WOOD.base);
        let rowY = capY + 11;
        for (let row = 0; row < 3; row += 1) {
          rect(g, x + 3, rowY, w - 6, 12, '#2a180f');
          bookRow(g, x + 3, rowY, w - 6, 12, rand);
          rect(g, x + 2, rowY + 12, w - 4, 2, WOOD.base);
          rect(g, x + 2, rowY + 12, w - 4, 1, WOOD.hi);
          rowY += 14;
        }
        rect(g, x, capY + 8, 3, 46, WOOD.dark);
        rect(g, x, capY + 8, 1, 46, WOOD.mid);
        rect(g, x + w - 3, capY + 8, 3, 46, WOOD.dark);
        rect(g, x, capY + 53, w, 2, WOOD.deep);
        const lw = textWidth(label) + 4;
        rect(g, x + 6, capY + 8, lw, 7, OUT);
        rect(g, x + 7, capY + 9, lw - 2, 5, '#efe2c8');
        text(g, label, x + 8, capY + 9, '#3a2c26');
      }
    };
  }

  function circulationDesk() {
    const x = 40;
    const y = 368;
    const w = 128;
    return {
      bounds: [x - 2, 350, w + 4, 54],
      sortY: 402,
      footprint: [x, 386, w, 16],
      draw(g) {
        rect(g, x, y, w, 34, OUT);
        rect(g, x + 1, y + 1, w - 2, 14, '#b98a5c');
        rect(g, x + 1, y + 1, w - 2, 1, '#d0a372');
        rect(g, x + 1, y + 14, w - 2, 1, '#d9ae7e');
        rect(g, x + 1, y + 16, w - 2, 17, WOOD.dark);
        for (let i = 0; i < 4; i += 1) {
          const px = x + 5 + i * 30;
          rect(g, px, y + 19, 26, 11, WOOD.base);
          rect(g, px, y + 19, 26, 1, WOOD.mid);
          rect(g, px, y + 19, 1, 11, WOOD.mid);
          rect(g, px, y + 29, 26, 1, WOOD.deep);
          rect(g, px + 25, y + 19, 1, 11, WOOD.deep);
        }
        const plaque = 'CHECKOUT';
        const pw = textWidth(plaque) + 6;
        const px = x + (w - pw) / 2;
        rect(g, px - 1, y + 20, pw + 2, 9, OUT);
        rect(g, px, y + 21, pw, 7, BRASS.base);
        rect(g, px, y + 21, pw, 1, BRASS.hi);
        text(g, plaque, px + 3, y + 22, '#4a2c1a');
        // Beige desktop computer.
        rect(g, 50, 354, 20, 16, OUT);
        rect(g, 51, 355, 18, 14, '#d9cfb8');
        rect(g, 53, 357, 14, 9, '#2f4a3a');
        rect(g, 54, 358, 8, 1, '#7fd08a');
        rect(g, 54, 360, 11, 1, '#7fd08a');
        rect(g, 54, 362, 6, 1, '#7fd08a');
        rect(g, 56, 369, 8, 3, '#bfb49a');
        rect(g, 49, 373, 22, 5, OUT);
        rect(g, 50, 374, 20, 3, '#cfc4ab');
        for (let kx = 51; kx < 69; kx += 2) rect(g, kx, 375, 1, 1, '#a89c82');
        bookStack(g, 124, 373, 5);
        // Brass service bell.
        rect(g, 148, 372, 9, 5, OUT);
        rect(g, 149, 373, 7, 3, BRASS.base);
        rect(g, 150, 373, 3, 1, BRASS.hi);
        rect(g, 152, 370, 1, 2, OUT);
        rect(g, 146, 376, 13, 2, OUT);
      }
    };
  }

  function cardCatalog() {
    const x = 40;
    const y = 190;
    return {
      bounds: [x - 1, y - 1, 58, 54],
      sortY: 242,
      footprint: [x, 228, 56, 14],
      draw(g) {
        g.fillStyle = 'rgba(30, 14, 8, 0.25)';
        g.fillRect(x + 2, y + 48, 54, 4);
        rect(g, x - 1, y - 1, 58, 50, OUT);
        rect(g, x, y, 56, 8, WOOD.light);
        rect(g, x, y, 56, 1, WOOD.hi);
        rect(g, x, y + 8, 56, 40, WOOD.base);
        for (let r = 0; r < 5; r += 1) {
          for (let c = 0; c < 5; c += 1) {
            const dx = x + 3 + c * 10;
            const dy = y + 10 + r * 7;
            rect(g, dx, dy, 9, 6, WOOD.mid);
            rect(g, dx, dy, 9, 1, '#9b6a42');
            rect(g, dx + 2, dy + 1, 5, 2, '#efe2c8');
            rect(g, dx + 4, dy + 4, 1, 1, BRASS.base);
          }
        }
        rect(g, x + 1, y + 46, 4, 6, OUT);
        rect(g, x + 51, y + 46, 4, 6, OUT);
      }
    };
  }

  function bookCart(x, y) {
    return {
      bounds: [x - 1, y - 8, 36, 38],
      sortY: y + 28,
      footprint: [x + 2, y + 20, 30, 8],
      draw(g) {
        const rand = rng(91);
        rect(g, x, y + 6, 34, 16, OUT);
        rect(g, x + 1, y + 7, 32, 3, '#6f7472');
        rect(g, x + 1, y + 7, 32, 1, '#9ea3a0');
        rect(g, x + 1, y + 16, 32, 3, '#6f7472');
        rect(g, x + 1, y + 16, 32, 1, '#9ea3a0');
        rect(g, x + 1, y + 10, 32, 6, '#2e2a28');
        bookRow(g, x + 2, y - 6, 30, 13, rand);
        bookRow(g, x + 2, y + 10, 30, 6, rand);
        rect(g, x + 1, y + 19, 32, 3, '#6f7472');
        disc(g, x + 5, y + 25, 3, OUT);
        disc(g, x + 29, y + 25, 3, OUT);
        rect(g, x + 4, y + 24, 2, 2, '#9ea3a0');
        rect(g, x + 28, y + 24, 2, 2, '#9ea3a0');
      }
    };
  }

  function quietSign(x, y) {
    return {
      bounds: [x - 1, y - 1, 24, 28],
      sortY: y + 25,
      footprint: [x + 2, y + 19, 18, 6],
      draw(g) {
        rect(g, x + 2, y + 16, 2, 9, OUT);
        rect(g, x + 18, y + 16, 2, 9, OUT);
        rect(g, x, y, 22, 17, OUT);
        rect(g, x + 1, y + 1, 20, 15, '#efe2c8');
        rect(g, x + 1, y + 1, 20, 1, '#fffaf0');
        rect(g, x + 1, y + 1, 20, 3, '#9c3431');
        text(g, 'SHH', x + 5, y + 6, '#3a2c26');
        rect(g, x + 4, y + 12, 14, 1, '#b9ab94');
      }
    };
  }

  const globe = {
    bounds: [418, 394, 30, 44],
    sortY: 436,
    footprint: [424, 428, 16, 8],
    live(ctx, time) {
      const cx = 432;
      const cy = 408;
      const spinT = clamp01((time - libraryFx.spinStart) / 2.4);
      const offset = libraryFx.spinBase + 64 * (1 - (1 - spinT) ** 3);
      ctx.fillStyle = 'rgba(30, 14, 8, 0.25)';
      ctx.fillRect(424, 434, 18, 3);
      line(ctx, 432, 420, 425, 434, OUT);
      line(ctx, 432, 420, 439, 434, OUT);
      line(ctx, 433, 420, 440, 434, WOOD.dark);
      rect(ctx, 431, 418, 3, 15, WOOD.dark);
      rect(ctx, 425, 433, 16, 2, WOOD.base);
      for (let a = -1.9; a <= 1.9; a += 0.08) {
        rect(ctx, Math.round(cx + Math.cos(a) * 12), Math.round(cy + Math.sin(a) * 12), 1, 1, BRASS.dark);
      }
      disc(ctx, cx, cy, 10, OUT);
      disc(ctx, cx, cy, 9, '#4b7a9a');
      for (let row = -8; row <= 8; row += 1) {
        for (let col = -8; col <= 8; col += 1) {
          if (col * col + row * row > 72) continue;
          const u = col * 1.25 + offset;
          const land = Math.sin(u * 0.33 + row * 0.35) + Math.sin(u * 0.13 - row * 0.52) * 0.9 + Math.sin(u * 0.71) * 0.25;
          if (land > 0.75) rect(ctx, cx + col, cy + row, 1, 1, col + row < -2 ? '#93aa55' : '#6f8a3f');
        }
      }
      rect(ctx, cx - 5, cy - 6, 3, 1, 'rgba(255,255,255,0.55)');
      rect(ctx, cx - 6, cy - 5, 1, 2, 'rgba(255,255,255,0.45)');
      rect(ctx, cx + 3, cy + 6, 4, 1, 'rgba(0,0,0,0.2)');
      rect(ctx, cx + 6, cy + 3, 1, 3, 'rgba(0,0,0,0.2)');
    }
  };

  const LIBRARY_BOOKS = {
    'A–F': [
      ['A Brief History of Campus Squirrels', 'Dr. Oakley Fenn'],
      ['Bulldogs Through the Ages', 'M. Hartwell'],
      ['Calculus for the Sleep-Deprived', 'R. Nguyen'],
      ['The Dewey Decimal Mysteries', 'Ivy Stacks'],
      ['Everything I Know About Magnolias', 'Clem Barrow'],
      ['Footnotes: A Love Story', 'Ada Quill']
    ],
    'G–M': [
      ['Georgia Clay & Other Pigments', 'J. Redmond'],
      ['Hedgerows of North Campus', 'T. Lark'],
      ['Inventing the Arch', 'W. Arden'],
      ['Jazz in the Stacks', 'Miles Page'],
      ['Knitting Through Finals', 'P. Wren'],
      ['Midnight in the Reading Room', 'Lena Voss']
    ],
    'N–Z': [
      ['Notes From a Carrel', 'Hal Beck'],
      ['Orange Leaves, Red Bricks', 'S. Dalton'],
      ['Peach Pits & Paradigms', 'Dr. Georgia Pike'],
      ['Quiet, Please: An Oral History', 'Juniper Holt'],
      ['The Study Hall Almanac', 'E. Marsh'],
      ['Zen and the Art of Group Projects', 'K. Ito']
    ]
  };
  const BOOK_COLORS = ['#9c3431', '#2f4f6b', '#4f6b3a', '#c79a3a', '#6b3f5e', '#2f6b64'];

  function dueDate() {
    const date = new Date(Date.now() + 21 * 24 * 60 * 60 * 1000);
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  function browseStacks(range, api) {
    const [title, author] = pick(LIBRARY_BOOKS[range]);
    const carrying = api.state.book;
    return {
      eyebrow: `Stacks ${range}`,
      title: 'You pull a book from the shelf',
      body: `“${title}” by ${author}.${carrying ? ` (You're already carrying “${carrying.title}”.)` : ''}`,
      actions: [
        {
          label: carrying ? 'Swap books' : 'Take it to the desk',
          primary: true,
          run: () => {
            api.state.book = { title, author, color: pick(BOOK_COLORS) };
            return {
              eyebrow: `Stacks ${range}`,
              title: 'Tucked under your arm',
              body: `You're carrying “${title}”. Bring it to the checkout desk if you'd like to borrow it.`
            };
          }
        },
        { label: 'Pull another', run: () => browseStacks(range, api) },
        { label: 'Put it back' }
      ]
    };
  }

  const STUDENT_LINES = [
    'Organic chem midterm in two hours. I’m fine. Totally fine.',
    'Pro tip: the table by the fireplace is warm, but the lamps here are better.',
    'If you’re heading to the coffee shop, the chai is elite.',
    'I came in for one book. That was four hours ago.'
  ];

  const GLOBE_PLACES = [
    ['Tbilisi', 'the *other* Georgia.'],
    ['Reykjavík', 'bring a sweater.'],
    ['Kyoto', 'a very good place for a quiet walk.'],
    ['Oaxaca', 'your finger smells faintly of mole now.'],
    ['Nairobi', 'the globe wobbles approvingly.'],
    ['Queenstown', 'somewhere to bungee jump after finals.'],
    ['Marrakesh', 'you hear imaginary market music.'],
    ['Savannah', 'close enough for a road trip.'],
    ['Hanoi', 'you suddenly want phở.'],
    ['Lisbon', 'hilly, sunny, and full of tiles.']
  ];

  const library = {
    id: 'library',
    title: 'Main Library',
    eyebrow: 'Reading room',
    width: 512,
    height: 512,
    backdrop: BACKDROP,
    speed: 0.62,
    gridCell: 8,
    spawn: { x: 256, y: 424, direction: 'up' },
    idleHint: 'Explore the reading room · the door is behind you',
    walkable: {
      rects: [
        { x: 28, y: 124, width: 456, height: 340 },
        { x: 234, y: 462, width: 44, height: 14 }
      ]
    },
    obstacles: {
      // Staff area behind the checkout desk.
      rects: [{ x: 28, y: 336, width: 144, height: 68 }]
    },
    paint: paintLibrary,
    props: [
      armchair(192, 126),
      armchair(292, 126),
      libraryChair(203, 194),
      libraryChair(290, 194),
      studyTable(164, 214, 184, (g) => {
        openBook(g, 291, 222);
        bookStack(g, 214, 225, 3);
        rect(g, 232, 226, 8, 5, '#f4ead6');
        rect(g, 232, 226, 8, 1, '#fffaf0');
      }),
      libraryChair(203, 290),
      libraryChair(290, 290),
      studyTable(164, 310, 184, (g) => {
        openBook(g, 204, 318);
        bookStack(g, 318, 321, 8);
      }),
      stack(382, 150, 92, 'A-F', 41),
      stack(382, 226, 92, 'G-M', 42),
      stack(382, 302, 92, 'N-Z', 43),
      circulationDesk(),
      cardCatalog(),
      bookCart(176, 410),
      quietSign(290, 412),
      globe,
      pottedPlant(30, 426, 'fern'),
      pottedPlant(456, 424, 'fern')
    ],
    npcs: [
      {
        id: 'librarian',
        x: 104,
        y: 376,
        look: {
          hair: '#b9b3ab', hairHi: '#dcd6ce', skin: '#e6b08a', skinShade: '#c98f6a',
          shirt: '#5a6b3c', shirtShade: '#445230', collar: '#efe2c8', cardigan: '#efe2c8',
          pants: '#3b3a44', pantsShade: '#2c2b33', glasses: '#3a2a22', bun: true
        }
      },
      {
        id: 'student',
        x: 299,
        y: 222,
        look: {
          hair: '#2a2220', hairHi: '#4a3a34', skin: '#9a6644', skinShade: '#7c4f33',
          shirt: '#a8322f', shirtShade: '#80251f', collar: '#c2463f',
          pants: '#34405a', longHair: true
        }
      }
    ],
    hotspots: [
      {
        id: 'librarian',
        x: 104,
        y: 420,
        radius: 38,
        title: 'Checkout Desk',
        label: 'Talk to the librarian',
        target: [[38, 346, 132, 58]],
        onInteract(api) {
          const { state } = api;
          const drinkNote = state.drink ? ` Is that a ${state.drink.toLowerCase()}? Lids on near the books, please.` : '';
          if (state.book) {
            const book = state.book;
            return {
              eyebrow: 'Checkout desk',
              title: 'Check this one out?',
              body: `“${book.title}” by ${book.author}. It would be due back ${dueDate()}.${drinkNote}`,
              actions: [
                {
                  label: 'Check it out',
                  primary: true,
                  run: () => {
                    state.checkedOut.push(book);
                    state.book = null;
                    return {
                      eyebrow: 'Checkout desk',
                      title: 'Stamped and ready',
                      body: `Ms. Pemberton stamps the card with a satisfying thunk. “${book.title}” is yours for three weeks. You've borrowed ${state.checkedOut.length} book${state.checkedOut.length === 1 ? '' : 's'} today.`
                    };
                  }
                },
                { label: 'Not yet' }
              ]
            };
          }
          const borrowed = state.checkedOut.length
            ? ` You're currently borrowing ${state.checkedOut.map((b) => `“${b.title}”`).join(', ')}.`
            : '';
          return {
            eyebrow: 'Checkout desk',
            title: 'Welcome to the library',
            body: `“Hello, dear. The stacks are along the east wall, the catalog is by the window, and the fire is lit.”${drinkNote}${borrowed}`,
            actions: [
              {
                label: 'Any recommendations?',
                primary: true,
                run: () => {
                  const range = pick(Object.keys(LIBRARY_BOOKS));
                  const [title, author] = pick(LIBRARY_BOOKS[range]);
                  return {
                    eyebrow: 'Staff pick',
                    title: `“${title}”`,
                    body: `“${author} is a delight. You'll find it in stacks ${range}.”`
                  };
                }
              },
              { label: 'Just browsing' }
            ]
          };
        }
      },
      { id: 'stacks-af', x: 428, y: 222, radius: 30, title: 'Stacks A–F', label: 'Browse stacks A–F', target: [[381, 149, 94, 58]], onInteract: (api) => browseStacks('A–F', api) },
      { id: 'stacks-gm', x: 428, y: 298, radius: 30, title: 'Stacks G–M', label: 'Browse stacks G–M', target: [[381, 225, 94, 58]], onInteract: (api) => browseStacks('G–M', api) },
      { id: 'stacks-nz', x: 428, y: 374, radius: 30, title: 'Stacks N–Z', label: 'Browse stacks N–Z', target: [[381, 301, 94, 58]], onInteract: (api) => browseStacks('N–Z', api) },
      {
        id: 'catalog',
        x: 68,
        y: 262,
        radius: 30,
        title: 'Card Catalog',
        label: 'Open the card catalog',
        target: [[38, 188, 60, 56]],
        onInteract(api) {
          const openDrawer = () => {
            const range = pick(Object.keys(LIBRARY_BOOKS));
            const [title, author] = pick(LIBRARY_BOOKS[range]);
            return {
              eyebrow: 'Card catalog',
              title: `Drawer ${range}`,
              body: `A typed card, soft at the corners: “${title}” — ${author}. Shelved in stacks ${range}.`,
              actions: [{ label: 'Another drawer', primary: true, run: openDrawer }, { label: 'Close' }]
            };
          };
          return {
            eyebrow: 'Card catalog',
            title: 'Hundreds of tiny drawers',
            body: 'The drawers smell like old paper and pencil shavings. A brass plate lists the sections:',
            list: ['Stacks A–F · nearest the windows', 'Stacks G–M · middle aisle', 'Stacks N–Z · by the globe', 'Special Collections · by appointment only'],
            actions: [{ label: 'Open a random drawer', primary: true, run: openDrawer }, { label: 'Close' }]
          };
        }
      },
      {
        id: 'fireplace',
        x: 256,
        y: 148,
        radius: 36,
        title: 'Fireplace',
        label: 'Warm up by the fire',
        target: [[222, 40, 68, 88], [192, 126, 28, 31], [292, 126, 28, 31]],
        onInteract({ state }) {
          let body = 'The fire pops and crackles. Two green leather armchairs sit on either side, one noticeably warmer than the other.';
          if (state.drink && state.book) body = `You sink into an armchair with your ${state.drink.toLowerCase()} and the first chapter of “${state.book.title}”. This might be the best seat on campus.`;
          else if (state.drink) body = `You sip your ${state.drink.toLowerCase()} by the fire. Peak coziness achieved.`;
          else if (state.book) body = `You read the first chapter of “${state.book.title}” by the fire. It's better than expected.`;
          return { eyebrow: 'Reading nook', title: 'By the fire', body };
        }
      },
      {
        id: 'student',
        x: 299,
        y: 263,
        radius: 30,
        title: 'Priya',
        label: 'Say hi to Priya',
        target: [[164, 192, 184, 58]],
        onInteract() {
          return {
            eyebrow: 'Fellow student',
            title: 'Priya',
            body: `“${pick(STUDENT_LINES)}”`,
            actions: [
              { label: 'Wish them luck', primary: true, run: () => ({ eyebrow: 'Fellow student', title: 'Priya', body: 'Priya gives you a thumbs up without looking up from the notes.' }) },
              { label: 'Leave them to it' }
            ]
          };
        }
      },
      {
        id: 'study',
        x: 212,
        y: 360,
        radius: 32,
        title: 'Study Table',
        label: 'Sit and study',
        target: [[164, 288, 184, 58]],
        onInteract({ state }) {
          state.studySessions += 1;
          const n = state.studySessions;
          return {
            eyebrow: 'Study table',
            title: n === 1 ? 'Focus mode' : `Study session #${n}`,
            body: n >= 4
              ? 'You open your notes again. The words are starting to swim. Maybe it’s time for a coffee?'
              : 'You open your notes under the green lamp. Twenty quiet minutes later, you feel measurably smarter.'
          };
        }
      },
      {
        id: 'globe',
        x: 408,
        y: 446,
        radius: 28,
        title: 'Globe',
        label: 'Spin the globe',
        target: [[418, 394, 30, 44]],
        onInteract(api) {
          const spinT = clamp01((api.time - libraryFx.spinStart) / 2.4);
          libraryFx.spinBase += 64 * (1 - (1 - spinT) ** 3);
          libraryFx.spinStart = api.time;
          const [place, quip] = pick(GLOBE_PLACES);
          return { eyebrow: 'Globe', title: `Your finger lands on ${place}`, body: `${place}: ${quip.replace(/\*/g, '')}` };
        }
      },
      {
        id: 'cart',
        x: 222,
        y: 426,
        radius: 20,
        title: 'Returns Cart',
        label: 'Look at the returns cart',
        target: [[175, 402, 36, 38]],
        onInteract() {
          const [title] = pick(LIBRARY_BOOKS[pick(Object.keys(LIBRARY_BOOKS))]);
          return {
            eyebrow: 'Returns cart',
            title: 'Recently returned',
            body: `Someone returned “${title}” with a pressed magnolia leaf still tucked inside.`
          };
        }
      },
      { id: 'exit', x: 256, y: 452, radius: 18, title: 'Library', label: 'Leave the library', exit: true }
    ],
    doors: [
      { id: 'exit', zone: { x: 238, y: 458, width: 36, height: 18 }, approach: { x: 256, y: 462 }, to: 'campus', arrive: 'library' }
    ],
    drawUnder(ctx, time) {
      // Fire.
      for (const [fx, phase] of [[246, 0], [251, 1.3], [256, 2.1], [261, 0.7], [266, 1.9]]) {
        const h = 10 + Math.round(4 * Math.sin(time * 7 + phase) + 2 * Math.sin(time * 13 + phase * 2));
        flame(ctx, fx, 113, h, 6, '#c8402a');
        flame(ctx, fx, 113, h - 3, 4, '#f08a3a');
        flame(ctx, fx, 113, Math.max(2, h - 7), 2, '#f8d86a');
      }
      rect(ctx, 242, 113, 28, 5, OUT);
      rect(ctx, 243, 113, 26, 2, WOOD.mid);
      rect(ctx, 243, 115, 26, 2, WOOD.base);
      disc(ctx, 244, 115, 2, '#b98a5c');
      disc(ctx, 268, 115, 2, '#b98a5c');
      for (let i = 0; i < 4; i += 1) {
        const life = (time * 0.7 + i * 0.27) % 1;
        rect(ctx, Math.round(250 + i * 4 + Math.sin(time * 3 + i) * 2), Math.round(108 - life * 24), 1, 1, `rgba(255, 200, 110, ${1 - life})`);
      }
      // Clock hands show the real time.
      const now = new Date();
      const minuteAngle = (now.getMinutes() / 60) * Math.PI * 2 - Math.PI / 2;
      const hourAngle = ((now.getHours() % 12) / 12 + now.getMinutes() / 720) * Math.PI * 2 - Math.PI / 2;
      line(ctx, 256, 48, 256 + Math.cos(minuteAngle) * 4, 48 + Math.sin(minuteAngle) * 4, '#2a1f1b');
      line(ctx, 256, 48, 256 + Math.cos(hourAngle) * 3, 48 + Math.sin(hourAngle) * 3, '#9c3431');
    },
    drawOver(ctx, time) {
      ctx.save();
      // Sunlight through the windows.
      ctx.fillStyle = 'rgba(255, 238, 190, 0.10)';
      for (const wx of [188, 294]) {
        ctx.beginPath();
        ctx.moveTo(wx, 106);
        ctx.lineTo(wx + 30, 106);
        ctx.lineTo(wx + 78, 214);
        ctx.lineTo(wx + 42, 214);
        ctx.closePath();
        ctx.fill();
      }
      for (let i = 0; i < 14; i += 1) {
        const wx = i % 2 ? 294 : 188;
        const life = (time * 0.05 + i * 0.137) % 1;
        const y = 110 + life * 100;
        const x = wx + 8 + ((i * 7) % 20) + (y - 106) * 0.44 + Math.sin(time + i) * 3;
        ctx.fillStyle = `rgba(255, 246, 214, ${0.55 * Math.sin(life * Math.PI)})`;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      }
      ctx.globalCompositeOperation = 'lighter';
      // Firelight.
      const flicker = 0.13 + Math.sin(time * 9) * 0.02 + Math.sin(time * 23) * 0.015;
      const fire = ctx.createRadialGradient(256, 110, 4, 256, 118, 92);
      fire.addColorStop(0, `rgba(255, 150, 70, ${flicker})`);
      fire.addColorStop(1, 'rgba(255, 150, 70, 0)');
      ctx.fillStyle = fire;
      ctx.fillRect(150, 30, 212, 190);
      // Banker's lamps.
      for (const ty of [214, 310]) {
        for (const lx of [184, 256, 328]) {
          const glow = ctx.createRadialGradient(lx, ty + 8, 1, lx, ty + 8, 24);
          glow.addColorStop(0, 'rgba(255, 220, 140, 0.20)');
          glow.addColorStop(1, 'rgba(255, 220, 140, 0)');
          ctx.fillStyle = glow;
          ctx.fillRect(lx - 24, ty - 16, 48, 48);
        }
      }
      ctx.restore();
    }
  };

  // =====================================================================
  // CAMPUS COFFEE
  // =====================================================================
  const BRICKS = ['#a8503e', '#9c4636', '#b25a44', '#94402f'];
  const CAFE_ROOM = { x: 48, y: 56, w: 416, h: 400, cap: 12, wallBottom: 148, door: { x: 232, w: 48 } };
  const cafeFx = { track: 0 };
  const TRACKS = ['Lo-fi study beats', 'Southern soul 45s', 'Jangly college rock', 'Bossa nova brunch', 'Nothing (the barista’s favorite)'];
  const musicPlaying = () => cafeFx.track !== TRACKS.length - 1;

  function paintCafe(g) {
    paintShell(g, CAFE_ROOM);
    // Checkerboard tile floor.
    for (let ty = 148, row = 0; ty < 456; ty += 16, row += 1) {
      for (let tx = 60, col = 0; tx < 452; tx += 16, col += 1) {
        const light = (row + col) % 2 === 0;
        const h = Math.min(16, 456 - ty);
        rect(g, tx, ty, 16, h, light ? '#ecdfc6' : '#cfb391');
        rect(g, tx, ty, 16, 1, light ? '#f6ecd8' : '#d9bf9e');
        rect(g, tx, ty, 1, h, light ? '#f1e5cf' : '#d5ba98');
      }
    }
    // Lounge rug.
    const rug = { x: 68, y: 330, w: 150, h: 104 };
    for (let fx = rug.x + 3; fx < rug.x + rug.w - 3; fx += 2) {
      rect(g, fx, rug.y - 3, 1, 3, '#efe2c8');
      rect(g, fx, rug.y + rug.h, 1, 3, '#efe2c8');
    }
    rect(g, rug.x, rug.y, rug.w, rug.h, '#7a3a24');
    rect(g, rug.x + 2, rug.y + 2, rug.w - 4, rug.h - 4, '#c9853a');
    rect(g, rug.x + 5, rug.y + 5, rug.w - 10, rug.h - 10, '#a8502f');
    strokeRect(g, rug.x + 9, rug.y + 9, rug.w - 18, rug.h - 18, '#e0b060');
    for (let dx = rug.x + 22; dx < rug.x + rug.w - 16; dx += 18) {
      for (let dy = rug.y + 22; dy < rug.y + rug.h - 16; dy += 18) diamond(g, dx, dy, 3, '#c9853a');
    }

    // Welcome mat.
    rect(g, 234, 422, 44, 16, OUT);
    rect(g, 235, 423, 42, 14, '#7a5a3a');
    strokeRect(g, 237, 425, 38, 10, '#a8835a');
    text(g, 'HELLO', 246, 428, '#e9d7b3');

    paintFloorShadows(g, CAFE_ROOM);

    // Back wall: exposed brick over beadboard.
    const rand = rng(17);
    const x0 = 60;
    const x1 = 452;
    rect(g, x0, 68, x1 - x0, 58, '#caa088');
    for (let row = 0, by = 71; by < 124; row += 1, by += 6) {
      for (let bx = x0 - (row % 2 ? 7 : 0); bx < x1; bx += 15) {
        const left = Math.max(x0, bx);
        const right = Math.min(x1, bx + 14);
        if (right <= left) continue;
        rect(g, left, by, right - left, 5, BRICKS[Math.floor(rand() * BRICKS.length)]);
        rect(g, left, by, right - left, 1, 'rgba(255, 210, 180, 0.18)');
        if (rand() < 0.2) rect(g, left + 3, by + 2, 3, 1, 'rgba(60, 20, 10, 0.2)');
      }
    }
    rect(g, x0, 68, x1 - x0, 3, WOOD.deep);
    rect(g, x0, 124, x1 - x0, 24, '#e9dcc1');
    for (let x = x0 + 2; x < x1; x += 4) rect(g, x, 128, 1, 17, '#d3c3a3');
    rect(g, x0, 124, x1 - x0, 4, WOOD.base);
    rect(g, x0, 124, x1 - x0, 1, WOOD.hi);
    rect(g, x0, 145, x1 - x0, 3, WOOD.deep);

    // Community bulletin board.
    rect(g, 70, 78, 64, 42, OUT);
    rect(g, 71, 79, 62, 40, WOOD.base);
    rect(g, 71, 79, 62, 1, WOOD.hi);
    rect(g, 74, 82, 56, 34, '#c49a62');
    for (let i = 0; i < 40; i += 1) rect(g, 74 + Math.floor(rand() * 56), 82 + Math.floor(rand() * 34), 1, 1, '#a9804c');
    const flyers = [[77, 85, 14, 16, '#f4ead6'], [94, 84, 16, 12, '#f2b8a8'], [113, 86, 14, 18, '#bcd6c4'], [79, 103, 18, 11, '#f0d98a'], [101, 99, 12, 15, '#efe6d4'], [116, 106, 11, 8, '#a9c4dc']];
    for (const [fx, fy, fw, fh, fc] of flyers) {
      rect(g, fx + 1, fy + 1, fw, fh, 'rgba(60, 30, 10, 0.25)');
      rect(g, fx, fy, fw, fh, fc);
      for (let ly = fy + 4; ly < fy + fh - 2; ly += 3) rect(g, fx + 2, ly, fw - 4 - ((ly * 3) % 5), 1, 'rgba(58, 44, 38, 0.45)');
      rect(g, fx + Math.floor(fw / 2), fy + 1, 2, 2, '#c8402a');
    }

    // Chalkboard menu.
    rect(g, 146, 72, 124, 44, OUT);
    rect(g, 147, 73, 122, 42, WOOD.dark);
    rect(g, 147, 73, 122, 1, WOOD.mid);
    rect(g, 150, 76, 116, 36, '#2f3a33');
    rect(g, 170, 94, 20, 6, '#39463e');
    rect(g, 226, 82, 26, 5, '#39463e');
    text(g, 'MENU', 193, 77, '#f2b0a4', 2);
    rect(g, 192, 88, 32, 1, '#f2b0a4');
    const items = [['LATTE', '5'], ['MOCHA', '5'], ['CHAI', '4'], ['DRIP', '3'], ['COLD BREW', '4'], ['COCOA', '4']];
    items.forEach(([name, price], i) => {
      const col = i < 3 ? 0 : 1;
      const row = i % 3;
      const tx = 154 + col * 58;
      const ty = 91 + row * 7;
      text(g, name, tx, ty, '#ecebe0');
      text(g, price, tx + 48, ty, '#f0d98a');
    });
    // Chalk cup doodle.
    strokeRect(g, 156, 79, 8, 7, '#ecebe0');
    rect(g, 164, 81, 2, 3, '#ecebe0');
    rect(g, 158, 76, 1, 2, '#ecebe0');
    rect(g, 161, 75, 1, 2, '#ecebe0');
    diamond(g, 256, 82, 2, '#f0d98a');

    // Shelves with mugs, jars and bags of beans.
    for (const sy of [96, 116]) {
      rect(g, 282, sy, 88, 3, OUT);
      rect(g, 283, sy, 86, 2, WOOD.light);
      rect(g, 283, sy, 86, 1, WOOD.hi);
      rect(g, 290, sy + 3, 2, 4, OUT);
      rect(g, 360, sy + 3, 2, 4, OUT);
    }
    const mugColors = ['#efe6d4', '#b33a35', '#2f6b64', '#efe6d4', '#c79a3a'];
    mugColors.forEach((color, i) => {
      const mx = 286 + i * 9;
      rect(g, mx, 89, 7, 7, OUT);
      rect(g, mx + 1, 90, 5, 6, color);
      rect(g, mx + 1, 90, 5, 1, 'rgba(255,255,255,0.35)');
      rect(g, mx + 7, 91, 2, 3, OUT);
    });
    for (let i = 0; i < 3; i += 1) {
      const jx = 333 + i * 11;
      rect(g, jx, 85, 9, 11, OUT);
      rect(g, jx + 1, 86, 7, 10, '#d9ecec');
      rect(g, jx + 1, 90, 7, 6, ['#5a3620', '#7a4a2a', '#3a2415'][i]);
      rect(g, jx, 84, 9, 2, '#9ea3a0');
    }
    for (let i = 0; i < 4; i += 1) {
      const bx = 287 + i * 20;
      rect(g, bx, 102, 14, 14, OUT);
      rect(g, bx + 1, 103, 12, 13, '#b89a6a');
      rect(g, bx + 1, 103, 12, 2, '#9a7d52');
      rect(g, bx + 3, 107, 8, 5, ['#9c3431', '#2f4f6b', '#4f6b3a', '#c79a3a'][i]);
      rect(g, bx + 4, 109, 6, 1, '#efe6d4');
    }

    // Neon sign and a framed print of the Arch.
    text(g, 'COFFEE', 385, 81, '#8a2a24', 2);
    text(g, 'COFFEE', 384, 80, '#ffb3a8', 2);
    rect(g, 394, 99, 42, 24, OUT);
    rect(g, 395, 100, 40, 22, BRASS.base);
    rect(g, 397, 102, 36, 18, '#f4ead6');
    rect(g, 397, 114, 36, 6, '#93aa55');
    rect(g, 404, 105, 22, 2, '#2e2a28');
    for (const ax of [405, 412, 419, 424]) rect(g, ax, 107, 2, 9, '#2e2a28');
    rect(g, 406, 103, 18, 2, '#2e2a28');

    paintCaps(g, CAFE_ROOM);
  }

  function backCounter() {
    return {
      bounds: [138, 110, 236, 56],
      sortY: 164,
      footprint: [140, 150, 232, 14],
      draw(g) {
        rect(g, 140, 136, 232, 28, OUT);
        rect(g, 141, 137, 230, 11, '#d9cdb6');
        rect(g, 141, 137, 230, 1, '#efe6d4');
        rect(g, 141, 147, 230, 1, '#f4ecde');
        rect(g, 141, 148, 230, 15, WOOD.base);
        for (let x = 144; x < 370; x += 6) rect(g, x, 149, 1, 13, WOOD.deep);
        rect(g, 141, 161, 230, 2, WOOD.deep);
        // Espresso machine.
        rect(g, 184, 114, 48, 30, OUT);
        rect(g, 185, 115, 46, 28, '#c9ccc8');
        rect(g, 185, 115, 46, 2, '#eef0ec');
        rect(g, 185, 136, 46, 7, '#9ea3a0');
        rect(g, 186, 123, 44, 5, '#b33a35');
        rect(g, 186, 123, 44, 1, '#d05a4f');
        disc(g, 196, 119, 2, OUT);
        rect(g, 195, 118, 2, 2, '#f4ead6');
        disc(g, 220, 119, 2, OUT);
        rect(g, 219, 118, 2, 2, '#f4ead6');
        for (const gx of [192, 214]) {
          rect(g, gx, 129, 10, 5, OUT);
          rect(g, gx + 1, 129, 8, 3, '#6f7472');
          rect(g, gx - 5, 131, 6, 2, OUT);
        }
        rect(g, 188, 139, 40, 2, '#6f7472');
        for (const cx of [194, 216]) {
          rect(g, cx, 135, 6, 5, OUT);
          rect(g, cx + 1, 135, 4, 4, '#f4ead6');
        }
        // Grinder.
        rect(g, 238, 112, 14, 32, OUT);
        rect(g, 239, 113, 12, 10, '#d9ecec');
        rect(g, 239, 117, 12, 6, '#4a2c1a');
        rect(g, 239, 123, 12, 20, '#3a3533');
        rect(g, 240, 124, 10, 1, '#5a524d');
        rect(g, 242, 136, 6, 6, '#6f7472');
        // Syrup bottles and cup stacks.
        ['#b33a35', '#c79a3a', '#4f6b3a', '#6b3f5e', '#e3d3b0'].forEach((color, i) => {
          const bx = 300 + i * 7;
          rect(g, bx, 122, 5, 16, OUT);
          rect(g, bx + 1, 126, 3, 11, color);
          rect(g, bx + 1, 123, 3, 3, '#3a3533');
          rect(g, bx + 1, 128, 1, 6, 'rgba(255,255,255,0.35)');
        });
        for (let i = 0; i < 3; i += 1) {
          const sx = 344 + i * 8;
          rect(g, sx, 118, 7, 20, OUT);
          rect(g, sx + 1, 119, 5, 18, '#f4ead6');
          for (let ly = 121; ly < 137; ly += 3) rect(g, sx + 1, ly, 5, 1, '#d9cdb6');
        }
      }
    };
  }

  function frontCounter() {
    return {
      bounds: [130, 184, 252, 54],
      sortY: 236,
      footprint: [132, 222, 248, 14],
      draw(g) {
        rect(g, 132, 206, 248, 31, OUT);
        rect(g, 133, 207, 246, 12, '#c79a62');
        rect(g, 133, 207, 246, 1, '#dcb07a');
        for (let x = 142; x < 378; x += 10) rect(g, x, 208, 1, 10, '#b3864f');
        rect(g, 133, 218, 246, 1, '#e6be88');
        rect(g, 133, 220, 246, 16, WOOD.base);
        rect(g, 133, 220, 246, 1, OUT);
        for (let x = 137; x < 378; x += 8) rect(g, x, 221, 1, 12, WOOD.deep);
        rect(g, 133, 233, 246, 3, WOOD.deep);
        // Register.
        rect(g, 148, 192, 24, 20, OUT);
        rect(g, 149, 199, 22, 12, '#3a3533');
        rect(g, 151, 201, 18, 1, '#5a524d');
        for (let ky = 203; ky < 210; ky += 2) for (let kx = 152; kx < 168; kx += 3) rect(g, kx, ky, 2, 1, '#9ea3a0');
        rect(g, 152, 192, 16, 7, OUT);
        rect(g, 153, 193, 14, 5, '#2f4a3a');
        rect(g, 154, 194, 7, 1, '#7fd08a');
        // Tip jar.
        rect(g, 177, 199, 9, 12, OUT);
        rect(g, 178, 200, 7, 10, '#d9ecec');
        rect(g, 178, 206, 7, 4, '#c79a3a');
        rect(g, 179, 202, 4, 3, '#93aa55');
        // "Order here" tent sign.
        rect(g, 250, 196, 27, 12, OUT);
        rect(g, 251, 197, 25, 10, '#f4ead6');
        text(g, 'ORDER', 254, 199, '#9c3431');
        // Pastry case.
        rect(g, 290, 186, 88, 34, OUT);
        rect(g, 291, 187, 86, 32, '#f1e8d6');
        rect(g, 291, 187, 86, 3, WOOD.light);
        rect(g, 291, 187, 86, 1, WOOD.hi);
        for (const sy of [201, 214]) rect(g, 291, sy, 86, 2, '#c9ccc8');
        for (let i = 0; i < 7; i += 1) {
          const px = 294 + i * 12;
          if (i % 2) {
            ellipseRect(g, px, 195, 10, 6, '#b8742f');
            rect(g, px + 2, 196, 6, 1, '#e0a55a');
          } else {
            rect(g, px + 1, 194, 8, 7, '#8a5a2a');
            ellipseRect(g, px, 191, 10, 6, '#c9853a');
            rect(g, px + 3, 192, 2, 1, '#5a3620');
          }
        }
        for (let i = 0; i < 7; i += 1) {
          const px = 294 + i * 12;
          disc(g, px + 5, 210, 4, i % 3 === 0 ? '#e89aa8' : '#c9914f');
          if (i % 3 === 0) disc(g, px + 5, 210, 1, '#f1e8d6');
          else { rect(g, px + 3, 209, 1, 1, '#5a3620'); rect(g, px + 6, 211, 1, 1, '#5a3620'); }
        }
        g.fillStyle = 'rgba(190, 225, 232, 0.28)';
        g.fillRect(291, 190, 86, 29);
        for (let i = 0; i < 3; i += 1) line(g, 298 + i * 30, 216, 308 + i * 30, 191, 'rgba(255,255,255,0.55)');
      }
    };
  }

  function bistroChair(g, x, y, facing) {
    const post = facing === 'right' ? x : x + 10;
    rect(g, post - 1, y - 1, 4, 24, OUT);
    rect(g, post, y, 2, 22, '#2e2a28');
    rect(g, post, y + 2, 1, 8, '#6a625d');
    rect(g, x - 1, y + 11, 14, 6, OUT);
    rect(g, x, y + 12, 12, 3, '#b33a35');
    rect(g, x, y + 12, 12, 1, '#d05a4f');
    rect(g, x + 1, y + 16, 2, 8, '#2e2a28');
    rect(g, x + 9, y + 16, 2, 8, '#2e2a28');
  }

  function bistroSet(cx, cy, items) {
    return {
      bounds: [cx - 38, cy - 26, 76, 56],
      sortY: cy + 27,
      footprint: [cx - 33, cy + 14, 66, 13],
      draw(g) {
        ellipseRect(g, cx - 16, cy + 21, 33, 7, 'rgba(40, 24, 14, 0.2)');
        bistroChair(g, cx - 35, cy - 1, 'right');
        bistroChair(g, cx + 23, cy - 1, 'left');
        rect(g, cx - 2, cy + 8, 5, 16, OUT);
        rect(g, cx - 1, cy + 8, 3, 15, '#3a3533');
        ellipseRect(g, cx - 10, cy + 21, 21, 6, OUT);
        ellipseRect(g, cx - 9, cy + 22, 19, 4, '#3a3533');
        ellipseRect(g, cx - 21, cy - 12, 43, 25, OUT);
        ellipseRect(g, cx - 20, cy - 9, 41, 20, '#bdb29c');
        ellipseRect(g, cx - 20, cy - 11, 41, 19, '#ece4d4');
        rect(g, cx - 12, cy - 8, 8, 1, '#fffaf0');
        rect(g, cx - 15, cy - 6, 3, 1, '#fffaf0');
        for (const item of items) {
          if (item === 'mug') {
            rect(g, cx - 13, cy - 4, 7, 7, OUT);
            rect(g, cx - 12, cy - 3, 5, 5, '#f4ead6');
            rect(g, cx - 12, cy - 3, 5, 1, '#7a4a2a');
            rect(g, cx - 6, cy - 2, 2, 3, OUT);
          }
          if (item === 'mug2') {
            rect(g, cx + 5, cy - 2, 7, 7, OUT);
            rect(g, cx + 6, cy - 1, 5, 5, '#b33a35');
            rect(g, cx + 6, cy - 1, 5, 1, '#7a4a2a');
            rect(g, cx + 12, cy, 2, 3, OUT);
          }
          if (item === 'laptop') {
            rect(g, cx - 2, cy - 16, 20, 14, OUT);
            rect(g, cx - 1, cy - 15, 18, 12, '#c9ccc8');
            rect(g, cx - 1, cy - 15, 18, 1, '#eef0ec');
            rect(g, cx + 7, cy - 10, 2, 2, '#eef0ec');
            rect(g, cx - 4, cy - 2, 24, 4, OUT);
            rect(g, cx - 3, cy - 2, 22, 2, '#9ea3a0');
          }
          if (item === 'cake') {
            ellipseRect(g, cx - 4, cy - 2, 15, 7, OUT);
            ellipseRect(g, cx - 3, cy - 1, 13, 5, '#fffaf0');
            rect(g, cx - 1, cy - 4, 8, 5, OUT);
            rect(g, cx, cy - 3, 6, 3, '#e8c07a');
            rect(g, cx, cy - 3, 6, 1, '#f2b0a4');
          }
          if (item === 'book') openBook(g, cx - 18, cy - 2);
        }
      }
    };
  }

  // Sofas are split in two so a seated character can sit between the
  // backrest and the seat cushions.
  function sofa(x, y, w, palette) {
    const { base, hi, dark, light } = palette;
    return [
      {
        bounds: [x, y, w, 20],
        sortY: y + 18,
        draw(g) {
          rect(g, x + 5, y, w - 10, 1, OUT);
          rect(g, x + 4, y + 1, w - 8, 18, OUT);
          rect(g, x + 5, y + 1, w - 10, 17, base);
          rect(g, x + 6, y + 2, w - 12, 2, hi);
          const cushions = Math.max(1, Math.round((w - 18) / 26));
          const cw = (w - 18) / cushions;
          for (let i = 1; i < cushions; i += 1) rect(g, Math.round(x + 9 + i * cw), y + 3, 1, 14, dark);
          for (let i = 0; i < cushions; i += 1) rect(g, Math.round(x + 9 + i * cw + cw / 2) - 1, y + 9, 2, 1, dark);
        }
      },
      {
        bounds: [x, y + 10, w, 27],
        sortY: y + 36,
        footprint: [x + 2, y + 22, w - 4, 14],
        draw(g) {
          rect(g, x, y + 10, 9, 23, OUT);
          rect(g, x + 1, y + 11, 7, 21, base);
          rect(g, x + 1, y + 11, 7, 2, light);
          rect(g, x + w - 9, y + 10, 9, 23, OUT);
          rect(g, x + w - 8, y + 11, 7, 21, base);
          rect(g, x + w - 8, y + 11, 7, 2, light);
          rect(g, x + 8, y + 17, w - 16, 10, OUT);
          const cushions = Math.max(1, Math.round((w - 18) / 26));
          const cw = (w - 18) / cushions;
          for (let i = 0; i < cushions; i += 1) {
            const cx0 = Math.round(x + 9 + i * cw);
            const cx1 = Math.round(x + 9 + (i + 1) * cw);
            rect(g, cx0, y + 17, cx1 - cx0 - 1, 9, hi);
            rect(g, cx0, y + 17, cx1 - cx0 - 1, 1, light);
          }
          rect(g, x + 1, y + 26, w - 2, 7, OUT);
          rect(g, x + 2, y + 26, w - 4, 5, dark);
          rect(g, x + 3, y + 33, 3, 3, WOOD.shadow);
          rect(g, x + w - 6, y + 33, 3, 3, WOOD.shadow);
        }
      }
    ];
  }

  function coffeeTable(x, y, w) {
    return {
      bounds: [x - 1, y - 8, w + 2, 26],
      sortY: y + 17,
      footprint: [x + 2, y + 7, w - 4, 10],
      draw(g) {
        g.fillStyle = 'rgba(30, 14, 8, 0.22)';
        g.fillRect(x + 2, y + 14, w - 4, 3);
        rect(g, x, y, w, 14, OUT);
        rect(g, x + 1, y + 1, w - 2, 8, WOOD.light);
        rect(g, x + 1, y + 1, w - 2, 1, WOOD.hi);
        rect(g, x + 1, y + 9, w - 2, 4, WOOD.base);
        rect(g, x + 2, y + 13, 3, 4, OUT);
        rect(g, x + w - 5, y + 13, 3, 4, OUT);
        // Magazine, mug and a little succulent.
        rect(g, x + 6, y + 2, 12, 6, OUT);
        rect(g, x + 7, y + 3, 10, 4, '#f2b0a4');
        rect(g, x + 8, y + 4, 6, 1, '#fffaf0');
        rect(g, x + w - 16, y - 1, 6, 6, OUT);
        rect(g, x + w - 15, y, 4, 4, '#f4ead6');
        rect(g, x + w - 15, y, 4, 1, '#7a4a2a');
        rect(g, x + 24, y, 7, 6, OUT);
        rect(g, x + 25, y + 2, 5, 3, '#b8643f');
        disc(g, x + 27, y - 2, 3, '#4f6b30');
        rect(g, x + 26, y - 3, 2, 1, '#93aa55');
      }
    };
  }

  function sidewalkSign(x, y) {
    return {
      bounds: [x - 2, y - 1, 30, 32],
      sortY: y + 30,
      footprint: [x + 2, y + 23, 22, 7],
      draw(g) {
        line(g, x + 3, y + 29, x + 5, y + 20, OUT);
        line(g, x + 23, y + 29, x + 21, y + 20, OUT);
        rect(g, x, y, 26, 24, OUT);
        rect(g, x + 1, y + 1, 24, 22, WOOD.base);
        rect(g, x + 3, y + 3, 20, 18, '#2f3a33');
        text(g, 'PEACH', x + 4, y + 5, '#f2b0a4');
        text(g, 'LATTE', x + 4, y + 12, '#ecebe0');
        rect(g, x + 11, y + 18, 1, 1, '#f0d98a');
        rect(g, x + 14, y + 18, 1, 1, '#f0d98a');
      }
    };
  }

  function recordCabinet() {
    return {
      bounds: [396, 152, 52, 50],
      sortY: 200,
      footprint: [398, 188, 48, 12],
      draw(g) {
        g.fillStyle = 'rgba(40, 24, 14, 0.2)';
        g.fillRect(400, 196, 46, 4);
        rect(g, 398, 170, 48, 28, OUT);
        rect(g, 399, 171, 46, 7, WOOD.light);
        rect(g, 399, 171, 46, 1, WOOD.hi);
        rect(g, 399, 178, 46, 18, WOOD.base);
        for (const sx of [401, 427]) {
          rect(g, sx, 180, 16, 14, '#3a2415');
          for (let yy = 181; yy < 194; yy += 2) for (let xx = sx + 1; xx < sx + 16; xx += 2) rect(g, xx, yy, 1, 1, '#5d3822');
        }
        rect(g, 420, 181, 4, 12, WOOD.dark);
        rect(g, 400, 196, 3, 4, OUT);
        rect(g, 441, 196, 3, 4, OUT);
        // Turntable.
        rect(g, 404, 158, 34, 16, OUT);
        rect(g, 405, 159, 32, 14, '#6b4129');
        rect(g, 405, 159, 32, 1, WOOD.mid);
        ellipseRect(g, 408, 160, 22, 12, '#1d1a19');
        ellipseRect(g, 411, 162, 16, 8, '#2e2a28');
        ellipseRect(g, 416, 164, 6, 4, '#b33a35');
        line(g, 434, 161, 427, 168, '#c9ccc8');
        rect(g, 433, 160, 3, 3, '#9ea3a0');
      },
      live(ctx, time) {
        if (!musicPlaying()) return;
        const angle = time * 5;
        const hx = 419 + Math.round(Math.cos(angle) * 8);
        const hy = 166 + Math.round(Math.sin(angle) * 4);
        rect(ctx, hx, hy, 1, 1, '#6f6a67');
      }
    };
  }

  const coffee = {
    id: 'coffee',
    title: 'Campus Coffee',
    eyebrow: 'Coffee shop',
    width: 512,
    height: 512,
    backdrop: BACKDROP,
    speed: 0.62,
    gridCell: 8,
    spawn: { x: 256, y: 408, direction: 'up' },
    idleHint: 'Order at the counter · the door is behind you',
    walkable: {
      rects: [
        { x: 60, y: 148, width: 392, height: 296 },
        { x: 234, y: 442, width: 44, height: 14 }
      ]
    },
    obstacles: {
      // Behind the counters is staff only.
      rects: [{ x: 132, y: 148, width: 248, height: 88 }]
    },
    paint: paintCafe,
    props: [
      backCounter(),
      frontCounter(),
      bistroSet(128, 280, ['laptop', 'mug']),
      bistroSet(390, 280, ['mug', 'mug2']),
      bistroSet(390, 382, ['cake', 'book']),
      ...sofa(74, 344, 78, TEAL_VELVET),
      armchair(164, 350, RUST_VELVET),
      coffeeTable(88, 404, 58),
      sidewalkSign(300, 390),
      recordCabinet(),
      pottedPlant(62, 150, 'fern'),
      pottedPlant(424, 408, 'monstera')
    ],
    npcs: [
      {
        id: 'barista',
        x: 228,
        y: 213,
        look: {
          hair: '#4a2e1f', hairHi: '#6a4430', skin: '#c68a5e', skinShade: '#a56e46',
          shirt: '#efe6d4', shirtShade: '#cfc3ac', pants: '#3a3533',
          apron: { color: '#3f5a3a', shade: '#2e4229' },
          beanie: { color: '#c9a13e', cuff: '#a98424' },
          beard: true
        }
      },
      {
        id: 'reader',
        x: 100,
        y: 370,
        look: {
          hair: '#e0c27a', hairHi: '#f2dc9c', skin: '#8a5a3a', skinShade: '#6e4428',
          shirt: '#c9a13e', shirtShade: '#a98424', collar: '#efe6d4',
          pants: '#4a4a5a', beanie: { color: '#9c3431', cuff: '#7a2826' }
        }
      },
      {
        id: 'patron',
        x: 126,
        y: 282,
        look: {
          hair: '#9a4a2a', hairHi: '#b8653d', skin: '#f0c9a6', skinShade: '#d6a67f',
          shirt: '#5a7a9a', shirtShade: '#46627e', collar: '#6d8fae',
          pants: '#2f3440', longHair: true, glasses: '#2a1f1b'
        }
      }
    ],
    hotspots: [
      {
        id: 'order',
        x: 222,
        y: 256,
        radius: 34,
        title: 'Counter',
        label: 'Order a drink',
        target: [[132, 184, 158, 54], [146, 74, 124, 46], [210, 182, 36, 36]],
        onInteract(api) {
          const { state } = api;
          const drinks = ['Peach Latte', 'Oat Latte', 'Mocha', 'Chai Latte', 'Cold Brew', 'Hot Cocoa'];
          const bookNote = state.book ? ` “Ooh, ‘${state.book.title}’? Great pick.”` : '';
          const current = state.drink ? ` You're still holding a ${state.drink.toLowerCase()}.` : '';
          return {
            eyebrow: 'Campus Coffee',
            title: 'What can I get started for you?',
            body: `Jules wipes down the espresso machine and smiles.${bookNote}${current}`,
            actions: [
              ...drinks.map((drink) => ({
                label: drink,
                run: () => {
                  state.drink = drink;
                  state.drinksOrdered += 1;
                  return {
                    eyebrow: 'Order up',
                    title: `One ${drink.toLowerCase()}, coming right up`,
                    body: state.drinksOrdered > 2
                      ? `Jules slides it across the counter. “Drink number ${state.drinksOrdered}? Respect.”`
                      : `Jules slides a warm ${drink.toLowerCase()} across the counter. It smells amazing, and it's on the house today.`
                  };
                }
              })),
              { label: 'Just looking' }
            ]
          };
        }
      },
      {
        id: 'pastries',
        x: 336,
        y: 256,
        radius: 32,
        title: 'Pastry Case',
        label: 'Check out the pastries',
        target: [[290, 184, 92, 54]],
        onInteract(api) {
          const pastries = ['Peach cobbler muffin', 'Pecan sticky bun', 'Giant chocolate chip cookie', 'Cheese straws'];
          return {
            eyebrow: 'Pastry case',
            title: 'Baked this morning',
            body: 'Everything behind the glass is still a little warm.',
            actions: [
              ...pastries.map((pastry) => ({
                label: pastry,
                run: () => {
                  api.state.pastries += 1;
                  return {
                    eyebrow: 'Pastry case',
                    title: 'Delicious',
                    body: `You eat the ${pastry.toLowerCase()} in about four bites. No regrets.`
                  };
                }
              })),
              { label: 'Maybe later' }
            ]
          };
        }
      },
      {
        id: 'board',
        x: 102,
        y: 168,
        radius: 30,
        title: 'Bulletin Board',
        label: 'Read the bulletin board',
        target: [[70, 78, 64, 42]],
        onInteract() {
          return {
            eyebrow: 'Community board',
            title: 'Pinned this week',
            list: [
              'Open mic night · Thursdays at 8',
              'LOST: one blue umbrella. Sentimental value.',
              'Organic chem study group · library, table two',
              'Guitar lessons — first one free',
              'Adopt a shelter pup! Ask Jules for details'
            ]
          };
        }
      },
      {
        id: 'record',
        x: 422,
        y: 220,
        radius: 30,
        title: 'Record Player',
        label: 'Change the record',
        target: [[396, 152, 52, 50]],
        onInteract() {
          const change = () => {
            cafeFx.track = (cafeFx.track + 1) % TRACKS.length;
            return {
              eyebrow: 'Record player',
              title: musicPlaying() ? 'Now playing' : 'Quiet time',
              body: musicPlaying() ? `♪ ${TRACKS[cafeFx.track]}` : 'You lift the needle. Jules looks quietly relieved.',
              actions: [{ label: 'Change the record', primary: true, run: change }, { label: 'Leave it' }]
            };
          };
          return {
            eyebrow: 'Record player',
            title: musicPlaying() ? 'Now playing' : 'Nothing playing',
            body: musicPlaying() ? `♪ ${TRACKS[cafeFx.track]}` : 'The turntable is still.',
            actions: [{ label: 'Change the record', primary: true, run: change }, { label: 'Leave it' }]
          };
        }
      },
      {
        id: 'patron',
        x: 128,
        y: 318,
        radius: 30,
        title: 'Marcus',
        label: 'Chat with Marcus',
        target: [[90, 252, 76, 58]],
        onInteract() {
          return {
            eyebrow: 'Regular',
            title: 'Marcus',
            body: `“${pick([
              'I’ve been about to start my essay for three hours now.',
              'The Wi-Fi password is on the back of the menu. It’s “decafisalie”.',
              'Have you seen the library fireplace? Cozy doesn’t cover it.',
              'Pro tip: the peach muffins sell out by ten.'
            ])}”`
          };
        }
      },
      {
        id: 'window-seat',
        x: 390,
        y: 426,
        radius: 30,
        title: 'Window Seat',
        label: 'Grab a seat',
        target: [[352, 356, 76, 56]],
        onInteract({ state }) {
          return {
            eyebrow: 'Window seat',
            title: 'People-watching',
            body: state.drink
              ? `You sip your ${state.drink.toLowerCase()} and watch the quad through the window. A squirrel is eyeing the patio croissants.`
              : 'You watch the quad through the window. A squirrel is eyeing the patio croissants. Maybe grab a drink first?'
          };
        }
      },
      {
        id: 'lounge',
        x: 158,
        y: 396,
        radius: 26,
        title: 'Dana',
        label: 'Say hi to Dana',
        target: [[72, 340, 124, 44]],
        onInteract({ state }) {
          const lines = [
            'Dana looks up from a paperback. “This couch is the best seat in the building. Don’t tell anyone.”',
            'Dana holds up the book. “Third time reading it. The ending still gets me.”',
            '“If you see a squirrel on the patio, do NOT make eye contact. It knows what it wants.”'
          ];
          if (state.book) lines.push(`Dana squints at your book. “Ooh, ‘${state.book.title}’. Tell me how it ends.”`);
          return { eyebrow: 'Lounge corner', title: 'Dana', body: pick(lines) };
        }
      },
      {
        id: 'sign',
        x: 313,
        y: 431,
        radius: 16,
        title: 'Sidewalk Sign',
        label: 'Read the sign',
        target: [[298, 389, 30, 32]],
        onInteract() {
          return {
            eyebrow: 'Chalkboard sign',
            title: 'Today’s special: Peach Latte',
            body: 'Hand-lettered in pink chalk, with a tiny drawing of a peach that looks a bit like a tomato.'
          };
        }
      },
      { id: 'exit', x: 256, y: 438, radius: 18, title: 'Campus Coffee', label: 'Leave the coffee shop', exit: true }
    ],
    doors: [
      { id: 'exit', zone: { x: 238, y: 438, width: 36, height: 20 }, approach: { x: 256, y: 444 }, to: 'campus', arrive: 'coffee' }
    ],
    drawOver(ctx, time) {
      ctx.save();
      // Espresso steam.
      for (let i = 0; i < 6; i += 1) {
        const life = (time * 0.45 + i / 6) % 1;
        const x = 197 + (i % 2) * 22 + Math.round(Math.sin(time * 2 + i * 1.7) * 2 * life);
        const y = 132 - life * 30;
        ctx.fillStyle = `rgba(255, 255, 255, ${0.55 * (1 - life)})`;
        ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
      }
      // Music notes drifting from the turntable.
      if (musicPlaying()) {
        for (let i = 0; i < 3; i += 1) {
          const life = (time * 0.35 + i / 3) % 1;
          const x = Math.round(420 + Math.sin(time * 2 + i * 2) * 6 + i * 4);
          const y = Math.round(154 - life * 34);
          ctx.globalAlpha = Math.sin(life * Math.PI);
          rect(ctx, x, y, 2, 2, '#3a2c26');
          rect(ctx, x + 1, y - 5, 1, 5, '#3a2c26');
          rect(ctx, x + 2, y - 5, 2, 1, '#3a2c26');
        }
        ctx.globalAlpha = 1;
      }
      // Sunlight from the storefront windows.
      ctx.fillStyle = 'rgba(255, 240, 200, 0.12)';
      for (const [x0, x1] of [[84, 196], [316, 428]]) {
        ctx.beginPath();
        ctx.moveTo(x0, 444);
        ctx.lineTo(x1, 444);
        ctx.lineTo(x1 - 34, 350);
        ctx.lineTo(x0 - 34, 350);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      const pulse = 0.14 + Math.sin(time * 3.1) * 0.02 + (Math.sin(time * 17) > 0.96 ? -0.06 : 0);
      const neon = ctx.createRadialGradient(407, 85, 2, 407, 85, 42);
      neon.addColorStop(0, `rgba(255, 110, 90, ${pulse})`);
      neon.addColorStop(1, 'rgba(255, 110, 90, 0)');
      ctx.fillStyle = neon;
      ctx.fillRect(360, 40, 94, 90);
      for (const [lx, ly] of [[190, 206], [320, 206]]) {
        const glow = ctx.createRadialGradient(lx, ly, 2, lx, ly, 60);
        glow.addColorStop(0, 'rgba(255, 214, 150, 0.10)');
        glow.addColorStop(1, 'rgba(255, 214, 150, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(lx - 60, ly - 60, 120, 120);
      }
      ctx.restore();
    }
  };

  window.CAMPUS_INTERIORS = { library, coffee };
})();

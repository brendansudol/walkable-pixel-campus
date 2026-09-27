// Procedural pixel-art campus: a code-drawn recreation of the original map.
//
// Everything is authored in "art pixels" on a 627×627 canvas, where one art
// pixel covers 2×2 world units. That keeps the chunky look of the original
// illustration while lining up with the 1254×1254 coordinates used by
// map-config.js (walkability, obstacles, hotspots and doors).
//
// Flat ground (island, grass, paths, steps, hedges, the sign) is painted once
// into the background. Anything tall (buildings, the stadium, trees, lamps,
// the Arch) is a depth-sorted prop so the avatar can pass behind it.
(() => {
  'use strict';

  const K = window.PixelKit;
  const { rect, line, rng, text7, text7Width } = K;

  const S = 2;
  const W = 627;
  const H = 627;

  const OUT = '#2a2320';
  const STONE = { hi: '#f6ecd9', base: '#ebdcbf', mid: '#dccaa6', dark: '#c3ad87', deep: '#a8906a' };
  const ROOF = { base: '#3d3a3c', hi: '#56525a', line: '#302d2f', lo: '#262425' };
  const BRICK = { base: '#a9463a', dark: '#8c392f', light: '#bb5645', mortar: '#8e3e33' };
  const GLASS = { base: '#3b4752', hi: '#8aa3ae', frame: '#f3ead8' };
  const WOOD = { base: '#6b4129', dark: '#4a2c1a', hi: '#8a5a3a' };
  const IRON = { base: '#232022', hi: '#4d494c' };
  const LEAF = { out: '#2b3d1b', dark: '#445f28', mid: '#5b7a31', light: '#779a3b', hi: '#98b851' };
  const LEAF_DEEP = { out: '#223318', dark: '#384f22', mid: '#4b692b', light: '#658635', hi: '#83a448' };
  const LEAF_GOLD = { out: '#33401b', dark: '#56692a', mid: '#6e8634', light: '#8fa543', hi: '#b3c35b' };
  const TRUNK = { base: '#6b4a2f', dark: '#4f3521', hi: '#86603f' };
  const RED = { base: '#b8352e', dark: '#8a2622', hi: '#d4554a' };

  const hexRgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const P = {
    grass: hexRgb('#79983a'),
    grassEdge: hexRgb('#6c8b33'),
    grassTuft: hexRgb('#637f2e'),
    grassLight: hexRgb('#89a946'),
    grassDark: hexRgb('#6f8f35'),
    lawn: hexRgb('#83a53f'),
    lawnTuft: hexRgb('#6f9235'),
    lawnLight: hexRgb('#94b54d'),
    curbHi: hexRgb('#e6c893'),
    curbLo: hexRgb('#b99461'),
    lip: hexRgb('#d6b381'),
    lipHi: hexRgb('#ecd09f'),
    lipLine: hexRgb('#b58f5f'),
    base: hexRgb('#3a3532'),
    baseHi: hexRgb('#57504b'),
    baseLo: hexRgb('#2a2624'),
    shadow: hexRgb('#5c3e2a'),
    bricks: [hexRgb('#c96d4c'), hexRgb('#c26548'), hexRgb('#d07652')],
    mortar: hexRgb('#a9573f'),
    pathEdge: hexRgb('#efd7ad'),
    pathEdgeLo: hexRgb('#dcbc8c'),
    pavers: [hexRgb('#cfc3ae'), hexRgb('#c6b9a3')],
    paverLine: hexRgb('#aa9c86')
  };

  // ---------- Small raster helpers ----------

  function hash(x, y, seed) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function valueNoise(x, y, scale, seed) {
    const gx = x / scale;
    const gy = y / scale;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = hash(x0, y0, seed);
    const b = hash(x0 + 1, y0, seed);
    const c = hash(x0, y0 + 1, seed);
    const d = hash(x0 + 1, y0 + 1, seed);
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  }

  // Draws a shape with the canvas API, then thresholds it into a hard-edged
  // 0/1 mask so every edge stays crisp.
  function makeMask(draw) {
    const canvas = K.makeCanvas(W, H);
    const g = canvas.getContext('2d', { willReadFrequently: true });
    g.fillStyle = '#000';
    g.strokeStyle = '#000';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    draw(g);
    const data = g.getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    for (let i = 0; i < mask.length; i += 1) mask[i] = data[i * 4 + 3] >= 128 ? 1 : 0;
    return mask;
  }

  function erode(mask, r) {
    const tmp = new Uint8Array(W * H);
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        let ok = 1;
        for (let dx = -r; dx <= r && ok; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= W || !mask[y * W + xx]) ok = 0;
        }
        tmp[y * W + x] = ok;
      }
    }
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        let ok = 1;
        for (let dy = -r; dy <= r && ok; dy += 1) {
          const yy = y + dy;
          if (yy < 0 || yy >= H || !tmp[yy * W + x]) ok = 0;
        }
        out[y * W + x] = ok;
      }
    }
    return out;
  }

  function union(...masks) {
    const out = new Uint8Array(W * H);
    for (const mask of masks) for (let i = 0; i < out.length; i += 1) out[i] |= mask[i];
    return out;
  }

  function roundRectPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // Closed Catmull-Rom spline through world-space control points.
  function smoothClosed(points, steps = 10) {
    const out = [];
    const n = points.length;
    for (let i = 0; i < n; i += 1) {
      const p0 = points[(i - 1 + n) % n];
      const p1 = points[i];
      const p2 = points[(i + 1) % n];
      const p3 = points[(i + 2) % n];
      for (let s = 0; s < steps; s += 1) {
        const t = s / steps;
        const t2 = t * t;
        const t3 = t2 * t;
        out.push([0, 1].map((k) => 0.5 * (
          2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3
        )));
      }
    }
    return out;
  }

  function tracePath(g, points, close) {
    g.beginPath();
    points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    if (close) g.closePath();
  }

  // Hard-edged filled circle / ellipse at integer coordinates.
  function blob(g, cx, cy, r, color) {
    K.ellipseRect(g, Math.round(cx - r), Math.round(cy - r), Math.round(r * 2) + 1, Math.round(r * 2) + 1, color);
  }

  function triangle(g, x, y, w, h, color) {
    g.fillStyle = color;
    const cx = x + w / 2;
    for (let row = 0; row < h; row += 1) {
      const half = Math.max(1, Math.round((w / 2) * ((row + 1) / h)));
      g.fillRect(Math.round(cx - half), y + row, half * 2, 1);
    }
  }

  // ---------- Layout (world units, matching map-config.js) ----------

  const ISLAND = { x: 31, y: 78, w: 566, h: 482, r: 34 };

  const RING = [
    [305, 568], [450, 566], [570, 566], [690, 566], [812, 570], [848, 612], [846, 682],
    [812, 760], [745, 835], [660, 893], [566, 916], [472, 893], [387, 835], [320, 760],
    [276, 682], [274, 612]
  ];

  const PATHS = [
    { width: 38, points: [[452, 580], [452, 522]] },
    { width: 36, points: [[642, 580], [642, 500]] },
    { width: 34, points: [[292, 592], [246, 546], [210, 512]] },
    { width: 40, points: [[836, 618], [960, 618], [1004, 614]] },
    { width: 40, points: [[282, 694], [196, 690]] },
    { width: 44, points: [[478, 896], [400, 950], [342, 1010], [326, 1128]] },
    { width: 30, points: [[330, 986], [372, 984]] },
    { width: 104, points: [[596, 912], [626, 990], [628, 1040]] },
    { width: 54, points: [[972, 1004], [972, 1124]], cap: 'butt' }
  ];

  const PLAZAS = [
    // Arch plaza between the ring and the Arch.
    [[540, 986], [708, 986], [712, 1066], [536, 1066]],
    // Forecourt below the Historic Hall steps.
    [[912, 584], [1008, 584], [1012, 636], [908, 636]]
  ];

  const PATIO = [[150, 914], [330, 914], [338, 1002], [146, 1002]];

  // Canopy centre and radius, in art pixels.
  const TREES = [
    [112, 86, 22], [86, 124, 24], [132, 130, 20], [160, 150, 15],
    [57, 192, 27], [101, 193, 21], [47, 258, 20], [89, 262, 25], [54, 322, 25], [100, 302, 14],
    [44, 386, 16], [44, 432, 15], [172, 418, 17], [160, 392, 13],
    [135, 530, 20], [60, 478, 13], [210, 512, 24], [420, 516, 24], [393, 480, 15],
    [400, 76, 25], [452, 96, 22], [503, 103, 22], [540, 118, 19], [380, 130, 22], [352, 146, 17],
    [568, 190, 25], [562, 246, 22], [552, 292, 17],
    [400, 170, 20], [396, 220, 22],
    [430, 346, 14], [418, 392, 22], [402, 437, 21], [430, 466, 16],
    [530, 488, 17], [576, 510, 19], [560, 544, 15], [290, 150, 14], [312, 146, 13]
  ];

  const BUSHES = [
    // [x, y, radius, flowers]
    [412, 268, 9, true], [424, 278, 8, true], [518, 280, 9, true], [530, 292, 8, true],
    [440, 490, 9, true], [452, 498, 7, true], [556, 478, 10, true], [568, 486, 8, false],
    [62, 498, 10, true], [80, 504, 9, true], [98, 508, 8, true], [188, 470, 9, false],
    [104, 316, 9, true], [116, 330, 7, false], [460, 504, 6, false],
    [396, 268, 7, false], [150, 450, 8, false], [186, 438, 8, true],
    [520, 540, 9, true], [470, 530, 8, false]
  ];

  const LAMPS = [[121, 320], [289, 258], [406, 285], [536, 302], [251, 543], [380, 553]];

  // ---------- Background ----------

  function paintGround(g) {
    const img = g.createImageData(W, H);
    const px = img.data;
    const put = (i, c, a = 255) => {
      const o = i * 4;
      px[o] = c[0];
      px[o + 1] = c[1];
      px[o + 2] = c[2];
      px[o + 3] = a;
    };
    const fill = (mask, fn) => {
      for (let y = 0; y < H; y += 1) {
        for (let x = 0; x < W; x += 1) {
          const i = y * W + x;
          if (mask[i]) {
            const c = fn(x, y, i);
            if (c) put(i, c);
          }
        }
      }
    };
    const world = (draw) => makeMask((m) => { m.scale(1 / S, 1 / S); draw(m); });

    const { x, y, w, h, r } = ISLAND;
    const shadowMask = makeMask((m) => { roundRectPath(m, x + 8, y + 16, w, h + 36, r + 6); m.fill(); });
    const baseMask = makeMask((m) => { roundRectPath(m, x, y + 30, w, h + 9, r + 6); m.fill(); });
    const lipMask = makeMask((m) => { roundRectPath(m, x - 1, y + 8, w + 2, h + 3, r + 1); m.fill(); });
    const grassMask = makeMask((m) => { roundRectPath(m, x, y, w, h, r); m.fill(); });
    const grassInner = erode(grassMask, 2);
    const grassDeep = erode(grassMask, 7);

    const ringPoints = smoothClosed(RING);
    const lawnMask = world((m) => { tracePath(m, ringPoints, true); m.fill(); });
    const ringMask = world((m) => { m.lineWidth = 42; tracePath(m, ringPoints, true); m.stroke(); });
    const spokeMask = world((m) => {
      for (const path of PATHS) {
        m.lineCap = path.cap || 'round';
        m.lineWidth = path.width;
        tracePath(m, path.points, false);
        m.stroke();
      }
      for (const plaza of PLAZAS) {
        tracePath(m, plaza, true);
        m.fill();
      }
    });
    const pathMask = union(ringMask, spokeMask);
    const pathInner = erode(pathMask, 1);
    const pathCore = erode(pathMask, 2);
    const patioMask = world((m) => { tracePath(m, PATIO, true); m.fill(); });
    const patioInner = erode(patioMask, 1);

    for (let i = 0; i < W * H; i += 1) if (shadowMask[i]) put(i, P.shadow, 40);

    fill(baseMask, (px0, py, i) => {
      if (lipMask[i - W * 2] && !lipMask[i]) return P.baseHi;
      if (!baseMask[i + W * 2]) return P.baseLo;
      return P.base;
    });

    fill(lipMask, (px0, py) => {
      if ((py - 86) % 5 === 0) return P.lipLine;
      const row = Math.floor((py - 86) / 5);
      if ((px0 + (row % 2) * 7) % 14 === 0) return P.lipLine;
      return (py - 86) % 5 === 1 ? P.lipHi : P.lip;
    });

    fill(grassMask, (gx, gy, i) => {
      if (!grassInner[i]) return grassInner[i - W] || grassInner[i + 1] || grassInner[i - 1] ? P.curbHi : P.curbLo;
      return grassColor(gx, gy, grassDeep[i] ? P.grass : P.grassEdge, P.grassTuft, P.grassLight, P.grassDark, 11);
    });

    fill(lawnMask, (gx, gy) => grassColor(gx, gy, P.lawn, P.lawnTuft, P.lawnLight, P.lawn, 29));

    fill(pathMask, (gx, gy, i) => {
      if (!grassMask[i]) return null;
      if (!pathInner[i]) return P.pathEdgeLo;
      if (!pathCore[i]) return P.pathEdge;
      const row = Math.floor(gy / 4);
      if (gy % 4 === 3) return P.mortar;
      const off = row % 2 ? 4 : 0;
      if ((gx + off) % 8 === 7) return P.mortar;
      return P.bricks[Math.floor(hash(Math.floor((gx + off) / 8), row, 5) * 3)];
    });

    fill(patioMask, (gx, gy, i) => {
      if (!patioInner[i]) return P.pathEdge;
      if (gx % 7 === 0 || gy % 7 === 0) return P.paverLine;
      return P.pavers[Math.floor(hash(Math.floor(gx / 7), Math.floor(gy / 7), 9) * 2)];
    });

    g.putImageData(img, 0, 0);
  }

  function grassColor(x, y, base, tuft, light, patch, seed) {
    const cell = 8;
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    if (hash(cx, cy, seed) < 0.5) {
      const ox = cx * cell + 2 + Math.floor(hash(cx, cy, seed + 1) * 4);
      const oy = cy * cell + 2 + Math.floor(hash(cx, cy, seed + 2) * 4);
      if ((x === ox && Math.abs(y - oy) <= 1) || (y === oy && Math.abs(x - ox) <= 1)) return tuft;
    }
    const n = hash(x, y, seed + 3);
    if (n < 0.025) return light;
    if (valueNoise(x, y, 26, seed + 4) > 0.68) return patch;
    return base;
  }

  function stairs(g, x, y, w, h) {
    rect(g, x - 1, y, w + 2, h + 1, OUT);
    for (let yy = y, i = 0; yy < y + h; yy += 4, i += 1) {
      const sh = Math.min(4, y + h - yy);
      rect(g, x, yy, w, sh, i % 2 ? STONE.mid : STONE.base);
      rect(g, x, yy, w, 1, STONE.hi);
      if (sh === 4) rect(g, x, yy + 3, w, 1, STONE.dark);
    }
  }

  function hedge(g, x, y, w, h) {
    rect(g, x + 1, y + h, w, 2, 'rgba(40, 50, 20, 0.35)');
    rect(g, x, y, w, h, LEAF.out);
    rect(g, x + 1, y + 1, w - 2, h - 2, LEAF.mid);
    rect(g, x + 1, y + 1, w - 2, 2, LEAF.light);
    rect(g, x + 1, y + h - 2, w - 2, 1, LEAF.dark);
    for (let xx = x + 3; xx < x + w - 2; xx += 5) rect(g, xx, y + 4 + (xx % 3), 2, 1, LEAF.dark);
    for (let xx = x + 2; xx < x + w - 2; xx += 7) rect(g, xx, y + 2, 1, 1, LEAF.hi);
  }

  function canopy(g, cx, cy, r, seed, flowers, leaf = LEAF) {
    const rand = rng(seed);
    const clusters = [[cx, cy + r * 0.12, r * 0.62]];
    const n = r < 10 ? 4 : 6 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.7;
      const d = r * (0.38 + rand() * 0.14);
      clusters.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, r * (0.4 + rand() * 0.14)]);
    }
    clusters.push([cx - r * 0.12, cy - r * 0.36, r * 0.46]);
    const list = clusters.map(([x, y, cr]) => [Math.round(x), Math.round(y), Math.max(2, Math.round(cr))]);
    for (const [x, y, cr] of list) blob(g, x, y, cr + 1, leaf.out);
    for (const [x, y, cr] of list) blob(g, x, y, cr, leaf.dark);
    for (const [x, y, cr] of list) blob(g, x - 1, y - 1, cr - 1, leaf.mid);
    for (const [x, y, cr] of list) {
      if (y <= cy + r * 0.25) blob(g, x - Math.round(cr * 0.3), y - Math.round(cr * 0.38), Math.max(1, Math.round(cr * 0.48)), leaf.light);
    }
    for (let i = 0; i < r * 1.6; i += 1) {
      const a = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * r * 0.78;
      const x = Math.round(cx + Math.cos(a) * d);
      const y = Math.round(cy + Math.sin(a) * d * 0.85);
      if (flowers && rand() < 0.55) {
        rect(g, x, y, 2, 2, '#d8662b');
        rect(g, x, y, 1, 1, '#f2a24a');
      } else if (y < cy - r * 0.1) {
        rect(g, x, y, 1, 1, leaf.hi);
      } else {
        rect(g, x, y, 2, 1, leaf.dark);
      }
    }
  }

  function flowerRing(g) {
    const cx = 287;
    const cy = 364;
    ellipseFill(g, cx - 31, cy - 23, 63, 47, LEAF.out);
    for (let i = 0; i < 26; i += 1) {
      const a = (i / 26) * Math.PI * 2;
      canopy(g, cx + Math.cos(a) * 27, cy + Math.sin(a) * 19, 6, 300 + i, true);
    }
    ellipseFill(g, cx - 22, cy - 15, 45, 31, '#83a53f');
    ellipseFill(g, cx - 18, cy - 11, 37, 23, '#79983a');
  }

  function ellipseFill(g, x, y, w, h, color) {
    K.ellipseRect(g, x, y, w, h, color);
  }

  function sign(g) {
    const x = 176;
    const y = 573;
    const w = 260;
    const h = 30;
    rect(g, x + 3, y + 4, w, h, 'rgba(60, 40, 25, 0.3)');
    rect(g, x - 1, y - 1, w + 2, h + 2, OUT);
    rect(g, x, y, w, h, '#2e2724');
    rect(g, x + 2, y + 2, w - 4, 1, '#d6aa52');
    rect(g, x + 2, y + h - 3, w - 4, 1, '#d6aa52');
    rect(g, x + 2, y + 2, 1, h - 4, '#d6aa52');
    rect(g, x + w - 3, y + 2, 1, h - 4, '#d6aa52');
    rect(g, x + 4, y + 4, w - 8, 1, '#8a6a2a');
    const label = 'UNIVERSITY OF GEORGIA';
    const tw = text7Width(label);
    text7(g, label, Math.round(x + (w - tw) / 2) + 1, y + 12, '#1a1514');
    text7(g, label, Math.round(x + (w - tw) / 2), y + 11, '#efe2c8');
    for (const bx of [x + 20, x + w - 21]) badge(g, bx, y + 15);
  }

  // A generic block-letter "G" badge.
  function badge(g, cx, cy) {
    ellipseFill(g, cx - 10, cy - 7, 21, 15, OUT);
    ellipseFill(g, cx - 9, cy - 6, 19, 13, RED.base);
    ellipseFill(g, cx - 7, cy - 5, 15, 11, '#f6efe2');
    text7(g, 'G', cx - 2, cy - 3, '#1a1514');
  }

  function paintCampus(g) {
    paintGround(g);

    // Soft shadows under trees, offset away from the afternoon sun.
    for (const [cx, cy, r] of TREES) {
      ellipseFill(g, Math.round(cx - r * 0.7), Math.round(cy + r * 0.72), Math.round(r * 1.9), Math.max(4, Math.round(r * 0.55)), 'rgba(35, 48, 18, 0.28)');
    }

    flowerRing(g);

    // Hedges and front lawns of North Campus.
    for (let xx = 120; xx < 204; xx += 10) canopy(g, xx + 5, 252, 6, 400 + xx, false);
    for (let xx = 244; xx < 284; xx += 10) canopy(g, xx + 5, 252, 6, 400 + xx, false);
    for (let xx = 292; xx < 308; xx += 10) canopy(g, xx + 5, 252, 6, 400 + xx, false);
    for (let xx = 336; xx < 382; xx += 10) canopy(g, xx + 5, 252, 6, 400 + xx, false);
    hedge(g, 148, 262, 58, 9);
    hedge(g, 236, 262, 48, 9);
    hedge(g, 350, 262, 30, 9);

    for (const [x, y, r, flowers] of BUSHES) canopy(g, x, y, r, x * 7 + y, flowers);

    // Steps.
    stairs(g, 208, 245, 30, 18);
    stairs(g, 312, 247, 20, 15);
    stairs(g, 449, 260, 62, 33);
    rect(g, 444, 258, 6, 30, STONE.dark);
    rect(g, 510, 258, 6, 30, STONE.dark);
    rect(g, 444, 258, 6, 2, STONE.base);
    rect(g, 510, 258, 6, 2, STONE.base);
    stairs(g, 458, 474, 58, 30);
    for (const px0 of [444, 516]) {
      rect(g, px0 - 1, 471, 16, 31, OUT);
      rect(g, px0, 472, 14, 29, '#c9bba3');
      rect(g, px0, 472, 14, 2, '#e3d7c1');
      for (let yy = 478; yy < 500; yy += 6) rect(g, px0, yy, 14, 1, '#ab9d86');
      rect(g, px0 + 7, 478, 1, 6, '#ab9d86');
      rect(g, px0 + 3, 484, 1, 6, '#ab9d86');
      rect(g, px0 + 10, 490, 1, 6, '#ab9d86');
    }
    stairs(g, 252, 544, 104, 26);
    rect(g, 252, 531, 104, 13, STONE.base);
    rect(g, 252, 531, 104, 1, STONE.hi);
    rect(g, 252, 543, 104, 1, STONE.dark);

    sign(g);
  }

  // ---------- Props ----------

  const props = [];
  function addProp({ bounds, sortY, footprint, draw, live }) {
    props.push({
      bounds: bounds.map((v) => v * S),
      sortY: sortY * S,
      footprint: footprint && footprint.map((v) => v * S),
      draw,
      live
    });
  }

  function brickWall(g, x, y, w, h, seed) {
    const rand = rng(seed);
    rect(g, x, y, w, h, BRICK.base);
    for (let row = 0, yy = y; yy < y + h; row += 1, yy += 3) {
      for (let xx = x - (row % 2 ? 3 : 0); xx < x + w; xx += 6) {
        const left = Math.max(x, xx + 1);
        const right = Math.min(x + w, xx + 6);
        const roll = rand();
        if (roll < 0.2 && right > left) rect(g, left, yy, right - left, Math.min(2, y + h - yy), roll < 0.1 ? BRICK.dark : BRICK.light);
        if (xx >= x) rect(g, xx, yy, 1, Math.min(2, y + h - yy), BRICK.mortar);
      }
      if (yy + 2 < y + h) rect(g, x, yy + 2, w, 1, BRICK.mortar);
    }
  }

  function shingles(g, x, y, w, h) {
    rect(g, x, y, w, h, ROOF.base);
    for (let row = 0, yy = y + 3; yy < y + h - 1; row += 1, yy += 3) {
      rect(g, x, yy, w, 1, ROOF.line);
      for (let xx = x + (row % 2 ? 3 : 0); xx < x + w; xx += 6) rect(g, xx, yy - 2, 1, 2, ROOF.line);
    }
    rect(g, x, y, w, 1, ROOF.hi);
  }

  function sash(g, x, y, w, h) {
    rect(g, x - 1, y - 2, w + 2, 2, STONE.base);
    rect(g, x, y, w, h, GLASS.frame);
    rect(g, x + 1, y + 1, w - 2, h - 2, GLASS.base);
    rect(g, x + Math.floor(w / 2), y + 1, 1, h - 2, GLASS.frame);
    rect(g, x + 1, y + Math.floor(h / 2), w - 2, 1, GLASS.frame);
    rect(g, x + 1, y + 1, 1, 2, GLASS.hi);
    rect(g, x - 1, y + h, w + 2, 1, STONE.mid);
  }

  function column(g, x, y, w, h) {
    rect(g, x - 1, y, w + 2, h, OUT);
    rect(g, x, y + 2, w, h - 4, STONE.base);
    rect(g, x + w - 2, y + 2, 2, h - 4, STONE.dark);
    rect(g, x + 1, y + 2, 1, h - 4, STONE.hi);
    rect(g, x - 1, y, w + 2, 2, STONE.hi);
    rect(g, x - 1, y + h - 2, w + 2, 2, STONE.mid);
  }

  function pediment(g, x, y, w, h) {
    triangle(g, x - 1, y - 1, w + 2, h + 1, OUT);
    triangle(g, x, y, w, h, STONE.hi);
    triangle(g, x + 5, y + 4, w - 10, h - 5, STONE.mid);
  }

  function door(g, x, y, w, h) {
    rect(g, x - 1, y - 1, w + 2, h + 1, OUT);
    rect(g, x, y, w, h, WOOD.base);
    rect(g, x + Math.floor(w / 2), y, 1, h, WOOD.dark);
    for (let yy = y + 2; yy < y + h - 2; yy += 5) {
      rect(g, x + 1, yy, Math.floor(w / 2) - 1, 3, WOOD.hi);
      rect(g, x + Math.floor(w / 2) + 1, yy, Math.ceil(w / 2) - 2, 3, WOOD.hi);
    }
  }

  function chimney(g, x, y, w, h) {
    rect(g, x - 1, y - 1, w + 2, h + 1, OUT);
    rect(g, x, y, w, h, '#2f2c2e');
    rect(g, x - 1, y - 1, w + 2, 3, STONE.base);
    rect(g, x + 2, y + 3, w - 4, 3, '#1c1a1b');
  }

  function quoins(g, x, y, h) {
    for (let yy = y, i = 0; yy < y + h; yy += 4, i += 1) rect(g, x - (i % 2), yy, 4 + (i % 2), 3, STONE.base);
  }

  // Sanford-style stadium bowl.
  addProp({
    bounds: [134, 2, 240, 162],
    sortY: 160,
    draw(g) {
      const cx = 253;
      const rx = 116;
      const top = 26;
      const ry = 50;
      const cy = top + ry;
      const face = 34;
      // Front facade band.
      for (let x = cx - rx; x <= cx + rx; x += 1) {
        const v = (x + 0.5 - cx) / rx;
        if (Math.abs(v) > 1) continue;
        const yb = Math.round(cy + ry * Math.sqrt(1 - v * v));
        const edge = Math.abs(v) > 0.86;
        for (let d = 0; d < face; d += 1) {
          let color = edge ? STONE.mid : STONE.base;
          if (d < 2) color = STONE.deep;
          else if (d >= 6 && d < 15) color = ((x + 1) % 12 < 3) ? (edge ? STONE.mid : STONE.base) : '#3b3638';
          else if (d >= 15 && d < 18) color = STONE.hi;
          else if (d >= 19 && d < 30) {
            const m = (x + 5) % 14;
            color = m < 4 || (d === 19 && (m === 4 || m === 13)) ? (edge ? STONE.mid : STONE.base) : '#4a4446';
          } else if (d >= 30) color = STONE.dark;
          rect(g, x, yb + d, 1, 1, color);
        }
        rect(g, x, yb + face, 1, 1, OUT);
      }
      rect(g, cx - rx, cy, 1, face, OUT);
      rect(g, cx + rx, cy, 1, face, OUT);
      // Rim and bowl.
      K.ellipseRect(g, cx - rx - 1, top - 1, rx * 2 + 3, ry * 2 + 3, OUT);
      K.ellipseRect(g, cx - rx, top, rx * 2 + 1, ry * 2 + 1, STONE.base);
      K.ellipseRect(g, cx - rx + 1, top + 1, rx * 2 - 1, ry * 2 - 3, STONE.hi);
      const inner = [cx - rx + 8, top + 6, rx * 2 - 15, ry * 2 - 11];
      const field = [190, 86, 126, 22];
      K.ellipseRect(g, inner[0] - 1, inner[1] - 1, inner[2] + 2, inner[3] + 2, '#2e2b2d');
      const tiers = 12;
      const drawTiers = (colors) => {
        for (let k = 0; k < tiers; k += 1) {
          const t = k / tiers;
          const box = inner.map((v, i) => Math.round(v + (field[i] - v) * t * 0.92));
          K.ellipseRect(g, box[0], box[1], box[2], box[3], colors[2]);
          K.ellipseRect(g, box[0], box[1] + 1, box[2], box[3] - 1, colors[k % 2]);
        }
      };
      drawTiers(['#5b5a61', '#6c6b73', '#85848c']);
      g.save();
      g.beginPath();
      g.rect(222, 30, 62, 56);
      g.clip();
      drawTiers(['#a8322c', '#bd3d34', '#d4574b']);
      g.restore();
      for (let a = 0; a < 18; a += 1) {
        const ang = (a / 18) * Math.PI * 2 + 0.17;
        line(g, 253 + Math.cos(ang) * 66, 97 + Math.sin(ang) * 12, 253 + Math.cos(ang) * 106, 77 + Math.sin(ang) * 42, '#8f8e96');
      }
      // Field.
      rect(g, field[0] - 1, field[1] - 1, field[2] + 2, field[3] + 2, '#2e2b2d');
      rect(g, field[0], field[1], field[2], field[3], '#5f9a3e');
      for (let x = field[0]; x < field[0] + field[2]; x += 12) rect(g, x, field[1], 6, field[3], '#6aa647');
      rect(g, field[0] + 2, field[1] + 2, field[2] - 4, 1, '#f3f1e8');
      rect(g, field[0] + 2, field[1] + field[3] - 3, field[2] - 4, 1, '#f3f1e8');
      for (let x = field[0] + 12; x < field[0] + field[2] - 8; x += 11) rect(g, x, field[1] + 2, 1, field[3] - 4, 'rgba(243, 241, 232, 0.8)');
      rect(g, field[0] + 2, field[1] + 3, 10, field[3] - 6, RED.base);
      rect(g, field[0] + field[2] - 12, field[1] + 3, 10, field[3] - 6, RED.base);
      // Scoreboard.
      rect(g, 228, 36, 3, 14, OUT);
      rect(g, 275, 36, 3, 14, OUT);
      rect(g, 211, 5, 82, 36, OUT);
      rect(g, 212, 6, 80, 34, '#3a3434');
      rect(g, 214, 8, 76, 30, '#161314');
      rect(g, 212, 6, 80, 1, '#5a5252');
      badge(g, 252, 23);
      K.text(g, 'HOME', 219, 12, '#f2b84b');
      K.text(g, '24', 220, 20, '#f2b84b', 2);
      K.text(g, 'AWAY', 270, 12, '#f2b84b');
      K.text(g, '17', 271, 20, '#f2b84b', 2);
    }
  });

  // North Campus: main hall with the clock tower.
  addProp({
    bounds: [116, 96, 168, 156],
    sortY: 248,
    draw(g) {
      rect(g, 121, 159, 158, 44, OUT);
      shingles(g, 122, 160, 156, 40);
      rect(g, 122, 160, 3, 40, ROOF.hi);
      chimney(g, 156, 157, 12, 18);
      chimney(g, 256, 157, 12, 18);
      rect(g, 120, 198, 160, 5, OUT);
      rect(g, 121, 198, 158, 3, STONE.base);
      rect(g, 121, 198, 158, 1, STONE.hi);
      rect(g, 121, 202, 158, 47, OUT);
      brickWall(g, 122, 202, 156, 46, 3);
      quoins(g, 122, 202, 44);
      quoins(g, 274, 202, 44);
      rect(g, 122, 245, 156, 3, STONE.mid);
      for (const wx of [130, 146, 162, 178, 194, 248, 264]) {
        sash(g, wx, 208, 8, 12);
        sash(g, wx, 228, 8, 12);
      }
      // Tower.
      rect(g, 210, 141, 28, 62, OUT);
      brickWall(g, 211, 142, 26, 60, 8);
      rect(g, 211, 142, 26, 4, STONE.base);
      rect(g, 211, 142, 26, 1, STONE.hi);
      K.arch(g, 217, 150, 14, 16, STONE.base);
      K.arch(g, 219, 152, 10, 13, GLASS.base);
      rect(g, 223, 152, 1, 13, GLASS.frame);
      rect(g, 219, 159, 10, 1, GLASS.frame);
      for (let row = 0; row < 18; row += 1) {
        const half = Math.round(7 + (row / 17) * 9);
        rect(g, 224 - half - 1, 124 + row, half * 2 + 2, 1, OUT);
        rect(g, 224 - half, 124 + row, half * 2, 1, row % 3 === 2 ? '#1f1c1e' : '#2e2b2d');
        rect(g, 224 - half, 124 + row, 2, 1, ROOF.hi);
      }
      rect(g, 216, 109, 16, 16, OUT);
      rect(g, 217, 110, 14, 14, '#f3ead8');
      rect(g, 217, 110, 14, 2, STONE.base);
      K.arch(g, 219, 113, 4, 8, '#2e2b2d');
      K.arch(g, 225, 113, 4, 8, '#2e2b2d');
      rect(g, 229, 110, 2, 14, STONE.mid);
      blob(g, 224, 106, 5, OUT);
      blob(g, 224, 106, 4, '#f3ead8');
      rect(g, 222, 104, 2, 2, '#ffffff');
      rect(g, 223, 97, 2, 6, OUT);
      // Front portico.
      rect(g, 203, 202, 42, 47, OUT);
      brickWall(g, 204, 202, 40, 46, 12);
      triangle(g, 202, 193, 44, 11, OUT);
      triangle(g, 203, 194, 42, 10, '#2e2b2d');
      pediment(g, 205, 200, 38, 12);
      rect(g, 204, 211, 40, 5, OUT);
      rect(g, 205, 212, 38, 3, STONE.base);
      rect(g, 205, 212, 38, 1, STONE.hi);
      rect(g, 207, 215, 34, 30, '#d9c7a4');
      door(g, 219, 224, 10, 21);
      K.arch(g, 219, 219, 10, 6, GLASS.base);
      for (const cx of [208, 214, 232, 238]) column(g, cx, 215, 3, 30);
      rect(g, 204, 244, 40, 4, STONE.mid);
      rect(g, 204, 244, 40, 1, STONE.hi);
    }
  });

  // North Campus: second building.
  addProp({
    bounds: [274, 150, 110, 101],
    sortY: 248,
    draw(g) {
      rect(g, 277, 184, 15, 64, OUT);
      brickWall(g, 278, 185, 13, 62, 21);
      rect(g, 276, 180, 17, 6, ROOF.base);
      rect(g, 289, 159, 91, 44, OUT);
      shingles(g, 290, 160, 89, 40);
      chimney(g, 330, 156, 12, 18);
      rect(g, 288, 198, 93, 5, OUT);
      rect(g, 289, 198, 91, 3, STONE.base);
      rect(g, 289, 198, 91, 1, STONE.hi);
      rect(g, 289, 202, 91, 47, OUT);
      brickWall(g, 290, 202, 89, 46, 5);
      quoins(g, 290, 202, 44);
      quoins(g, 375, 202, 44);
      rect(g, 290, 245, 89, 3, STONE.mid);
      for (const wx of [297, 348, 364]) {
        sash(g, wx, 208, 8, 12);
        sash(g, wx, 228, 8, 12);
      }
      sash(g, 318, 208, 8, 8);
      pediment(g, 310, 216, 24, 7);
      rect(g, 310, 222, 24, 3, STONE.base);
      rect(g, 312, 225, 20, 21, '#d9c7a4');
      door(g, 318, 229, 8, 17);
      column(g, 312, 225, 2, 21);
      column(g, 330, 225, 2, 21);
      rect(g, 310, 245, 24, 3, STONE.mid);
    }
  });

  // Historic Hall (the classical building).
  addProp({
    bounds: [414, 120, 132, 143],
    sortY: 261,
    draw(g) {
      rect(g, 417, 124, 126, 138, OUT);
      rect(g, 418, 125, 124, 136, STONE.base);
      rect(g, 418, 125, 124, 12, STONE.hi);
      for (let xx = 420; xx < 540; xx += 12) rect(g, xx, 131, 1, 6, STONE.mid);
      rect(g, 418, 136, 124, 2, STONE.dark);
      rect(g, 431, 137, 98, 36, OUT);
      shingles(g, 432, 138, 96, 34);
      for (const sx of [418, 528]) {
        rect(g, sx, 138, 14, 120, STONE.base);
        rect(g, sx + 3, 144, 8, 106, STONE.mid);
        rect(g, sx + 3, 144, 8, 1, STONE.dark);
        rect(g, sx + 10, 144, 1, 106, STONE.hi);
        rect(g, sx + 13, 138, 1, 120, STONE.dark);
      }
      pediment(g, 429, 166, 102, 31);
      K.disc(g, 480, 186, 5, OUT);
      K.disc(g, 480, 186, 4, '#3a3533');
      rect(g, 478, 184, 2, 1, '#6a6468');
      rect(g, 426, 197, 108, 11, OUT);
      rect(g, 427, 197, 106, 10, STONE.base);
      rect(g, 427, 197, 106, 1, STONE.hi);
      rect(g, 427, 201, 106, 1, STONE.mid);
      rect(g, 427, 205, 106, 1, STONE.dark);
      rect(g, 432, 208, 96, 47, '#d6c3a0');
      for (let yy = 212; yy < 254; yy += 6) rect(g, 432, yy, 96, 1, '#c5b08b');
      door(g, 475, 226, 11, 27);
      rect(g, 474, 224, 13, 2, STONE.base);
      for (const cx of [433, 450, 467, 487, 504, 521]) column(g, cx, 207, 7, 49);
      rect(g, 424, 255, 112, 6, OUT);
      rect(g, 425, 255, 110, 5, STONE.mid);
      rect(g, 425, 255, 110, 1, STONE.hi);
    }
  });

  // Library.
  addProp({
    bounds: [434, 310, 152, 166],
    sortY: 473,
    draw(g) {
      const frame = (inset, color) => {
        const x0 = 440 + inset;
        const x1 = 580 - inset;
        const y0 = 316 + inset;
        const chamfer = 14 - inset;
        for (let y = y0; y < 402; y += 1) {
          const cut = Math.max(0, chamfer - (y - y0));
          rect(g, x0 + cut, y, x1 - x0 - cut * 2, 1, color);
        }
      };
      frame(-1, OUT);
      frame(0, STONE.base);
      frame(1, STONE.hi);
      frame(4, STONE.dark);
      frame(5, ROOF.base);
      for (let y = 324, row = 0; y < 400; y += 3, row += 1) {
        const cut = Math.max(0, 9 - (y - 321));
        rect(g, 445 + cut, y, 130 - cut * 2, 1, ROOF.line);
        for (let xx = 446 + cut + (row % 2 ? 3 : 0); xx < 574 - cut; xx += 6) rect(g, xx, y + 1, 1, 2, ROOF.line);
      }
      rect(g, 454, 321, 112, 1, ROOF.hi);
      // Skylight.
      rect(g, 488, 340, 48, 37, OUT);
      rect(g, 489, 341, 46, 35, STONE.hi);
      rect(g, 492, 344, 40, 29, '#7f9ea6');
      for (let xx = 492; xx < 532; xx += 10) rect(g, xx, 344, 1, 29, STONE.base);
      rect(g, 492, 358, 40, 1, STONE.base);
      for (let i = 0; i < 4; i += 1) rect(g, 494 + i * 10, 346, 3, 1, '#c9dde0');
      rect(g, 489, 374, 46, 2, STONE.dark);
      // Facade.
      rect(g, 437, 398, 146, 6, OUT);
      rect(g, 438, 398, 144, 4, STONE.base);
      rect(g, 438, 398, 144, 1, STONE.hi);
      rect(g, 439, 403, 142, 71, OUT);
      brickWall(g, 440, 403, 140, 70, 17);
      quoins(g, 440, 404, 66);
      quoins(g, 576, 404, 66);
      sash(g, 541, 428, 14, 24);
      rect(g, 440, 470, 140, 3, STONE.mid);
      // Portico.
      pediment(g, 445, 390, 84, 30);
      K.disc(g, 487, 408, 4, OUT);
      K.disc(g, 487, 408, 3, '#3a3533');
      rect(g, 444, 419, 86, 17, OUT);
      rect(g, 445, 420, 84, 15, STONE.base);
      rect(g, 445, 420, 84, 1, STONE.hi);
      rect(g, 445, 434, 84, 1, STONE.dark);
      const label = 'LIBRARY';
      text7(g, label, Math.round(487 - text7Width(label) / 2), 424, '#3a2c26');
      rect(g, 448, 436, 78, 35, '#d6c3a0');
      for (let yy = 440; yy < 470; yy += 6) rect(g, 448, yy, 78, 1, '#c5b08b');
      door(g, 481, 443, 12, 27);
      rect(g, 480, 440, 14, 3, STONE.base);
      for (const cx of [451, 467, 500, 516]) column(g, cx, 435, 7, 37);
      rect(g, 444, 470, 86, 4, STONE.mid);
      rect(g, 444, 470, 86, 1, STONE.hi);
    }
  });

  // Campus Coffee.
  addProp({
    bounds: [46, 352, 98, 118],
    sortY: 467,
    draw(g) {
      rect(g, 49, 356, 92, 50, OUT);
      rect(g, 50, 357, 90, 48, STONE.base);
      rect(g, 50, 357, 90, 2, STONE.hi);
      rect(g, 54, 361, 82, 40, STONE.dark);
      shingles(g, 55, 362, 80, 38);
      rect(g, 88, 368, 26, 21, OUT);
      rect(g, 89, 369, 24, 19, '#4a4648');
      rect(g, 89, 369, 24, 2, '#6a666a');
      for (let yy = 373; yy < 386; yy += 3) rect(g, 91, yy, 20, 1, '#2f2c2e');
      rect(g, 104, 364, 5, 5, OUT);
      rect(g, 50, 400, 90, 67, OUT);
      brickWall(g, 51, 401, 88, 65, 31);
      quoins(g, 51, 401, 62);
      quoins(g, 135, 401, 62);
      // Sign board.
      rect(g, 63, 402, 62, 22, OUT);
      rect(g, 64, 403, 60, 20, '#4a2c1a');
      rect(g, 65, 404, 58, 18, '#5d3822');
      rect(g, 66, 405, 56, 16, '#3a2415');
      const label = 'COFFEE';
      text7(g, label, Math.round(94 - text7Width(label) / 2), 410, '#efe2c8');
      // Awning.
      rect(g, 60, 424, 66, 20, OUT);
      for (let xx = 61, i = 0; xx < 125; xx += 4, i += 1) rect(g, xx, 425, Math.min(4, 125 - xx), 17, i % 2 ? '#f3eadb' : RED.base);
      rect(g, 61, 425, 64, 2, 'rgba(0,0,0,0.18)');
      for (let xx = 61, i = 0; xx < 125; xx += 4, i += 1) {
        rect(g, xx, 442, 4, 1, i % 2 ? '#f3eadb' : RED.base);
        rect(g, xx + 1, 443, 2, 1, i % 2 ? '#f3eadb' : RED.base);
        rect(g, xx, 443, 1, 1, OUT);
        rect(g, xx + 3, 443, 1, 1, OUT);
        rect(g, xx + 1, 444, 2, 1, OUT);
      }
      for (const wx of [65, 106]) {
        rect(g, wx - 1, 446, 19, 17, OUT);
        rect(g, wx, 447, 17, 15, STONE.base);
        rect(g, wx + 1, 448, 15, 13, '#2f3a42');
        rect(g, wx + 8, 448, 1, 13, STONE.base);
        rect(g, wx + 2, 449, 2, 2, '#6d8791');
      }
      door(g, 85, 444, 18, 22);
      rect(g, 87, 446, 14, 7, '#2f3a42');
      rect(g, 94, 446, 1, 7, WOOD.base);
      rect(g, 50, 464, 90, 3, STONE.mid);
    }
  });

  // Patio table with a red umbrella.
  addProp({
    bounds: [124, 426, 44, 66],
    sortY: 488,
    footprint: [128, 468, 32, 20],
    draw(g) {
      K.ellipseRect(g, 132, 480, 26, 8, 'rgba(40, 30, 20, 0.25)');
      for (const [cx, cy] of [[130, 474], [157, 474]]) {
        rect(g, cx - 3, cy - 6, 6, 12, OUT);
        rect(g, cx - 2, cy - 5, 4, 10, '#b98a5c');
        rect(g, cx - 2, cy - 5, 4, 2, '#d0a372');
      }
      rect(g, 143, 450, 2, 22, OUT);
      K.ellipseRect(g, 134, 467, 20, 9, OUT);
      K.ellipseRect(g, 135, 468, 18, 7, '#c79a62');
      K.ellipseRect(g, 135, 468, 18, 4, '#dcb07a');
      rect(g, 139, 483, 10, 7, OUT);
      rect(g, 140, 484, 8, 5, '#b98a5c');
      K.ellipseRect(g, 126, 428, 37, 22, OUT);
      K.ellipseRect(g, 127, 429, 35, 20, RED.base);
      K.ellipseRect(g, 129, 430, 25, 11, RED.hi);
      for (const dx of [-12, -4, 4, 12]) line(g, 144, 431, 144 + dx, 447, RED.dark);
      rect(g, 143, 427, 3, 3, '#f3eadb');
    }
  });

  // Monument at the centre of the quad.
  addProp({
    bounds: [268, 316, 38, 58],
    sortY: 372,
    draw(g) {
      rect(g, 271, 354, 32, 18, OUT);
      rect(g, 272, 355, 30, 16, STONE.mid);
      rect(g, 272, 355, 30, 4, STONE.hi);
      rect(g, 298, 359, 4, 12, STONE.dark);
      rect(g, 275, 337, 24, 19, OUT);
      rect(g, 276, 338, 22, 17, STONE.base);
      rect(g, 276, 338, 22, 2, STONE.hi);
      rect(g, 294, 340, 4, 15, STONE.dark);
      K.arch(g, 283, 343, 7, 11, '#8a8078');
      K.arch(g, 284, 344, 5, 10, '#5a524d');
      rect(g, 279, 328, 16, 11, OUT);
      rect(g, 280, 329, 14, 9, STONE.hi);
      rect(g, 290, 330, 4, 8, STONE.mid);
      blob(g, 287, 325, 5, OUT);
      blob(g, 287, 325, 4, STONE.hi);
      rect(g, 289, 324, 2, 3, STONE.mid);
      rect(g, 286, 317, 2, 4, OUT);
    }
  });

  // Filled band between two concentric half-ellipses (the Arch's curved top).
  function archBand(g, cx, cy, rxo, ryo, rxi, ryi, color) {
    for (let x = Math.ceil(cx - rxo); x <= Math.floor(cx + rxo); x += 1) {
      const vo = (x + 0.5 - cx) / rxo;
      if (Math.abs(vo) > 1) continue;
      const yo = Math.round(cy - ryo * Math.sqrt(1 - vo * vo));
      const vi = (x + 0.5 - cx) / rxi;
      const yi = Math.abs(vi) < 1 ? Math.round(cy - ryi * Math.sqrt(1 - vi * vi)) : cy;
      if (yi > yo) rect(g, x, yo, 1, yi - yo, color);
    }
  }

  // The Arch: three iron columns under a curved, scrolled crown.
  addProp({
    bounds: [254, 440, 104, 108],
    sortY: 541,
    draw(g) {
      archBand(g, 305, 472, 46, 26, 39, 19, OUT);
      archBand(g, 305, 472, 45, 25, 40, 20, IRON.base);
      archBand(g, 305, 472, 45, 25, 44, 24, IRON.hi);
      archBand(g, 305, 472, 37, 18, 33, 14, OUT);
      archBand(g, 305, 472, 36, 17, 34, 15, IRON.base);
      for (const x of [279, 287, 323, 331]) {
        const v = (x + 0.5 - 305) / 34;
        const top = Math.round(472 - 15 * Math.sqrt(1 - v * v));
        rect(g, x, top, 1, 472 - top, IRON.base);
      }
      for (const [x, y] of [[294, 464], [316, 464]]) {
        rect(g, x - 2, y - 2, 5, 5, IRON.base);
        rect(g, x - 1, y - 1, 3, 3, '#6a666a');
        rect(g, x, y, 1, 1, IRON.base);
      }
      rect(g, 302, 443, 7, 6, OUT);
      rect(g, 303, 444, 5, 4, IRON.base);
      rect(g, 304, 444, 1, 2, IRON.hi);
      rect(g, 259, 469, 92, 8, OUT);
      rect(g, 260, 470, 90, 6, IRON.base);
      rect(g, 260, 470, 90, 1, IRON.hi);
      rect(g, 260, 474, 90, 1, '#141213');
      for (const x of [264, 299, 334]) {
        rect(g, x - 2, 476, 16, 5, OUT);
        rect(g, x - 1, 477, 14, 3, '#3a3638');
        rect(g, x - 1, 477, 14, 1, IRON.hi);
        rect(g, x - 1, 480, 14, 58, OUT);
        rect(g, x, 480, 12, 57, IRON.base);
        rect(g, x + 1, 481, 2, 55, IRON.hi);
        rect(g, x + 10, 481, 1, 55, '#141213');
        for (const band of [492, 524]) rect(g, x, band, 12, 1, IRON.hi);
        rect(g, x - 3, 536, 18, 9, OUT);
        rect(g, x - 2, 537, 16, 7, '#302c2e');
        rect(g, x - 2, 537, 16, 1, IRON.hi);
      }
      for (const lx of [270, 340]) {
        rect(g, lx - 3, 464, 7, 6, OUT);
        rect(g, lx - 2, 465, 5, 4, IRON.base);
        blob(g, lx, 459, 5, OUT);
        blob(g, lx, 459, 4, '#f6efe2');
        rect(g, lx - 2, 457, 2, 2, '#ffffff');
        rect(g, lx + 2, 461, 1, 1, '#d8cdb9');
      }
    }
  });

  // Brick gate pillars and railings flanking the Arch.
  for (const [x, rail] of [[235, [251, 261]], [359, [350, 358]]]) {
    addProp({
      bounds: [Math.min(x, rail[0]) - 2, 528, 30, 30],
      sortY: 555,
      footprint: [x, 549, 15, 6],
      draw(g) {
        for (let rx = rail[0]; rx <= rail[1]; rx += 3) rect(g, rx, 540, 1, 13, IRON.base);
        rect(g, rail[0], 540, rail[1] - rail[0] + 1, 1, IRON.base);
        rect(g, x - 1, 531, 17, 25, OUT);
        brickWall(g, x, 532, 15, 23, x);
        rect(g, x - 2, 529, 19, 4, OUT);
        rect(g, x - 1, 530, 17, 3, STONE.base);
        rect(g, x - 1, 530, 17, 1, STONE.hi);
      }
    });
  }

  for (const [x, baseY] of LAMPS) {
    addProp({
      bounds: [x - 5, baseY - 40, 11, 42],
      sortY: baseY,
      footprint: [x - 2, baseY - 3, 5, 3],
      draw(g) {
        K.ellipseRect(g, x - 3, baseY - 1, 9, 3, 'rgba(30, 30, 20, 0.3)');
        rect(g, x - 3, baseY - 4, 7, 4, OUT);
        rect(g, x - 2, baseY - 3, 5, 2, IRON.base);
        rect(g, x - 1, baseY - 30, 3, 27, OUT);
        rect(g, x, baseY - 30, 1, 27, IRON.hi);
        rect(g, x - 2, baseY - 32, 5, 3, OUT);
        blob(g, x, baseY - 36, 4, OUT);
        blob(g, x, baseY - 36, 3, '#f6efe2');
        rect(g, x - 1, baseY - 38, 1, 1, '#ffffff');
      }
    });
  }

  TREES.forEach(([cx, cy, r], index) => {
    const trunkTop = Math.round(cy + r * 0.45);
    const baseY = Math.round(cy + r + 5);
    const tw = Math.max(4, Math.round(r / 4));
    addProp({
      bounds: [cx - r - 3, cy - r - 3, r * 2 + 7, baseY - cy + r + 6],
      sortY: baseY,
      draw(g) {
        const left = cx - Math.floor(tw / 2);
        rect(g, left - 1, trunkTop, tw + 2, baseY - trunkTop + 1, OUT);
        rect(g, left, trunkTop, tw, baseY - trunkTop, TRUNK.base);
        rect(g, left + tw - 2, trunkTop, 2, baseY - trunkTop, TRUNK.dark);
        rect(g, left + 1, trunkTop, 1, baseY - trunkTop, TRUNK.hi);
        rect(g, left - 2, baseY - 2, tw + 4, 2, OUT);
        rect(g, left - 1, baseY - 2, tw + 2, 1, TRUNK.base);
        const leaf = index % 5 === 2 ? LEAF_DEEP : index % 7 === 4 ? LEAF_GOLD : LEAF;
        canopy(g, cx, cy, r, 1000 + index * 17, false, leaf);
      }
    });
  });

  // Stadium flags wave in the breeze.
  function drawFlags(ctx, time) {
    ctx.save();
    ctx.scale(S, S);
    for (const [x, topY, phase] of [[150, 39, 0], [184, 22, 1.3], [324, 22, 2.1], [358, 39, 0.7]]) {
      rect(ctx, x, topY, 1, 15, OUT);
      for (let col = 0; col < 8; col += 1) {
        const wave = Math.round(Math.sin(time * 5 + phase - col * 0.7) * (col / 7) * 1.5);
        rect(ctx, x + 1 + col, topY + wave, 1, 5, col % 3 === 2 ? RED.dark : RED.base);
      }
    }
    ctx.restore();
  }

  Object.assign(window.CAMPUS_MAP, {
    pixelScale: S,
    paint: paintCampus,
    props,
    drawUnder: drawFlags
  });
})();

(() => {
  'use strict';

  const CAMPUS = window.CAMPUS_MAP;
  const ASSET_URLS = window.CAMPUS_ASSETS || {};
  const Kit = window.PixelKit;
  const canvas = document.getElementById('gameCanvas');
  const stage = document.getElementById('gameStage');
  const ctx = canvas.getContext('2d', { alpha: false });
  const locationLabel = document.getElementById('locationLabel');
  const interactButton = document.getElementById('interactButton');
  const loadingCard = document.getElementById('loadingCard');
  const debugButton = document.getElementById('debugButton');
  const inventoryEl = document.getElementById('inventory');
  const sceneBanner = document.getElementById('sceneBanner');
  const sceneBannerEyebrow = document.getElementById('sceneBannerEyebrow');
  const sceneBannerTitle = document.getElementById('sceneBannerTitle');

  const poiDialog = document.getElementById('poiDialog');
  const dialogEyebrow = document.getElementById('dialogEyebrow');
  const dialogTitle = document.getElementById('dialogTitle');
  const dialogBody = document.getElementById('dialogBody');
  const dialogList = document.getElementById('dialogList');
  const dialogActions = document.getElementById('dialogActions');
  const helpDialog = document.getElementById('helpDialog');

  const PLAYER_RADIUS = 9;
  const DEFAULT_GRID_CELL = 12;
  const WALK_SPEED = 150;
  const RUN_SPEED = 225;
  const MAX_ZOOM = 2.6;
  const MIN_ZOOM = 1;
  const TRANSITION_OUT = 0.34;
  const TRANSITION_IN = 0.46;

  const scenes = {
    campus: {
      id: 'campus',
      title: 'North Campus',
      eyebrow: 'University of Georgia',
      backdrop: '#f4dfc6',
      idleHint: 'Use WASD, arrow keys, or click a destination',
      ...CAMPUS
    },
    ...(window.CAMPUS_INTERIORS || {})
  };
  let scene = scenes.campus;

  // Things the player carries between scenes.
  const state = {
    drink: null,
    book: null,
    checkedOut: [],
    studySessions: 0,
    drinksOrdered: 0,
    pastries: 0
  };

  const player = {
    x: CAMPUS.spawn.x,
    y: CAMPUS.spawn.y,
    direction: CAMPUS.spawn.direction || 'up',
    moving: false,
    animationTime: 0,
    frame: 0
  };

  const camera = {
    x: CAMPUS.width / 2,
    y: CAMPUS.height / 2,
    zoom: 1
  };

  const renderState = {
    cssWidth: 1,
    cssHeight: 1,
    scale: 1,
    cameraX: camera.x,
    cameraY: camera.y,
    dpr: 1
  };

  const images = {};
  const keys = new Set();
  const virtualKeys = new Set();
  let path = [];
  let currentHotspot = null;
  let pendingInteract = null;
  let transition = null;
  let doorArmed = new Map();
  let debugVisible = false;
  let lastFrameTime = performance.now();
  let clock = 0;
  let messageUntil = 0;
  let bannerTimer = 0;
  let grid;
  let isReady = false;

  const toRect = (r) => (Array.isArray(r) ? { x: r[0], y: r[1], width: r[2], height: r[3] } : r);
  const pointInRect = (x, y, r) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load ${src}`));
      image.src = src;
    });
  }

  function drawEllipse(context, shape) {
    context.beginPath();
    context.ellipse(
      shape.x + shape.width / 2,
      shape.y + shape.height / 2,
      shape.width / 2,
      shape.height / 2,
      0,
      0,
      Math.PI * 2
    );
    context.fill();
  }

  function drawPolygon(context, shape) {
    context.beginPath();
    shape.points.forEach((point, index) => {
      if (index === 0) context.moveTo(point[0], point[1]);
      else context.lineTo(point[0], point[1]);
    });
    context.closePath();
    context.fill();
  }

  function paintShapes(context, shapes) {
    for (const ellipse of shapes.ellipses || []) drawEllipse(context, ellipse);
    for (const rect of shapes.rects || []) context.fillRect(rect.x, rect.y, rect.width, rect.height);
    for (const polygon of shapes.polygons || []) drawPolygon(context, polygon);
    for (const stroke of shapes.strokes || []) {
      context.beginPath();
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = stroke.width;
      stroke.points.forEach((point, index) => {
        if (index === 0) context.moveTo(point[0], point[1]);
        else context.lineTo(point[0], point[1]);
      });
      context.stroke();
    }
  }

  // ---------- Scene preparation ----------

  // Builds a scene's background, prop sprites, NPCs, walk mask and nav grid
  // the first time it is needed. Art is painted at 1 / pixelScale of world
  // resolution and scaled up with nearest-neighbour sampling when drawn.
  function prepareScene(sc) {
    if (sc.runtime) return sc.runtime;
    const rt = { props: [], npcs: [] };
    const footprints = [];
    const pixelScale = sc.pixelScale || 1;

    rt.background = Kit.makeCanvas(sc.width / pixelScale, sc.height / pixelScale);
    sc.paint(rt.background.getContext('2d'));

    for (const prop of sc.props || []) {
      const [x, y, w, h] = prop.bounds;
      let sprite = null;
      if (prop.draw) {
        sprite = Kit.makeCanvas(w / pixelScale, h / pixelScale);
        const g = sprite.getContext('2d');
        g.translate(-x / pixelScale, -y / pixelScale);
        prop.draw(g);
      }
      rt.props.push({ sprite, x, y, w, h, sortY: prop.sortY, live: prop.live });
      if (prop.footprint) footprints.push(toRect(prop.footprint));
    }

    for (const npc of sc.npcs || []) {
      rt.npcs.push({ ...npc, frames: Kit.buildCharacter(npc.look), phase: Math.random() * 4 });
      footprints.push({ x: npc.x - 7, y: npc.y - 6, width: 14, height: 8 });
    }

    const obstacles = {
      ...(sc.obstacles || {}),
      rects: [...((sc.obstacles && sc.obstacles.rects) || []), ...footprints]
    };
    buildWalkMask(sc, rt, obstacles);
    sc.runtime = rt;
    rt.grid = buildGrid(sc);
    return rt;
  }

  function buildWalkMask(sc, rt, obstacles) {
    const maskCanvas = Kit.makeCanvas(sc.width, sc.height);
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

    maskCtx.clearRect(0, 0, sc.width, sc.height);
    maskCtx.fillStyle = '#fff';
    maskCtx.strokeStyle = '#fff';
    paintShapes(maskCtx, sc.walkable);

    maskCtx.globalCompositeOperation = 'destination-out';
    maskCtx.fillStyle = '#000';
    maskCtx.strokeStyle = '#000';
    paintShapes(maskCtx, obstacles);
    maskCtx.globalCompositeOperation = 'source-over';

    rt.maskData = maskCtx.getImageData(0, 0, sc.width, sc.height).data;

    rt.debugMask = Kit.makeCanvas(sc.width, sc.height);
    const debugCtx = rt.debugMask.getContext('2d');
    const debugImage = debugCtx.createImageData(sc.width, sc.height);
    for (let i = 0; i < rt.maskData.length; i += 4) {
      if (rt.maskData[i + 3] > 127) {
        debugImage.data[i] = 55;
        debugImage.data[i + 1] = 220;
        debugImage.data[i + 2] = 130;
        debugImage.data[i + 3] = 72;
      }
    }
    debugCtx.putImageData(debugImage, 0, 0);
  }

  function maskContains(sc, x, y) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= sc.width || py >= sc.height) return false;
    return sc.runtime.maskData[(py * sc.width + px) * 4 + 3] > 127;
  }

  function isWalkableIn(sc, x, y, radius = PLAYER_RADIUS) {
    const samples = [
      [0, 0],
      [radius, 0], [-radius, 0], [0, radius], [0, -radius],
      [radius * 0.72, radius * 0.72],
      [-radius * 0.72, radius * 0.72],
      [radius * 0.72, -radius * 0.72],
      [-radius * 0.72, -radius * 0.72]
    ];
    return samples.every(([dx, dy]) => maskContains(sc, x + dx, y + dy));
  }

  function isWalkable(x, y, radius) {
    return isWalkableIn(scene, x, y, radius);
  }

  function buildGrid(sc) {
    const cell = sc.gridCell || DEFAULT_GRID_CELL;
    const cols = Math.ceil(sc.width / cell);
    const rows = Math.ceil(sc.height / cell);
    const cells = new Uint8Array(cols * rows);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = Math.min(sc.width - 1, col * cell + cell / 2);
        const y = Math.min(sc.height - 1, row * cell + cell / 2);
        cells[row * cols + col] = isWalkableIn(sc, x, y, PLAYER_RADIUS + 1) ? 1 : 0;
      }
    }
    return { cols, rows, cells, cell };
  }

  // ---------- Pathfinding ----------

  class MinHeap {
    constructor() { this.items = []; }
    get size() { return this.items.length; }
    push(item) {
      const items = this.items;
      items.push(item);
      let index = items.length - 1;
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (items[parent].score <= item.score) break;
        items[index] = items[parent];
        index = parent;
      }
      items[index] = item;
    }
    pop() {
      const items = this.items;
      if (items.length === 1) return items.pop();
      const root = items[0];
      const tail = items.pop();
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= items.length) break;
        let child = left;
        if (right < items.length && items[right].score < items[left].score) child = right;
        if (items[child].score >= tail.score) break;
        items[index] = items[child];
        index = child;
      }
      items[index] = tail;
      return root;
    }
  }

  function cellId(col, row) { return row * grid.cols + col; }
  function idToCell(id) { return { col: id % grid.cols, row: Math.floor(id / grid.cols) }; }
  function cellToWorld(col, row) {
    return {
      x: Math.min(scene.width - 1, col * grid.cell + grid.cell / 2),
      y: Math.min(scene.height - 1, row * grid.cell + grid.cell / 2)
    };
  }

  function nearestOpenCell(x, y) {
    const startCol = Math.max(0, Math.min(grid.cols - 1, Math.floor(x / grid.cell)));
    const startRow = Math.max(0, Math.min(grid.rows - 1, Math.floor(y / grid.cell)));
    const startId = cellId(startCol, startRow);
    if (grid.cells[startId]) return startId;

    for (let radius = 1; radius <= 15; radius += 1) {
      let bestId = -1;
      let bestDistance = Infinity;
      for (let row = startRow - radius; row <= startRow + radius; row += 1) {
        for (let col = startCol - radius; col <= startCol + radius; col += 1) {
          if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue;
          if (Math.abs(col - startCol) !== radius && Math.abs(row - startRow) !== radius) continue;
          const id = cellId(col, row);
          if (!grid.cells[id]) continue;
          const point = cellToWorld(col, row);
          const distance = Math.hypot(point.x - x, point.y - y);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestId = id;
          }
        }
      }
      if (bestId !== -1) return bestId;
    }
    return -1;
  }

  function octile(aCol, aRow, bCol, bRow) {
    const dx = Math.abs(aCol - bCol);
    const dy = Math.abs(aRow - bRow);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  }

  function segmentWalkable(a, b) {
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(distance / 6));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (!isWalkable(x, y)) return false;
    }
    return true;
  }

  function simplifyPath(points) {
    if (points.length <= 2) return points;
    const simplified = [points[0]];
    let anchor = 0;
    while (anchor < points.length - 1) {
      let next = points.length - 1;
      while (next > anchor + 1 && !segmentWalkable(points[anchor], points[next])) next -= 1;
      simplified.push(points[next]);
      anchor = next;
    }
    return simplified;
  }

  function findPath(from, to) {
    const startId = nearestOpenCell(from.x, from.y);
    const goalId = nearestOpenCell(to.x, to.y);
    if (startId < 0 || goalId < 0) return [];
    if (startId === goalId) return [{ x: to.x, y: to.y }];

    const total = grid.cols * grid.rows;
    const gScore = new Float64Array(total);
    gScore.fill(Infinity);
    const cameFrom = new Int32Array(total);
    cameFrom.fill(-1);
    const closed = new Uint8Array(total);
    const heap = new MinHeap();
    const goal = idToCell(goalId);

    gScore[startId] = 0;
    const start = idToCell(startId);
    heap.push({ id: startId, score: octile(start.col, start.row, goal.col, goal.row) });

    const directions = [
      [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
      [-1, -1, Math.SQRT2], [1, -1, Math.SQRT2],
      [-1, 1, Math.SQRT2], [1, 1, Math.SQRT2]
    ];

    let found = false;
    while (heap.size) {
      const currentItem = heap.pop();
      const currentId = currentItem.id;
      if (closed[currentId]) continue;
      if (currentId === goalId) {
        found = true;
        break;
      }
      closed[currentId] = 1;
      const current = idToCell(currentId);

      for (const [dx, dy, moveCost] of directions) {
        const col = current.col + dx;
        const row = current.row + dy;
        if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue;
        const nextId = cellId(col, row);
        if (!grid.cells[nextId] || closed[nextId]) continue;

        if (dx !== 0 && dy !== 0) {
          const sideA = cellId(current.col + dx, current.row);
          const sideB = cellId(current.col, current.row + dy);
          if (!grid.cells[sideA] || !grid.cells[sideB]) continue;
        }

        const tentative = gScore[currentId] + moveCost;
        if (tentative >= gScore[nextId]) continue;
        cameFrom[nextId] = currentId;
        gScore[nextId] = tentative;
        const estimate = tentative + octile(col, row, goal.col, goal.row);
        heap.push({ id: nextId, score: estimate });
      }
    }

    if (!found) return [];
    const ids = [];
    let cursor = goalId;
    while (cursor !== -1) {
      ids.push(cursor);
      if (cursor === startId) break;
      cursor = cameFrom[cursor];
    }
    ids.reverse();

    const points = [{ x: from.x, y: from.y }];
    for (let i = 1; i < ids.length; i += 1) {
      const cell = idToCell(ids[i]);
      points.push(cellToWorld(cell.col, cell.row));
    }

    const snappedGoal = cellToWorld(goal.col, goal.row);
    if (isWalkable(to.x, to.y) && segmentWalkable(snappedGoal, to)) points.push({ x: to.x, y: to.y });
    return simplifyPath(points).slice(1);
  }

  function flashMessage(text) {
    locationLabel.textContent = text;
    messageUntil = clock + 1.2;
  }

  function setDestination(worldX, worldY) {
    const route = findPath({ x: player.x, y: player.y }, { x: worldX, y: worldY });
    if (!route.length) {
      flashMessage('That area is not currently walkable');
      return false;
    }
    path = route;
    return true;
  }

  // ---------- Movement ----------

  function movePlayer(dx, dy) {
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance / 4));
    const stepX = dx / steps;
    const stepY = dy / steps;
    let moved = false;

    for (let i = 0; i < steps; i += 1) {
      if (isWalkable(player.x + stepX, player.y + stepY)) {
        player.x += stepX;
        player.y += stepY;
        moved = true;
      } else {
        let slid = false;
        if (isWalkable(player.x + stepX, player.y)) {
          player.x += stepX;
          slid = true;
        }
        if (isWalkable(player.x, player.y + stepY)) {
          player.y += stepY;
          slid = true;
        }
        moved = moved || slid;
        if (!slid) break;
      }
    }
    return moved;
  }

  function directionVector() {
    let x = 0;
    let y = 0;
    const has = (value) => keys.has(value) || virtualKeys.has(value);
    if (has('arrowleft') || has('a') || has('left')) x -= 1;
    if (has('arrowright') || has('d') || has('right')) x += 1;
    if (has('arrowup') || has('w') || has('up')) y -= 1;
    if (has('arrowdown') || has('s') || has('down')) y += 1;
    if (x || y) {
      const length = Math.hypot(x, y);
      x /= length;
      y /= length;
    }
    return { x, y };
  }

  function findNearbyHotspot() {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const hotspot of scene.hotspots || []) {
      const distance = Math.hypot(player.x - hotspot.x, player.y - hotspot.y);
      if (distance <= hotspot.radius && distance < nearestDistance) {
        nearest = hotspot;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function updateLocationUI() {
    if (transition) return;
    const nearby = findNearbyHotspot();
    currentHotspot = nearby;
    if (nearby) {
      const action = nearby.label || `Explore ${nearby.title}`;
      if (clock >= messageUntil) {
        locationLabel.textContent = nearby.label ? `${nearby.label} · press E` : `${nearby.title} · press E or Explore`;
      }
      interactButton.hidden = false;
      if (interactButton.textContent !== action) interactButton.textContent = action;
    } else {
      if (clock >= messageUntil) {
        const text = path.length ? 'Walking to destination…' : scene.idleHint;
        if (locationLabel.textContent !== text) locationLabel.textContent = text;
      }
      interactButton.hidden = true;
    }
  }

  function faceToward(hotspot) {
    const target = hotspot.target ? toRect(hotspot.target[0]) : null;
    const tx = target ? target.x + target.width / 2 : hotspot.x;
    const ty = target ? target.y + target.height / 2 : hotspot.y;
    const dx = tx - player.x;
    const dy = ty - player.y;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    if (Math.abs(dx) > Math.abs(dy)) player.direction = dx < 0 ? 'left' : 'right';
    else player.direction = dy < 0 ? 'up' : 'down';
  }

  function arrive() {
    const hotspot = pendingInteract;
    pendingInteract = null;
    if (!hotspot) return;
    if (Math.hypot(player.x - hotspot.x, player.y - hotspot.y) <= hotspot.radius) {
      faceToward(hotspot);
      interact(hotspot);
    }
  }

  function updateCamera(delta) {
    const follow = camera.zoom > 1.02;
    const targetX = follow ? player.x : scene.width / 2;
    const targetY = follow ? player.y : scene.height / 2;
    const smoothing = 1 - Math.exp(-delta * 7.5);
    camera.x += (targetX - camera.x) * smoothing;
    camera.y += (targetY - camera.y) * smoothing;
  }

  function snapCamera() {
    const follow = camera.zoom > 1.02;
    camera.x = follow ? player.x : scene.width / 2;
    camera.y = follow ? player.y : scene.height / 2;
  }

  function update(delta) {
    clock += delta;
    if (transition) {
      advanceTransition(delta);
      updateCamera(delta);
      return;
    }

    const input = directionVector();
    let velocityX = 0;
    let velocityY = 0;

    if (input.x || input.y) {
      path = [];
      pendingInteract = null;
      velocityX = input.x;
      velocityY = input.y;
    } else if (path.length) {
      const waypoint = path[0];
      const dx = waypoint.x - player.x;
      const dy = waypoint.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 5) {
        path.shift();
        if (!path.length) arrive();
      } else {
        velocityX = dx / distance;
        velocityY = dy / distance;
      }
    }

    const running = keys.has('shift');
    const speed = (running ? RUN_SPEED : WALK_SPEED) * (scene.speed || 1);
    const moved = (velocityX || velocityY)
      ? movePlayer(velocityX * speed * delta, velocityY * speed * delta)
      : false;

    player.moving = moved;
    if (moved) {
      if (Math.abs(velocityX) > Math.abs(velocityY)) player.direction = velocityX < 0 ? 'left' : 'right';
      else player.direction = velocityY < 0 ? 'up' : 'down';
      player.animationTime += delta;
      player.frame = Math.floor(player.animationTime / 0.115) % 4;
    } else {
      player.frame = 0;
    }

    checkDoors();
    updateCamera(delta);
    updateLocationUI();
  }

  // ---------- Scenes and doors ----------

  function armDoors() {
    doorArmed = new Map();
    for (const door of scene.doors || []) doorArmed.set(door.id, !pointInRect(player.x, player.y, door.zone));
  }

  // A door only fires once the player has been outside its zone, so arriving
  // on a doorstep never bounces you straight back through it.
  function checkDoors() {
    for (const door of scene.doors || []) {
      if (!pointInRect(player.x, player.y, door.zone)) {
        doorArmed.set(door.id, true);
      } else if (doorArmed.get(door.id)) {
        useDoor(door);
        return;
      }
    }
  }

  function arrivalFor(door) {
    const target = scenes[door.to];
    if (door.arrive) {
      const back = (target.doors || []).find((item) => item.id === door.arrive);
      if (back && back.exitSpawn) return back.exitSpawn;
    }
    return target.spawn;
  }

  function useDoor(door) {
    changeScene(door.to, arrivalFor(door));
  }

  function approachDoor(doorId) {
    const door = (scene.doors || []).find((item) => item.id === doorId);
    if (!door) return false;
    pendingInteract = null;
    if (pointInRect(player.x, player.y, door.zone)) {
      useDoor(door);
      return true;
    }
    const target = door.approach || { x: door.zone.x + door.zone.width / 2, y: door.zone.y + door.zone.height / 2 };
    return setDestination(target.x, target.y);
  }

  function changeScene(id, arrival) {
    const next = scenes[id];
    if (transition || !next) return false;
    try {
      prepareScene(next);
    } catch (error) {
      console.error(error);
      flashMessage('That building could not be opened');
      return false;
    }
    path = [];
    pendingInteract = null;
    keys.clear();
    virtualKeys.clear();
    document.querySelectorAll('.touch-pad button').forEach((button) => button.classList.remove('is-held'));
    interactButton.hidden = true;
    locationLabel.textContent = id === 'campus' ? 'Heading back outside…' : `Entering ${next.title}…`;
    transition = { phase: 'out', t: 0, to: id, arrival: arrival || next.spawn };
    return true;
  }

  function advanceTransition(delta) {
    transition.t += delta;
    if (transition.phase === 'out' && transition.t >= TRANSITION_OUT) {
      swapScene(transition.to, transition.arrival);
      transition = { phase: 'in', t: 0 };
    } else if (transition.phase === 'in' && transition.t >= TRANSITION_IN) {
      transition = null;
      updateLocationUI();
    }
  }

  function swapScene(id, arrival) {
    const previous = scene;
    previous.savedZoom = camera.zoom;
    scene = scenes[id];
    grid = scene.runtime.grid;
    player.x = arrival.x;
    player.y = arrival.y;
    player.direction = arrival.direction || 'up';
    player.frame = 0;
    player.moving = false;
    camera.zoom = scene.savedZoom || 1;
    snapCamera();
    armDoors();
    stage.dataset.scene = scene.id;
    showBanner(scene);
    updateLocationUI();

    const detail = { id: scene.id, title: scene.title, from: previous.id };
    window.dispatchEvent(new CustomEvent('campus:scene', { detail }));
    if (window.parent !== window) window.parent.postMessage({ type: 'campus:scene', scene: detail }, '*');
  }

  function showBanner(sc) {
    sceneBannerEyebrow.textContent = sc.eyebrow || '';
    sceneBannerTitle.textContent = sc.title || '';
    sceneBanner.classList.remove('is-visible');
    void sceneBanner.offsetWidth;
    sceneBanner.classList.add('is-visible');
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => sceneBanner.classList.remove('is-visible'), 2200);
  }

  // ---------- Rendering ----------

  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    renderState.cssWidth = rect.width;
    renderState.cssHeight = rect.height;
    renderState.dpr = dpr;
  }

  function clampCamera(scale) {
    const halfWorldViewWidth = renderState.cssWidth / scale / 2;
    const halfWorldViewHeight = renderState.cssHeight / scale / 2;
    if (halfWorldViewWidth >= scene.width / 2) camera.x = scene.width / 2;
    else camera.x = Math.max(halfWorldViewWidth, Math.min(scene.width - halfWorldViewWidth, camera.x));
    if (halfWorldViewHeight >= scene.height / 2) camera.y = scene.height / 2;
    else camera.y = Math.max(halfWorldViewHeight, Math.min(scene.height - halfWorldViewHeight, camera.y));
  }

  // Interiors are ~2.5× closer than the campus, so overlays shrink with them.
  function uiUnit() {
    return Math.max(0.45, scene.width / CAMPUS.width);
  }

  function drawPathPreview() {
    if (!path.length) return;
    const unit = uiUnit();
    ctx.save();
    ctx.lineWidth = 4 * unit;
    ctx.strokeStyle = 'rgba(255, 250, 226, 0.95)';
    ctx.setLineDash([6 * unit, 7 * unit]);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    for (const waypoint of path) ctx.lineTo(waypoint.x, waypoint.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const final = path[path.length - 1];
    ctx.strokeStyle = '#9d2c2d';
    ctx.lineWidth = 3 * unit;
    ctx.beginPath();
    ctx.arc(final.x, final.y, 12 * unit, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawHotspotDebug() {
    const unit = uiUnit();
    ctx.save();
    ctx.font = `700 ${Math.round(17 * unit)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3 * unit;
    for (const door of scene.doors || []) {
      ctx.fillStyle = 'rgba(60, 120, 220, 0.25)';
      ctx.fillRect(door.zone.x, door.zone.y, door.zone.width, door.zone.height);
      ctx.strokeStyle = 'rgba(40, 80, 180, 0.9)';
      ctx.strokeRect(door.zone.x, door.zone.y, door.zone.width, door.zone.height);
    }
    for (const hotspot of scene.hotspots || []) {
      ctx.setLineDash([4 * unit, 4 * unit]);
      ctx.strokeStyle = 'rgba(214, 150, 40, 0.8)';
      ctx.lineWidth = 1.5 * unit;
      for (const target of hotspot.target || []) {
        const r = toRect(target);
        ctx.strokeRect(r.x, r.y, r.width, r.height);
      }
      ctx.setLineDash([]);
      ctx.lineWidth = 3 * unit;
      ctx.beginPath();
      ctx.arc(hotspot.x, hotspot.y, hotspot.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(214, 55, 55, 0.13)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(125, 25, 25, 0.88)';
      ctx.stroke();
      const width = ctx.measureText(hotspot.title).width + 18 * unit;
      ctx.fillStyle = 'rgba(28, 24, 22, .86)';
      ctx.fillRect(hotspot.x - width / 2, hotspot.y - 13 * unit, width, 26 * unit);
      ctx.fillStyle = '#fff8e9';
      ctx.fillText(hotspot.title, hotspot.x, hotspot.y + unit);
    }
    ctx.restore();
  }

  // Held items sit in the avatar's hands; some are hidden behind the body.
  function drawHeldItems(inFront) {
    const px = Math.round(player.x);
    const py = Math.round(player.y);
    const dir = player.direction;
    if (state.drink) {
      const [dx, dy] = { down: [-11, -11], up: [6, -11], left: [-12, -12], right: [7, -12] }[dir];
      if (inFront) Kit.drawCup(ctx, px + dx, py + dy, clock);
    }
    if (state.book) {
      const [dx, dy, front] = {
        down: [5, -12, true],
        up: [-11, -12, true],
        left: [3, -14, false],
        right: [-9, -14, false]
      }[dir];
      if (front === inFront) Kit.drawBook(ctx, px + dx, py + dy, state.book.color);
    }
  }

  function drawAvatar() {
    const directions = { down: 0, left: 1, right: 2, up: 3 };
    const row = directions[player.direction] ?? 0;
    ctx.drawImage(
      images.avatar,
      player.frame * 24,
      row * 32,
      24,
      32,
      Math.round(player.x - 12),
      Math.round(player.y - 28),
      24,
      32
    );
  }

  function drawPlayer() {
    ctx.save();
    ctx.fillStyle = 'rgba(39, 27, 22, 0.28)';
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + 1, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    drawHeldItems(false);
    drawAvatar();
    drawHeldItems(true);
    ctx.restore();
  }

  function drawNpc(npc) {
    ctx.fillStyle = 'rgba(39, 27, 22, 0.25)';
    ctx.beginPath();
    ctx.ellipse(npc.x, npc.y + 1, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    const blinking = (clock + npc.phase) % 3.7 < 0.13;
    ctx.drawImage(npc.frames[blinking ? 1 : 0], Math.round(npc.x - 12), Math.round(npc.y - 28));
  }

  // Props, NPCs and the player are drawn in order of their feet so the avatar
  // can pass behind shelves and counters. When furniture covers the avatar, a
  // faint silhouette is drawn on top so the player never loses track of it.
  function drawSorted(rt) {
    const drawables = [{ kind: 'player', sortY: player.y }];
    for (const prop of rt.props) drawables.push({ kind: 'prop', sortY: prop.sortY, item: prop });
    for (const npc of rt.npcs) drawables.push({ kind: 'npc', sortY: npc.y, item: npc });
    drawables.sort((a, b) => a.sortY - b.sortY);

    const px = player.x - 12;
    const py = player.y - 28;
    let playerDrawn = false;
    let occluded = false;
    for (const drawable of drawables) {
      if (drawable.kind === 'player') {
        drawPlayer();
        playerDrawn = true;
      } else if (drawable.kind === 'npc') {
        drawNpc(drawable.item);
      } else {
        const prop = drawable.item;
        if (prop.sprite) {
          ctx.drawImage(prop.sprite, prop.x, prop.y, prop.w, prop.h);
          if (playerDrawn && prop.x < px + 24 && prop.x + prop.w > px &&
            prop.y < py + 26 && prop.y + prop.h > py) occluded = true;
        }
        if (prop.live) prop.live(ctx, clock);
      }
    }

    if (occluded) {
      ctx.save();
      ctx.globalAlpha = 0.4;
      drawAvatar();
      ctx.restore();
    }
  }

  function drawTransition() {
    if (!transition) return;
    const raw = transition.phase === 'out'
      ? transition.t / TRANSITION_OUT
      : 1 - transition.t / TRANSITION_IN;
    const progress = Math.max(0, Math.min(1, raw));
    const eased = progress * progress * (3 - 2 * progress);
    const { cssWidth, cssHeight, scale, dpr } = renderState;
    const sx = (player.x - renderState.cameraX) * scale + cssWidth / 2;
    const sy = (player.y - 14 - renderState.cameraY) * scale + cssHeight / 2;
    const maxRadius = Math.hypot(Math.max(sx, cssWidth - sx), Math.max(sy, cssHeight - sy));
    const radius = maxRadius * (1 - eased);

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#191716';
    ctx.beginPath();
    ctx.rect(0, 0, cssWidth, cssHeight);
    if (radius > 0.5) ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fill('evenodd');
    ctx.restore();
  }

  function render() {
    resizeCanvas();
    const rt = scene.runtime;
    const baseScale = Math.min(renderState.cssWidth / scene.width, renderState.cssHeight / scene.height);
    const scale = baseScale * camera.zoom;
    clampCamera(scale);

    renderState.scale = scale;
    renderState.cameraX = camera.x;
    renderState.cameraY = camera.y;

    const dpr = renderState.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = scene.backdrop || '#f4dfc6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const offsetX = renderState.cssWidth / 2 - camera.x * scale;
    const offsetY = renderState.cssHeight / 2 - camera.y * scale;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(rt.background, 0, 0, scene.width, scene.height);
    if (scene.drawUnder) scene.drawUnder(ctx, clock);
    if (debugVisible) ctx.drawImage(rt.debugMask, 0, 0);
    drawPathPreview();
    drawSorted(rt);
    if (scene.drawOver) scene.drawOver(ctx, clock);
    if (debugVisible) drawHotspotDebug();
    drawTransition();
  }

  function screenToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;
    return {
      x: renderState.cameraX + (screenX - rect.width / 2) / renderState.scale,
      y: renderState.cameraY + (screenY - rect.height / 2) / renderState.scale
    };
  }

  // ---------- Interaction ----------

  function targetAt(x, y) {
    return (scene.hotspots || []).find((hotspot) =>
      (hotspot.target || []).some((target) => pointInRect(x, y, toRect(target)))
    );
  }

  // Walk to a hotspot and interact on arrival.
  function goToHotspot(hotspot) {
    if (hotspot.enter) return approachDoor(hotspot.enter);
    if (Math.hypot(player.x - hotspot.x, player.y - hotspot.y) <= hotspot.radius) {
      path = [];
      faceToward(hotspot);
      interact(hotspot);
      return true;
    }
    if (!setDestination(hotspot.x, hotspot.y)) return false;
    pendingInteract = hotspot;
    return true;
  }

  function interact(hotspot) {
    if (!hotspot || transition) return;

    const publicHotspot = {
      id: hotspot.id,
      title: hotspot.title,
      eyebrow: hotspot.eyebrow,
      scene: scene.id
    };
    window.dispatchEvent(new CustomEvent('campus:interact', { detail: publicHotspot }));
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'campus:interact', hotspot: publicHotspot }, '*');
    }

    if (hotspot.enter) {
      approachDoor(hotspot.enter);
      return;
    }
    if (hotspot.exit) {
      const door = (scene.doors || [])[0];
      if (door) useDoor(door);
      return;
    }
    const spec = hotspot.onInteract
      ? hotspot.onInteract({ state, time: clock })
      : { eyebrow: hotspot.eyebrow, title: hotspot.title, body: hotspot.body };
    if (spec) showDialog(spec);
  }

  function openCurrentHotspot() {
    if (!currentHotspot || transition) return;
    path = [];
    pendingInteract = null;
    faceToward(currentHotspot);
    interact(currentHotspot);
  }

  function showDialog(spec) {
    keys.clear();
    virtualKeys.clear();
    dialogEyebrow.textContent = spec.eyebrow || '';
    dialogTitle.textContent = spec.title || '';
    dialogBody.textContent = spec.body || '';
    dialogBody.hidden = !spec.body;

    dialogList.replaceChildren(...(spec.list || []).map((item) => {
      const li = document.createElement('li');
      li.textContent = item;
      return li;
    }));
    dialogList.hidden = !(spec.list && spec.list.length);

    const actions = spec.actions && spec.actions.length
      ? spec.actions
      : [{ label: 'Continue exploring', primary: true }];
    dialogActions.classList.toggle('is-menu', actions.length > 3);
    dialogActions.replaceChildren(...actions.map((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = action.label;
      if (!action.primary) button.classList.add('is-secondary');
      button.addEventListener('click', () => {
        const next = action.run ? action.run() : null;
        updateInventory();
        if (next) showDialog(next);
        else poiDialog.close();
      });
      return button;
    }));

    updateInventory();
    if (!poiDialog.open) {
      if (typeof poiDialog.showModal === 'function') poiDialog.showModal();
      else poiDialog.setAttribute('open', '');
    }
    const focusTarget = dialogActions.querySelector('button:not(.is-secondary)') || dialogActions.querySelector('button');
    if (focusTarget) focusTarget.focus();
  }

  function updateInventory() {
    const items = [];
    if (state.drink) items.push(['☕', state.drink]);
    if (state.book) items.push(['📕', `“${state.book.title}”`]);
    if (state.checkedOut.length) items.push(['📚', `${state.checkedOut.length} borrowed`]);
    inventoryEl.replaceChildren(...items.map(([icon, label]) => {
      const chip = document.createElement('span');
      chip.className = 'inventory-chip';
      const iconEl = document.createElement('span');
      iconEl.setAttribute('aria-hidden', 'true');
      iconEl.textContent = icon;
      chip.append(iconEl, label);
      return chip;
    }));
    inventoryEl.hidden = !items.length;
  }

  function resetPlayer() {
    if (scene.id !== 'campus') {
      scenes.campus.savedZoom = 1;
      changeScene('campus', CAMPUS.spawn);
      return;
    }
    player.x = CAMPUS.spawn.x;
    player.y = CAMPUS.spawn.y;
    player.direction = CAMPUS.spawn.direction || 'up';
    player.frame = 0;
    path = [];
    pendingInteract = null;
    camera.x = CAMPUS.width / 2;
    camera.y = CAMPUS.height / 2;
    camera.zoom = 1;
    armDoors();
  }

  function setZoom(value) {
    camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  }

  function bindControls() {
    window.addEventListener('keydown', (event) => {
      if (poiDialog.open || helpDialog.open) return;
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'shift', 'e', 'enter'].includes(key)) {
        event.preventDefault();
      }
      if (key === 'e' || key === 'enter') {
        if (!event.repeat) openCurrentHotspot();
        return;
      }
      if (transition) return;
      keys.add(key);
    });
    window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => {
      keys.clear();
      virtualKeys.clear();
      document.querySelectorAll('.touch-pad button').forEach((button) => button.classList.remove('is-held'));
    });

    canvas.addEventListener('pointerdown', (event) => {
      if (transition) return;
      const point = screenToWorld(event.clientX, event.clientY);
      const hotspot = targetAt(point.x, point.y);
      if (hotspot) {
        goToHotspot(hotspot);
        return;
      }
      pendingInteract = null;
      setDestination(point.x, point.y);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (event.pointerType !== 'mouse') return;
      const point = screenToWorld(event.clientX, event.clientY);
      canvas.style.cursor = targetAt(point.x, point.y) ? 'pointer' : '';
    });

    document.querySelectorAll('.touch-pad button').forEach((button) => {
      const direction = button.dataset.direction;
      const press = (event) => {
        event.preventDefault();
        if (transition) return;
        button.setPointerCapture?.(event.pointerId);
        virtualKeys.add(direction);
        path = [];
        pendingInteract = null;
        button.classList.add('is-held');
      };
      const release = (event) => {
        event.preventDefault();
        virtualKeys.delete(direction);
        button.classList.remove('is-held');
      };
      button.addEventListener('pointerdown', press);
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      button.addEventListener('lostpointercapture', release);
    });

    document.getElementById('zoomIn').addEventListener('click', () => setZoom(camera.zoom + 0.3));
    document.getElementById('zoomOut').addEventListener('click', () => setZoom(camera.zoom - 0.3));
    document.getElementById('resetButton').addEventListener('click', resetPlayer);
    debugButton.addEventListener('click', () => {
      debugVisible = !debugVisible;
      debugButton.setAttribute('aria-pressed', String(debugVisible));
    });
    interactButton.addEventListener('click', openCurrentHotspot);
    document.getElementById('dialogClose').addEventListener('click', () => poiDialog.close());
    document.getElementById('helpButton').addEventListener('click', () => helpDialog.showModal());
    document.getElementById('helpClose').addEventListener('click', () => helpDialog.close());

    for (const dialog of [poiDialog, helpDialog]) {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    }
  }

  function frame(now) {
    const delta = Math.min(0.05, (now - lastFrameTime) / 1000);
    lastFrameTime = now;
    update(delta);
    render();
    requestAnimationFrame(frame);
  }

  async function start() {
    try {
      images.avatar = await loadImage(ASSET_URLS['avatar.png'] || 'avatar.png');

      prepareScene(scene);
      grid = scene.runtime.grid;
      armDoors();
      stage.dataset.scene = scene.id;
      bindControls();

      // Allow deep links such as ?scene=library.
      const requested = new URLSearchParams(window.location.search).get('scene');
      if (requested && requested !== 'campus' && scenes[requested]) {
        prepareScene(scenes[requested]);
        swapScene(requested, scenes[requested].spawn);
      }

      isReady = true;
      window.dispatchEvent(new CustomEvent('campus:ready'));
      if (window.parent !== window) window.parent.postMessage({ type: 'campus:ready' }, '*');
      loadingCard.hidden = true;
      requestAnimationFrame((now) => {
        lastFrameTime = now;
        requestAnimationFrame(frame);
      });

      // Warm up interiors so the first door opens instantly.
      window.setTimeout(() => {
        for (const sc of Object.values(scenes)) {
          try { prepareScene(sc); } catch (error) { console.error(error); }
        }
      }, 400);
    } catch (error) {
      console.error(error);
      loadingCard.textContent = 'The prototype could not load its image assets.';
    }
  }

  window.CampusWorld = {
    isReady: () => isReady,
    reset: resetPlayer,
    setZoom,
    getPlayerPosition: () => ({ x: player.x, y: player.y, scene: scene.id }),
    getScene: () => scene.id,
    getInventory: () => JSON.parse(JSON.stringify(state)),
    enter(id) {
      if (!isReady || !scenes[id] || id === scene.id) return false;
      return changeScene(id, id === 'campus' ? CAMPUS.spawn : scenes[id].spawn);
    },
    goTo(id) {
      if (!isReady || transition) return false;
      if ((scene.doors || []).some((door) => door.id === id)) return approachDoor(id);
      const hotspot = (scene.hotspots || []).find((item) => item.id === id);
      if (!hotspot) return false;
      if (hotspot.enter) return approachDoor(hotspot.enter);
      pendingInteract = null;
      return setDestination(hotspot.x, hotspot.y);
    }
  };

  start();
})();

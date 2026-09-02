(() => {
  'use strict';

  const MAP = window.CAMPUS_MAP;
  const ASSET_URLS = window.CAMPUS_ASSETS || {};
  const canvas = document.getElementById('gameCanvas');
  const stage = document.getElementById('gameStage');
  const ctx = canvas.getContext('2d', { alpha: false });
  const locationLabel = document.getElementById('locationLabel');
  const interactButton = document.getElementById('interactButton');
  const loadingCard = document.getElementById('loadingCard');
  const debugButton = document.getElementById('debugButton');

  const poiDialog = document.getElementById('poiDialog');
  const dialogEyebrow = document.getElementById('dialogEyebrow');
  const dialogTitle = document.getElementById('dialogTitle');
  const dialogBody = document.getElementById('dialogBody');
  const helpDialog = document.getElementById('helpDialog');

  const PLAYER_RADIUS = 9;
  const GRID_CELL = 12;
  const WALK_SPEED = 150;
  const RUN_SPEED = 225;
  const MAX_ZOOM = 2.6;
  const MIN_ZOOM = 1;

  const player = {
    x: MAP.spawn.x,
    y: MAP.spawn.y,
    direction: MAP.spawn.direction || 'up',
    moving: false,
    animationTime: 0,
    frame: 0
  };

  const camera = {
    x: MAP.width / 2,
    y: MAP.height / 2,
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
  let destination = null;
  let currentHotspot = null;
  let debugVisible = false;
  let lastFrameTime = performance.now();
  let walkMaskCanvas;
  let walkMaskData;
  let debugMaskCanvas;
  let grid;
  let isReady = false;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load ${src}`));
      image.src = src;
    });
  }

  function beginPath(context, shape) {
    context.beginPath();
    if ('points' in shape) {
      const [first, ...rest] = shape.points;
      context.moveTo(first[0], first[1]);
      for (const point of rest) context.lineTo(point[0], point[1]);
      return;
    }
    if ('width' in shape && 'height' in shape) {
      context.rect(shape.x, shape.y, shape.width, shape.height);
    }
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

  function buildWalkMask() {
    walkMaskCanvas = document.createElement('canvas');
    walkMaskCanvas.width = MAP.width;
    walkMaskCanvas.height = MAP.height;
    const maskCtx = walkMaskCanvas.getContext('2d', { willReadFrequently: true });

    maskCtx.clearRect(0, 0, MAP.width, MAP.height);
    maskCtx.fillStyle = '#fff';
    maskCtx.strokeStyle = '#fff';
    paintShapes(maskCtx, MAP.walkable);

    maskCtx.globalCompositeOperation = 'destination-out';
    maskCtx.fillStyle = '#000';
    maskCtx.strokeStyle = '#000';
    paintShapes(maskCtx, MAP.obstacles);
    maskCtx.globalCompositeOperation = 'source-over';

    walkMaskData = maskCtx.getImageData(0, 0, MAP.width, MAP.height).data;

    debugMaskCanvas = document.createElement('canvas');
    debugMaskCanvas.width = MAP.width;
    debugMaskCanvas.height = MAP.height;
    const debugCtx = debugMaskCanvas.getContext('2d');
    const debugImage = debugCtx.createImageData(MAP.width, MAP.height);
    for (let i = 0; i < walkMaskData.length; i += 4) {
      if (walkMaskData[i + 3] > 127) {
        debugImage.data[i] = 55;
        debugImage.data[i + 1] = 220;
        debugImage.data[i + 2] = 130;
        debugImage.data[i + 3] = 72;
      }
    }
    debugCtx.putImageData(debugImage, 0, 0);
  }

  function maskContains(x, y) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= MAP.width || py >= MAP.height) return false;
    return walkMaskData[(py * MAP.width + px) * 4 + 3] > 127;
  }

  function isWalkable(x, y, radius = PLAYER_RADIUS) {
    const samples = [
      [0, 0],
      [radius, 0], [-radius, 0], [0, radius], [0, -radius],
      [radius * 0.72, radius * 0.72],
      [-radius * 0.72, radius * 0.72],
      [radius * 0.72, -radius * 0.72],
      [-radius * 0.72, -radius * 0.72]
    ];
    return samples.every(([dx, dy]) => maskContains(x + dx, y + dy));
  }

  function buildGrid() {
    const cols = Math.ceil(MAP.width / GRID_CELL);
    const rows = Math.ceil(MAP.height / GRID_CELL);
    const cells = new Uint8Array(cols * rows);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = Math.min(MAP.width - 1, col * GRID_CELL + GRID_CELL / 2);
        const y = Math.min(MAP.height - 1, row * GRID_CELL + GRID_CELL / 2);
        cells[row * cols + col] = isWalkable(x, y, PLAYER_RADIUS + 1) ? 1 : 0;
      }
    }
    grid = { cols, rows, cells };
  }

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
      x: Math.min(MAP.width - 1, col * GRID_CELL + GRID_CELL / 2),
      y: Math.min(MAP.height - 1, row * GRID_CELL + GRID_CELL / 2)
    };
  }

  function nearestOpenCell(x, y) {
    const startCol = Math.max(0, Math.min(grid.cols - 1, Math.floor(x / GRID_CELL)));
    const startRow = Math.max(0, Math.min(grid.rows - 1, Math.floor(y / GRID_CELL)));
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

  function setDestination(worldX, worldY) {
    const route = findPath({ x: player.x, y: player.y }, { x: worldX, y: worldY });
    if (!route.length) {
      locationLabel.textContent = 'That area is not currently walkable';
      window.setTimeout(updateLocationUI, 1200);
      return;
    }
    destination = route[route.length - 1];
    path = route;
  }

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
    for (const hotspot of MAP.hotspots) {
      const distance = Math.hypot(player.x - hotspot.x, player.y - hotspot.y);
      if (distance <= hotspot.radius && distance < nearestDistance) {
        nearest = hotspot;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function updateLocationUI() {
    const nearby = findNearbyHotspot();
    currentHotspot = nearby;
    if (nearby) {
      locationLabel.textContent = `${nearby.title} · press E or Explore`;
      interactButton.hidden = false;
      interactButton.textContent = `Explore ${nearby.title}`;
    } else {
      locationLabel.textContent = path.length
        ? 'Walking to destination…'
        : 'Use WASD, arrow keys, or click a destination';
      interactButton.hidden = true;
    }
  }

  function update(delta) {
    const input = directionVector();
    let velocityX = 0;
    let velocityY = 0;

    if (input.x || input.y) {
      path = [];
      destination = null;
      velocityX = input.x;
      velocityY = input.y;
    } else if (path.length) {
      const waypoint = path[0];
      const dx = waypoint.x - player.x;
      const dy = waypoint.y - player.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 5) {
        path.shift();
        if (!path.length) destination = null;
      } else {
        velocityX = dx / distance;
        velocityY = dy / distance;
      }
    }

    const running = keys.has('shift');
    const speed = running ? RUN_SPEED : WALK_SPEED;
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

    const targetCameraX = camera.zoom > 1.02 ? player.x : MAP.width / 2;
    const targetCameraY = camera.zoom > 1.02 ? player.y : MAP.height / 2;
    const smoothing = 1 - Math.exp(-delta * 7.5);
    camera.x += (targetCameraX - camera.x) * smoothing;
    camera.y += (targetCameraY - camera.y) * smoothing;

    updateLocationUI();
  }

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
    if (halfWorldViewWidth >= MAP.width / 2) camera.x = MAP.width / 2;
    else camera.x = Math.max(halfWorldViewWidth, Math.min(MAP.width - halfWorldViewWidth, camera.x));
    if (halfWorldViewHeight >= MAP.height / 2) camera.y = MAP.height / 2;
    else camera.y = Math.max(halfWorldViewHeight, Math.min(MAP.height - halfWorldViewHeight, camera.y));
  }

  function drawPathPreview() {
    if (!path.length) return;
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255, 250, 226, 0.95)';
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.moveTo(player.x, player.y);
    for (const waypoint of path) ctx.lineTo(waypoint.x, waypoint.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const final = path[path.length - 1];
    ctx.strokeStyle = '#9d2c2d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(final.x, final.y, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawHotspotDebug() {
    ctx.save();
    ctx.font = '700 17px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const hotspot of MAP.hotspots) {
      ctx.beginPath();
      ctx.arc(hotspot.x, hotspot.y, hotspot.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(214, 55, 55, 0.13)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(125, 25, 25, 0.88)';
      ctx.lineWidth = 3;
      ctx.stroke();
      const width = ctx.measureText(hotspot.title).width + 18;
      ctx.fillStyle = 'rgba(28, 24, 22, .86)';
      ctx.fillRect(hotspot.x - width / 2, hotspot.y - 13, width, 26);
      ctx.fillStyle = '#fff8e9';
      ctx.fillText(hotspot.title, hotspot.x, hotspot.y + 1);
    }
    ctx.restore();
  }

  function drawPlayer() {
    const directions = { down: 0, left: 1, right: 2, up: 3 };
    const frameWidth = 24;
    const frameHeight = 32;
    const row = directions[player.direction] ?? 0;

    ctx.save();
    ctx.fillStyle = 'rgba(39, 27, 22, 0.28)';
    ctx.beginPath();
    ctx.ellipse(player.x, player.y + 1, 11, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.drawImage(
      images.avatar,
      player.frame * frameWidth,
      row * frameHeight,
      frameWidth,
      frameHeight,
      Math.round(player.x - frameWidth / 2),
      Math.round(player.y - frameHeight + 4),
      frameWidth,
      frameHeight
    );
    ctx.restore();
  }

  function shouldDrawForeground(rule) {
    const bounds = rule.activeWhen;
    return player.x >= bounds.xMin && player.x <= bounds.xMax &&
      player.y >= bounds.yMin && player.y <= bounds.yMax;
  }

  function render() {
    resizeCanvas();
    const baseScale = Math.min(renderState.cssWidth / MAP.width, renderState.cssHeight / MAP.height);
    const scale = baseScale * camera.zoom;
    clampCamera(scale);

    renderState.scale = scale;
    renderState.cameraX = camera.x;
    renderState.cameraY = camera.y;

    const dpr = renderState.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#f4dfc6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const offsetX = renderState.cssWidth / 2 - camera.x * scale;
    const offsetY = renderState.cssHeight / 2 - camera.y * scale;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * offsetX, dpr * offsetY);
    ctx.imageSmoothingEnabled = false;

    ctx.drawImage(images.map, 0, 0);
    if (debugVisible) ctx.drawImage(debugMaskCanvas, 0, 0);
    drawPathPreview();
    drawPlayer();

    for (const rule of MAP.foregroundRules) {
      if (shouldDrawForeground(rule)) ctx.drawImage(images[rule.image], rule.x || 0, rule.y || 0);
    }
    if (debugVisible) drawHotspotDebug();
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

  function openCurrentHotspot() {
    if (!currentHotspot) return;

    const publicHotspot = {
      id: currentHotspot.id,
      title: currentHotspot.title,
      eyebrow: currentHotspot.eyebrow
    };
    window.dispatchEvent(new CustomEvent('campus:interact', { detail: publicHotspot }));
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'campus:interact', hotspot: publicHotspot }, '*');
    }

    dialogEyebrow.textContent = currentHotspot.eyebrow;
    dialogTitle.textContent = currentHotspot.title;
    dialogBody.textContent = currentHotspot.body;
    if (typeof poiDialog.showModal === 'function') poiDialog.showModal();
    else poiDialog.setAttribute('open', '');
  }

  function resetPlayer() {
    player.x = MAP.spawn.x;
    player.y = MAP.spawn.y;
    player.direction = MAP.spawn.direction || 'up';
    player.frame = 0;
    path = [];
    destination = null;
    camera.x = MAP.width / 2;
    camera.y = MAP.height / 2;
    camera.zoom = 1;
  }

  function setZoom(value) {
    camera.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  }

  function bindControls() {
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'shift', 'e', 'enter'].includes(key)) {
        event.preventDefault();
      }
      if (key === 'e' || key === 'enter') {
        openCurrentHotspot();
        return;
      }
      keys.add(key);
    });
    window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => {
      keys.clear();
      virtualKeys.clear();
      document.querySelectorAll('.touch-pad button').forEach((button) => button.classList.remove('is-held'));
    });

    canvas.addEventListener('pointerdown', (event) => {
      const point = screenToWorld(event.clientX, event.clientY);
      setDestination(point.x, point.y);
    });

    document.querySelectorAll('.touch-pad button').forEach((button) => {
      const direction = button.dataset.direction;
      const press = (event) => {
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        virtualKeys.add(direction);
        path = [];
        destination = null;
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
    document.getElementById('dialogPrimary').addEventListener('click', () => poiDialog.close());
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
      const foregroundNames = [...new Set(MAP.foregroundRules.map((rule) => rule.image))];
      const loaded = await Promise.all([
        loadImage(ASSET_URLS['campus-map.png'] || 'campus-map.png'),
        loadImage(ASSET_URLS['avatar.png'] || 'avatar.png'),
        ...foregroundNames.map((name) => loadImage(ASSET_URLS[name] || name))
      ]);
      images.map = loaded[0];
      images.avatar = loaded[1];
      foregroundNames.forEach((name, index) => { images[name] = loaded[index + 2]; });

      buildWalkMask();
      buildGrid();
      bindControls();
      isReady = true;
      window.dispatchEvent(new CustomEvent('campus:ready'));
      if (window.parent !== window) window.parent.postMessage({ type: 'campus:ready' }, '*');
      loadingCard.hidden = true;
      requestAnimationFrame((now) => {
        lastFrameTime = now;
        requestAnimationFrame(frame);
      });
    } catch (error) {
      console.error(error);
      loadingCard.textContent = 'The prototype could not load its image assets.';
    }
  }

  window.CampusWorld = {
    isReady: () => isReady,
    reset: resetPlayer,
    setZoom,
    getPlayerPosition: () => ({ x: player.x, y: player.y }),
    goTo(id) {
      const hotspot = MAP.hotspots.find((item) => item.id === id);
      if (!hotspot || !isReady) return false;
      setDestination(hotspot.x, hotspot.y);
      return true;
    }
  };

  start();
})();

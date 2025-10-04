let opencvReady = false;
if (typeof onOpenCvReady !== 'function') {
  window.onOpenCvReady = function () { opencvReady = true; };
}

const video = document.getElementById('video');
const videoCanvas = document.getElementById('video-canvas');
const drawCanvas = document.getElementById('draw-canvas');
const vctx = videoCanvas.getContext('2d');
const dctx = drawCanvas.getContext('2d');

const toggleBtn = document.getElementById('toggle-draw');
const penSizeInput = document.getElementById('pen-size');
const penColorInput = document.getElementById('pen-color');
const landmarkColorInput = document.getElementById('lm-color');
const effectSelect = document.getElementById('effect');
const clearBtn = document.getElementById('clear-canvas');
const saveBtn = document.getElementById('save');
const switchCameraBtn = document.getElementById('switch-camera');
const brushSelect = document.getElementById('brush');
let brushTexture = null; // Image
let useTexturedBrush = false;

const layerSelect = document.getElementById('layer-select');
const newLayerBtn = document.getElementById('new-layer');
const brushUpload = document.getElementById('brush-upload');

// Layer model: an ordered array of offscreen canvases composited into drawCanvas
let layers = [];
let activeLayerIndex = 0;

function createLayer(width, height) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  return { canvas: c, ctx };
}

function rebuildDrawCanvas() {
  // Composite all layers into the visible drawCanvas
  dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  for (const layer of layers) {
    dctx.drawImage(layer.canvas, 0, 0);
  }
}

function ensureLayers() {
  if (layers.length === 0) {
    layers.push(createLayer(drawCanvas.width, drawCanvas.height));
    activeLayerIndex = 0;
    refreshLayerUI();
  }
}

function refreshLayerUI() {
  if (!layerSelect) return;
  layerSelect.innerHTML = '';
  layers.forEach((_, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `Layer ${i + 1}`;
    if (i === activeLayerIndex) opt.selected = true;
    layerSelect.appendChild(opt);
  });
}

// Load optional paper texture PNG (place your texture at web/web/assets/brush-paper.png)
(function preloadTexture() {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => { brushTexture = img; };
  img.onerror = () => { brushTexture = null; };
  img.src = './web/assets/brush-paper.png';
})();

// Simple exponential smoothing for more fluid lines
let smoothedByHand = new Map();
const SMOOTHING_ALPHA = 0.35; // increase for more smoothing
function smoothPoint(handIndex, p) {
  const prev = smoothedByHand.get(handIndex);
  if (!prev) { smoothedByHand.set(handIndex, p); return p; }
  const q = { x: prev.x + (p.x - prev.x) * SMOOTHING_ALPHA, y: prev.y + (p.y - prev.y) * SMOOTHING_ALPHA };
  smoothedByHand.set(handIndex, q);
  return q;
}

function drawLine(from, to) {
  const size = Number(penSizeInput.value);
  const color = penColorInput.value;

  if (useTexturedBrush && brushTexture) {
    drawOnActiveLayer((ctx) => {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.floor(dist / Math.max(1, size * 0.6)));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = from.x + dx * t;
        const y = from.y + dy * t;
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'destination-in';
        const w = size * 2.0;
        const h = size * 2.0;
        ctx.drawImage(brushTexture, x - w / 2, y - h / 2, w, h);
        ctx.restore();
      }
    });
    return;
  }

  drawOnActiveLayer((ctx) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  });
}

function applyEffect() {
  if (!opencvReady) return;
  if (effectSelect.value === 'none') return;

  const src = cv.imread(drawCanvas);
  let dst = new cv.Mat();

  if (effectSelect.value === 'paper') {
    cv.cvtColor(src, dst, cv.COLOR_RGBA2RGB);
    cv.bilateralFilter(dst, dst, 9, 75, 75);
    dst.convertTo(dst, -1, 1.05, -5);
  } else if (effectSelect.value === 'metal') {
    const kernel = cv.matFromArray(3, 3, cv.CV_32F, [
      -2, -1, 0,
      -1, 1, 1,
       0, 1, 2
    ]);
    cv.filter2D(src, dst, cv.CV_8U, kernel);
    kernel.delete();
  } else if (effectSelect.value === 'glass') {
    let tmp = new cv.Mat();
    const k = cv.matFromArray(3, 3, cv.CV_32F, [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ]);
    cv.filter2D(src, tmp, cv.CV_8U, k);
    k.delete();
    let blur = new cv.Mat();
    cv.GaussianBlur(tmp, blur, new cv.Size(0, 0), 2);
    cv.addWeighted(tmp, 1.0, blur, 0.3, 0, dst);
    tmp.delete();
    blur.delete();
  }

  cv.imshow(drawCanvas, dst);
  src.delete();
  dst.delete();
}

function toOriginalPoint(landmark, width, height) {
  return { x: landmark.x * width, y: landmark.y * height };
}

function toScreenPoint(originalPoint, width) {
  // Screen point depends on mirroring
  return mirrored
    ? { x: width - originalPoint.x, y: originalPoint.y }
    : { x: originalPoint.x, y: originalPoint.y };
}

function isFist(handLandmarks) {
  const tips = [8, 12, 16, 20];
  const mcps = [5, 9, 13, 17];
  let foldedCount = 0;
  for (let i = 0; i < tips.length; i++) {
    if (!handLandmarks[tips[i]] || !handLandmarks[mcps[i]]) continue;
    if (handLandmarks[tips[i]].y > handLandmarks[mcps[i]].y) foldedCount++;
  }
  return foldedCount >= 3;
}

async function initHands() {
  const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
  hands.setOptions({
    maxNumHands: 4,
    modelComplexity: 4,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  });

  hands.onResults((results) => {
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);

    const width = drawCanvas.width;
    const height = drawCanvas.height;
    const all = results.multiHandLandmarks || [];

    // Mirror overlay to match video only when mirrored
    vctx.save();
    if (mirrored) {
      vctx.setTransform(-1, 0, 0, 1, videoCanvas.width, 0);
    }
    for (const lm of all) {
      drawConnectors(vctx, lm, HAND_CONNECTIONS, { color: landmarkColorInput.value, lineWidth: 2 });
      drawLandmarks(vctx, lm, { color: landmarkColorInput.value, lineWidth: 1, radius: 2 });
    }
    vctx.restore();

    all.forEach((lm, idx) => {
      const tip = lm[8];
      if (!tip) return;

      const tipOriginal = toOriginalPoint(tip, width, height);
      const tipScreen = toScreenPoint(tipOriginal, width);
      const smooth = smoothPoint(idx, tipScreen);

      const closed = isFist(lm);
      const mayDraw = drawingEnabled && !closed;

      if (mayDraw) {
        const last = lastPointByHand.get(idx);
        if (last) {
          drawLine(last, smooth);
          // applyEffect(); // opt-in per frame if desired
        }
        lastPointByHand.set(idx, smooth);
      } else {
        lastPointByHand.delete(idx);
        smoothedByHand.delete(idx);
      }
    });

    const validIndexes = new Set(all.map((_, i) => i));
    for (const k of Array.from(lastPointByHand.keys())) {
      if (!validIndexes.has(k)) lastPointByHand.delete(k);
    }
  });

  const camera = new Camera(video, {
    onFrame: async () => { await hands.send({ image: video }); },
    width: 1280,
    height: 720
  });
  camera.start();
}

function clearCanvas() {
  dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
}

let drawingEnabled = false;
let lastPointByHand = new Map();
let currentFacing = 'user';
let mirrored = true;

function drawOnActiveLayer(drawFn) {
  const layer = layers[activeLayerIndex];
  if (!layer) return;
  drawFn(layer.ctx);
  rebuildDrawCanvas();
}

function setCanvasSize() {
  const rect = video.getBoundingClientRect();
  [videoCanvas, drawCanvas].forEach((c) => {
    c.width = rect.width;
    c.height = rect.height;
  });
  // Resize layers too
  const resized = layers.map(() => createLayer(drawCanvas.width, drawCanvas.height));
  // Copy old into new
  for (let i = 0; i < layers.length; i++) {
    resized[i].ctx.drawImage(layers[i].canvas, 0, 0);
  }
  layers = resized;
  rebuildDrawCanvas();
}

async function initCamera() {
  mirrored = currentFacing === 'user';
  video.style.transform = mirrored ? 'scaleX(-1)' : 'none';
  const constraints = { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: currentFacing } };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  video.srcObject = stream;
  await video.play();
  setCanvasSize();
}

function saveDrawing() {
  const dataUrl = drawCanvas.toDataURL('image/png');
  const payload = {
    image: dataUrl,
    effect: document.getElementById('effect').value,
    penColor: penColorInput.value,
    penSize: Number(penSizeInput.value),
    brush: brushSelect ? brushSelect.value : 'normal'
  };

  // Attempt to POST to local API first
  fetch(window.location.origin.replace(':5173', ':5001') + '/api/drawings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

function bindUI() {
  toggleBtn.addEventListener('click', () => {
    drawingEnabled = !drawingEnabled;
    toggleBtn.title = drawingEnabled ? 'Stop Drawing' : 'Start Drawing';
    if (!drawingEnabled) lastPointByHand.clear();
  });
  clearBtn.addEventListener('click', clearCanvas);
  saveBtn.addEventListener('click', saveDrawing);
  switchCameraBtn.addEventListener('click', async () => {
    const stream = video.srcObject; if (stream) { for (const t of stream.getTracks()) t.stop(); }
    currentFacing = currentFacing === 'user' ? 'environment' : 'user';
    await initCamera();
  });
  if (brushSelect) {
    brushSelect.addEventListener('change', () => {
      useTexturedBrush = brushSelect.value === 'paper';
    });
    useTexturedBrush = brushSelect.value === 'paper';
  }
  window.addEventListener('resize', setCanvasSize);
  const lib = document.getElementById('open-library');
  if (lib) {
    lib.addEventListener('click', async (e) => {
      e.preventDefault();
      // Very simple viewer in a new tab
      const url = window.location.origin.replace(':5173', ':5001') + '/api/drawings';
      window.open(url, '_blank');
    });
  }
}

(async function run() {
  await initCamera();
  await initHands();
  ensureLayers();
  bindUI();
})(); 
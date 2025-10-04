let opencvReady = false;
function onOpenCvReady() {
  opencvReady = true;
}

const video = document.getElementById('video');
const videoCanvas = document.getElementById('video-canvas');
const drawCanvas = document.getElementById('draw-canvas');
const vctx = videoCanvas.getContext('2d');
const dctx = drawCanvas.getContext('2d');

const toggleBtn = document.getElementById('toggle-draw');
const penSizeInput = document.getElementById('pen-size');
const penColorInput = document.getElementById('pen-color');
const effectSelect = document.getElementById('effect');
const clearBtn = document.getElementById('clear-canvas');
const saveBtn = document.getElementById('save');

let drawingEnabled = false;
let lastPointByHand = new Map(); // handIndex -> {x,y} in SCREEN (mirrored) coordinates

function setCanvasSize() {
  const rect = video.getBoundingClientRect();
  [videoCanvas, drawCanvas].forEach((c) => {
    c.width = rect.width;
    c.height = rect.height;
  });
}

async function initCamera() {
  try {
    const constraints = { video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' } };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
    // Ensure proper sizing once metadata is ready
    if (video.readyState >= 1) {
      setCanvasSize();
    } else {
      video.addEventListener('loadedmetadata', setCanvasSize, { once: true });
    }
    window.addEventListener('resize', setCanvasSize);
  } catch (err) {
    console.error('Camera init failed', err);
    alert('Camera permission or availability issue. Please allow camera and close other apps using it.');
  }
}

function drawLine(from, to) {
  dctx.strokeStyle = penColorInput.value;
  dctx.lineWidth = Number(penSizeInput.value);
  dctx.lineCap = 'round';
  dctx.beginPath();
  dctx.moveTo(from.x, from.y);
  dctx.lineTo(to.x, to.y);
  dctx.stroke();
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
  // Original camera coordinates (not mirrored)
  return { x: landmark.x * width, y: landmark.y * height };
}

function toScreenPoint(originalPoint, width) {
  // Convert to mirrored screen coordinates to match CSS-mirrored video
  return { x: width - originalPoint.x, y: originalPoint.y };
}

function isFist(handLandmarks) {
  // Heuristic in ORIGINAL space (mirroring does not affect y ordering)
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
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6
  });

  hands.onResults((results) => {
    // Clear overlay; do NOT draw the video frame (the <video> element shows it, already mirrored via CSS)
    vctx.setTransform(1, 0, 0, 1, 0, 0);
    vctx.clearRect(0, 0, videoCanvas.width, videoCanvas.height);

    const width = drawCanvas.width;
    const height = drawCanvas.height;
    const all = results.multiHandLandmarks || [];

    // Render landmarks mirrored to align with mirrored video
    vctx.save();
    vctx.setTransform(-1, 0, 0, 1, videoCanvas.width, 0);
    for (const lm of all) {
      drawConnectors(vctx, lm, HAND_CONNECTIONS, { color: '#22d3ee', lineWidth: 2 });
      drawLandmarks(vctx, lm, { color: '#f43f5e', lineWidth: 1, radius: 2 });
    }
    vctx.restore();

    all.forEach((lm, idx) => {
      const tip = lm[8];
      if (!tip) return;

      const tipOriginal = toOriginalPoint(tip, width, height);
      const tipScreen = toScreenPoint(tipOriginal, width);

      const closed = isFist(lm);
      const mayDraw = drawingEnabled && !closed;

      if (mayDraw) {
        const last = lastPointByHand.get(idx);
        if (last) {
          drawLine(last, tipScreen);
          // Effects can be revisited later; kept here but optional
          // applyEffect();
        }
        lastPointByHand.set(idx, tipScreen);
      } else {
        lastPointByHand.delete(idx);
      }
    });

    const validIndexes = new Set(all.map((_, i) => i));
    for (const k of Array.from(lastPointByHand.keys())) {
      if (!validIndexes.has(k)) lastPointByHand.delete(k);
    }
  });

  const camera = new Camera(video, {
    onFrame: async () => {
      try { await hands.send({ image: video }); } catch (e) { /* swallow transient errors */ }
    },
    width: 1280,
    height: 720
  });
  camera.start();
}

function clearCanvas() {
  dctx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
}

async function saveDrawing() {
  const dataUrl = drawCanvas.toDataURL('image/png');
  const res = await fetch('http://127.0.0.1:5001/api/drawings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl, effect: effectSelect.value, penColor: penColorInput.value, penSize: Number(penSizeInput.value) })
  });
  if (!res.ok) {
    alert('Failed to save');
    return;
  }
}

function bindUI() {
  toggleBtn.addEventListener('click', () => {
    drawingEnabled = !drawingEnabled;
    toggleBtn.textContent = drawingEnabled ? 'Stop Drawing' : 'Start Drawing';
    if (!drawingEnabled) lastPointByHand.clear();
  });
  clearBtn.addEventListener('click', clearCanvas);
  saveBtn.addEventListener('click', saveDrawing);
}

(async function run() {
  await initCamera();
  await initHands();
  bindUI();
})(); 
const origInput = document.getElementById("orig-file");
const styInput = document.getElementById("sty-file");
const audioInput = document.getElementById("audio-file");
const origFileName = document.getElementById("orig-file-name");
const styFileName = document.getElementById("sty-file-name");
const audioFileName = document.getElementById("audio-file-name");
const orig = document.getElementById("orig");
const sty = document.getElementById("sty");
const bgm = document.getElementById("bgm");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const scrub = document.getElementById("scrub");
const invertEnabled = document.getElementById("invert-enabled");
const invertStart = document.getElementById("invert-start");
const invertEnd = document.getElementById("invert-end");
const btnSetStart = document.getElementById("btn-set-start");
const btnSetEnd = document.getElementById("btn-set-end");
const effectType = document.getElementById("effect-type");
const effectStart = document.getElementById("effect-start");
const effectEnd = document.getElementById("effect-end");
const effectIntensity = document.getElementById("effect-intensity");
const btnEffectStart = document.getElementById("btn-effect-start");
const btnEffectEnd = document.getElementById("btn-effect-end");
const btnAddEffect = document.getElementById("btn-add-effect");
const effectList = document.getElementById("effect-list");
const timeReadout = document.getElementById("time-readout");
const durationMain = document.getElementById("duration-main");
const durationDetail = document.getElementById("duration-detail");
const emptyPreview = document.getElementById("empty-preview");
const previewArea = document.getElementById("preview-area");
const stage = document.getElementById("stage");
const btnPlay = document.getElementById("btn-play");
const btnExport = document.getElementById("btn-export");
const btnFrameFit = document.getElementById("btn-frame-fit");
const btnFrameReset = document.getElementById("btn-frame-reset");

let origLoaded = false;
let styLoaded = false;
let audioLoaded = false;
let origName = "";
let styName = "";
let audioName = "";
let origUrl = "";
let styUrl = "";
let audioUrl = "";
let corners = null;
let presence = 0;
let frameActive = false;
let exporting = false;
let previewing = false;
let effectSegments = [];
let activeCorner = -1;
let pointerId = null;

const EFFECT_LABELS = {
  glitch: "故障闪切",
  scan: "霓虹扫描",
  pulse: "冲击波",
  focus: "暗场聚焦",
};

function clearVideo(videoEl) {
  videoEl.pause();
  videoEl.removeAttribute("src");
  videoEl.load();
}

function clearAudio() {
  bgm.pause();
  bgm.removeAttribute("src");
  bgm.load();
}

function setFileName(el, name) {
  el.textContent = name || "未选择";
  el.title = name || "";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const mm = Math.floor(s / 60);
  const ss = (s % 60).toFixed(2).padStart(5, "0");
  return `${String(mm).padStart(2, "0")}:${ss}`;
}

function getDuration() {
  return Number.isFinite(orig.duration) ? orig.duration : 0;
}

function getStylizedDuration() {
  return Number.isFinite(sty.duration) ? sty.duration : 0;
}

function updateTimeReadout() {
  const duration = getDuration();
  const current = Number(scrub.value) || 0;
  timeReadout.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  durationMain.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  durationDetail.textContent =
    `原始 ${formatTime(duration)} · 风格 ${formatTime(getStylizedDuration())}`;
}

function syncTimelineBounds() {
  const duration = getDuration();
  scrub.disabled = !origLoaded;
  scrub.max = String(duration || 0);
  invertStart.max = String(duration || 0);
  invertEnd.max = String(duration || 0);
  effectStart.max = String(duration || 0);
  effectEnd.max = String(duration || 0);
  if (!invertEnabled.checked) {
    invertStart.value = "0";
    invertEnd.value = String(duration || 0);
  } else {
    invertStart.value = String(clamp(Number(invertStart.value) || 0, 0, duration || 0));
    invertEnd.value = String(clamp(Number(invertEnd.value) || duration || 0, 0, duration || 0));
  }
  effectStart.value = String(clamp(Number(effectStart.value) || 0, 0, duration || 0));
  effectEnd.value = String(clamp(Number(effectEnd.value) || 0, 0, duration || 0));
  updateTimeReadout();
}

function clearStylized(reason = "") {
  if (styUrl) URL.revokeObjectURL(styUrl);
  styUrl = "";
  styName = "";
  styLoaded = false;
  styInput.value = "";
  setFileName(styFileName, "");
  clearVideo(sty);
  if (reason) status(reason);
}

function status(msg) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("working", /…\s*$/.test(msg));
}

function setPreviewState(state) {
  previewArea.dataset.state = state;
}

function refreshControls() {
  const ready = origLoaded && styLoaded && !exporting;
  btnPlay.disabled = !ready;
  btnExport.disabled = !ready;
  scrub.disabled = !origLoaded;
  previewArea.classList.toggle("ready", origLoaded);
  emptyPreview.hidden = origLoaded;
  setPreviewState(exporting ? "exporting" : previewing ? "playing" : ready ? "ready" : "empty");
  if (exporting) {
    status("正在导出，需要完整播放一遍视频…");
  } else if (previewing) {
    status("正在预览…");
  } else if (origLoaded && styLoaded) {
    status(
      `已加载 ${origName} 和 ${styName}` +
      (audioLoaded ? `，音乐 ${audioName}` : "") +
      "，可以预览或导出。"
    );
  } else if (origLoaded) {
    status(`已加载原始视频 ${origName}，请再上传风格视频。`);
  } else if (styLoaded) {
    status(`已加载风格视频 ${styName}，请再上传原始视频。`);
  } else {
    status("请先上传两个视频。");
  }
}

function resetTracker() {
  corners = null;
  presence = 0;
  frameActive = false;
}

function renderEffectList() {
  effectList.innerHTML = "";
  for (const seg of effectSegments) {
    const chip = document.createElement("div");
    chip.className = "effect-chip";
    chip.innerHTML = `<span>${EFFECT_LABELS[seg.type]} ${formatTime(seg.start)}-${formatTime(seg.end)}</span>`;
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.addEventListener("click", () => {
      effectSegments = effectSegments.filter((item) => item.id !== seg.id);
      renderEffectList();
      status("已移除特效片段。");
    });
    chip.appendChild(del);
    effectList.appendChild(chip);
  }
}

function loadIntoVideo(videoEl, file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    let settled = false;
    const cleanup = () => {
      videoEl.onloadedmetadata = null;
      videoEl.oncanplay = null;
      videoEl.onerror = null;
    };
    const done = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(url);
    };
    videoEl.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      URL.revokeObjectURL(url);
      const detail = videoEl.error && videoEl.error.message ? `：${videoEl.error.message}` : "";
      reject(new Error(`无法读取 ${file.name}${detail}`));
    };
    videoEl.onloadedmetadata = done;
    videoEl.oncanplay = done;
    videoEl.preload = "auto";
    videoEl.src = url;
    videoEl.load();
  });
}

function loadIntoAudio(audioEl, file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    audioEl.onloadedmetadata = () => {
      audioEl.onloadedmetadata = null;
      resolve(url);
    };
    audioEl.onerror = () => {
      audioEl.onerror = null;
      reject(new Error(`无法读取 ${file.name}`));
    };
    audioEl.src = url;
  });
}

function drawPoster() {
  if (orig.readyState < 2) return;
  orig.currentTime = 0.01;
  orig.onseeked = () => {
    orig.onseeked = null;
    ctx.drawImage(orig, 0, 0, canvas.width, canvas.height);
    updateTimeReadout();
  };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerpPt(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function defaultQuad() {
  const w = canvas.width || 1280;
  const h = canvas.height || 720;
  return [
    { x: w * 0.22, y: h * 0.23 },
    { x: w * 0.78, y: h * 0.20 },
    { x: w * 0.82, y: h * 0.72 },
    { x: w * 0.18, y: h * 0.76 },
  ];
}

function resetFrameToDefault(showStatus = true) {
  corners = defaultQuad();
  presence = 1;
  frameActive = true;
  if (showStatus) status("已重置取景框，可拖动四个角微调。");
  renderFrame(Number(scrub.value) || orig.currentTime || 0);
}

function fitFrameToCanvas() {
  corners = [
    { x: canvas.width * 0.08, y: canvas.height * 0.08 },
    { x: canvas.width * 0.92, y: canvas.height * 0.08 },
    { x: canvas.width * 0.92, y: canvas.height * 0.92 },
    { x: canvas.width * 0.08, y: canvas.height * 0.92 },
  ];
  presence = 1;
  frameActive = true;
  status("已铺满取景框，可继续拖动角点调整。");
  renderFrame(Number(scrub.value) || orig.currentTime || 0);
}

function getInvertRange() {
  if (!invertEnabled.checked) return null;
  const duration = getDuration();
  if (!duration) return null;
  let start = Number(invertStart.value);
  let end = Number(invertEnd.value);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  start = clamp(start, 0, duration);
  end = clamp(end, 0, duration);
  if (end < start) [start, end] = [end, start];
  if (end <= start) return null;
  return { start, end };
}

function isInvertedAtTime(t) {
  const range = getInvertRange();
  return !!range && t >= range.start && t <= range.end;
}

function quadPath(q) {
  ctx.beginPath();
  ctx.moveTo(q[0].x, q[0].y);
  for (let i = 1; i < 4; i++) ctx.lineTo(q[i].x, q[i].y);
  ctx.closePath();
}

function drawWindow(q, sourceVideo) {
  if (!sourceVideo || sourceVideo.readyState < 2) return;
  ctx.save();
  quadPath(q);
  ctx.clip();
  ctx.globalAlpha = presence;
  ctx.drawImage(sourceVideo, 0, 0, canvas.width, canvas.height);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawOutline(q, t) {
  ctx.save();
  ctx.globalAlpha = presence;
  quadPath(q);
  ctx.setLineDash([10, 8]);
  ctx.lineDashOffset = -t * 40;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 6;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.shadowBlur = 0;
  q.forEach((p, i) => {
    const r = 7 + Math.sin(t * 3 + i * 1.5) * 1.5;
    const halo = (t * 0.8 + i * 0.25) % 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + halo * 14, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - halo) * presence})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });
  ctx.restore();
}

function activeEffectSegments(t) {
  return effectSegments.filter((seg) => t >= seg.start && t <= seg.end);
}

function segmentProgress(seg, t) {
  return clamp((t - seg.start) / Math.max(seg.end - seg.start, 0.001), 0, 1);
}

function drawFlashGlitch(seg, t) {
  const p = segmentProgress(seg, t);
  const level = seg.intensity * (0.35 + 0.65 * Math.sin(p * Math.PI));
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 8; i++) {
    const y = ((i * 83 + Math.floor(t * 90) * 17) % canvas.height);
    const h = 8 + ((i * 13) % 24);
    const xShift = Math.sin(t * 80 + i) * 28 * level;
    ctx.globalAlpha = 0.16 * level;
    ctx.drawImage(canvas, 0, y, canvas.width, h, xShift, y, canvas.width, h);
  }
  ctx.globalAlpha = 0.12 * level;
  ctx.fillStyle = Math.floor(t * 18) % 2 ? "#ff6b5e" : "#4bd8ff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawNeonScan(seg, t) {
  const p = segmentProgress(seg, t);
  const y = p * canvas.height;
  const beam = Math.max(28, canvas.height * 0.06);
  const g = ctx.createLinearGradient(0, y - beam, 0, y + beam);
  g.addColorStop(0, "rgba(75,216,255,0)");
  g.addColorStop(0.45, `rgba(75,216,255,${0.22 * seg.intensity})`);
  g.addColorStop(0.5, `rgba(255,255,255,${0.48 * seg.intensity})`);
  g.addColorStop(0.55, `rgba(255,107,94,${0.22 * seg.intensity})`);
  g.addColorStop(1, "rgba(255,107,94,0)");
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = g;
  ctx.fillRect(0, y - beam, canvas.width, beam * 2);
  ctx.strokeStyle = `rgba(255,255,255,${0.55 * seg.intensity})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(canvas.width, y);
  ctx.stroke();
  ctx.restore();
}

function drawShockPulse(seg, t) {
  const p = segmentProgress(seg, t);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const maxR = Math.hypot(canvas.width, canvas.height) * 0.55;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.lineWidth = Math.max(4, 18 * (1 - p));
  ctx.strokeStyle = `rgba(255,194,75,${(1 - p) * 0.75 * seg.intensity})`;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR * p, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = (1 - p) * 0.12 * seg.intensity;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function drawDarkFocus(seg, t) {
  const p = segmentProgress(seg, t);
  const pulse = 0.75 + 0.25 * Math.sin(p * Math.PI * 4);
  const g = ctx.createRadialGradient(
    canvas.width / 2,
    canvas.height / 2,
    canvas.width * 0.16,
    canvas.width / 2,
    canvas.height / 2,
    canvas.width * 0.68
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, `rgba(0,0,0,${0.62 * seg.intensity * pulse})`);
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.18 * seg.intensity * pulse;
  ctx.strokeStyle = "#ffc24b";
  ctx.lineWidth = 3;
  ctx.strokeRect(canvas.width * 0.08, canvas.height * 0.08, canvas.width * 0.84, canvas.height * 0.84);
  ctx.restore();
}

function drawEffectOverlay(t) {
  for (const seg of activeEffectSegments(t)) {
    if (seg.type === "glitch") drawFlashGlitch(seg, t);
    if (seg.type === "scan") drawNeonScan(seg, t);
    if (seg.type === "pulse") drawShockPulse(seg, t);
    if (seg.type === "focus") drawDarkFocus(seg, t);
  }
}

function renderFrame(t) {
  if (!origLoaded) return;
  if (!corners) resetFrameToDefault(false);
  const inverted = isInvertedAtTime(t);
  const baseVideo = inverted ? sty : orig;
  const overlayVideo = inverted ? orig : sty;
  if (baseVideo && baseVideo.readyState >= 2) {
    ctx.drawImage(baseVideo, 0, 0, canvas.width, canvas.height);
  }

  if (styLoaded && Math.abs(sty.currentTime - orig.currentTime) > 0.15) {
    sty.currentTime = orig.currentTime;
  }

  if (corners && presence > 0.01 && styLoaded) {
    drawWindow(corners, overlayVideo);
    drawOutline(corners, t);
  }

  drawEffectOverlay(t);

  scrub.value = String(t);
  updateTimeReadout();
}

function canvasPoint(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((evt.clientX - rect.left) / rect.width) * canvas.width,
    y: ((evt.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function nearestCorner(pt) {
  if (!corners) return -1;
  const hitRadius = Math.max(canvas.width, canvas.height) * 0.055;
  let best = -1;
  let bestDistance = Infinity;
  corners.forEach((corner, index) => {
    const d = dist(pt, corner);
    if (d < bestDistance) {
      bestDistance = d;
      best = index;
    }
  });
  return bestDistance <= hitRadius ? best : -1;
}

canvas.addEventListener("pointerdown", (evt) => {
  if (!origLoaded) return;
  const hit = nearestCorner(canvasPoint(evt));
  if (hit < 0) return;
  activeCorner = hit;
  pointerId = evt.pointerId;
  canvas.setPointerCapture(pointerId);
});

canvas.addEventListener("pointermove", (evt) => {
  if (activeCorner < 0 || !corners) return;
  const pt = canvasPoint(evt);
  corners[activeCorner] = {
    x: clamp(pt.x, 0, canvas.width),
    y: clamp(pt.y, 0, canvas.height),
  };
  presence = 1;
  renderFrame(Number(scrub.value) || orig.currentTime || 0);
});

function releaseCorner() {
  activeCorner = -1;
  pointerId = null;
}

canvas.addEventListener("pointerup", releaseCorner);
canvas.addEventListener("pointercancel", releaseCorner);

async function stepAt(t) {
  if (!origLoaded) {
    return {
      presence: 0,
      corners: null,
    };
  }
  return new Promise((resolve) => {
    const done = () => {
      orig.onseeked = null;
      renderFrame(t);
      resolve({
        presence: +presence.toFixed(2),
        corners: corners
          ? corners.map((p) => [Math.round(p.x), Math.round(p.y)])
          : null,
      });
    };
    orig.onseeked = done;
    orig.currentTime = t;
  });
}

window.__step = stepAt;

async function handleOriginal(file) {
  if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) {
    origInput.value = "";
    setFileName(origFileName, "");
    status("原始视频需要上传 mp4、mov、m4v 或 webm 视频文件。");
    return;
  }
  if (origUrl) URL.revokeObjectURL(origUrl);
  orig.pause();
  clearStylized();
  resetTracker();
  origLoaded = false;
  origName = file.name;
  setFileName(origFileName, origName);
  status(`正在加载原始视频 ${origName}…`);
  origUrl = await loadIntoVideo(orig, file);
  canvas.width = orig.videoWidth;
  canvas.height = orig.videoHeight;
  scrub.max = String(orig.duration || 0);
  scrub.value = "0";
  invertEnabled.checked = false;
  invertStart.value = "0";
  invertEnd.value = String(orig.duration || 0);
  effectSegments = [];
  effectStart.value = "0";
  effectEnd.value = String(Math.min(0.6, orig.duration || 0));
  renderEffectList();
  drawPoster();
  origLoaded = true;
  resetFrameToDefault(false);
  status(`已加载原始视频 ${origName}。可拖动预览里的四个角调整取景框。`);
  syncTimelineBounds();
  refreshControls();
}

async function handleStylized(file) {
  if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) {
    styInput.value = "";
    setFileName(styFileName, "");
    status("风格视频需要上传 mp4、mov、m4v 或 webm 视频文件。");
    return;
  }
  if (styUrl) URL.revokeObjectURL(styUrl);
  clearVideo(sty);
  styLoaded = false;
  styName = file.name;
  setFileName(styFileName, styName);
  status(`正在加载风格视频 ${styName}…`);
  styUrl = await loadIntoVideo(sty, file);
  styLoaded = true;
  syncTimelineBounds();
  updateTimeReadout();
  refreshControls();
}

async function handleAudio(file) {
  if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|wav|aac|ncm)$/i.test(file.name)) {
    audioInput.value = "";
    setFileName(audioFileName, "");
    status("背景音乐只能上传音频文件；不要把视频放到这里。");
    return;
  }
  if (/\.ncm$/i.test(file.name)) {
    audioInput.value = "";
    setFileName(audioFileName, "");
    status("这首歌是网易云 .ncm 加密格式，浏览器不能直接使用。请先转换成 mp3、m4a 或 wav 后再上传。");
    return;
  }
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  clearAudio();
  audioLoaded = false;
  audioName = file.name;
  setFileName(audioFileName, audioName);
  status(`正在加载背景音乐 ${audioName}…`);
  audioUrl = await loadIntoAudio(bgm, file);
  audioLoaded = true;
  bgm.loop = true;
  refreshControls();
}

origInput.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    await handleOriginal(file);
  } catch (err) {
    console.error(err);
    status("原始视频加载失败：" + (err.message || err));
  }
});

styInput.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    await handleStylized(file);
  } catch (err) {
    console.error(err);
    status(
      "风格视频加载失败：" +
      (err.message || err) +
      "。如果这是 mp4，请先用 faststart 重新封装后再上传。"
    );
  }
});

audioInput.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    await handleAudio(file);
  } catch (err) {
    console.error(err);
    audioLoaded = false;
    status("背景音乐加载失败：" + (err.message || err));
  }
});

function playThrough() {
  if (!origLoaded || !styLoaded) return;
  resetTracker();
  previewing = true;
  const startTime = clamp(Number(scrub.value) || 0, 0, getDuration());
  orig.currentTime = startTime;
  sty.currentTime = startTime;
  if (audioLoaded) bgm.currentTime = startTime % Math.max(bgm.duration || 0.001, 0.001);
  scrub.value = String(startTime);
  updateTimeReadout();
  void orig.play().catch((err) => console.warn("原始视频播放失败", err));
  void sty.play().catch((err) => console.warn("风格视频播放失败", err));
  if (audioLoaded) void bgm.play().catch((err) => console.warn("背景音乐播放失败", err));
  requestAnimationFrame(loop);
}

function loop() {
  if (!previewing) return;
  if (!orig.ended) requestAnimationFrame(loop);
  renderFrame(orig.currentTime);
}

btnPlay.addEventListener("click", () => {
  if (exporting || !origLoaded || !styLoaded) return;
  playThrough();
});

btnExport.addEventListener("click", async () => {
  if (exporting || !origLoaded || !styLoaded) return;
  previewing = false;
  orig.pause();
  sty.pause();
  if (audioLoaded) bgm.pause();
  renderFrame(Number(scrub.value) || orig.currentTime || 0);
  status("已定格当前合成画面。普通浏览器可右键保存画布，小工具内可继续预览调整。");
});

btnFrameFit.addEventListener("click", fitFrameToCanvas);
btnFrameReset.addEventListener("click", () => resetFrameToDefault(true));

orig.addEventListener("pause", () => {
  if (!exporting && !orig.ended) {
    previewing = false;
    refreshControls();
  }
  if (!exporting && audioLoaded) bgm.pause();
});

orig.addEventListener("play", () => {
  if (!exporting) {
    previewing = true;
    refreshControls();
  }
});

scrub.addEventListener("input", () => {
  if (!origLoaded) return;
  const t = clamp(Number(scrub.value) || 0, 0, getDuration());
  previewing = false;
  orig.pause();
  refreshControls();
  sty.pause();
  if (audioLoaded) bgm.pause();
  orig.onseeked = () => {
    orig.onseeked = null;
    if (styLoaded) sty.currentTime = t;
    if (audioLoaded) bgm.currentTime = t % Math.max(bgm.duration || 0.001, 0.001);
    renderFrame(t);
  };
  orig.currentTime = t;
  if (styLoaded) sty.currentTime = t;
  if (audioLoaded) bgm.currentTime = t % Math.max(bgm.duration || 0.001, 0.001);
  updateTimeReadout();
  refreshControls();
});

function setInvertPoint(which) {
  if (!origLoaded) return;
  const t = clamp(Number(scrub.value) || orig.currentTime || 0, 0, getDuration());
  invertEnabled.checked = true;
  if (which === "start") {
    invertStart.value = String(t);
  } else {
    invertEnd.value = String(t);
  }
  syncTimelineBounds();
}

function setEffectPoint(which) {
  if (!origLoaded) return;
  const t = clamp(Number(scrub.value) || orig.currentTime || 0, 0, getDuration());
  if (which === "start") {
    effectStart.value = String(t);
    const end = Math.max(t + 0.3, Number(effectEnd.value) || 0);
    effectEnd.value = String(clamp(end, 0, getDuration()));
  } else {
    effectEnd.value = String(t);
  }
  syncTimelineBounds();
}

function addEffectSegment() {
  if (!origLoaded) {
    status("请先上传原始视频。");
    return;
  }
  const duration = getDuration();
  let start = clamp(Number(effectStart.value) || 0, 0, duration);
  let end = clamp(Number(effectEnd.value) || 0, 0, duration);
  if (end < start) [start, end] = [end, start];
  if (end <= start) {
    status("特效片段需要一个有效的起止时间。");
    return;
  }
  effectSegments.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    type: effectType.value,
    start,
    end,
    intensity: Number(effectIntensity.value) || 0.7,
  });
  renderEffectList();
  status(`已添加 ${EFFECT_LABELS[effectType.value]} 片段：${formatTime(start)}-${formatTime(end)}。`);
}

btnSetStart.addEventListener("click", () => setInvertPoint("start"));
btnSetEnd.addEventListener("click", () => setInvertPoint("end"));
btnEffectStart.addEventListener("click", () => setEffectPoint("start"));
btnEffectEnd.addEventListener("click", () => setEffectPoint("end"));
btnAddEffect.addEventListener("click", addEffectSegment);

invertEnabled.addEventListener("change", () => {
  if (invertEnabled.checked && !Number(invertEnd.value)) {
    invertEnd.value = String(getDuration() || 0);
  }
  syncTimelineBounds();
});

invertStart.addEventListener("change", syncTimelineBounds);
invertEnd.addEventListener("change", syncTimelineBounds);
effectStart.addEventListener("change", syncTimelineBounds);
effectEnd.addEventListener("change", syncTimelineBounds);

window.addEventListener("pageshow", () => {
  origInput.value = "";
  styInput.value = "";
  audioInput.value = "";
  setFileName(origFileName, "");
  setFileName(styFileName, "");
  setFileName(audioFileName, "");
  origLoaded = false;
  styLoaded = false;
  audioLoaded = false;
  origName = "";
  styName = "";
  audioName = "";
  if (origUrl) URL.revokeObjectURL(origUrl);
  if (styUrl) URL.revokeObjectURL(styUrl);
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  origUrl = "";
  styUrl = "";
  audioUrl = "";
  clearVideo(orig);
  clearVideo(sty);
  clearAudio();
  scrub.value = "0";
  invertEnabled.checked = false;
  invertStart.value = "0";
  invertEnd.value = "0";
  effectSegments = [];
  effectStart.value = "0";
  effectEnd.value = "0";
  renderEffectList();
  previewing = false;
  resetTracker();
  updateTimeReadout();
  refreshControls();
});

clearVideo(orig);
clearVideo(sty);
clearAudio();
previewing = false;
scrub.value = "0";
setFileName(origFileName, "");
setFileName(styFileName, "");
setFileName(audioFileName, "");
setPreviewState("empty");
updateTimeReadout();
refreshControls();

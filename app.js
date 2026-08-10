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
const invertReadout = document.getElementById("invert-readout");
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
const btnCanvasPlay = document.getElementById("btn-canvas-play");
const btnExport = document.getElementById("btn-export");
const btnFrameFit = document.getElementById("btn-frame-fit");
const btnFrameReset = document.getElementById("btn-frame-reset");
const btnAutoTrack = document.getElementById("btn-auto-track");
const btnLoadDemo = document.getElementById("btn-load-demo");
const editingControls = document.getElementById("editing-controls");
const uploadCards = document.querySelectorAll(".upload[data-file-target]");
const languageButtons = document.querySelectorAll("[data-lang]");

const MEDIAPIPE_TASKS_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const WASM_URL = `${MEDIAPIPE_TASKS_URL}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
const MEDIAPIPE_LOAD_TIMEOUT_MS = 12000;
const DEFAULT_AUDIO_URL = "./bgm.mp3";
const DEMO_ORIGINAL_URL = "./demo-original.mp4";
const DEMO_INSIDE_URL = "./demo-inside.mp4";
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MAX_LOST_FRAMES = 25;
const JUMP_CONFIRM_FRAMES = 2;
const ROUNDED_EXPORT_BG = "#f6f8f1";
const ROUNDED_EXPORT_RADIUS_RATIO = 0.035;
const fxCanvas = document.createElement("canvas");
const fxCtx = fxCanvas.getContext("2d", { willReadFrequently: true });
const pixelCanvas = document.createElement("canvas");
const pixelCtx = pixelCanvas.getContext("2d");
const tintCanvas = document.createElement("canvas");
const tintCtx = tintCanvas.getContext("2d");
const SHARED_EFFECTS = Array.isArray(window.FRAMELAB_EFFECTS) && window.FRAMELAB_EFFECTS.length
  ? window.FRAMELAB_EFFECTS
  : [
      { id: "glitch", labelKey: "effectGlitch" },
      { id: "scan", labelKey: "effectScan" },
      { id: "focus", labelKey: "effectFocus" },
      { id: "feedback", labelKey: "effectFeedback" },
      { id: "rgb", labelKey: "effectRgb" },
      { id: "pixel", labelKey: "effectPixel" },
      { id: "warp", labelKey: "effectWarp" },
      { id: "raster", labelKey: "effectRaster" },
    ];

let origLoaded = false;
let styLoaded = false;
let audioLoaded = false;
let origName = "";
let styName = "";
let audioName = "";
let origUrl = "";
let styUrl = "";
let audioUrl = "";
let usingBundledAudio = false;
let corners = null;
let presence = 0;
let frameActive = false;
let lostFrames = 0;
let jumpFrames = 0;
let exporting = false;
let previewing = false;
let effectSegments = [];
let activeCorner = -1;
let pointerId = null;
let ignoreNextCanvasClick = false;
let landmarker = null;
let landmarkerLoading = null;
let autoTracking = true;
let frameMode = "auto";
let lastVideoTime = -1;

const I18N = {
  zh: {
    metaTitle: "FrameLab 手势视频合成工具",
    metaDescription: "FrameLab 是一款在浏览器本地完成手势取景、双视频合成、特效预览与导出的创作工具。",
    ogTitle: "FrameLab 手势视频合成工具",
    ogDescription: "上传原始视频和风格视频，自动识别双手取景框，在浏览器本地预览并导出。",
    tagline: "上传两段视频，MediaPipe 自动识别手势框",
    appLabel: "手势取景合成工具",
    twitterAria: "打开 JGuli49724 的 X / Twitter",
    emailAria: "发送邮件到 juguli326@gmail.com",
    xiaohongshuAria: "打开 JGuli49724 的小红书主页",
    liveMode: "实时摄像头特效",
    liveModeAria: "打开实时摄像头特效",
    uploadMode: "上传视频",
    modeTabsAria: "创作模式",
    heroTitle: "手势框合成",
    heroSub: "选原片和风格片，MediaPipe 会自动识别双手取景框，也可以拖动四角微调。",
    origAria: "选择原始视频",
    origTitle: "原始视频",
    origMeta: "识别手势 · 作为底片",
    origHint: "建议双手取景框清晰；画布按原视频分辨率合成，不压缩画质。",
    styAria: "选择风格视频",
    styTitle: "框内视频",
    styMeta: "显示在手框内",
    styHint: "它会显示在双手形成的画面内，时长接近原片效果最好。",
    audioAria: "选择背景音乐",
    audioTitle: "bgm",
    audioMeta: "默认音轨",
    audioHint: "内置 bgm，可替换为 MP3、M4A 或 WAV。",
    bundledAudioName: "bgm",
    choose: "选择",
    advanced: "高级",
    advancedSummary: "添加局部特效与时间段",
    effectLabel: "特效片段",
    effectMeta: "叠加在风格视频上",
    effectType: "特效类型",
    effectStart: "开始时间",
    effectEnd: "结束时间",
    effectTypeAria: "特效类型",
    effectStartAria: "特效起点",
    effectEndAria: "特效终点",
    effectIntensityAria: "特效强度",
    effectGlitch: "故障闪切",
    effectScan: "霓虹扫描",
    effectFocus: "暗场聚焦",
    effectFeedback: "反馈残影",
    effectRgb: "RGB 分离",
    effectPixel: "像素海报",
    effectWarp: "液态扭曲",
    effectRaster: "扫描切片",
    setStart: "设为起点",
    setEnd: "设为终点",
    intensity: "强度",
    addEffect: "添加特效",
    effectsEmpty: "尚未添加特效片段",
    preview: "预览",
    demoKicker: "示例成片",
    emptyTitle: "先看效果，再开始创作",
    emptyBody: "加载两段示例视频，直接体验手势框合成。",
    loadDemo: "加载示例视频",
    timeline: "播放进度",
    scrubAria: "调整播放进度",
    play: "播放",
    pause: "暂停",
    exportVideo: "导出最终视频",
    frameToolsAria: "帧定位方式",
    frameMode: "帧定位方式",
    frameModeHelp: "选择手框如何出现",
    autoTrack: "自动识别",
    manualFrame: "手动取景框",
    fitFrame: "铺满画面",
    autoTrackHelp: "自动追踪双手形成的画面",
    manualFrameHelp: "拖动四角自定义画面位置",
    fitFrameHelp: "让框内视频充满整个画面",
    maskAria: "反转内外时段",
    invertMask: "反转内外",
    invertHelp: "框外显示框内视频",
    exportNeedsVideos: "请先上传两段视频",
    footer: "FrameLab · MediaPipe 手势识别 · 原分辨率画布 · 建议使用最新版 Chrome 或 Edge",
    fileNone: "未选择",
    durationDetail: "原始 {orig} · 风格 {sty}",
    invertOff: "未启用",
    exporting: "正在导出，需要完整播放一遍视频…",
    previewing: "正在预览…",
    ready: "已加载 {orig} 和 {sty}{audio}{tracking}",
    readyAudio: "，音乐 {audio}",
    trackingAuto: "，MediaPipe 会自动识别手势框。",
    trackingManual: "，可以手动拖动取景框。",
    origOnly: "已加载原始视频 {name}，请再上传风格视频。",
    styOnly: "已加载风格视频 {name}，请再上传原始视频。",
    needBoth: "请先上传两个视频。",
    effectRemoved: "已移除特效片段。",
    readFileFail: "无法读取 {name}{detail}",
    mediaPipeLoading: "正在加载 MediaPipe 手势识别…",
    mediaPipeUnavailable: "MediaPipe 暂时不可用，已切换为手动取景框。",
    frameReset: "已重置取景框，可拖动四个角微调。",
    frameFit: "已铺满取景框，可继续拖动角点调整。",
    needOriginal: "请先上传原始视频。",
    autoTrackingOn: "已切回 MediaPipe 自动识别。",
    mediaPipeManualKept: "MediaPipe 暂时不可用，已保留手动取景框。",
    invalidOriginal: "原始视频需要上传 mp4、mov、m4v 或 webm 视频文件。",
    loadingOriginal: "正在加载原始视频 {name}…",
    invalidStylized: "风格视频需要上传 mp4、mov、m4v 或 webm 视频文件。",
    loadingStylized: "正在加载风格视频 {name}…",
    invalidAudio: "背景音乐只能上传音频文件；不要把视频放到这里。",
    ncmUnsupported: "这首歌是网易云 .ncm 加密格式，浏览器不能直接使用。请先转换成 mp3、m4a 或 wav 后再上传。",
    loadingAudio: "正在加载背景音乐 {name}…",
    loadingBundledAudio: "正在加载预置背景音乐…",
    bundledAudioFail: "预置音乐资源无法加载",
    originalLoadFail: "原始视频加载失败：{error}",
    stylizedLoadFail: "风格视频加载失败：{error}。如果这是 mp4，请先用 faststart 重新封装后再上传。",
    audioLoadFail: "背景音乐加载失败：{error}",
    exportUnsupported: "当前浏览器不支持视频导出，请使用最新版 Chrome 或 Edge。",
    exportFail: "导出失败，请重试或更换最新版 Chrome / Edge。",
    exportDone: "已导出 {name}。",
    invalidEffectRange: "特效片段需要一个有效的起止时间。",
    effectAdded: "已添加 {effect} 片段：{start}-{end}。",
    demoLoaded: "示例视频已加载，可以直接预览或调整。",
  },
  en: {
    metaTitle: "FrameLab Hand-Frame Video Composer",
    metaDescription: "FrameLab is an in-browser tool for hand-frame tracking, dual-video compositing, effect previews, and local export.",
    ogTitle: "FrameLab Hand-Frame Video Composer",
    ogDescription: "Upload an original video and a style video, auto-detect the hand frame, preview locally, and export in the browser.",
    tagline: "Upload two videos. MediaPipe detects the hand frame automatically.",
    appLabel: "Hand-frame video compositing tool",
    twitterAria: "Open JGuli49724 on X / Twitter",
    emailAria: "Email juguli326@gmail.com",
    xiaohongshuAria: "Open JGuli49724 on Xiaohongshu",
    liveMode: "Live Camera Effects",
    liveModeAria: "Open live camera effects",
    uploadMode: "Upload Video",
    modeTabsAria: "Creation modes",
    heroTitle: "Hand-Frame Composer",
    heroSub: "Choose an original clip and a style clip. MediaPipe can detect the two-hand frame automatically, and you can fine-tune the four corners.",
    origAria: "Choose original video",
    origTitle: "Original Video",
    origMeta: "Detects hands · base layer",
    origHint: "Use footage where the two-hand frame is clear. The canvas keeps the original video resolution.",
    styAria: "Choose style video",
    styTitle: "Inside Video",
    styMeta: "Shows inside the hand frame",
    styHint: "This clip appears inside the hand frame. A similar duration works best.",
    audioAria: "Choose background music",
    audioTitle: "BGM",
    audioMeta: "Default track",
    audioHint: "Includes BGM. Replace it with an MP3, M4A, or WAV file.",
    bundledAudioName: "BGM",
    choose: "Choose",
    advanced: "Advanced",
    advancedSummary: "Add effects and time ranges",
    effectLabel: "Effect Segment",
    effectMeta: "overlays the style video",
    effectType: "Effect type",
    effectStart: "Start time",
    effectEnd: "End time",
    effectTypeAria: "Effect type",
    effectStartAria: "Effect start time",
    effectEndAria: "Effect end time",
    effectIntensityAria: "Effect intensity",
    effectGlitch: "Glitch Cut",
    effectScan: "Neon Scan",
    effectFocus: "Dark Focus",
    effectFeedback: "Feedback Echo",
    effectRgb: "RGB Split",
    effectPixel: "Pixel Poster",
    effectWarp: "Liquid Warp",
    effectRaster: "Raster Slice",
    setStart: "Set Start",
    setEnd: "Set End",
    intensity: "Intensity",
    addEffect: "Add Effect",
    effectsEmpty: "No effect segments yet",
    preview: "Preview",
    demoKicker: "Sample output",
    emptyTitle: "See the result first",
    emptyBody: "Load two sample clips to try hand-frame compositing right away.",
    loadDemo: "Load sample videos",
    timeline: "Playback Progress",
    scrubAria: "Adjust playback progress",
    play: "Play",
    pause: "Pause",
    exportVideo: "Export Final Video",
    frameToolsAria: "Frame placement mode",
    frameMode: "Frame placement",
    frameModeHelp: "Choose how the hand frame appears",
    autoTrack: "Auto Track",
    manualFrame: "Manual Frame",
    fitFrame: "Fill Screen",
    autoTrackHelp: "Follow the frame created by both hands",
    manualFrameHelp: "Drag four corners to place the frame yourself",
    fitFrameHelp: "Let the inside video fill the whole image",
    maskAria: "Invert inside and outside range",
    invertMask: "Invert inside and outside",
    invertHelp: "Show the inside video outside the frame",
    exportNeedsVideos: "Upload two videos to export",
    footer: "FrameLab · MediaPipe hand tracking · original-resolution canvas · Latest Chrome or Edge recommended",
    fileNone: "Not selected",
    durationDetail: "Original {orig} · Style {sty}",
    invertOff: "Off",
    exporting: "Exporting. The video needs to play through once…",
    previewing: "Previewing…",
    ready: "Loaded {orig} and {sty}{audio}{tracking}",
    readyAudio: ", music {audio}",
    trackingAuto: ". MediaPipe will detect the hand frame automatically.",
    trackingManual: ". You can drag the frame corners manually.",
    origOnly: "Loaded original video {name}. Please upload a style video.",
    styOnly: "Loaded style video {name}. Please upload an original video.",
    needBoth: "Please upload two videos first.",
    effectRemoved: "Effect segment removed.",
    readFileFail: "Could not read {name}{detail}",
    mediaPipeLoading: "Loading MediaPipe hand tracking…",
    mediaPipeUnavailable: "MediaPipe is temporarily unavailable. Switched to manual framing.",
    frameReset: "Frame reset. Drag the four corners to fine-tune it.",
    frameFit: "Frame filled the canvas. You can keep adjusting the corners.",
    needOriginal: "Please upload an original video first.",
    autoTrackingOn: "Switched back to MediaPipe auto tracking.",
    mediaPipeManualKept: "MediaPipe is temporarily unavailable. Keeping the manual frame.",
    invalidOriginal: "Original video must be an mp4, mov, m4v, or webm file.",
    loadingOriginal: "Loading original video {name}…",
    invalidStylized: "Style video must be an mp4, mov, m4v, or webm file.",
    loadingStylized: "Loading style video {name}…",
    invalidAudio: "Background music must be an audio file. Do not upload video here.",
    ncmUnsupported: "This .ncm file is encrypted and cannot be used directly in the browser. Convert it to mp3, m4a, or wav first.",
    loadingAudio: "Loading background music {name}…",
    loadingBundledAudio: "Loading preset background music…",
    bundledAudioFail: "Preset music could not be loaded",
    originalLoadFail: "Original video failed to load: {error}",
    stylizedLoadFail: "Style video failed to load: {error}. If this is an mp4, repackage it with faststart and upload again.",
    audioLoadFail: "Background music failed to load: {error}",
    exportUnsupported: "This browser does not support video export. Use the latest Chrome or Edge.",
    exportFail: "Export failed. Try again or use the latest Chrome / Edge.",
    exportDone: "Exported {name}.",
    invalidEffectRange: "Effect segment needs a valid start and end time.",
    effectAdded: "Added {effect} segment: {start}-{end}.",
    demoLoaded: "Sample videos loaded. Preview or adjust them directly.",
  },
};

const EFFECT_LABEL_KEYS = Object.fromEntries(SHARED_EFFECTS.map((item) => [item.id, item.labelKey]));

const LANGUAGE_PREFERENCE_KEY = "framelab-lang-v2";

function normalizeLang(value) {
  return String(value || "").toLowerCase().startsWith("en") ? "en" : "zh";
}

function getInitialLang() {
  const urlLang = new URLSearchParams(window.location.search).get("lang");
  if (urlLang) return normalizeLang(urlLang);
  const storedLang = localStorage.getItem(LANGUAGE_PREFERENCE_KEY);
  if (storedLang) return normalizeLang(storedLang);
  return "zh";
}

let currentLang = getInitialLang();

function t(key, values = {}) {
  const template = I18N[currentLang][key] || I18N.zh[key] || key;
  return template.replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
}

function setMeta(selector, value) {
  const el = document.head.querySelector(selector);
  if (el) el.setAttribute("content", value);
}

function effectLabel(type) {
  return t(EFFECT_LABEL_KEYS[type] || type);
}

function populateEffectOptions() {
  const selected = effectType.value || SHARED_EFFECTS[0]?.id || "glitch";
  effectType.innerHTML = "";
  for (const item of SHARED_EFFECTS) {
    const option = document.createElement("option");
    option.value = item.id;
    option.dataset.i18n = item.labelKey;
    option.textContent = t(item.labelKey);
    effectType.appendChild(option);
  }
  effectType.value = SHARED_EFFECTS.some((item) => item.id === selected)
    ? selected
    : SHARED_EFFECTS[0]?.id || "glitch";
}

function trackEvent(name, data = {}) {
  try {
    const payload = {
      lang: currentLang,
      ...data,
    };
    if (typeof window.trackAnalyticsEvent === "function") {
      window.trackAnalyticsEvent(name, payload);
      return;
    }
    window.va?.("event", { name, data: payload });
  } catch (err) {
    console.warn("Analytics event skipped", err);
  }
}

function fileExtension(file) {
  const match = /\.([a-z0-9]+)$/i.exec(file.name || "");
  return match ? match[1].toLowerCase() : "unknown";
}

function fileSizeBucket(file) {
  const mb = file.size / 1024 / 1024;
  if (mb < 10) return "<10mb";
  if (mb < 50) return "10-50mb";
  if (mb < 200) return "50-200mb";
  return "200mb+";
}

function roundedSeconds(value) {
  return Math.round(Number(value) || 0);
}

function trackFileUploaded(kind, file, mediaEl) {
  const data = {
    kind,
    extension: fileExtension(file),
    size_bucket: fileSizeBucket(file),
  };
  if (mediaEl && Number.isFinite(mediaEl.duration)) {
    data.duration_sec = roundedSeconds(mediaEl.duration);
  }
  if (mediaEl && mediaEl.videoWidth && mediaEl.videoHeight) {
    data.resolution = `${mediaEl.videoWidth}x${mediaEl.videoHeight}`;
  }
  trackEvent("File Uploaded", data);
}

function commonProjectMetrics() {
  return {
    duration_sec: roundedSeconds(getDuration()),
    has_audio: audioLoaded,
    effects_count: effectSegments.length,
    auto_tracking: autoTracking,
    invert_enabled: invertEnabled.checked,
  };
}

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

function traceRoundedRect(x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function ensureCanvasSize(targetCanvas, targetCtx, w, h) {
  if (targetCanvas.width !== w || targetCanvas.height !== h) {
    targetCanvas.width = w;
    targetCanvas.height = h;
  }
  if (targetCtx) {
    targetCtx.imageSmoothingEnabled = true;
    targetCtx.imageSmoothingQuality = "high";
  }
}

function snapshotCanvas() {
  ensureCanvasSize(fxCanvas, fxCtx, canvas.width, canvas.height);
  fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
  fxCtx.drawImage(canvas, 0, 0);
  return fxCanvas;
}

function tintedSource(source, color) {
  ensureCanvasSize(tintCanvas, tintCtx, canvas.width, canvas.height);
  tintCtx.clearRect(0, 0, tintCanvas.width, tintCanvas.height);
  tintCtx.globalCompositeOperation = "source-over";
  tintCtx.drawImage(source, 0, 0);
  tintCtx.globalCompositeOperation = "source-atop";
  tintCtx.fillStyle = color;
  tintCtx.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
  tintCtx.globalCompositeOperation = "source-over";
  return tintCanvas;
}

function setFileName(el, name) {
  el.textContent = name || t("fileNone");
  el.title = name || "";
}

function applyLanguage() {
  document.documentElement.lang = currentLang === "en" ? "en" : "zh-CN";
  document.title = t("metaTitle");
  setMeta("meta[name='description']", t("metaDescription"));
  setMeta("meta[property='og:title']", t("ogTitle"));
  setMeta("meta[property='og:description']", t("ogDescription"));
  populateEffectOptions();

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.dataset.i18nTitle));
  });
  languageButtons.forEach((button) => {
    const pressed = button.dataset.lang === currentLang;
    button.setAttribute("aria-pressed", String(pressed));
  });
  effectList.dataset.emptyMessage = t("effectsEmpty");

  if (!origName) setFileName(origFileName, "");
  if (!styName) setFileName(styFileName, "");
  if (usingBundledAudio) {
    audioName = t("bundledAudioName");
    setFileName(audioFileName, audioName);
  } else if (!audioName) {
    setFileName(audioFileName, "");
  }
  updateTimeReadout();
  updateInvertReadout();
  renderEffectList();
  refreshControls();
}

function setLanguage(lang) {
  currentLang = normalizeLang(lang);
  localStorage.setItem(LANGUAGE_PREFERENCE_KEY, currentLang);
  applyLanguage();
  trackEvent("Language Changed", { selected_lang: currentLang });
}

languageButtons.forEach((button) => {
  button.addEventListener("click", () => setLanguage(button.dataset.lang));
});

document.querySelectorAll(".social-link").forEach((link) => {
  link.addEventListener("click", () => {
    const href = link.getAttribute("href") || "";
    trackEvent("Contact Clicked", {
      target: link.dataset.contactTarget || (href.startsWith("mailto:") ? "email" : "x"),
    });
  });
});

function openFilePicker(card) {
  const input = document.getElementById(card.dataset.fileTarget);
  if (input) input.click();
}

uploadCards.forEach((card) => {
  card.addEventListener("click", (evt) => {
    if (evt.target.closest("input[type='file']")) return;
    if (evt.target.closest("label.file-picker")) return;
    openFilePicker(card);
  });
  card.addEventListener("keydown", (evt) => {
    if (evt.key !== "Enter" && evt.key !== " ") return;
    evt.preventDefault();
    openFilePicker(card);
  });
});

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
  durationDetail.textContent = t("durationDetail", {
    orig: formatTime(duration),
    sty: formatTime(getStylizedDuration()),
  });
}

function updateInvertReadout() {
  if (!invertEnabled.checked) {
    invertReadout.textContent = t("invertOff");
    return;
  }
  invertReadout.textContent = `${formatTime(invertStart.value)} - ${formatTime(invertEnd.value)}`;
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
  updateInvertReadout();
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

function refreshFrameModeButtons() {
  btnAutoTrack.classList.toggle("is-active", frameMode === "auto" && !!landmarker);
  btnFrameReset.classList.toggle("is-active", frameMode === "manual");
  btnFrameFit.classList.toggle("is-active", frameMode === "fill");
}

function refreshControls() {
  const playbackReady = origLoaded && !exporting;
  const compositeReady = origLoaded && styLoaded && !exporting;
  btnCanvasPlay.disabled = !playbackReady;
  btnExport.disabled = !compositeReady;
  btnExport.title = compositeReady ? t("exportVideo") : t("exportNeedsVideos");
  btnAutoTrack.disabled = !origLoaded;
  btnFrameReset.disabled = !origLoaded;
  btnFrameFit.disabled = !origLoaded;
  invertEnabled.disabled = !origLoaded;
  btnSetStart.disabled = !origLoaded;
  btnSetEnd.disabled = !origLoaded;
  scrub.disabled = !origLoaded;
  // Keep the workflow visible before upload. Individual controls remain disabled
  // until the original video provides a duration and a valid preview surface.
  editingControls.hidden = false;
  refreshFrameModeButtons();
  previewArea.classList.toggle("ready", origLoaded);
  emptyPreview.hidden = origLoaded;
  setPreviewState(exporting ? "exporting" : previewing ? "playing" : playbackReady ? "ready" : "empty");
  if (exporting) {
    status(t("exporting"));
  } else if (previewing) {
    status(t("previewing"));
  } else if (origLoaded && styLoaded) {
    status(
      t("ready", {
        orig: origName,
        sty: styName,
        audio: audioLoaded ? t("readyAudio", { audio: audioName }) : "",
        tracking: autoTracking && landmarker ? t("trackingAuto") : t("trackingManual"),
      })
    );
  } else if (origLoaded) {
    status(t("origOnly", { name: origName }));
  } else if (styLoaded) {
    status(t("styOnly", { name: styName }));
  } else {
    status("");
  }
}

function resetTracker() {
  corners = null;
  presence = 0;
  frameActive = false;
  lostFrames = 0;
  jumpFrames = 0;
  lastVideoTime = -1;
}

function renderEffectList() {
  effectList.innerHTML = "";
  for (const seg of effectSegments) {
    const chip = document.createElement("div");
    chip.className = "effect-chip";
    chip.innerHTML = `<span>${effectLabel(seg.type)} ${formatTime(seg.start)}-${formatTime(seg.end)}</span>`;
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "×";
    del.addEventListener("click", () => {
      effectSegments = effectSegments.filter((item) => item.id !== seg.id);
      renderEffectList();
      status(t("effectRemoved"));
      trackEvent("Effect Removed", {
        effect_type: seg.type,
        effect_duration_sec: roundedSeconds(seg.end - seg.start),
      });
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
      videoEl.onloadeddata = null;
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
      const detail = videoEl.error && videoEl.error.message ? `: ${videoEl.error.message}` : "";
      reject(new Error(t("readFileFail", { name: file.name, detail })));
    };
    videoEl.onloadeddata = done;
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
      reject(new Error(t("readFileFail", { name: file.name, detail: "" })));
    };
    audioEl.src = url;
  });
}

function seekVideo(videoEl, time) {
  if (!videoEl || videoEl.readyState < 2) return Promise.resolve();
  const duration = Number.isFinite(videoEl.duration) ? videoEl.duration : 0;
  const target = clamp(time, 0, Math.max(0, duration - 0.01));
  if (Math.abs(videoEl.currentTime - target) < 0.01) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    videoEl.addEventListener("seeked", done, { once: true });
    videoEl.currentTime = target;
  });
}

async function showUploadPreview(time = 0) {
  if (!origLoaded) return;
  const target = clamp(time, 0, getDuration());
  await seekVideo(orig, target);
  if (styLoaded) await seekVideo(sty, target);
  if (!corners) {
    corners = defaultQuad();
    presence = 1;
    frameActive = true;
  }
  renderFrame(target);
}

async function initLandmarker() {
  if (landmarker) return landmarker;
  if (landmarkerLoading) return landmarkerLoading;
  status(t("mediaPipeLoading"));
  const loadTask = import(`${MEDIAPIPE_TASKS_URL}/vision_bundle.mjs`)
    .then(async ({ FilesetResolver, HandLandmarker }) => {
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      try {
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });
      } catch (err) {
        console.warn("GPU delegate unavailable, falling back to CPU", err);
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });
      }
      return landmarker;
    });
  const timeoutTask = new Promise((_, reject) => {
    setTimeout(() => reject(new Error("MediaPipe load timeout")), MEDIAPIPE_LOAD_TIMEOUT_MS);
  });
  landmarkerLoading = Promise.race([loadTask, timeoutTask])
    .catch((err) => {
      console.warn("MediaPipe load failed", err);
      landmarkerLoading = null;
      status(t("mediaPipeUnavailable"));
      return null;
    });
  return landmarkerLoading;
}

function toPixel(lm) {
  return { x: lm.x * canvas.width, y: lm.y * canvas.height };
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

function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a / 2);
}

function computeQuad(hands) {
  if (hands.length !== 2) return null;
  const info = hands.map((lm) => ({
    index: toPixel(lm[INDEX_TIP]),
    thumb: toPixel(lm[THUMB_TIP]),
    wristX: toPixel(lm[WRIST]).x,
    scale: dist(toPixel(lm[WRIST]), toPixel(lm[MIDDLE_MCP])) + 1,
  }));
  const needed = frameActive ? 0.2 : 0.75;
  for (const hd of info) {
    if (dist(hd.thumb, hd.index) < hd.scale * needed) return null;
  }
  info.sort((a, b) => a.wristX - b.wristX);
  const [A, B] = info;
  const pts = [A.index, B.index, B.thumb, A.thumb];
  const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
  const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
  const hull = [...pts].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
  const minArea = frameActive ? 0.0005 : 0.005;
  if (polygonArea(hull) < canvas.width * canvas.height * minArea) return null;
  return pts;
}

function updateTracker(hands) {
  const target = computeQuad(hands);
  if (target) {
    if (!corners) {
      corners = target;
      presence = 1;
      frameActive = true;
      lostFrames = 0;
      jumpFrames = 0;
      return;
    }
    const moved = target.reduce((s, p, i) => s + dist(p, corners[i]), 0) / 4;
    if (moved > canvas.width * 0.3 && ++jumpFrames < JUMP_CONFIRM_FRAMES) {
      if (++lostFrames > MAX_LOST_FRAMES) presence = Math.max(0, presence - 0.05);
      return;
    }
    lostFrames = 0;
    frameActive = true;
    jumpFrames = 0;
    const alpha = Math.min(0.85, Math.max(0.35, moved / (canvas.width * 0.05)));
    corners = corners.map((c, i) => lerpPt(c, target[i], alpha));
    presence = Math.min(1, presence + 0.12);
  } else if (corners && ++lostFrames <= MAX_LOST_FRAMES) {
    presence = Math.min(1, presence + 0.04);
  } else {
    presence = Math.max(0, presence - 0.05);
    if (presence === 0) {
      corners = null;
      frameActive = false;
      jumpFrames = 0;
    }
  }
}

function resetFrameToDefault(showStatus = true) {
  autoTracking = false;
  frameMode = "manual";
  corners = defaultQuad();
  presence = 1;
  frameActive = true;
  if (showStatus) status(t("frameReset"));
  refreshFrameModeButtons();
  renderFrame(Number(scrub.value) || orig.currentTime || 0);
}

function fitFrameToCanvas() {
  autoTracking = false;
  frameMode = "fill";
  corners = [
    { x: canvas.width * 0.08, y: canvas.height * 0.08 },
    { x: canvas.width * 0.92, y: canvas.height * 0.08 },
    { x: canvas.width * 0.92, y: canvas.height * 0.92 },
    { x: canvas.width * 0.08, y: canvas.height * 0.92 },
  ];
  presence = 1;
  frameActive = true;
  status(t("frameFit"));
  refreshFrameModeButtons();
  renderFrame(Number(scrub.value) || orig.currentTime || 0);
}

async function enableAutoTracking() {
  if (!origLoaded) {
    status(t("needOriginal"));
    return;
  }
  autoTracking = true;
  frameMode = "auto";
  resetTracker();
  const mp = await initLandmarker();
  if (mp) {
    status(t("autoTrackingOn"));
  } else {
    autoTracking = false;
    frameMode = "manual";
    corners = defaultQuad();
    presence = 1;
    frameActive = true;
    status(t("mediaPipeManualKept"));
  }
  renderFrame(Number(scrub.value) || orig.currentTime || 0);
  refreshControls();
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
  const source = snapshotCanvas();
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  for (let i = 0; i < 14; i++) {
    const y = ((i * 83 + Math.floor(t * 90) * 17) % canvas.height);
    const h = 7 + ((i * 17) % 34);
    const xShift = (Math.sin(t * 80 + i) * 32 + Math.cos(t * 37 + i) * 20) * level;
    ctx.globalAlpha = 0.2 * level;
    ctx.drawImage(source, 0, y, canvas.width, h, xShift, y, canvas.width, h);
  }
  ctx.globalAlpha = 0.16 * level;
  ctx.fillStyle = Math.floor(t * 18) % 2 ? "#ff6b5e" : "#4bd8ff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.22 * level;
  ctx.drawImage(tintedSource(source, "rgb(255,40,72)"), -18 * level, 0);
  ctx.drawImage(tintedSource(source, "rgb(45,220,255)"), 18 * level, 0);
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
  ctx.globalAlpha = 0.18 * seg.intensity;
  ctx.fillStyle = "#fff";
  const stripe = Math.max(4, Math.round(canvas.height * 0.008));
  for (let row = -stripe; row < canvas.height + stripe; row += stripe * 3) {
    ctx.fillRect(0, row + ((t * 120) % (stripe * 3)), canvas.width, 1.5);
  }
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

function drawFeedbackEcho(seg, t) {
  const p = segmentProgress(seg, t);
  const level = seg.intensity * (0.72 + 0.28 * Math.sin(p * Math.PI));
  const source = snapshotCanvas();
  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.filter = `blur(${1 + 2.5 * level}px) saturate(${120 + 80 * level}%) contrast(${110 + 45 * level}%)`;
  for (let i = 1; i <= 4; i++) {
    const drift = i * level;
    const scale = 1 + 0.016 * i + 0.02 * level;
    const sw = w * scale;
    const sh = h * scale;
    const dx = (w - sw) / 2 + Math.sin(t * 2.4 + i) * w * 0.012 * drift;
    const dy = (h - sh) / 2 + Math.cos(t * 1.9 + i) * h * 0.014 * drift;
    ctx.globalAlpha = (0.15 / i) * level;
    ctx.drawImage(source, dx, dy, sw, sh);
  }
  ctx.filter = "none";
  ctx.globalCompositeOperation = "multiply";
  ctx.globalAlpha = 0.16 * level;
  ctx.fillStyle = p > 0.5 ? "#0a1712" : "#f1ffcc";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawRgbSplit(seg, t) {
  const p = segmentProgress(seg, t);
  const level = seg.intensity * (0.65 + 0.35 * Math.sin(p * Math.PI));
  const source = snapshotCanvas();
  const w = canvas.width;
  const h = canvas.height;
  const amp = Math.max(8, w * 0.035) * level;
  ctx.save();
  ctx.globalCompositeOperation = "screen";
  ctx.filter = `saturate(${140 + 90 * level}%) contrast(${110 + 35 * level}%)`;
  ctx.globalAlpha = 0.38 * level;
  ctx.drawImage(tintedSource(source, "rgb(255, 40, 70)"), -amp, Math.sin(t * 8) * amp * 0.12, w, h);
  ctx.drawImage(tintedSource(source, "rgb(35, 255, 190)"), amp * 0.55, Math.cos(t * 7) * amp * 0.1, w, h);
  ctx.drawImage(tintedSource(source, "rgb(45, 95, 255)"), Math.sin(t * 5) * amp * 0.25, amp * 0.32, w, h);
  ctx.filter = "none";
  ctx.globalAlpha = 0.14 * level;
  ctx.fillStyle = Math.floor(t * 12) % 2 ? "#ff2a46" : "#28e4ff";
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function drawPixelPoster(seg, t) {
  const p = segmentProgress(seg, t);
  const level = seg.intensity * (0.8 + 0.2 * Math.sin(p * Math.PI));
  const source = snapshotCanvas();
  const w = canvas.width;
  const h = canvas.height;
  const block = Math.max(7, Math.round(8 + 34 * level));
  const pw = Math.max(24, Math.round(w / block));
  const ph = Math.max(24, Math.round(h / block));
  ensureCanvasSize(pixelCanvas, pixelCtx, pw, ph);
  pixelCtx.imageSmoothingEnabled = true;
  pixelCtx.clearRect(0, 0, pw, ph);
  pixelCtx.filter = `contrast(${130 + 70 * level}%) saturate(${130 + 80 * level}%)`;
  pixelCtx.drawImage(source, 0, 0, pw, ph);
  pixelCtx.filter = "none";

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.55 + 0.35 * level;
  ctx.filter = `contrast(${115 + 50 * level}%) saturate(${120 + 70 * level}%)`;
  ctx.drawImage(pixelCanvas, 0, 0, w, h);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "overlay";
  ctx.globalAlpha = 0.18 * level;
  for (let x = -block; x < w + block; x += block * 2) {
    ctx.fillStyle = (Math.floor(x / block + t * 12) % 2) ? "#ffffff" : "#0b211a";
    ctx.fillRect(x, 0, block, h);
  }
  ctx.restore();
}

function drawLiquidWarp(seg, t) {
  const p = segmentProgress(seg, t);
  const level = seg.intensity * (0.65 + 0.35 * Math.sin(p * Math.PI));
  const source = snapshotCanvas();
  const w = canvas.width;
  const h = canvas.height;
  const slices = 44;
  const sliceH = Math.max(2, Math.ceil(h / slices));
  const amp = Math.max(12, w * 0.045) * level;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = `saturate(${115 + 55 * level}%)`;
  for (let i = 0; i < slices; i++) {
    const y = i * sliceH;
    const phase = y * 0.018 + t * 5.2 + p * Math.PI * 2;
    const shift = Math.sin(phase) * amp + Math.sin(phase * 0.43 - t * 3.7) * amp * 0.45;
    ctx.drawImage(source, 0, y, w, sliceH + 1, shift, y, w, sliceH + 1);
  }
  ctx.filter = "none";
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.18 * level;
  ctx.strokeStyle = "#c7f15b";
  ctx.lineWidth = Math.max(2, w * 0.002);
  for (let i = 0; i < 4; i++) {
    const r = (0.15 + ((p + i * 0.21) % 1) * 0.72) * Math.hypot(w, h);
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRasterSlice(seg, t) {
  const p = segmentProgress(seg, t);
  const level = seg.intensity * (0.7 + 0.3 * Math.sin(p * Math.PI));
  const source = snapshotCanvas();
  const w = canvas.width;
  const h = canvas.height;
  const rows = 28;
  const amp = Math.max(10, w * 0.05) * level;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (let i = 0; i < rows; i++) {
    const y = Math.floor(((i / rows) * h + t * 90 + i * 17) % h);
    const sliceH = 4 + ((i * 11) % 32);
    const gate = Math.sin(t * 9 + i * 1.7) > -0.2 ? 1 : 0.25;
    const shift = (Math.sin(t * 6.4 + i * 2.1) * amp + Math.cos(i * 5.3) * amp * 0.45) * gate;
    ctx.globalAlpha = 0.35 + 0.55 * level;
    ctx.drawImage(source, 0, y, w, sliceH, shift, y, w, sliceH);
  }
  ctx.globalCompositeOperation = "screen";
  ctx.globalAlpha = 0.22 * level;
  ctx.fillStyle = "#ffffff";
  const scanY = (p * h + Math.sin(t * 4) * h * 0.06) % h;
  ctx.fillRect(0, scanY, w, Math.max(2, h * 0.01));
  ctx.fillStyle = "#28e4ff";
  ctx.fillRect((Math.sin(t * 2.8) * 0.5 + 0.5) * w, 0, Math.max(3, w * 0.006), h);
  ctx.restore();
}

function drawEffectOverlay(t) {
  for (const seg of activeEffectSegments(t)) {
    if (seg.type === "glitch") drawFlashGlitch(seg, t);
    if (seg.type === "scan") drawNeonScan(seg, t);
    if (seg.type === "focus") drawDarkFocus(seg, t);
    if (seg.type === "feedback") drawFeedbackEcho(seg, t);
    if (seg.type === "rgb") drawRgbSplit(seg, t);
    if (seg.type === "pixel") drawPixelPoster(seg, t);
    if (seg.type === "warp") drawLiquidWarp(seg, t);
    if (seg.type === "raster") drawRasterSlice(seg, t);
  }
}

function renderFrame(t) {
  if (!origLoaded) return;
  const w = canvas.width;
  const h = canvas.height;
  const radius = Math.max(
    18,
    Math.min(48, Math.round(Math.min(w, h) * ROUNDED_EXPORT_RADIUS_RATIO))
  );
  ctx.save();
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = ROUNDED_EXPORT_BG;
  ctx.fillRect(0, 0, w, h);
  traceRoundedRect(0, 0, w, h, radius);
  ctx.clip();
  const inverted = isInvertedAtTime(t);
  const baseVideo = inverted ? sty : orig;
  const overlayVideo = inverted ? orig : sty;
  if (baseVideo && baseVideo.readyState >= 2) {
    ctx.drawImage(baseVideo, 0, 0, w, h);
  }

  if (autoTracking && landmarker && orig.currentTime !== lastVideoTime) {
    lastVideoTime = orig.currentTime;
    const res = landmarker.detectForVideo(orig, performance.now());
    updateTracker(res.landmarks || []);
  } else if (!corners && !autoTracking) {
    corners = defaultQuad();
    presence = 1;
    frameActive = true;
  }

  if (styLoaded && Math.abs(sty.currentTime - orig.currentTime) > 0.15) {
    sty.currentTime = orig.currentTime;
  }

  if (corners && presence > 0.01 && styLoaded) {
    drawWindow(corners, overlayVideo);
    drawOutline(corners, t);
  }

  drawEffectOverlay(t);
  ctx.restore();
  ctx.save();
  traceRoundedRect(0.5, 0.5, w - 1, h - 1, radius);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "rgba(7, 16, 12, .10)";
  ctx.stroke();
  ctx.restore();

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
  ignoreNextCanvasClick = hit >= 0;
  if (hit < 0) return;
  autoTracking = false;
  frameMode = "manual";
  refreshFrameModeButtons();
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
previewArea.addEventListener("click", (evt) => {
  if (evt.target.closest(".duration-badge")) return;
  if (ignoreNextCanvasClick) {
    ignoreNextCanvasClick = false;
    return;
  }
  togglePreview();
});

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
    status(t("invalidOriginal"));
    trackEvent("Upload Rejected", {
      kind: "original",
      reason: "invalid_video_type",
      extension: fileExtension(file),
      size_bucket: fileSizeBucket(file),
    });
    return;
  }
  if (origUrl) URL.revokeObjectURL(origUrl);
  orig.pause();
  clearStylized();
  resetTracker();
  origLoaded = false;
  origName = file.name;
  setFileName(origFileName, origName);
  status(t("loadingOriginal", { name: origName }));
  origUrl = await loadIntoVideo(orig, file);
  canvas.width = orig.videoWidth;
  canvas.height = orig.videoHeight;
  scrub.max = String(orig.duration || 0);
  trackFileUploaded("original", file, orig);
  scrub.value = "0";
  invertEnabled.checked = false;
  invertStart.value = "0";
  invertEnd.value = String(orig.duration || 0);
  effectSegments = [];
  effectStart.value = "0";
  effectEnd.value = String(Math.min(1.2, orig.duration || 0));
  renderEffectList();
  origLoaded = true;
  autoTracking = false;
  frameMode = "manual";
  corners = defaultQuad();
  presence = 1;
  frameActive = true;
  syncTimelineBounds();
  refreshControls();
  await showUploadPreview(0);

  const activeOrigUrl = origUrl;
  void initLandmarker().then((mp) => {
    if (!origLoaded || origUrl !== activeOrigUrl) return;
    autoTracking = !!mp;
    frameMode = mp ? "auto" : "manual";
    lastVideoTime = -1;
    refreshControls();
  });
}

async function handleStylized(file) {
  if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) {
    styInput.value = "";
    setFileName(styFileName, "");
    status(t("invalidStylized"));
    trackEvent("Upload Rejected", {
      kind: "style",
      reason: "invalid_video_type",
      extension: fileExtension(file),
      size_bucket: fileSizeBucket(file),
    });
    return;
  }
  if (styUrl) URL.revokeObjectURL(styUrl);
  clearVideo(sty);
  styLoaded = false;
  styName = file.name;
  setFileName(styFileName, styName);
  status(t("loadingStylized", { name: styName }));
  styUrl = await loadIntoVideo(sty, file);
  styLoaded = true;
  trackFileUploaded("style", file, sty);
  syncTimelineBounds();
  await showUploadPreview(Number(scrub.value) || orig.currentTime || 0);
  refreshControls();
}

async function handleAudio(file) {
  if (!/^audio\//.test(file.type) && !/\.(mp3|m4a|wav|aac|ncm)$/i.test(file.name)) {
    audioInput.value = "";
    setFileName(audioFileName, "");
    status(t("invalidAudio"));
    trackEvent("Upload Rejected", {
      kind: "audio",
      reason: "invalid_audio_type",
      extension: fileExtension(file),
      size_bucket: fileSizeBucket(file),
    });
    return;
  }
  if (/\.ncm$/i.test(file.name)) {
    audioInput.value = "";
    setFileName(audioFileName, "");
    status(t("ncmUnsupported"));
    trackEvent("Upload Rejected", {
      kind: "audio",
      reason: "encrypted_ncm",
      extension: fileExtension(file),
      size_bucket: fileSizeBucket(file),
    });
    return;
  }
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  clearAudio();
  usingBundledAudio = false;
  audioLoaded = false;
  audioName = file.name;
  setFileName(audioFileName, audioName);
  status(t("loadingAudio", { name: audioName }));
  audioUrl = await loadIntoAudio(bgm, file);
  audioLoaded = true;
  trackFileUploaded("audio", file, bgm);
  bgm.loop = true;
  refreshControls();
}

async function loadBundledAudio() {
  if (audioLoaded) return;
  clearAudio();
  audioLoaded = false;
  usingBundledAudio = true;
  audioName = t("bundledAudioName");
  setFileName(audioFileName, audioName);
  status(t("loadingBundledAudio"));
  await new Promise((resolve, reject) => {
    const done = () => {
      bgm.removeEventListener("loadedmetadata", done);
      bgm.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      bgm.removeEventListener("loadedmetadata", done);
      bgm.removeEventListener("error", fail);
      reject(new Error(t("bundledAudioFail")));
    };
    bgm.addEventListener("loadedmetadata", done, { once: true });
    bgm.addEventListener("error", fail, { once: true });
    bgm.src = DEFAULT_AUDIO_URL;
    bgm.load();
  });
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
    status(t("originalLoadFail", { error: err.message || err }));
    trackEvent("Upload Failed", {
      kind: "original",
      reason: "load_error",
    });
  }
});

styInput.addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    await handleStylized(file);
  } catch (err) {
    console.error(err);
    status(t("stylizedLoadFail", { error: err.message || err }));
    trackEvent("Upload Failed", {
      kind: "style",
      reason: "load_error",
    });
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
    status(t("audioLoadFail", { error: err.message || err }));
    trackEvent("Upload Failed", {
      kind: "audio",
      reason: "load_error",
    });
  }
});

async function fetchDemoFile(url, name) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${name}`);
  const blob = await response.blob();
  return new File([blob], name, { type: blob.type || "video/mp4" });
}

btnLoadDemo.addEventListener("click", async () => {
  if (btnLoadDemo.disabled) return;
  btnLoadDemo.disabled = true;
  try {
    const [demoOriginal, demoInside] = await Promise.all([
      fetchDemoFile(DEMO_ORIGINAL_URL, "最终原视频.mp4"),
      fetchDemoFile(DEMO_INSIDE_URL, "动漫.mp4"),
    ]);
    await handleOriginal(demoOriginal);
    await handleStylized(demoInside);
    // The demo button is the user's explicit gesture, so start the preview
    // immediately after both clips are ready.
    trackEvent("Preview Started", { ...commonProjectMetrics(), source: "demo" });
    playThrough();
    status(t("demoLoaded"));
    trackEvent("Demo Loaded", commonProjectMetrics());
  } catch (err) {
    console.error(err);
    status(t("readFileFail", { name: t("loadDemo"), detail: `: ${err.message || err}` }));
  } finally {
    btnLoadDemo.disabled = false;
  }
});

function playThrough() {
  if (!origLoaded) return;
  if (autoTracking) resetTracker();
  previewing = true;
  const startTime = clamp(Number(scrub.value) || 0, 0, getDuration());
  orig.currentTime = startTime;
  if (styLoaded) sty.currentTime = startTime;
  if (audioLoaded) bgm.currentTime = startTime % Math.max(bgm.duration || 0.001, 0.001);
  scrub.value = String(startTime);
  updateTimeReadout();
  void orig.play().catch((err) => console.warn("原始视频播放失败", err));
  if (styLoaded) void sty.play().catch((err) => console.warn("风格视频播放失败", err));
  if (audioLoaded) void bgm.play().catch((err) => console.warn("背景音乐播放失败", err));
  refreshControls();
  requestAnimationFrame(loop);
}

function pauseThrough() {
  previewing = false;
  orig.pause();
  if (styLoaded) sty.pause();
  if (audioLoaded) bgm.pause();
  renderFrame(orig.currentTime || Number(scrub.value) || 0);
  refreshControls();
}

function loop() {
  if (!previewing) return;
  if (!orig.ended) requestAnimationFrame(loop);
  renderFrame(orig.currentTime);
}

function togglePreview() {
  if (exporting || !origLoaded) return;
  if (previewing) {
    pauseThrough();
  } else {
    trackEvent("Preview Started", commonProjectMetrics());
    playThrough();
  }
}

btnExport.addEventListener("click", async () => {
  if (exporting || !origLoaded || !styLoaded) return;
  if (!canvas.captureStream || typeof MediaRecorder === "undefined") {
    status(t("exportUnsupported"));
    trackEvent("Export Failed", {
      ...commonProjectMetrics(),
      reason: "unsupported_browser",
    });
    return;
  }

  pauseThrough();
  exporting = true;
  refreshControls();

  const stream = canvas.captureStream(30);
  if (audioLoaded && bgm.captureStream) {
    try {
      const audioStream = bgm.captureStream();
      for (const track of audioStream.getAudioTracks()) stream.addTrack(track);
    } catch (err) {
      console.warn("背景音乐无法加入导出流", err);
    }
  }

  const mime = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm",
  ].find((type) => MediaRecorder.isTypeSupported(type)) || "video/webm";
  const isMp4 = mime.startsWith("video/mp4");
  trackEvent("Export Started", {
    ...commonProjectMetrics(),
    mime_type: mime,
  });
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 10_000_000,
  });
  const chunks = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };
  recorder.onerror = (event) => {
    console.error(event.error || event);
    exporting = false;
    stream.getTracks().forEach((track) => track.stop());
    refreshControls();
    status(t("exportFail"));
    trackEvent("Export Failed", {
      ...commonProjectMetrics(),
      reason: "recorder_error",
    });
  };
  recorder.onstop = () => {
    const extension = isMp4 ? "mp4" : "webm";
    const blob = new Blob(chunks, { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `FrameLab-${new Date().toISOString().slice(0, 10)}.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    stream.getTracks().forEach((track) => track.stop());
    exporting = false;
    previewing = false;
    refreshControls();
    status(t("exportDone", { name: link.download }));
    trackEvent("Export Completed", {
      ...commonProjectMetrics(),
      extension,
      mime_type: mime,
    });
  };

  orig.onended = () => {
    orig.onended = null;
    previewing = false;
    sty.pause();
    if (audioLoaded) bgm.pause();
    if (recorder.state !== "inactive") recorder.stop();
  };

  scrub.value = "0";
  orig.currentTime = 0;
  sty.currentTime = 0;
  if (audioLoaded) bgm.currentTime = 0;
  updateTimeReadout();
  recorder.start(1000);
  playThrough();
});

btnFrameFit.addEventListener("click", () => {
  trackEvent("Frame Tool Used", {
    ...commonProjectMetrics(),
    tool: "fit_canvas",
  });
  fitFrameToCanvas();
});
btnFrameReset.addEventListener("click", () => {
  trackEvent("Frame Tool Used", {
    ...commonProjectMetrics(),
    tool: "manual_frame",
  });
  resetFrameToDefault(true);
});
btnAutoTrack.addEventListener("click", () => {
  trackEvent("Frame Tool Used", {
    ...commonProjectMetrics(),
    tool: "auto_track",
  });
  enableAutoTracking();
});

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
    status(t("needOriginal"));
    return;
  }
  const duration = getDuration();
  let start = clamp(Number(effectStart.value) || 0, 0, duration);
  let end = clamp(Number(effectEnd.value) || 0, 0, duration);
  if (end < start) [start, end] = [end, start];
  if (end <= start) {
    status(t("invalidEffectRange"));
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
  trackEvent("Effect Added", {
    ...commonProjectMetrics(),
    effect_type: effectType.value,
    effect_duration_sec: roundedSeconds(end - start),
    intensity: Number(effectIntensity.value) || 0.7,
  });
  status(t("effectAdded", {
    effect: effectLabel(effectType.value),
    start: formatTime(start),
    end: formatTime(end),
  }));
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
  trackEvent("Invert Mask Toggled", {
    ...commonProjectMetrics(),
    enabled: invertEnabled.checked,
  });
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
  usingBundledAudio = false;
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
  void loadBundledAudio().catch((err) => {
    console.warn(err);
    audioLoaded = false;
    setFileName(audioFileName, "");
    refreshControls();
  });
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
applyLanguage();
void loadBundledAudio().catch((err) => {
  console.warn(err);
  audioLoaded = false;
  setFileName(audioFileName, "");
  refreshControls();
});

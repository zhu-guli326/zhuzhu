(function () {
  'use strict';

  const TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const WASM_URL = `${TASKS_VISION_URL}/wasm`;
  const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  const EFFECTS = [
    { id: 'feedback', zh: '反馈残影', en: 'Feedback Trail' },
    { id: 'flow', zh: '液态位移', en: 'Fluid Displace' },
    { id: 'electric', zh: '电场轮廓', en: 'Electric Bloom' },
    { id: 'glitch', zh: '运动撕裂', en: 'Motion Glitch' },
  ];
  const EFFECT_INDEX = { feedback: 0, flow: 1, electric: 2, glitch: 3 };

  const params = new URLSearchParams(location.search);
  const DEMO = params.has('demo');
  const FRAMED = window.self !== window.top;
  const USE_SUPPLIED_CAMERA = FRAMED && params.has('embedded');
  if (FRAMED) document.documentElement.classList.add('embedded');

  const video = document.getElementById('live-video');
  const canvas = document.getElementById('gl-canvas');
  const status = document.getElementById('live-status');
  const statusText = document.getElementById('live-status-text');
  const hint = document.getElementById('live-hint');
  const select = document.getElementById('interactive-effect-select');
  const meterFill = document.querySelector('.motion-meter span');
  const recordButton = document.getElementById('interactive-record');
  if (!video || !canvas) return;

  const state = {
    effect: EFFECT_INDEX[params.get('effect')] != null ? params.get('effect') : 'feedback',
    hands: [],
    energy: 0,
    accel: 0,
    landmarker: null,
    lastTrackAt: 0,
    lastTrackTimestamp: 0,
    lastRenderAt: performance.now(),
    suppliedCameraStream: null,
    suppliedResolve: null,
    recorder: null,
    recordChunks: [],
    recordStartedAt: 0,
    recordTimer: 0,
    demoStart: performance.now(),
  };

  const suppliedReady = new Promise((resolve) => { state.suppliedResolve = resolve; });
  window.receiveLiveCameraStream = (stream) => {
    state.suppliedCameraStream = stream;
    state.suppliedResolve?.(stream);
  };
  if (USE_SUPPLIED_CAMERA) {
    window.parent?.postMessage({ type: 'framelab-live-ready' }, location.origin);
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mixPoint = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

  function trackEvent(name, data = {}) {
    try {
      const payload = { mode: 'live_camera_gpu', effect: state.effect, demo: DEMO, ...data };
      if (typeof window.trackAnalyticsEvent === 'function') window.trackAnalyticsEvent(name, payload);
      else window.va?.('event', { name, data: payload });
    } catch (_) {}
  }

  function setStatus(message, hidden = false) {
    if (statusText) statusText.textContent = message;
    status?.classList.toggle('hidden', hidden);
  }

  function buildToolbar() {
    if (!select) return;
    select.innerHTML = '';
    EFFECTS.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.zh} · ${item.en}`;
      select.appendChild(option);
    });
    select.value = state.effect;
    select.addEventListener('change', () => {
      state.effect = select.value;
      renderer?.resetFeedback();
      trackEvent('Live Effect Changed');
    });
    recordButton?.addEventListener('click', () => toggleRecording());
  }

  function makeCameraError(name, message) {
    const error = new Error(message);
    error.name = name;
    return error;
  }

  async function waitForSuppliedStream() {
    if (state.suppliedCameraStream?.active) return state.suppliedCameraStream;
    return Promise.race([
      suppliedReady.then((stream) => {
        if (!stream?.active) throw makeCameraError('InvalidStateError', '摄像头画面已停止');
        return stream;
      }),
      new Promise((_, reject) => setTimeout(() => reject(makeCameraError('TimeoutError', '父页面没有传入摄像头画面')), 8000)),
    ]);
  }

  function getCameraStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      return Promise.reject(makeCameraError('NotSupportedError', '当前浏览器不支持摄像头访问'));
    }
    const mobile = matchMedia('(max-width: 760px)').matches;
    return navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: mobile ? 960 : 1280 },
        height: { ideal: mobile ? 540 : 720 },
        frameRate: { ideal: 30, max: 60 },
        facingMode: 'user',
      },
      audio: false,
    });
  }

  function waitForVideoReady() {
    if (video.readyState >= 2 && video.videoWidth && video.videoHeight) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const finish = (error) => {
        clearTimeout(timeout);
        video.removeEventListener('loadeddata', onReady);
        video.removeEventListener('canplay', onReady);
        video.removeEventListener('error', onError);
        error ? reject(error) : resolve();
      };
      const onReady = () => { if (video.videoWidth && video.videoHeight) finish(); };
      const onError = () => finish(makeCameraError('NotReadableError', '摄像头画面无法播放'));
      const timeout = setTimeout(() => finish(makeCameraError('TimeoutError', '摄像头画面加载超时')), 8000);
      video.addEventListener('loadeddata', onReady);
      video.addEventListener('canplay', onReady);
      video.addEventListener('error', onError);
    });
  }

  function makeDemoStream() {
    const demo = document.createElement('canvas');
    demo.width = 1280;
    demo.height = 720;
    const d = demo.getContext('2d');
    function paint(now) {
      const t = now / 1000;
      const g = d.createLinearGradient(0, 0, demo.width, demo.height);
      g.addColorStop(0, '#11151f');
      g.addColorStop(0.45, '#42324f');
      g.addColorStop(1, '#153e47');
      d.fillStyle = g;
      d.fillRect(0, 0, demo.width, demo.height);
      d.fillStyle = 'rgba(255,255,255,.05)';
      for (let x = 0; x < demo.width; x += 48) d.fillRect(x, 0, 1, demo.height);
      for (let y = 0; y < demo.height; y += 48) d.fillRect(0, y, demo.width, 1);
      const cx = demo.width * (0.5 + Math.sin(t * 0.7) * 0.04);
      const cy = demo.height * 0.46;
      d.fillStyle = '#e7c8b9';
      d.beginPath(); d.arc(cx, cy - 145, 84, 0, Math.PI * 2); d.fill();
      d.fillStyle = '#202635';
      d.beginPath(); d.ellipse(cx, cy + 70, 190, 240, 0, 0, Math.PI * 2); d.fill();
      const hx = cx + Math.sin(t * 1.6) * 300;
      const hy = cy - 30 + Math.cos(t * 1.1) * 105;
      d.strokeStyle = '#e7c8b9';
      d.lineWidth = 42;
      d.lineCap = 'round';
      d.beginPath(); d.moveTo(cx + 120, cy + 35); d.lineTo(hx, hy); d.stroke();
      d.fillStyle = '#f1d7c9';
      d.beginPath(); d.arc(hx, hy, 38, 0, Math.PI * 2); d.fill();
      d.fillStyle = 'rgba(255,255,255,.78)';
      d.font = '700 22px system-ui';
      d.fillText('FrameLab · GPU realtime test', 36, 48);
      requestAnimationFrame(paint);
    }
    requestAnimationFrame(paint);
    return demo.captureStream(30);
  }

  function landmarkToUv(lm) {
    return { x: 1 - lm.x, y: 1 - lm.y, z: lm.z || 0 };
  }

  function palmCenter(points) {
    const ids = [0, 5, 9, 13, 17];
    return ids.reduce((out, id) => ({ x: out.x + points[id].x / ids.length, y: out.y + points[id].y / ids.length }), { x: 0, y: 0 });
  }

  function rawHand(points) {
    const palm = palmCenter(points);
    const scale = Math.max(0.035, dist(points[0], points[9]));
    const pinch = clamp(dist(points[4], points[8]) / Math.max(0.02, scale * 2.15), 0, 1);
    const tips = [4, 8, 12, 16, 20];
    const openness = clamp(tips.reduce((sum, id) => sum + dist(points[id], points[0]), 0) / (tips.length * scale * 2.65), 0, 1);
    return { points, palm, scale, pinch, openness };
  }

  function orderHands(rawHands, previousHands) {
    if (rawHands.length !== 2 || previousHands.length !== 2) return rawHands;
    const same = dist(rawHands[0].palm, previousHands[0].palm) + dist(rawHands[1].palm, previousHands[1].palm);
    const swapped = dist(rawHands[1].palm, previousHands[0].palm) + dist(rawHands[0].palm, previousHands[1].palm);
    return swapped < same ? [rawHands[1], rawHands[0]] : rawHands;
  }

  function updateHands(result, timestamp) {
    const previous = state.hands;
    const dt = clamp((timestamp - (state.lastTrackTimestamp || timestamp - 50)) / 1000, 1 / 120, 0.12);
    state.lastTrackTimestamp = timestamp;
    let raw = (result.landmarks || []).slice(0, 2).map((landmarks) => rawHand(landmarks.map(landmarkToUv)));
    raw = orderHands(raw, previous);
    state.hands = raw.map((hand, index) => {
      const old = previous[index];
      if (!old) return { ...hand, vx: 0, vy: 0, speed: 0, accel: 0 };
      const palm = mixPoint(old.palm, hand.palm, 0.62);
      const rawVx = (palm.x - old.palm.x) / dt;
      const rawVy = (palm.y - old.palm.y) / dt;
      const vx = lerp(old.vx || 0, rawVx, 0.48);
      const vy = lerp(old.vy || 0, rawVy, 0.48);
      const speed = Math.hypot(vx, vy);
      const accel = (speed - (old.speed || 0)) / dt;
      return {
        ...hand,
        palm,
        scale: lerp(old.scale, hand.scale, 0.55),
        pinch: lerp(old.pinch, hand.pinch, 0.5),
        openness: lerp(old.openness, hand.openness, 0.5),
        vx, vy, speed, accel,
      };
    });
  }

  function updateDemoHands(now) {
    const t = (now - state.demoStart) / 1000;
    const x = 0.5 - Math.sin(t * 1.6) * 0.235;
    const y = 0.56 + Math.cos(t * 1.1) * 0.145;
    const palm = { x, y };
    const old = state.hands[0];
    const dt = 1 / 60;
    const vx = old ? (palm.x - old.palm.x) / dt : 0;
    const vy = old ? (palm.y - old.palm.y) / dt : 0;
    const speed = Math.hypot(vx, vy);
    const scale = 0.075;
    const points = Array.from({ length: 21 }, (_, i) => ({
      x: palm.x + Math.cos(i * 1.7) * scale * (i >= 4 ? 0.9 : 0.35),
      y: palm.y + Math.sin(i * 1.7) * scale * (i >= 4 ? 0.9 : 0.35),
    }));
    points[8] = { x: palm.x + scale * 1.25, y: palm.y + scale * 0.5 };
    points[4] = { x: palm.x - scale * 0.9, y: palm.y + scale * 0.35 };
    state.hands = [{ points, palm, scale, pinch: 0.58, openness: 0.82, vx, vy, speed, accel: old ? (speed - old.speed) / dt : 0 }];
  }

  async function initTracking() {
    if (DEMO) return;
    try {
      setStatus('正在加载手势追踪…');
      const { HandLandmarker, FilesetResolver } = await import(TASKS_VISION_URL);
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      state.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.35,
        minHandPresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      });
      scheduleTracking();
    } catch (error) {
      console.warn('Hand tracking unavailable', error);
      setStatus('手势识别不可用，保留画面运动反馈', true);
    }
  }

  function detectFrame(now) {
    if (!state.landmarker || video.readyState < 2 || now - state.lastTrackAt < 45) return;
    state.lastTrackAt = now;
    try {
      const result = state.landmarker.detectForVideo(video, now);
      updateHands(result, now);
    } catch (error) {
      console.warn('Skipped tracking frame', error);
    }
  }

  function scheduleTracking() {
    if (typeof video.requestVideoFrameCallback === 'function') {
      const onFrame = (now) => {
        detectFrame(now);
        video.requestVideoFrameCallback(onFrame);
      };
      video.requestVideoFrameCallback(onFrame);
    } else {
      const tick = (now) => {
        detectFrame(now);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  }

  const VERTEX_SHADER = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p;
  if (gl_VertexID == 0) p = vec2(-1.0, -1.0);
  else if (gl_VertexID == 1) p = vec2(1.0, -1.0);
  else if (gl_VertexID == 2) p = vec2(-1.0, 1.0);
  else p = vec2(1.0, 1.0);
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

  const SIM_FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVideo;
uniform sampler2D uPrevVideo;
uniform sampler2D uFeedback;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDelta;
uniform float uEnergy;
uniform float uAccel;
uniform int uEffect;
uniform int uHandCount;
uniform vec4 uHand0;
uniform vec4 uHand1;
uniform vec4 uMeta;
uniform vec4 uPoints[12];

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec2 safeUv(vec2 uv) { return clamp(uv, vec2(0.002), vec2(0.998)); }
vec3 cameraAt(vec2 uv) { uv = safeUv(uv); return texture(uVideo, vec2(1.0 - uv.x, 1.0 - uv.y)).rgb; }
vec3 previousCameraAt(vec2 uv) { uv = safeUv(uv); return texture(uPrevVideo, vec2(1.0 - uv.x, 1.0 - uv.y)).rgb; }
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float screenBlend(float a, float b) { return 1.0 - (1.0 - a) * (1.0 - b); }
vec3 screenBlend3(vec3 a, vec3 b) { return vec3(screenBlend(a.r,b.r), screenBlend(a.g,b.g), screenBlend(a.b,b.b)); }

vec2 opticalFlow(vec2 uv, out float motion) {
  vec2 px = 1.0 / uResolution;
  float c = luma(cameraAt(uv));
  float p = luma(previousCameraAt(uv));
  float gx = (luma(cameraAt(uv + vec2(px.x, 0.0))) - luma(cameraAt(uv - vec2(px.x, 0.0)))) * 0.5;
  float gy = (luma(cameraAt(uv + vec2(0.0, px.y))) - luma(cameraAt(uv - vec2(0.0, px.y)))) * 0.5;
  float temporal = c - p;
  vec2 grad = vec2(gx, gy);
  float denom = dot(grad, grad) + 0.0022;
  vec2 flow = clamp((-temporal * grad) / denom, vec2(-0.035), vec2(0.035));
  motion = smoothstep(0.018, 0.14, abs(temporal) + length(grad) * 0.33);
  return flow * motion;
}

vec2 handVelocity(int hand) { return hand == 0 ? uHand0.zw : uHand1.zw; }
float handOpen(int hand) { return hand == 0 ? uMeta.x : uMeta.z; }
float handPinch(int hand) { return hand == 0 ? uMeta.y : uMeta.w; }

vec2 handField(vec2 uv, out float mask) {
  vec2 field = vec2(0.0);
  mask = 0.0;
  for (int i = 0; i < 12; i++) {
    int hand = i < 6 ? 0 : 1;
    if (hand >= uHandCount) continue;
    vec4 point = uPoints[i];
    vec2 d = uv - point.xy;
    float radius = max(0.018, point.z);
    float d2 = dot(d, d);
    float influence = exp(-d2 / (radius * radius * 0.72)) * point.w;
    vec2 dir = d / (sqrt(d2) + 0.0008);
    vec2 tangent = vec2(-dir.y, dir.x);
    vec2 vel = handVelocity(hand);
    float speed = min(2.5, length(vel));
    float open = handOpen(hand);
    float pinch = handPinch(hand);
    field += vel * influence * (0.010 + speed * 0.004);
    field += tangent * influence * open * (0.0009 + uEnergy * 0.0018);
    field += dir * influence * (open * 0.0014 - (1.0 - pinch) * 0.0032);
    mask = max(mask, influence);
  }
  return field;
}

float edgeStrength(vec2 uv) {
  vec2 px = 1.0 / uResolution;
  float gx = luma(cameraAt(uv + vec2(px.x, 0.0))) - luma(cameraAt(uv - vec2(px.x, 0.0)));
  float gy = luma(cameraAt(uv + vec2(0.0, px.y))) - luma(cameraAt(uv - vec2(0.0, px.y)));
  return length(vec2(gx, gy));
}

float lineGlow(vec2 uv, vec2 a, vec2 b, float gate) {
  vec2 ab = b - a;
  float len = max(length(ab), 0.001);
  vec2 tangent = ab / len;
  vec2 normal = vec2(-tangent.y, tangent.x);
  float t = clamp(dot(uv - a, ab) / dot(ab, ab), 0.0, 1.0);
  float jitter = (sin(t * 73.0 + uTime * 19.0) + sin(t * 131.0 - uTime * 13.0) * 0.55) * 0.0045 * gate;
  vec2 p = mix(a, b, t) + normal * jitter;
  float d = length(uv - p);
  return (exp(-d * 620.0) * 1.2 + exp(-d * 95.0) * 0.32) * gate;
}

void main() {
  vec2 uv = vUv;
  vec3 current = cameraAt(uv);
  vec3 previousVideo = previousCameraAt(uv);
  float motion = 0.0;
  vec2 flow = opticalFlow(uv, motion);
  float handMask = 0.0;
  vec2 hFlow = handField(uv, handMask);
  vec2 totalFlow = flow * (0.55 + uEnergy * 0.55) + hFlow;
  float frameDiff = length(current - previousVideo);
  float active = clamp(max(motion, handMask * (0.18 + uEnergy * 0.82)) + smoothstep(0.035, 0.2, frameDiff), 0.0, 1.0);

  vec3 color = current;

  if (uEffect == 0) {
    vec2 centered = uv - 0.5;
    float zoom = 0.997 - uEnergy * 0.004;
    vec2 feedbackUv = 0.5 + centered * zoom - totalFlow * (0.58 + uEnergy * 1.45);
    vec2 chroma = totalFlow * (0.22 + uEnergy * 0.45);
    vec3 trail;
    trail.r = texture(uFeedback, safeUv(feedbackUv + chroma)).r;
    trail.g = texture(uFeedback, safeUv(feedbackUv)).g;
    trail.b = texture(uFeedback, safeUv(feedbackUv - chroma)).b;
    trail *= 0.935 - uEnergy * 0.055;
    float wet = clamp(0.12 + active * 0.66 + uEnergy * 0.22, 0.0, 0.9);
    vec3 layered = max(current * (0.92 - uEnergy * 0.08), trail);
    color = mix(current, screenBlend3(current * 0.7, layered), wet);
  } else if (uEffect == 1) {
    vec2 disp = totalFlow * (0.82 + uEnergy * 1.8);
    float localWet = clamp(active * 0.88 + handMask * 0.48, 0.0, 1.0);
    vec3 s0 = cameraAt(uv - disp * 0.35);
    vec3 s1 = cameraAt(uv - disp * 0.82);
    vec3 s2 = cameraAt(uv - disp * 1.35);
    vec3 s3 = cameraAt(uv - disp * 1.95);
    vec3 viscous = s0 * 0.38 + s1 * 0.28 + s2 * 0.2 + s3 * 0.14;
    vec2 chroma = disp * (0.35 + uEnergy * 0.5);
    viscous.r = cameraAt(uv - disp - chroma).r;
    viscous.b = cameraAt(uv - disp + chroma).b;
    vec3 fb = texture(uFeedback, safeUv(uv - disp * 0.7)).rgb * 0.88;
    viscous = mix(viscous, screenBlend3(viscous, fb), localWet * 0.18);
    color = mix(current, viscous, localWet * 0.93);
  } else if (uEffect == 2) {
    float edge = edgeStrength(uv);
    float hotEdge = smoothstep(0.055, 0.24, edge) * (0.55 + uEnergy * 1.75);
    vec3 base = pow(max(current, vec3(0.0)), vec3(1.15)) * (0.22 + (1.0 - uEnergy) * 0.12);
    vec3 cyan = vec3(0.28, 1.35, 1.5);
    vec3 magenta = vec3(1.45, 0.25, 1.15);
    float directionMix = 0.5 + 0.5 * sin(uv.y * 12.0 + uv.x * 5.0 + totalFlow.x * 120.0);
    vec3 emission = mix(cyan, magenta, directionMix) * hotEdge;
    emission += mix(cyan, vec3(1.5), handMask) * handMask * (0.12 + uEnergy * 0.95);
    if (uHandCount == 2) {
      vec2 a = uPoints[2].xy;
      vec2 b = uPoints[8].xy;
      float proximity = 1.0 - smoothstep(0.18, 0.72, distance(a, b));
      float arc = lineGlow(uv, a, b, proximity * (0.55 + uEnergy));
      emission += mix(cyan, vec3(1.5, 0.75, 1.35), 0.5 + 0.5 * sin(uTime * 9.0)) * arc;
    }
    color = base + emission;
  } else {
    vec2 dominantVel = uHandCount > 0 ? uHand0.zw : flow * 18.0;
    float dir = dominantVel.x >= 0.0 ? 1.0 : -1.0;
    float burst = clamp(uEnergy * 0.85 + uAccel * 0.5 + smoothstep(0.04, 0.18, frameDiff) * 0.45, 0.0, 1.0);
    float row = floor(uv.y * (28.0 + uEnergy * 34.0));
    float seed = hash21(vec2(row, floor(uTime * (8.0 + uEnergy * 18.0))));
    float gate = step(0.68 - uEnergy * 0.28, seed) * burst;
    float centerBias = 1.0;
    if (uHandCount > 0) centerBias = exp(-pow((uv.y - uHand0.y) / (0.16 + uEnergy * 0.2), 2.0));
    float shift = (seed - 0.5) * (0.02 + uEnergy * 0.095) * dir * gate * centerBias;
    vec2 tearUv = vec2(uv.x + shift, uv.y + dominantVel.y * 0.0035 * gate);
    vec2 rgbShift = normalize(dominantVel + vec2(0.0001)) * (0.003 + uEnergy * 0.018) * burst;
    vec3 torn = cameraAt(tearUv);
    torn.r = cameraAt(tearUv + rgbShift).r;
    torn.b = cameraAt(tearUv - rgbShift).b;
    float scan = smoothstep(0.86, 1.0, sin(uv.y * uResolution.y * 1.25) * 0.5 + 0.5);
    torn *= 1.0 - scan * 0.055 * burst;
    vec3 fb = texture(uFeedback, safeUv(tearUv - totalFlow * 0.2)).rgb;
    torn = mix(torn, max(torn, fb * 0.9), gate * 0.22);
    color = mix(current, torn, clamp(burst * 0.88, 0.0, 1.0));
  }

  outColor = vec4(max(color, vec3(0.0)), 1.0);
}`;

  const POST_FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform vec2 uResolution;
uniform float uBloom;
uniform float uExposure;
vec3 hot(vec3 c) { float l = max(max(c.r, c.g), c.b); return c * smoothstep(0.55, 1.15, l); }
void main() {
  vec2 px = 1.0 / uResolution;
  vec3 scene = texture(uScene, vUv).rgb;
  vec3 bloom = vec3(0.0);
  bloom += hot(texture(uScene, vUv + vec2(2.0,0.0)*px).rgb);
  bloom += hot(texture(uScene, vUv - vec2(2.0,0.0)*px).rgb);
  bloom += hot(texture(uScene, vUv + vec2(0.0,2.0)*px).rgb);
  bloom += hot(texture(uScene, vUv - vec2(0.0,2.0)*px).rgb);
  bloom += hot(texture(uScene, vUv + vec2(6.0,6.0)*px).rgb) * 0.72;
  bloom += hot(texture(uScene, vUv + vec2(-6.0,6.0)*px).rgb) * 0.72;
  bloom += hot(texture(uScene, vUv + vec2(6.0,-6.0)*px).rgb) * 0.72;
  bloom += hot(texture(uScene, vUv + vec2(-6.0,-6.0)*px).rgb) * 0.72;
  bloom += hot(texture(uScene, vUv + vec2(14.0,0.0)*px).rgb) * 0.5;
  bloom += hot(texture(uScene, vUv - vec2(14.0,0.0)*px).rgb) * 0.5;
  bloom += hot(texture(uScene, vUv + vec2(0.0,14.0)*px).rgb) * 0.5;
  bloom += hot(texture(uScene, vUv - vec2(0.0,14.0)*px).rgb) * 0.5;
  bloom /= 8.88;
  vec3 color = scene + bloom * uBloom;
  color = vec3(1.0) - exp(-color * uExposure);
  color = pow(max(color, vec3(0.0)), vec3(1.0/2.2));
  outColor = vec4(color, 1.0);
}`;

  let renderer = null;

  function createRenderer() {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return createFallbackRenderer();

    function shader(type, source) {
      const s = gl.createShader(type);
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(log || 'Shader compile failed');
      }
      return s;
    }

    function program(fragment) {
      const p = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, VERTEX_SHADER));
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'Program link failed');
      return p;
    }

    const sim = program(SIM_FRAGMENT);
    const post = program(POST_FRAGMENT);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    function texture() {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 2, 2, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(16));
      return t;
    }

    const videoTextures = [texture(), texture()];
    let videoWrite = 0;
    let fbTextures = [];
    let fbos = [];
    let fbWrite = 0;
    let width = 0;
    let height = 0;
    let firstVideoFrame = true;

    function framebufferTexture(w, h) {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      const f = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, f);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Framebuffer incomplete');
      return { texture: t, fbo: f };
    }

    function resetFeedback() {
      fbos.forEach((fbo) => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
      });
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    function resize() {
      const vw = video.videoWidth || 1280;
      const vh = video.videoHeight || 720;
      const maxDim = matchMedia('(max-width: 760px)').matches ? 960 : 1280;
      const scale = Math.min(1, maxDim / Math.max(vw, vh));
      const w = Math.max(2, Math.round(vw * scale));
      const h = Math.max(2, Math.round(vh * scale));
      document.documentElement.style.setProperty('--video-aspect', String(vw / vh));
      if (width === w && height === h) return;
      width = w; height = h;
      canvas.width = width;
      canvas.height = height;
      fbTextures.forEach((t) => gl.deleteTexture(t));
      fbos.forEach((f) => gl.deleteFramebuffer(f));
      const a = framebufferTexture(width, height);
      const b = framebufferTexture(width, height);
      fbTextures = [a.texture, b.texture];
      fbos = [a.fbo, b.fbo];
      fbWrite = 0;
      resetFeedback();
    }

    function bindTexture(unit, t) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
    }

    function uploadVideo(t) {
      bindTexture(0, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
    }

    function uniform(p, name) { return gl.getUniformLocation(p, name); }
    const simU = {
      video: uniform(sim, 'uVideo'), prevVideo: uniform(sim, 'uPrevVideo'), feedback: uniform(sim, 'uFeedback'),
      resolution: uniform(sim, 'uResolution'), time: uniform(sim, 'uTime'), delta: uniform(sim, 'uDelta'),
      energy: uniform(sim, 'uEnergy'), accel: uniform(sim, 'uAccel'), effect: uniform(sim, 'uEffect'), handCount: uniform(sim, 'uHandCount'),
      hand0: uniform(sim, 'uHand0'), hand1: uniform(sim, 'uHand1'), meta: uniform(sim, 'uMeta'), points: uniform(sim, 'uPoints[0]'),
    };
    const postU = {
      scene: uniform(post, 'uScene'), resolution: uniform(post, 'uResolution'), bloom: uniform(post, 'uBloom'), exposure: uniform(post, 'uExposure'),
    };

    function pointUniforms() {
      const out = new Float32Array(12 * 4);
      for (let handIndex = 0; handIndex < 2; handIndex++) {
        const hand = state.hands[handIndex];
        if (!hand) continue;
        const ids = [-1, 4, 8, 12, 16, 20];
        ids.forEach((id, localIndex) => {
          const p = id === -1 ? hand.palm : hand.points[id];
          const offset = (handIndex * 6 + localIndex) * 4;
          out[offset] = p.x;
          out[offset + 1] = p.y;
          out[offset + 2] = hand.scale * (localIndex === 0 ? 2.15 : 1.15);
          out[offset + 3] = localIndex === 0 ? 1 : 0.72;
        });
      }
      return out;
    }

    function handUniform(hand) {
      return hand ? [hand.palm.x, hand.palm.y, hand.vx, hand.vy] : [-2, -2, 0, 0];
    }

    function render(now, dt) {
      resize();
      if (video.readyState < 2 || !width || !height) return;

      const currentVideo = videoTextures[videoWrite];
      const previousVideo = videoTextures[1 - videoWrite];
      uploadVideo(currentVideo);
      if (firstVideoFrame) {
        uploadVideo(previousVideo);
        firstVideoFrame = false;
      }

      const writeFbo = fbos[fbWrite];
      const writeTex = fbTextures[fbWrite];
      const readTex = fbTextures[1 - fbWrite];

      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
      gl.viewport(0, 0, width, height);
      gl.useProgram(sim);
      gl.bindVertexArray(vao);
      bindTexture(0, currentVideo);
      bindTexture(1, previousVideo);
      bindTexture(2, readTex);
      gl.uniform1i(simU.video, 0);
      gl.uniform1i(simU.prevVideo, 1);
      gl.uniform1i(simU.feedback, 2);
      gl.uniform2f(simU.resolution, width, height);
      gl.uniform1f(simU.time, now / 1000);
      gl.uniform1f(simU.delta, dt);
      gl.uniform1f(simU.energy, state.energy);
      gl.uniform1f(simU.accel, state.accel);
      gl.uniform1i(simU.effect, EFFECT_INDEX[state.effect] ?? 0);
      gl.uniform1i(simU.handCount, state.hands.length);
      gl.uniform4fv(simU.hand0, handUniform(state.hands[0]));
      gl.uniform4fv(simU.hand1, handUniform(state.hands[1]));
      gl.uniform4f(simU.meta,
        state.hands[0]?.openness || 0, state.hands[0]?.pinch || 1,
        state.hands[1]?.openness || 0, state.hands[1]?.pinch || 1
      );
      gl.uniform4fv(simU.points, pointUniforms());
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(post);
      bindTexture(0, writeTex);
      gl.uniform1i(postU.scene, 0);
      gl.uniform2f(postU.resolution, width, height);
      const bloom = state.effect === 'electric' ? 1.65 : state.effect === 'feedback' ? 0.42 : state.effect === 'flow' ? 0.18 : 0.1;
      const exposure = state.effect === 'electric' ? 1.25 : 1.06;
      gl.uniform1f(postU.bloom, bloom);
      gl.uniform1f(postU.exposure, exposure);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      fbWrite = 1 - fbWrite;
      videoWrite = 1 - videoWrite;
    }

    return { render, resetFeedback, type: 'webgl2' };
  }

  function createFallbackRenderer() {
    const ctx = canvas.getContext('2d', { alpha: false });
    return {
      type: '2d-fallback',
      resetFeedback() {},
      render() {
        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        canvas.width = vw; canvas.height = vh;
        document.documentElement.style.setProperty('--video-aspect', String(vw / vh));
        ctx.save();
        ctx.translate(vw, 0); ctx.scale(-1, 1); ctx.drawImage(video, 0, 0, vw, vh); ctx.restore();
      },
    };
  }

  function updateEnergy() {
    const speed = state.hands.reduce((sum, hand) => sum + Math.min(2.2, hand.speed), 0);
    const accel = state.hands.reduce((sum, hand) => sum + Math.min(8, Math.abs(hand.accel)), 0);
    const targetEnergy = clamp(speed * 0.58, 0, 1);
    const targetAccel = clamp(accel * 0.09, 0, 1);
    state.energy = lerp(state.energy, targetEnergy, targetEnergy > state.energy ? 0.22 : 0.08);
    state.accel = lerp(state.accel, targetAccel, targetAccel > state.accel ? 0.2 : 0.06);
    if (!state.hands.length) {
      state.energy *= 0.94;
      state.accel *= 0.9;
    }
  }

  function renderLoop(now) {
    if (DEMO) updateDemoHands(now);
    updateEnergy();
    const dt = clamp((now - state.lastRenderAt) / 1000, 1 / 120, 0.05);
    state.lastRenderAt = now;
    renderer?.render(now, dt);
    if (meterFill) meterFill.style.transform = `scaleX(${Math.max(0.03, state.energy)})`;
    hint?.classList.toggle('quiet', state.energy > 0.08);
    requestAnimationFrame(renderLoop);
  }

  function supportedMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    return ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']
      .find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  function resetRecordUi() {
    clearInterval(state.recordTimer);
    state.recordTimer = 0;
    recordButton?.classList.remove('is-recording');
    const label = recordButton?.querySelector('.interactive-record-label');
    const time = recordButton?.querySelector('time');
    if (label) label.textContent = '录制';
    if (time) time.textContent = '00:00';
  }

  function toggleRecording() {
    if (!recordButton) return;
    if (state.recorder?.state === 'recording') {
      state.recorder.stop();
      return;
    }
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') return;
    const stream = canvas.captureStream(30);
    const mime = supportedMime();
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 }) : new MediaRecorder(stream);
    state.recorder = recorder;
    state.recordChunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) state.recordChunks.push(event.data); };
    recorder.onerror = () => trackEvent('Live Recording Failed');
    recorder.onstop = () => {
      resetRecordUi();
      const finalMime = recorder.mimeType || mime || 'video/webm';
      if (state.recordChunks.length) {
        const blob = new Blob(state.recordChunks, { type: finalMime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `FrameLab-live-${new Date().toISOString().replace(/[:.]/g, '-')}.${finalMime.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1200);
      }
      stream.getTracks().forEach((track) => track.stop());
      state.recorder = null;
      state.recordChunks = [];
      trackEvent('Live Recording Completed');
    };
    recorder.start(1000);
    state.recordStartedAt = Date.now();
    recordButton.classList.add('is-recording');
    recordButton.querySelector('.interactive-record-label').textContent = '停止';
    state.recordTimer = setInterval(() => {
      const seconds = Math.floor((Date.now() - state.recordStartedAt) / 1000);
      recordButton.querySelector('time').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }, 250);
    trackEvent('Live Recording Started');
  }

  async function boot() {
    buildToolbar();
    try {
      setStatus(DEMO ? '正在启动演示画面…' : USE_SUPPLIED_CAMERA ? '正在连接摄像头…' : '正在请求摄像头权限…');
      const stream = DEMO ? makeDemoStream() : USE_SUPPLIED_CAMERA ? await waitForSuppliedStream() : await getCameraStream();
      video.srcObject = stream;
      await waitForVideoReady();
      await video.play();
      renderer = createRenderer();
      if (renderer.type !== 'webgl2') setStatus('WebGL2 不可用，已降级为原始摄像头');
      else setStatus('GPU 实时视觉已启动', true);
      trackEvent('Live Camera Started', { renderer: renderer.type, width: video.videoWidth, height: video.videoHeight });
      requestAnimationFrame(renderLoop);
      initTracking();
    } catch (error) {
      console.error(error);
      setStatus(error?.message || '实时摄像头启动失败');
      trackEvent('Live Camera Failed', { reason: error?.name || 'unknown' });
    }
  }

  boot();
})();

(function () {
  const TASKS_VISION_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  const WASM_URL = `${TASKS_VISION_URL}/wasm`;
  const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
  const EFFECTS = [
    { id: 'echo', zh: '身体残影', en: 'Body Echo' },
    { id: 'flow', zh: '液态流场', en: 'Liquid Flow' },
    { id: 'electric', zh: '高压电场', en: 'Electric Field' },
    { id: 'glitch', zh: '动作撕裂', en: 'Motion Tear' },
    { id: 'holo', zh: '全息脉冲', en: 'Holo Pulse' },
  ];

  const video = document.getElementById('video');
  const sourceCanvas = document.getElementById('canvas');
  const stage = document.getElementById('stage');
  const legacyToolbar = document.getElementById('toolbar');
  if (!video || !sourceCanvas || !stage) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'interactive-canvas';
  canvas.setAttribute('aria-label', '实时互动视觉画面');
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });

  const frame = document.createElement('canvas');
  const fctx = frame.getContext('2d', { alpha: false });
  const feedback = document.createElement('canvas');
  const fbctx = feedback.getContext('2d', { alpha: true });
  const scratch = document.createElement('canvas');

  const state = {
    effect: 'echo', hands: [], energy: 0, accel: 0,
    twoHandDistance: 0, lastTwoHandDistance: 0,
    lastDetectionAt: 0, landmarker: null,
    recording: null, recordingChunks: [], recordStartedAt: 0, recordTimer: 0,
  };

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function mirrorPoint(lm, w, h) {
    return { x: (1 - lm.x) * w, y: lm.y * h, z: lm.z || 0 };
  }

  function palmCenter(points) {
    const ids = [0, 5, 9, 13, 17];
    return ids.reduce((out, id) => ({ x: out.x + points[id].x / ids.length, y: out.y + points[id].y / ids.length }), { x: 0, y: 0 });
  }

  function handMetrics(points, previous, dt) {
    const palm = palmCenter(points);
    const wrist = points[0];
    const middleMcp = points[9];
    const scale = Math.max(24, dist(wrist, middleMcp));
    const pinch = clamp(dist(points[4], points[8]) / (scale * 1.9), 0, 1);
    const tipIds = [4, 8, 12, 16, 20];
    const openness = clamp(tipIds.reduce((sum, id) => sum + dist(points[id], wrist), 0) / (tipIds.length * scale * 2.5), 0, 1);
    const vx = previous ? (palm.x - previous.palm.x) / Math.max(0.016, dt) : 0;
    const vy = previous ? (palm.y - previous.palm.y) / Math.max(0.016, dt) : 0;
    const speed = Math.hypot(vx, vy);
    const previousSpeed = previous?.speed || 0;
    const accel = (speed - previousSpeed) / Math.max(0.016, dt);
    return { points, palm, scale, pinch, openness, vx, vy, speed, accel };
  }

  function resize() {
    const w = video.videoWidth || sourceCanvas.width || 1280;
    const h = video.videoHeight || sourceCanvas.height || 720;
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      [canvas, frame, feedback, scratch].forEach((c) => { c.width = w; c.height = h; });
      fbctx.clearRect(0, 0, w, h);
    }
  }

  function drawMirrored(target, w, h, dx = 0, dy = 0) {
    target.save();
    target.translate(w, 0);
    target.scale(-1, 1);
    target.drawImage(video, -dx, dy, w, h);
    target.restore();
  }

  function updateFrame(w, h) {
    fctx.clearRect(0, 0, w, h);
    drawMirrored(fctx, w, h);
  }

  function interactionEnergy() {
    const diagonal = Math.hypot(canvas.width, canvas.height) || 1;
    const raw = state.hands.reduce((sum, hand) => sum + hand.speed / diagonal, 0);
    state.energy = lerp(state.energy, clamp(raw * 2.8, 0, 1), 0.24);
    const accelRaw = state.hands.reduce((sum, hand) => sum + Math.abs(hand.accel) / diagonal, 0);
    state.accel = lerp(state.accel, clamp(accelRaw * 0.08, 0, 1), 0.2);
  }

  function drawBase(w, h, saturation = 1.06, contrast = 1.03, brightness = 1) {
    ctx.filter = `saturate(${saturation}) contrast(${contrast}) brightness(${brightness})`;
    ctx.drawImage(frame, 0, 0);
    ctx.filter = 'none';
  }

  function drawEcho(w, h) {
    ctx.fillStyle = '#050609';
    ctx.fillRect(0, 0, w, h);
    const dominant = state.hands[0];
    const vx = dominant ? dominant.vx : 0;
    const vy = dominant ? dominant.vy : 0;
    const speed = clamp(state.energy, 0, 1);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.76;
    ctx.translate(w / 2 + vx * 0.012, h / 2 + vy * 0.012);
    const feedbackScale = 0.996 - speed * 0.006;
    ctx.scale(feedbackScale, feedbackScale);
    ctx.drawImage(feedback, -w / 2, -h / 2, w, h);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.72 + (1 - speed) * 0.2;
    ctx.filter = `saturate(${1.12 + speed * 0.8}) contrast(${1.04 + speed * 0.2})`;
    ctx.drawImage(frame, 0, 0);
    ctx.restore();

    if (dominant) {
      const layers = 3 + Math.round(speed * 7);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = 1; i <= layers; i++) {
        const k = i / layers;
        ctx.globalAlpha = (0.15 + speed * 0.08) * (1 - k * 0.75);
        const dx = -dominant.vx * 0.02 * k;
        const dy = -dominant.vy * 0.02 * k;
        ctx.filter = `blur(${0.8 + k * 1.8}px) hue-rotate(${k * 16 * speed}deg)`;
        ctx.drawImage(frame, dx, dy, w, h);
      }
      ctx.restore();
    }

    fbctx.clearRect(0, 0, w, h);
    fbctx.globalAlpha = 0.92;
    fbctx.drawImage(canvas, 0, 0);
  }

  function drawLocalizedSlices(hand, w, h, amount, directionX, directionY) {
    const radius = hand.scale * (2.1 + hand.openness * 1.2);
    const top = Math.max(0, hand.palm.y - radius);
    const bottom = Math.min(h, hand.palm.y + radius);
    const step = Math.max(5, Math.round(radius / 12));
    for (let y = top; y < bottom; y += step) {
      const normalized = 1 - Math.abs(y - hand.palm.y) / radius;
      if (normalized <= 0) continue;
      const wave = Math.sin((y - hand.palm.y) * 0.035 + performance.now() * 0.0024);
      const shiftX = (directionX * 0.018 + wave * 8) * amount * normalized;
      const shiftY = directionY * 0.004 * amount * normalized;
      ctx.globalAlpha = 0.42 + normalized * 0.42;
      ctx.drawImage(frame, 0, y, w, step + 1, shiftX, y + shiftY, w, step + 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawFlow(w, h) {
    drawBase(w, h, 1.1, 1.04, 0.98);
    if (!state.hands.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const hand of state.hands) {
      const localEnergy = clamp(hand.speed / (Math.hypot(w, h) * 0.65), 0, 1);
      drawLocalizedSlices(hand, w, h, 0.4 + localEnergy * 2.8, hand.vx, hand.vy);
      const radius = hand.scale * (2.4 + hand.openness * 1.4);
      const pulse = ctx.createRadialGradient(hand.palm.x, hand.palm.y, 0, hand.palm.x, hand.palm.y, radius);
      const pinchPower = 1 - hand.pinch;
      pulse.addColorStop(0, `rgba(255,255,255,${0.04 + localEnergy * 0.14 + pinchPower * 0.08})`);
      pulse.addColorStop(0.32, `rgba(79,238,255,${0.05 + localEnergy * 0.13})`);
      pulse.addColorStop(0.72, `rgba(255,91,224,${0.02 + localEnergy * 0.08})`);
      pulse.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = pulse;
      ctx.fillRect(hand.palm.x - radius, hand.palm.y - radius, radius * 2, radius * 2);
      ctx.strokeStyle = `rgba(210,252,255,${0.1 + localEnergy * 0.35})`;
      ctx.lineWidth = 1.2 + localEnergy * 3;
      ctx.beginPath();
      ctx.arc(hand.palm.x, hand.palm.y, radius * (0.24 + hand.pinch * 0.42), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawElectricArc(a, b, intensity) {
    const segments = 16;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    ctx.beginPath();
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const jitter = Math.sin(i * 9.7 + performance.now() * 0.03) * len * 0.018 * intensity + (Math.random() - 0.5) * len * 0.018 * intensity;
      const x = lerp(a.x, b.x, t) + nx * jitter;
      const y = lerp(a.y, b.y, t) + ny * jitter;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
  }

  function drawElectric(w, h) {
    ctx.fillStyle = '#03050a';
    ctx.fillRect(0, 0, w, h);
    const energy = state.energy;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = `blur(${10 + energy * 16}px) saturate(2.2) brightness(${1.05 + energy * 0.75})`;
    ctx.globalAlpha = 0.24 + energy * 0.28;
    ctx.drawImage(frame, 0, 0);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.62 + energy * 0.26;
    ctx.filter = 'saturate(2.2) contrast(1.45) hue-rotate(128deg)';
    ctx.drawImage(frame, -3 - energy * 8, 0, w, h);
    ctx.filter = 'saturate(2.2) contrast(1.45) hue-rotate(252deg)';
    ctx.drawImage(frame, 3 + energy * 8, 0, w, h);
    ctx.restore();
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const hand of state.hands) {
      const local = clamp(hand.speed / (Math.hypot(w, h) * 0.7), 0.08, 1);
      const r = hand.scale * (0.55 + hand.openness * 0.5);
      const g = ctx.createRadialGradient(hand.palm.x, hand.palm.y, 0, hand.palm.x, hand.palm.y, r * 2.4);
      g.addColorStop(0, `rgba(255,255,255,${0.22 + local * 0.45})`);
      g.addColorStop(0.18, `rgba(77,244,255,${0.16 + local * 0.42})`);
      g.addColorStop(0.55, `rgba(255,70,224,${0.05 + local * 0.22})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(hand.palm.x - r * 2.4, hand.palm.y - r * 2.4, r * 4.8, r * 4.8);
      for (let i = 0; i < 8 + Math.round(local * 10); i++) {
        const angle = (i / 8) * Math.PI * 2 + performance.now() * 0.0015;
        const length = r * (0.8 + Math.random() * (0.8 + local));
        const end = { x: hand.palm.x + Math.cos(angle) * length, y: hand.palm.y + Math.sin(angle) * length };
        drawElectricArc(hand.palm, end, 0.5 + local);
        ctx.strokeStyle = i % 2 ? `rgba(255,92,229,${0.08 + local * 0.34})` : `rgba(91,247,255,${0.12 + local * 0.44})`;
        ctx.lineWidth = 0.8 + local * 1.8;
        ctx.stroke();
      }
    }
    if (state.hands.length === 2) {
      const a = state.hands[0].points[8];
      const b = state.hands[1].points[8];
      const d = dist(a, b);
      const gate = clamp(1 - d / (Math.min(w, h) * 0.55), 0, 1);
      if (gate > 0.04) {
        drawElectricArc(a, b, 0.8 + gate * 1.8);
        ctx.strokeStyle = `rgba(218,255,255,${0.18 + gate * 0.72})`;
        ctx.lineWidth = 1.2 + gate * 3.5;
        ctx.shadowColor = '#65f8ff';
        ctx.shadowBlur = 12 + gate * 30;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawGlitch(w, h) {
    drawBase(w, h, 1.15, 1.1, 0.98);
    const energy = state.energy;
    const burst = clamp(state.accel * 1.5, 0, 1);
    const dominant = state.hands[0];
    if (!dominant || energy < 0.025) return;
    const dir = dominant.vx >= 0 ? 1 : -1;
    const split = (4 + energy * 28 + burst * 22) * dir;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.18 + energy * 0.28;
    ctx.filter = 'hue-rotate(120deg) saturate(2)';
    ctx.drawImage(frame, split, 0, w, h);
    ctx.filter = 'hue-rotate(245deg) saturate(2)';
    ctx.drawImage(frame, -split, 0, w, h);
    ctx.restore();
    const rows = 4 + Math.round(energy * 12 + burst * 10);
    for (let i = 0; i < rows; i++) {
      const spread = dominant.scale * (1.5 + energy * 2.8);
      const y = clamp(dominant.palm.y + (Math.random() - 0.5) * spread * 2, 0, h - 2);
      const sliceH = 4 + Math.random() * (12 + energy * 38);
      const shift = dominant.vx * (0.012 + Math.random() * 0.018) + dir * burst * (30 + Math.random() * 60);
      ctx.globalAlpha = 0.38 + Math.random() * 0.42;
      ctx.drawImage(frame, 0, y, w, sliceH, shift, y + dominant.vy * 0.002, w, sliceH);
    }
    ctx.globalAlpha = 1;
  }

  function drawHolo(w, h) {
    drawBase(w, h, 1.18, 1.08, 0.98);
    const energy = state.energy;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const hand of state.hands) {
      const p = hand.palm;
      const local = clamp(hand.speed / (Math.hypot(w, h) * 0.8), 0, 1);
      const radius = hand.scale * (1.4 + hand.openness * 1.6);
      const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius * 2.2);
      gradient.addColorStop(0, `rgba(255,255,255,${0.08 + local * 0.22})`);
      gradient.addColorStop(0.22, `rgba(70,236,255,${0.1 + local * 0.24})`);
      gradient.addColorStop(0.52, `rgba(255,82,220,${0.05 + local * 0.18})`);
      gradient.addColorStop(0.8, `rgba(204,255,83,${0.02 + local * 0.1})`);
      gradient.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(p.x - radius * 2.2, p.y - radius * 2.2, radius * 4.4, radius * 4.4);
      const rings = 3 + Math.round(local * 4);
      for (let i = 0; i < rings; i++) {
        const phase = (performance.now() * 0.00035 * (1 + local) + i / rings) % 1;
        ctx.strokeStyle = `hsla(${(performance.now() * 0.025 + i * 72) % 360}, 100%, 72%, ${(1 - phase) * (0.08 + local * 0.24)})`;
        ctx.lineWidth = 1 + local * 2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, radius * (0.4 + phase * 1.6), radius * (0.18 + phase * 0.72), Math.atan2(hand.vy, hand.vx || 1), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (state.hands.length === 2) {
      const a = state.hands[0].palm;
      const b = state.hands[1].palm;
      ctx.strokeStyle = `rgba(190,250,255,${0.08 + energy * 0.32})`;
      ctx.lineWidth = 1.4 + energy * 2.8;
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = -performance.now() * 0.04;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function render() {
    resize();
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h || video.readyState < 2) {
      requestAnimationFrame(render);
      return;
    }
    updateFrame(w, h);
    interactionEnergy();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    switch (state.effect) {
      case 'flow': drawFlow(w, h); break;
      case 'electric': drawElectric(w, h); break;
      case 'glitch': drawGlitch(w, h); break;
      case 'holo': drawHolo(w, h); break;
      case 'echo': default: drawEcho(w, h); break;
    }
    requestAnimationFrame(render);
  }

  async function initTracking() {
    try {
      const { HandLandmarker, FilesetResolver } = await import(TASKS_VISION_URL);
      const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
      state.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.35,
        minHandPresenceConfidence: 0.35,
        minTrackingConfidence: 0.35,
      });
      scheduleTracking();
    } catch (error) {
      console.warn('Interactive hand tracking unavailable; effects fall back to camera-only rendering.', error);
    }
  }

  function scheduleTracking() {
    let previousTimestamp = performance.now();
    const tick = () => {
      const now = performance.now();
      if (state.landmarker && video.readyState >= 2 && now - state.lastDetectionAt >= 50) {
        state.lastDetectionAt = now;
        try {
          const result = state.landmarker.detectForVideo(video, now);
          const dt = (now - previousTimestamp) / 1000;
          previousTimestamp = now;
          const previousHands = state.hands;
          const rawHands = (result.landmarks || []).map((hand) => hand.map((lm) => mirrorPoint(lm, canvas.width, canvas.height)));
          state.hands = rawHands.map((points, index) => handMetrics(points, previousHands[index], dt));
          if (state.hands.length === 2) {
            state.lastTwoHandDistance = state.twoHandDistance || dist(state.hands[0].palm, state.hands[1].palm);
            state.twoHandDistance = dist(state.hands[0].palm, state.hands[1].palm);
          }
        } catch (error) {
          console.warn('Interactive tracking frame skipped', error);
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function buildToolbar() {
    const toolbar = document.createElement('div');
    toolbar.id = 'interactive-toolbar';
    const select = document.createElement('select');
    select.id = 'interactive-effect-select';
    select.setAttribute('aria-label', '选择实时互动视觉效果');
    EFFECTS.forEach((effect) => {
      const option = document.createElement('option');
      option.value = effect.id;
      option.textContent = `${effect.zh} · ${effect.en}`;
      select.appendChild(option);
    });
    select.value = state.effect;
    select.addEventListener('change', () => {
      state.effect = select.value;
      fbctx.clearRect(0, 0, feedback.width, feedback.height);
    });
    const meter = document.createElement('div');
    meter.className = 'motion-meter';
    meter.innerHTML = '<span></span>';
    const meterFill = meter.querySelector('span');
    const animateMeter = () => {
      meterFill.style.transform = `scaleX(${Math.max(0.04, state.energy)})`;
      requestAnimationFrame(animateMeter);
    };
    requestAnimationFrame(animateMeter);
    const record = document.createElement('button');
    record.type = 'button';
    record.className = 'interactive-record';
    record.innerHTML = '<span class="interactive-record-dot"></span><span class="interactive-record-label">录制</span><time>00:00</time>';
    record.addEventListener('click', () => toggleRecording(record));
    toolbar.append(select, meter, record);
    document.body.appendChild(toolbar);
  }

  function supportedMime() {
    if (typeof MediaRecorder === 'undefined') return '';
    return ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
  }

  function toggleRecording(button) {
    if (state.recording?.state === 'recording') {
      state.recording.stop();
      return;
    }
    if (!canvas.captureStream || typeof MediaRecorder === 'undefined') return;
    const stream = canvas.captureStream(30);
    const mime = supportedMime();
    const recorder = mime ? new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 }) : new MediaRecorder(stream);
    state.recording = recorder;
    state.recordingChunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) state.recordingChunks.push(event.data); };
    recorder.onstop = () => {
      clearInterval(state.recordTimer);
      button.classList.remove('is-recording');
      button.querySelector('.interactive-record-label').textContent = '录制';
      button.querySelector('time').textContent = '00:00';
      const finalMime = recorder.mimeType || mime || 'video/webm';
      const ext = finalMime.startsWith('video/mp4') ? 'mp4' : 'webm';
      if (state.recordingChunks.length) {
        const blob = new Blob(state.recordingChunks, { type: finalMime });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `FrameLab-interactive-${Date.now()}.${ext}`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1200);
      }
      stream.getTracks().forEach((track) => track.stop());
      state.recording = null;
    };
    recorder.start(1000);
    state.recordStartedAt = Date.now();
    button.classList.add('is-recording');
    button.querySelector('.interactive-record-label').textContent = '停止';
    const time = button.querySelector('time');
    state.recordTimer = setInterval(() => {
      const seconds = Math.floor((Date.now() - state.recordStartedAt) / 1000);
      time.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }, 250);
  }

  document.documentElement.classList.add('interactive-live');
  if (legacyToolbar) legacyToolbar.setAttribute('aria-hidden', 'true');
  buildToolbar();
  requestAnimationFrame(render);
  initTracking();
})();

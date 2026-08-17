const HERO_EFFECTS = new Set(["holo", "glitch", "triprism"]);
const LABELS = {
  holo: "捏合棱镜",
  glitch: "挥手撕裂",
  triprism: "框选传送门",
};

const STALE_SIGNAL_MS = 110;
const SWIPE_COOLDOWN_MS = 150;
const SWIPE_LIFETIME_MS = 520;

const video = document.getElementById("video");
const baseCanvas = document.getElementById("canvas");
const toolbar = document.getElementById("toolbar");

if (!video || !baseCanvas || !toolbar) {
  // Only live.html has all three nodes. Keep the module inert elsewhere.
} else {
  // Draw directly into live.html's real output canvas. This deliberately runs
  // after the legacy renderer so the three hero effects replace the old 2D
  // visuals and remain part of canvas.captureStream() recordings.
  const ctx = baseCanvas.getContext("2d");
  const source = document.createElement("canvas");
  const sourceCtx = source.getContext("2d");
  const temp = document.createElement("canvas");
  const tempCtx = temp.getContext("2d");

  let raf = 0;
  let tears = [];
  let lastSwipeAt = -Infinity;
  let lastHeroEffect = "";

  function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
  }

  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - clamp(t), 3);
  }

  function currentEffectId() {
    return toolbar.querySelector('button[data-id].active, button[data-id][aria-pressed="true"]')?.dataset.id || "";
  }

  function resizeToBase() {
    const w = baseCanvas.width || video.videoWidth || 1280;
    const h = baseCanvas.height || video.videoHeight || 720;
    if (source.width !== w || source.height !== h) {
      source.width = w;
      source.height = h;
      temp.width = w;
      temp.height = h;
    }
    return { w, h };
  }

  function drawMirroredFrame(targetCtx, w, h) {
    targetCtx.save();
    targetCtx.translate(w, 0);
    targetCtx.scale(-1, 1);
    targetCtx.drawImage(video, 0, 0, w, h);
    targetCtx.restore();
  }

  function refreshSource(w, h) {
    sourceCtx.clearRect(0, 0, w, h);
    drawMirroredFrame(sourceCtx, w, h);
  }

  function drawCleanBase(w, h) {
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0);
    ctx.restore();
  }

  function activeSignal(now) {
    const signal = globalThis.FRAMELAB_GESTURE_3D;
    if (!signal || !Number.isFinite(signal.timestamp)) return null;
    if (now - signal.timestamp > STALE_SIGNAL_MS) return null;
    return signal;
  }

  function pathQuad(targetCtx, quad) {
    if (!quad?.length) return;
    targetCtx.beginPath();
    targetCtx.moveTo(quad[0].x, quad[0].y);
    for (let i = 1; i < quad.length; i += 1) targetCtx.lineTo(quad[i].x, quad[i].y);
    targetCtx.closePath();
  }

  function normalizedQuadToPixels(quad, w, h) {
    return quad.map((point) => ({ x: point.x * w, y: point.y * h }));
  }

  function quadCenter(quad) {
    return quad.reduce(
      (sum, point) => ({ x: sum.x + point.x / quad.length, y: sum.y + point.y / quad.length }),
      { x: 0, y: 0 }
    );
  }

  function quadBounds(quad) {
    return {
      x0: Math.min(...quad.map((point) => point.x)),
      y0: Math.min(...quad.map((point) => point.y)),
      x1: Math.max(...quad.map((point) => point.x)),
      y1: Math.max(...quad.map((point) => point.y)),
    };
  }

  function drawPinchPrism(signal, w, h) {
    const pinch = signal?.pinch;
    if (!pinch || pinch.handIndex < 0 || pinch.strength < 0.08) return;

    const hand = signal.hands?.[pinch.handIndex];
    const cx = pinch.x * w;
    const cy = pinch.y * h;
    const palmScalePx = (hand?.palmScale || 0.12) * Math.min(w, h);
    const depth = clamp((-pinch.z - 0.005) * 4.2, -0.2, 1);
    const depthVelocity = clamp(Math.abs(hand?.vz || 0) * 0.42, 0, 0.7);
    const strength = clamp(pinch.strength * 0.88 + depthVelocity * 0.28);
    const radius = clamp(palmScalePx * (1.25 + strength * 0.8), Math.min(w, h) * 0.08, Math.min(w, h) * 0.28);
    const tilt = clamp(pinch.tiltZ * 8, -1, 1);
    const zoom = 1.06 + strength * 0.42 + depth * 0.08;

    ctx.save();
    ctx.beginPath();
    const sides = 8;
    for (let i = 0; i < sides; i += 1) {
      const angle = -Math.PI / 8 + (Math.PI * 2 * i) / sides;
      const rx = radius * (1 + Math.sin(angle * 2) * tilt * 0.08);
      const x = cx + Math.cos(angle) * rx;
      const y = cy + Math.sin(angle) * radius * (0.82 + depth * 0.06);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.clip();

    ctx.translate(cx, cy);
    ctx.scale(zoom, zoom);
    ctx.translate(-cx, -cy);
    ctx.filter = `saturate(${1.25 + strength * 0.9}) contrast(${1.08 + strength * 0.28}) brightness(${1.02 + depth * 0.08})`;
    ctx.drawImage(source, 0, 0);
    ctx.filter = "none";

    const split = radius * (0.055 + strength * 0.09);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = 0.24 + strength * 0.18;
    ctx.filter = "hue-rotate(105deg) saturate(1.8)";
    ctx.drawImage(source, split * (1 + tilt), -split * 0.25);
    ctx.filter = "hue-rotate(-95deg) saturate(1.8)";
    ctx.drawImage(source, -split * (1 - tilt), split * 0.22);
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineJoin = "round";
    const glow = ctx.createRadialGradient(cx, cy, radius * 0.05, cx, cy, radius * 1.2);
    glow.addColorStop(0, `rgba(255,255,255,${0.2 + strength * 0.22})`);
    glow.addColorStop(0.38, `rgba(199,241,91,${0.12 + strength * 0.24})`);
    glow.addColorStop(0.7, `rgba(86,105,255,${0.08 + strength * 0.18})`);
    glow.addColorStop(1, "rgba(255,69,169,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(cx - radius * 1.3, cy - radius * 1.3, radius * 2.6, radius * 2.6);

    const ringGradient = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius);
    ringGradient.addColorStop(0, "rgba(216,255,255,.92)");
    ringGradient.addColorStop(.28, "rgba(199,241,91,.96)");
    ringGradient.addColorStop(.56, "rgba(82,111,255,.92)");
    ringGradient.addColorStop(.82, "rgba(255,68,166,.94)");
    ringGradient.addColorStop(1, "rgba(216,255,255,.92)");
    ctx.strokeStyle = ringGradient;
    ctx.shadowColor = "rgba(117,230,255,.8)";
    ctx.shadowBlur = 18 + strength * 18;
    ctx.lineWidth = 2.2 + strength * 2.2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius, radius * (0.82 + depth * 0.06), tilt * 0.18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    for (let i = 1; i <= 3; i += 1) {
      const r = radius * (0.22 + i * 0.19);
      ctx.globalAlpha = 0.14 + strength * 0.12;
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * (0.82 + depth * 0.06), tilt * 0.18, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "rgba(231,255,255,.94)";
    ctx.beginPath();
    ctx.arc(cx, cy, 2.2 + strength * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function maybeSpawnSwipe(signal, now) {
    const swipe = signal?.swipe;
    if (!swipe || swipe.handIndex < 0 || swipe.strength < 0.34) return;
    if (now - lastSwipeAt < SWIPE_COOLDOWN_MS) return;

    lastSwipeAt = now;
    tears.push({
      bornAt: now,
      x: swipe.x,
      y: swipe.y,
      z: swipe.z,
      vx: swipe.vx,
      vy: swipe.vy,
      vz: swipe.vz,
      strength: swipe.strength,
      axis: swipe.axis,
      direction: swipe.direction || 1,
      seed: Math.random() * 1000,
    });
    if (tears.length > 7) tears = tears.slice(-7);
  }

  function drawSwipeTear(signal, w, h, now) {
    maybeSpawnSwipe(signal, now);
    tears = tears.filter((tear) => now - tear.bornAt < SWIPE_LIFETIME_MS);
    if (!tears.length) return;

    ctx.save();
    for (const tear of tears) {
      const age = clamp((now - tear.bornAt) / SWIPE_LIFETIME_MS);
      const decay = 1 - age;
      const kick = easeOutCubic(Math.min(1, age * 2.4)) * decay;
      const depthKick = 1 + clamp(Math.abs(tear.vz) * 0.5, 0, 0.9);
      const strength = tear.strength * decay;
      const horizontal = tear.axis === "x";
      const sliceCount = 10;
      const centerX = tear.x * w;
      const centerY = tear.y * h;
      const spread = (horizontal ? h : w) * (0.18 + tear.strength * 0.18);
      const maxShift = (horizontal ? w : h) * (0.028 + tear.strength * 0.085) * depthKick;

      for (let i = 0; i < sliceCount; i += 1) {
        const unit = i / Math.max(1, sliceCount - 1) - 0.5;
        const wave = Math.sin(tear.seed + i * 2.7) * 0.55 + Math.sin(i * 0.83) * 0.45;
        const localShift = maxShift * (0.42 + Math.abs(wave) * 0.8) * tear.direction * kick;
        ctx.globalAlpha = 0.42 + strength * 0.45;
        ctx.filter = i % 3 === 0 ? "hue-rotate(82deg) saturate(1.65)" : i % 3 === 1 ? "hue-rotate(-78deg) saturate(1.55)" : "none";

        if (horizontal) {
          const bandH = Math.max(4, h * (0.009 + tear.strength * 0.012));
          const sy = clamp(centerY + unit * spread + wave * bandH * 1.7, 0, h - bandH);
          ctx.drawImage(source, 0, sy, w, bandH, localShift, sy + wave * 2.2, w, bandH);
        } else {
          const bandW = Math.max(4, w * (0.009 + tear.strength * 0.012));
          const sx = clamp(centerX + unit * spread + wave * bandW * 1.7, 0, w - bandW);
          ctx.drawImage(source, sx, 0, bandW, h, sx + wave * 2.2, localShift, bandW, h);
        }
      }

      ctx.filter = "none";
      ctx.globalCompositeOperation = "screen";
      const g = horizontal
        ? ctx.createLinearGradient(centerX - maxShift * 2, centerY, centerX + maxShift * 2, centerY)
        : ctx.createLinearGradient(centerX, centerY - maxShift * 2, centerX, centerY + maxShift * 2);
      g.addColorStop(0, "rgba(255,58,136,0)");
      g.addColorStop(.4, `rgba(255,58,136,${0.24 + strength * 0.28})`);
      g.addColorStop(.52, `rgba(222,255,255,${0.48 + strength * 0.34})`);
      g.addColorStop(.65, `rgba(50,230,255,${0.22 + strength * 0.3})`);
      g.addColorStop(1, "rgba(50,230,255,0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.3 + tear.strength * 3.2;
      ctx.shadowColor = horizontal ? "rgba(255,65,160,.75)" : "rgba(61,230,255,.75)";
      ctx.shadowBlur = 10 + tear.strength * 18;
      ctx.beginPath();
      if (horizontal) {
        ctx.moveTo(centerX - w * 0.32, centerY);
        ctx.lineTo(centerX + w * 0.32, centerY + tear.vy * h * 0.018);
      } else {
        ctx.moveTo(centerX, centerY - h * 0.32);
        ctx.lineTo(centerX + tear.vx * w * 0.018, centerY + h * 0.32);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalCompositeOperation = "source-over";
    }
    ctx.restore();
  }

  function insetQuad(quad, factor) {
    const center = quadCenter(quad);
    return quad.map((point) => ({
      x: mix(point.x, center.x, factor),
      y: mix(point.y, center.y, factor),
    }));
  }

  function drawPortalWalls(front, back, depthStrength) {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 0; i < 4; i += 1) {
      const j = (i + 1) % 4;
      const grad = ctx.createLinearGradient(front[i].x, front[i].y, back[i].x, back[i].y);
      grad.addColorStop(0, i % 2 === 0 ? `rgba(199,241,91,${0.14 + depthStrength * 0.22})` : `rgba(255,67,164,${0.13 + depthStrength * 0.2})`);
      grad.addColorStop(1, i % 2 === 0 ? `rgba(70,89,255,${0.2 + depthStrength * 0.22})` : `rgba(50,229,255,${0.18 + depthStrength * 0.22})`);
      ctx.beginPath();
      ctx.moveTo(front[i].x, front[i].y);
      ctx.lineTo(front[j].x, front[j].y);
      ctx.lineTo(back[j].x, back[j].y);
      ctx.lineTo(back[i].x, back[i].y);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    }
    ctx.restore();
  }

  function drawFramePortal(signal, w, h, now) {
    const frame = signal?.frame;
    if (!frame?.valid || !frame.quad?.length) return;

    const front = normalizedQuadToPixels(frame.quad, w, h);
    const center = quadCenter(front);
    const depthStrength = clamp((-frame.depth + 0.025) * 4.4 + frame.depthSpread * 3.2, 0.08, 1);
    const sideTilt = clamp(frame.depthDelta * 8, -1, 1);
    const baseExtrude = 12 + depthStrength * 46;
    const depthVector = {
      x: sideTilt * (18 + depthStrength * 22),
      y: 8 + depthStrength * 22,
    };
    const averageCornerDepth = frame.cornerDepths?.reduce((sum, value) => sum + value, 0) / Math.max(1, frame.cornerDepths?.length || 1) || 0;
    const back = front.map((point, index) => {
      const localDepth = frame.cornerDepths?.[index] ?? averageCornerDepth;
      const perCorner = clamp((averageCornerDepth - localDepth) * 8, -0.65, 0.65);
      return {
        x: point.x + depthVector.x + perCorner * baseExtrude * 0.7,
        y: point.y + depthVector.y + (0.25 - perCorner) * baseExtrude * 0.26,
      };
    });

    drawPortalWalls(front, back, depthStrength);

    const bounds = quadBounds(front);
    const portalW = Math.max(1, bounds.x1 - bounds.x0);
    const portalH = Math.max(1, bounds.y1 - bounds.y0);
    const t = now / 1000;

    ctx.save();
    pathQuad(ctx, front);
    ctx.clip();
    ctx.translate(center.x, center.y);
    const zoom = 1.07 + depthStrength * 0.2;
    ctx.scale(zoom, zoom);
    ctx.rotate(sideTilt * 0.035);
    ctx.translate(-center.x, -center.y);
    ctx.filter = `saturate(${1.45 + depthStrength * 0.75}) contrast(${1.12 + depthStrength * 0.28}) hue-rotate(${sideTilt * 18}deg)`;
    ctx.drawImage(source, depthVector.x * 0.32, depthVector.y * 0.22);
    ctx.filter = "none";

    ctx.globalCompositeOperation = "screen";
    const wash = ctx.createLinearGradient(bounds.x0, bounds.y0, bounds.x1, bounds.y1);
    wash.addColorStop(0, `rgba(70,95,255,${0.06 + depthStrength * 0.1})`);
    wash.addColorStop(.45, `rgba(199,241,91,${0.04 + depthStrength * 0.1})`);
    wash.addColorStop(1, `rgba(255,65,166,${0.06 + depthStrength * 0.12})`);
    ctx.fillStyle = wash;
    ctx.fillRect(bounds.x0, bounds.y0, portalW, portalH);

    ctx.globalAlpha = 0.14 + depthStrength * 0.18;
    ctx.strokeStyle = "rgba(227,255,255,.88)";
    ctx.lineWidth = 1.2;
    for (let y = bounds.y0; y < bounds.y1; y += Math.max(7, portalH / 32)) {
      const wobble = Math.sin(t * 2.2 + y * 0.024) * 2.5;
      ctx.beginPath();
      ctx.moveTo(bounds.x0 + wobble, y);
      ctx.lineTo(bounds.x1 + wobble, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    for (let i = 4; i >= 1; i -= 1) {
      const inner = insetQuad(front, i * 0.11);
      ctx.globalAlpha = (0.08 + depthStrength * 0.06) * (5 - i);
      ctx.strokeStyle = i % 2 === 0 ? "rgba(199,241,91,.8)" : "rgba(94,112,255,.85)";
      ctx.lineWidth = 1.2 + (5 - i) * 0.35;
      pathQuad(ctx, inner);
      ctx.stroke();
    }

    const frontGradient = ctx.createLinearGradient(front[0].x, front[0].y, front[2].x, front[2].y);
    frontGradient.addColorStop(0, "rgba(210,255,255,.98)");
    frontGradient.addColorStop(.25, "rgba(199,241,91,.98)");
    frontGradient.addColorStop(.52, "rgba(82,105,255,.96)");
    frontGradient.addColorStop(.78, "rgba(255,63,164,.96)");
    frontGradient.addColorStop(1, "rgba(210,255,255,.98)");
    ctx.globalAlpha = 0.86 + depthStrength * 0.14;
    ctx.strokeStyle = frontGradient;
    ctx.lineWidth = 2.2 + depthStrength * 2.4;
    ctx.shadowColor = "rgba(82,221,255,.8)";
    ctx.shadowBlur = 14 + depthStrength * 18;
    pathQuad(ctx, front);
    ctx.stroke();

    ctx.globalAlpha = 0.42 + depthStrength * 0.2;
    ctx.strokeStyle = "rgba(97,111,255,.86)";
    ctx.lineWidth = 1.6;
    ctx.shadowBlur = 8;
    pathQuad(ctx, back);
    ctx.stroke();
    ctx.shadowBlur = 0;

    front.forEach((point, index) => {
      const pulse = 2.4 + Math.sin(t * 4.5 + index) * 0.7 + depthStrength * 1.5;
      ctx.fillStyle = index % 2 === 0 ? "rgba(199,241,91,.94)" : "rgba(236,252,255,.94)";
      ctx.beginPath();
      ctx.arc(point.x, point.y, pulse, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function renameHeroButtons() {
    let renamed = false;
    for (const [id, label] of Object.entries(LABELS)) {
      const button = toolbar.querySelector(`button[data-id="${id}"]`);
      if (!button) continue;
      const key = button.querySelector(".key")?.textContent?.trim() || "";
      const currentLabel = button.textContent.replace(key, "").trim();
      if (currentLabel === label && button.title.startsWith(label)) continue;
      button.innerHTML = `${key ? `<span class="key">${key}</span>` : ""}${label}`;
      button.title = `${label}${key ? ` (${key})` : ""}`;
      renamed = true;
    }
    return renamed;
  }

  function render(now) {
    const effect = currentEffectId();
    const isHero = HERO_EFFECTS.has(effect);
    const ready = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight;

    if (effect !== lastHeroEffect) {
      tears = [];
      lastSwipeAt = -Infinity;
      lastHeroEffect = effect;
    }

    if (!isHero || !ready) {
      scheduleNext();
      return;
    }

    const { w, h } = resizeToBase();
    refreshSource(w, h);
    drawCleanBase(w, h);

    const signal = activeSignal(now);
    if (effect === "holo") drawPinchPrism(signal, w, h);
    else if (effect === "glitch") drawSwipeTear(signal, w, h, now);
    else if (effect === "triprism") drawFramePortal(signal, w, h, now);

    scheduleNext();
  }

  const renameObserver = new MutationObserver(() => renameHeroButtons());
  renameObserver.observe(toolbar, { childList: true, subtree: false });
  renameHeroButtons();
  window.setTimeout(() => renameObserver.disconnect(), 15000);

  function scheduleNext() {
    window.setTimeout(() => {
      raf = requestAnimationFrame(render);
    }, 0);
  }

  function startWhenVideoIsReady() {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && baseCanvas.width) {
      window.setTimeout(() => {
        raf = requestAnimationFrame(render);
      }, 24);
      return;
    }
    requestAnimationFrame(startWhenVideoIsReady);
  }
  startWhenVideoIsReady();

  window.addEventListener("pagehide", () => cancelAnimationFrame(raf), { once: true });
}

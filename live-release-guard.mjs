const SIGNAL_STALE_MS = 48;
const REACQUIRE_STABLE_FRAMES = 2;

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const toolbar = document.getElementById("toolbar");

if (video && canvas && toolbar) {
  const ctx = canvas.getContext("2d");
  let raf = 0;
  let stableFrames = 0;
  let hadFreshGesture = false;
  let lastEffect = "";

  function currentEffectId() {
    return toolbar.querySelector('button[data-id].active, button[data-id][aria-pressed="true"]')?.dataset.id || "";
  }

  function freshQuad(now) {
    const signal = globalThis.FRAMELAB_GESTURE_3D;
    if (!signal || !Number.isFinite(signal.timestamp)) return false;
    if (now - signal.timestamp > SIGNAL_STALE_MS) return false;
    return Boolean(signal.quadValid && signal.quad?.length === 4);
  }

  function drawCleanCamera() {
    const w = canvas.width;
    const h = canvas.height;
    if (!w || !h || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.filter = "none";
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);
    ctx.restore();
  }

  function guard(now) {
    const effect = currentEffectId();
    if (effect !== lastEffect) {
      stableFrames = 0;
      hadFreshGesture = false;
      lastEffect = effect;
    }

    if (!freshQuad(now)) {
      stableFrames = 0;
      hadFreshGesture = false;
      drawCleanCamera();
    } else {
      stableFrames += 1;
      if (!hadFreshGesture && stableFrames < REACQUIRE_STABLE_FRAMES) {
        drawCleanCamera();
      } else {
        hadFreshGesture = true;
      }
    }

    schedule();
  }

  function schedule() {
    window.setTimeout(() => {
      raf = requestAnimationFrame(guard);
    }, 0);
  }

  function start() {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && canvas.width) {
      schedule();
      return;
    }
    requestAnimationFrame(start);
  }

  start();
  window.addEventListener("pagehide", () => cancelAnimationFrame(raf), { once: true });
}

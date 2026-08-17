(function () {
  window.FRAMELAB_EFFECTS = [
    { id: "glitch", labelKey: "effectGlitch", zh: "故障闪切", en: "Glitch Cut" },
    { id: "scan", labelKey: "effectScan", zh: "霓虹扫描", en: "Neon Scan" },
    { id: "focus", labelKey: "effectFocus", zh: "暗场聚焦", en: "Dark Focus" },
    { id: "feedback", labelKey: "effectFeedback", zh: "反馈残影", en: "Feedback Echo" },
    { id: "rgb", labelKey: "effectRgb", zh: "RGB 分离", en: "RGB Split" },
    { id: "pixel", labelKey: "effectPixel", zh: "像素海报", en: "Pixel Poster" },
    { id: "warp", labelKey: "effectWarp", zh: "液态扭曲", en: "Liquid Warp" },
    { id: "raster", labelKey: "effectRaster", zh: "扫描切片", en: "Raster Slice" },
  ];

  function loadStylesheet(href, marker) {
    if (document.querySelector(`link[${marker}]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute(marker, "true");
    document.head.appendChild(link);
  }

  function loadScript(src, marker) {
    if (document.querySelector(`script[${marker}]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.setAttribute(marker, "true");
    document.head.appendChild(script);
  }

  function loadModuleScript(src, marker) {
    if (document.querySelector(`script[${marker}]`)) return;
    const script = document.createElement("script");
    script.type = "module";
    script.src = src;
    script.setAttribute(marker, "true");
    document.head.appendChild(script);
  }

  function addLink(rel, href, extra = {}) {
    if (document.querySelector(`link[rel="${rel}"][href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = rel;
    link.href = href;
    Object.assign(link, extra);
    document.head.appendChild(link);
  }

  // Embedded live mode already gets a camera MediaStream from app.js before the
  // iframe starts. Attach and paint that stream immediately, while MediaPipe is
  // still loading in live.html, so the user sees camera pixels first instead of
  // waiting on the model/network path.
  function setupEarlyEmbeddedCamera() {
    const video = document.getElementById("video");
    const canvas = document.getElementById("canvas");
    const status = document.getElementById("status");
    const statusText = document.getElementById("status-text");
    const params = new URLSearchParams(location.search);
    const embedded = window.self !== window.top && params.has("embedded") && !params.has("demo");
    if (!embedded || !video || !canvas || !status || window.__FRAMELAB_EARLY_CAMERA__) return;
    window.__FRAMELAB_EARLY_CAMERA__ = true;

    const style = document.createElement("style");
    style.textContent = `
      #status.framelab-camera-previewing {
        inset: 12px auto auto 50% !important;
        transform: translateX(-50%);
        width: auto;
        min-width: 250px;
        height: auto;
        min-height: 42px;
        flex-direction: row;
        gap: 9px;
        padding: 9px 13px;
        border: 1px solid rgba(255,255,255,.12);
        border-radius: 999px;
        background: rgba(12,12,16,.58) !important;
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        pointer-events: none;
      }
      #status.framelab-camera-previewing .spinner { width: 16px; height: 16px; border-width: 2px; }
      #status.framelab-camera-previewing #status-text { font-size: 12px; white-space: nowrap; }
    `;
    document.head.appendChild(style);

    let raf = 0;
    let earlyStream = null;
    const ctx = canvas.getContext("2d");

    function paint() {
      if (!earlyStream?.active || status.classList.contains("hidden")) return;
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth && video.videoHeight) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      raf = requestAnimationFrame(paint);
    }

    function attach(stream) {
      if (!stream?.active) return;
      earlyStream = stream;
      window.__FRAMELAB_EARLY_STREAM__ = stream;
      if (video.srcObject !== stream) video.srcObject = stream;
      video.play().catch(() => {});
      status.classList.add("framelab-camera-previewing");
      if (statusText) statusText.textContent = "实时画面已连接 · 手势识别后台加载中…";
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(paint);
    }

    // This receiver exists before live.html's module initializes. app.js will
    // send the already-authorized parent stream to it, and then send it again
    // when live.html installs its final receiver.
    window.receiveLiveCameraStream = attach;
    window.parent?.postMessage({ type: "framelab-live-ready" }, location.origin);
    window.addEventListener("pagehide", () => cancelAnimationFrame(raf), { once: true });
  }

  function setupStreamingDemoLoader() {
    const button = document.getElementById("btn-load-demo");
    if (!button || button.dataset.streamingDemoLoader === "true") return;
    button.dataset.streamingDemoLoader = "true";

    const directByName = new Map([
      ["最终原视频.mp4", new URL("./demo-original.mp4", location.href).href],
      ["动漫.mp4", new URL("./demo-inside.mp4", location.href).href],
    ]);
    const demoUrls = new Set(directByName.values());
    const nativeFetch = window.fetch.bind(window);
    const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
    const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
    const warmers = [];
    let warming = false;
    let readyCount = 0;
    let clicked = false;

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const saveData = Boolean(connection?.saveData || /(^|-)2g$/.test(String(connection?.effectiveType || "")));

    function absoluteRequestUrl(input) {
      try {
        const raw = input instanceof Request ? input.url : String(input);
        return new URL(raw, location.href).href;
      } catch (_) {
        return "";
      }
    }

    // Scope the compatibility bridge to the two bundled demo URLs only. app.js
    // still creates File objects, but the <video> receives the original MP4 URL
    // so the browser can use range requests instead of a second full Blob copy.
    window.fetch = function framelabStreamingFetch(input, init) {
      const url = absoluteRequestUrl(input);
      if (!demoUrls.has(url)) return nativeFetch(input, init);
      return Promise.resolve(new Response(new Blob([], { type: "video/mp4" }), {
        status: 200,
        headers: { "content-type": "video/mp4", "content-length": "0" },
      }));
    };

    URL.createObjectURL = function framelabCreateObjectURL(value) {
      const direct = value && value.size === 0 && value.name ? directByName.get(value.name) : "";
      return direct || nativeCreateObjectURL(value);
    };
    URL.revokeObjectURL = function framelabRevokeObjectURL(url) {
      if (demoUrls.has(String(url))) return;
      nativeRevokeObjectURL(url);
    };

    function updateStatus() {
      if (!clicked) return;
      const label = document.documentElement.lang?.startsWith("en") ? "Opening sample" : "正在打开示例";
      button.textContent = `${label} · ${Math.min(2, readyCount)}/2`;
      button.setAttribute("aria-busy", "true");
    }

    function warmMedia(url) {
      const media = document.createElement("video");
      media.muted = true;
      media.playsInline = true;
      media.preload = "auto";
      media.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px";
      let counted = false;
      const ready = () => {
        if (counted) return;
        counted = true;
        readyCount += 1;
        updateStatus();
      };
      media.addEventListener("loadeddata", ready, { once: true });
      media.addEventListener("canplay", ready, { once: true });
      media.src = url;
      document.body.appendChild(media);
      media.load();
      warmers.push(media);
    }

    function startWarmup() {
      if (warming) return;
      warming = true;
      directByName.forEach((url) => warmMedia(url));
      addLink("modulepreload", "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs", { crossOrigin: "anonymous" });
      void nativeFetch("https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", {
        cache: "force-cache", mode: "cors",
      }).catch(() => {});
    }

    button.addEventListener("pointerenter", startWarmup, { passive: true });
    button.addEventListener("focus", startWarmup, { passive: true });
    button.addEventListener("touchstart", startWarmup, { passive: true });
    button.addEventListener("click", () => { clicked = true; startWarmup(); updateStatus(); }, { capture: true });

    if (!saveData) {
      if (typeof requestIdleCallback === "function") requestIdleCallback(startWarmup, { timeout: 1000 });
      else setTimeout(startWarmup, 700);
    }

    window.addEventListener("pagehide", () => {
      warmers.forEach((media) => { media.pause(); media.removeAttribute("src"); media.remove(); });
    }, { once: true });
  }

  addLink("preconnect", "https://cdn.jsdelivr.net", { crossOrigin: "anonymous" });
  addLink("preconnect", "https://storage.googleapis.com", { crossOrigin: "anonymous" });
  loadStylesheet("./preview-frame.css?v=3", "data-framelab-preview-fix");

  if (document.getElementById("orig-file") && document.getElementById("preview-area")) {
    setupStreamingDemoLoader();
    loadScript("./progressive-preview.js?v=1", "data-framelab-progressive-preview");
  }

  if (document.getElementById("toolbar") && document.getElementById("video") && document.getElementById("canvas")) {
    setupEarlyEmbeddedCamera();
    loadStylesheet("./live-toolbar.css?v=3", "data-framelab-live-toolbar");
    loadScript("./live-toolbar.js?v=2", "data-framelab-live-toolbar");
    loadModuleScript("./live-runtime.mjs?v=1", "data-framelab-live-runtime");
  }
})();

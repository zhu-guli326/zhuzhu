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
    let originalButtonText = "";

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

    window.fetch = function framelabStreamingFetch(input, init) {
      const url = absoluteRequestUrl(input);
      if (!demoUrls.has(url)) return nativeFetch(input, init);
      return Promise.resolve(
        new Response(new Blob([], { type: "video/mp4" }), {
          status: 200,
          headers: { "content-type": "video/mp4", "content-length": "0" },
        })
      );
    };

    URL.createObjectURL = function framelabCreateObjectURL(value) {
      const direct = value && value.size === 0 && value.name ? directByName.get(value.name) : "";
      return direct || nativeCreateObjectURL(value);
    };

    URL.revokeObjectURL = function framelabRevokeObjectURL(url) {
      if (demoUrls.has(String(url))) return;
      nativeRevokeObjectURL(url);
    };

    function updateWarmStatus() {
      if (!clicked) return;
      if (!originalButtonText) originalButtonText = button.textContent.trim();
      const label = document.documentElement.lang?.startsWith("en") ? "Opening sample" : "正在打开示例";
      button.textContent = `${label} · ${Math.min(2, readyCount)}/2`;
      button.setAttribute("aria-busy", "true");
    }

    function warmMedia(url) {
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.preload = "auto";
      video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-10px;top:-10px";
      let counted = false;
      const markReady = () => {
        if (counted) return;
        counted = true;
        readyCount += 1;
        updateWarmStatus();
      };
      video.addEventListener("loadeddata", markReady, { once: true });
      video.addEventListener("canplay", markReady, { once: true });
      video.src = url;
      document.body.appendChild(video);
      video.load();
      warmers.push(video);
    }

    function warmMediaPipe() {
      addLink(
        "modulepreload",
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs",
        { crossOrigin: "anonymous" }
      );
      void nativeFetch(
        "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        { cache: "force-cache", mode: "cors" }
      ).catch(() => {});
    }

    function startWarmup() {
      if (warming) return;
      warming = true;
      directByName.forEach((url) => warmMedia(url));
      warmMediaPipe();
    }

    button.addEventListener("pointerenter", startWarmup, { passive: true });
    button.addEventListener("focus", startWarmup, { passive: true });
    button.addEventListener("touchstart", startWarmup, { passive: true });
    button.addEventListener(
      "click",
      () => {
        clicked = true;
        originalButtonText = button.textContent.trim();
        startWarmup();
        updateWarmStatus();
      },
      { capture: true }
    );

    if (!saveData) {
      const idleStart = () => startWarmup();
      if (typeof requestIdleCallback === "function") requestIdleCallback(idleStart, { timeout: 1000 });
      else window.setTimeout(idleStart, 700);
    }

    window.addEventListener(
      "pagehide",
      () => warmers.forEach((video) => { video.pause(); video.removeAttribute("src"); video.remove(); }),
      { once: true }
    );
  }

  addLink("preconnect", "https://cdn.jsdelivr.net", { crossOrigin: "anonymous" });
  addLink("preconnect", "https://storage.googleapis.com", { crossOrigin: "anonymous" });
  loadStylesheet("./preview-frame.css?v=3", "data-framelab-preview-fix");

  if (document.getElementById("orig-file") && document.getElementById("preview-area")) {
    setupStreamingDemoLoader();
    loadScript("./progressive-preview.js?v=1", "data-framelab-progressive-preview");
  }

  if (document.getElementById("toolbar")) {
    loadStylesheet("./live-toolbar.css?v=2", "data-framelab-live-toolbar");
    loadScript("./live-toolbar.js?v=1", "data-framelab-live-toolbar");
    loadModuleScript("./live-hero-fx.mjs?v=1", "data-framelab-live-hero-fx");
    loadModuleScript("./live-release-guard.mjs?v=1", "data-framelab-live-release-guard");
  }
})();

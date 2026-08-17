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

  function preconnect(href) {
    if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    link.crossOrigin = "anonymous";
    document.head.appendChild(link);
  }

  function setupFastDemoLoader() {
    const button = document.getElementById("btn-load-demo");
    if (!button || button.dataset.fastDemoLoader === "true") return;
    button.dataset.fastDemoLoader = "true";

    const nativeFetch = window.fetch.bind(window);
    const demoUrls = [
      new URL("./demo-original.mp4", location.href).href,
      new URL("./demo-inside.mp4", location.href).href,
    ];
    const demoUrlSet = new Set(demoUrls);
    const jobs = new Map();
    let userRequestedDemo = false;
    let buttonLabel = "";

    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const avoidAutomaticPrefetch = Boolean(
      connection?.saveData || /(^|-)2g$/.test(String(connection?.effectiveType || ""))
    );

    function requestUrl(input) {
      try {
        const raw = input instanceof Request ? input.url : String(input);
        return new URL(raw, location.href).href;
      } catch (_) {
        return "";
      }
    }

    function updateButtonProgress() {
      if (!userRequestedDemo) return;
      const activeJobs = demoUrls.map((url) => jobs.get(url)).filter(Boolean);
      const total = activeJobs.reduce((sum, job) => sum + (job.total || 0), 0);
      const loaded = activeJobs.reduce((sum, job) => sum + Math.min(job.loaded || 0, job.total || Infinity), 0);
      const completed = activeJobs.filter((job) => job.done).length;
      let suffix = "";
      if (total > 0) {
        suffix = `${Math.min(99, Math.round((loaded / total) * 100))}%`;
      } else if (completed > 0) {
        suffix = `${completed}/2`;
      } else {
        suffix = "…";
      }
      button.textContent = `${buttonLabel || "Loading sample"} · ${suffix}`;
      button.setAttribute("aria-busy", "true");
    }

    function finishButtonProgress() {
      if (!userRequestedDemo) return;
      button.textContent = buttonLabel || button.textContent;
      button.removeAttribute("aria-busy");
      userRequestedDemo = false;
    }

    async function responseToBlob(response, job) {
      if (!response.ok) throw new Error(`Demo preload failed: ${response.status}`);
      const type = response.headers.get("content-type") || "video/mp4";
      const total = Number(response.headers.get("content-length")) || 0;
      job.total = total;

      if (!response.body?.getReader) {
        const blob = await response.blob();
        job.loaded = blob.size;
        job.total = job.total || blob.size;
        updateButtonProgress();
        return blob;
      }

      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        job.loaded = loaded;
        updateButtonProgress();
      }
      const blob = new Blob(chunks, { type });
      job.loaded = blob.size;
      job.total = job.total || blob.size;
      updateButtonProgress();
      return blob;
    }

    function startPrefetch(url) {
      const absoluteUrl = requestUrl(url);
      if (!demoUrlSet.has(absoluteUrl)) return null;
      const existing = jobs.get(absoluteUrl);
      if (existing) return existing.promise;

      const job = {
        loaded: 0,
        total: 0,
        done: false,
        blob: null,
        promise: null,
      };
      job.promise = nativeFetch(absoluteUrl, {
        cache: "force-cache",
        credentials: "same-origin",
        priority: "high",
      })
        .then((response) => responseToBlob(response, job))
        .then((blob) => {
          job.blob = blob;
          job.done = true;
          updateButtonProgress();
          return blob;
        })
        .catch((error) => {
          jobs.delete(absoluteUrl);
          throw error;
        });
      jobs.set(absoluteUrl, job);
      return job.promise;
    }

    function startBoth() {
      demoUrls.forEach((url) => {
        void startPrefetch(url)?.catch((error) => {
          console.warn("Demo prefetch skipped", error);
        });
      });
    }

    // app.js fetches the two demo files after the click. Reuse the same
    // in-flight/background download instead of starting two more network
    // requests from zero. The rest of window.fetch remains untouched.
    window.fetch = async function framelabFetch(input, init) {
      const absoluteUrl = requestUrl(input);
      if (!demoUrlSet.has(absoluteUrl)) return nativeFetch(input, init);

      const blob = await startPrefetch(absoluteUrl);
      return new Response(blob, {
        status: 200,
        headers: {
          "content-type": blob.type || "video/mp4",
          "content-length": String(blob.size),
        },
      });
    };

    button.addEventListener(
      "pointerenter",
      () => startBoth(),
      { passive: true }
    );
    button.addEventListener("focus", startBoth, { passive: true });
    button.addEventListener(
      "touchstart",
      () => startBoth(),
      { passive: true }
    );
    button.addEventListener(
      "click",
      () => {
        if (!userRequestedDemo) buttonLabel = button.textContent.trim();
        userRequestedDemo = true;
        startBoth();
        updateButtonProgress();
        Promise.allSettled(demoUrls.map((url) => startPrefetch(url))).then(() => {
          // app.js continues with decoding + MediaPipe after the network stage.
          // Restore the localized label once the two heavy assets are local.
          window.setTimeout(finishButtonProgress, 120);
        });
      },
      { capture: true }
    );

    // The sample CTA is above the fold. Start low-friction background work
    // after first paint on normal connections, so a later click usually reuses
    // several seconds of already-downloaded data. Respect Save-Data/2G.
    if (!avoidAutomaticPrefetch) {
      const idleStart = () => startBoth();
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(idleStart, { timeout: 900 });
      } else {
        window.setTimeout(idleStart, 650);
      }
    }

    // The model is loaded immediately after the original demo becomes ready.
    // Warm the two cross-origin connections without competing for the large
    // video downloads themselves.
    preconnect("https://cdn.jsdelivr.net");
    preconnect("https://storage.googleapis.com");
  }

  loadStylesheet("./preview-frame.css?v=3", "data-framelab-preview-fix");

  if (document.getElementById("orig-file") && document.getElementById("preview-area")) {
    setupFastDemoLoader();
    loadScript("./progressive-preview.js?v=1", "data-framelab-progressive-preview");
  }

  if (document.getElementById("toolbar")) {
    loadStylesheet("./live-toolbar.css?v=2", "data-framelab-live-toolbar");
    loadScript("./live-toolbar.js?v=1", "data-framelab-live-toolbar");
    loadModuleScript("./live-hero-fx.mjs?v=1", "data-framelab-live-hero-fx");
  }
})();

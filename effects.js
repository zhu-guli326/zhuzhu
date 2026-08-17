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

  loadStylesheet("./preview-frame.css?v=3", "data-framelab-preview-fix");

  if (document.getElementById("orig-file") && document.getElementById("preview-area")) {
    loadScript("./progressive-preview.js?v=1", "data-framelab-progressive-preview");
  }

  if (document.getElementById("toolbar")) {
    loadStylesheet("./live-toolbar.css?v=2", "data-framelab-live-toolbar");
    loadScript("./live-toolbar.js?v=1", "data-framelab-live-toolbar");
    loadModuleScript("./live-hero-fx.mjs?v=1", "data-framelab-live-hero-fx");
  }
})();

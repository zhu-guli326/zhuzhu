(function () {
  window.FRAMELAB_EFFECTS = [
    { id: "echo", labelKey: "effectEcho", zh: "身体残影", en: "Body Echo" },
    { id: "flow", labelKey: "effectFlow", zh: "液态流场", en: "Liquid Flow" },
    { id: "electric", labelKey: "effectElectric", zh: "高压电场", en: "Electric Field" },
    { id: "glitch", labelKey: "effectGlitch", zh: "动作撕裂", en: "Motion Tear" },
    { id: "holo", labelKey: "effectHolo", zh: "全息脉冲", en: "Holo Pulse" },
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

  loadStylesheet("./preview-frame.css?v=3", "data-framelab-preview-fix");

  if (document.getElementById("orig-file") && document.getElementById("preview-area")) {
    loadScript("./progressive-preview.js?v=1", "data-framelab-progressive-preview");
  }

  // Live camera mode now uses a dedicated gesture-driven rendering layer.
  // The legacy canvas remains underneath as a compatibility fallback while
  // the interactive engine owns the visible preview and recording output.
  if (document.getElementById("toolbar") && document.getElementById("video")) {
    loadStylesheet("./live-interactive.css?v=1", "data-framelab-live-interactive");
    loadScript("./live-interactive.js?v=1", "data-framelab-live-interactive");
  }
})();

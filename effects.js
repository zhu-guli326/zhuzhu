(function () {
  window.FRAMELAB_EFFECTS = [
    { id: "feedback", labelKey: "effectFeedback", zh: "反馈残影", en: "Feedback Trail" },
    { id: "flow", labelKey: "effectFlow", zh: "液态位移", en: "Fluid Displace" },
    { id: "electric", labelKey: "effectElectric", zh: "电场轮廓", en: "Electric Bloom" },
    { id: "glitch", labelKey: "effectGlitch", zh: "运动撕裂", en: "Motion Glitch" },
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

  // live.html contains the original Canvas2D + MediaPipe loop. Running the new
  // renderer on top of it means two trackers and two render loops compete for
  // the same camera. Redirect before the legacy module starts so the GPU path
  // owns camera input, tracking, feedback and recording end to end.
  if (document.getElementById("toolbar") && document.getElementById("video")) {
    const query = new URLSearchParams(location.search);
    if (!query.has("legacy")) {
      const next = new URL("./live-v2.html", location.href);
      next.search = location.search;
      next.hash = location.hash;
      location.replace(next.href);
      return;
    }
  }
})();

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

  // Preview-only visual fix. Keep the compositing/export canvas untouched and
  // apply a single browser clipping layer to remove mismatched corner pixels.
  if (!document.querySelector('link[data-framelab-preview-fix]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./preview-frame.css";
    link.dataset.framelabPreviewFix = "true";
    document.head.appendChild(link);
  }
})();

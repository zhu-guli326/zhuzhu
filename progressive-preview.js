(function () {
  const input = document.getElementById('orig-file');
  const canvas = document.getElementById('canvas');
  const previewArea = document.getElementById('preview-area');
  const emptyPreview = document.getElementById('empty-preview');
  const statusEl = document.getElementById('status');
  if (!input || !canvas || !previewArea) return;

  let objectUrl = '';
  let previewToken = 0;

  function setStatus(message) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.classList.remove('working');
  }

  function revealPreview() {
    previewArea.classList.add('ready');
    previewArea.dataset.state = 'ready';
    if (emptyPreview) emptyPreview.hidden = true;
  }

  function drawFirstFrame(video, token) {
    if (token !== previewToken || !video.videoWidth || !video.videoHeight) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    ctx.restore();
    revealPreview();
    setStatus('视频已就绪，正在后台加载 MediaPipe 手势识别…');
    window.dispatchEvent(new CustomEvent('framelab:first-frame-ready', {
      detail: {
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      },
    }));
  }

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file || (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm)$/i.test(file.name))) return;

    previewToken += 1;
    const token = previewToken;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(file);

    const probe = document.createElement('video');
    probe.preload = 'auto';
    probe.muted = true;
    probe.playsInline = true;
    probe.src = objectUrl;

    let finished = false;
    const finish = () => {
      if (finished || token !== previewToken) return;
      if (!probe.videoWidth || !probe.videoHeight) return;
      finished = true;
      try {
        if (Math.abs(probe.currentTime) > 0.001) probe.currentTime = 0;
      } catch (_) {}
      drawFirstFrame(probe, token);
    };

    probe.addEventListener('loadeddata', finish, { once: true });
    probe.addEventListener('canplay', finish, { once: true });
    probe.addEventListener('loadedmetadata', () => {
      if (probe.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish();
    }, { once: true });
    probe.addEventListener('error', () => {
      if (token !== previewToken) return;
      console.warn('Progressive first-frame preview skipped: video probe failed.');
    }, { once: true });
    probe.load();
  });

  window.addEventListener('beforeunload', () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });
})();

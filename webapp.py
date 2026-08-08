#!/usr/bin/env python3
"""Local web app for automatic finger-frame masking."""

from __future__ import annotations

import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import uuid
from pathlib import Path

from flask import Flask, jsonify, render_template_string, request, send_file, url_for
from werkzeug.utils import secure_filename

BASE_DIR = Path(__file__).resolve().parent
COMPOSITE = BASE_DIR / "composite.py"
PYTHON = sys.executable
MAX_UPLOAD = 350 * 1024 * 1024

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD

jobs: dict[str, dict] = {}
job_lock = threading.Lock()


HTML = """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>自动蒙版合成</title>
  <style>
    :root {
      --bg: #111016;
      --panel: rgba(255,255,255,0.06);
      --line: rgba(255,255,255,0.12);
      --text: rgba(255,255,255,0.92);
      --muted: rgba(255,255,255,0.65);
      --accent: #7cc9ff;
      --accent2: #9affb3;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: radial-gradient(900px 500px at 15% -10%, rgba(124,201,255,0.18), transparent 60%),
                  radial-gradient(800px 500px at 90% 20%, rgba(154,255,179,0.10), transparent 55%),
                  var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 32px 18px;
    }
    .wrap { max-width: 1060px; margin: 0 auto; }
    h1 { margin: 0 0 8px; font-size: 30px; }
    .sub { margin: 0 0 24px; color: var(--muted); line-height: 1.5; }
    .grid {
      display: grid;
      grid-template-columns: 1.05fr 0.95fr;
      gap: 16px;
      align-items: start;
    }
    @media (max-width: 920px) { .grid { grid-template-columns: 1fr; } }
    .panel {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      padding: 18px;
      backdrop-filter: blur(8px);
    }
    label { display: block; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
    input[type="file"], input[type="text"] {
      width: 100%;
      border: 1px solid var(--line);
      background: rgba(0,0,0,.28);
      color: var(--text);
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 14px;
      margin-bottom: 14px;
    }
    input::placeholder { color: rgba(255,255,255,.35); }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 640px) { .row { grid-template-columns: 1fr; } }
    button {
      border: none;
      border-radius: 12px;
      padding: 12px 16px;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: #071018;
      font-weight: 700;
      cursor: pointer;
    }
    button:disabled { opacity: .45; cursor: default; }
    .status {
      margin-top: 14px;
      color: var(--muted);
      white-space: pre-wrap;
      line-height: 1.5;
      font-size: 13px;
    }
    .progress {
      height: 10px;
      border-radius: 999px;
      overflow: hidden;
      background: rgba(255,255,255,.08);
      margin-top: 12px;
    }
    .bar {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, var(--accent), var(--accent2));
      transition: width .25s ease;
    }
    video {
      width: 100%;
      background: #000;
      border-radius: 14px;
      border: 1px solid var(--line);
    }
    a.download {
      display: inline-block;
      margin-top: 12px;
      color: #cbeeff;
      text-decoration: none;
    }
    .tiny { color: var(--muted); font-size: 12px; line-height: 1.5; margin-top: 8px; }
    code { background: rgba(255,255,255,.08); padding: 2px 5px; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>自动蒙版合成</h1>
    <p class="sub">上传原始视频和风格化视频，服务器会追踪手势框、合成画面，并返回一个 MP4。</p>

    <div class="grid">
      <div class="panel">
        <form id="form">
          <div class="row">
            <div>
              <label>原始视频</label>
              <input name="original" type="file" accept="video/*" required />
            </div>
            <div>
              <label>风格化视频</label>
              <input name="stylized" type="file" accept="video/*" required />
            </div>
          </div>
          <div class="row">
            <div>
              <label>反转时间段</label>
              <input name="invert_window" type="text" placeholder="可选，例如 5-10" />
            </div>
            <div style="display:flex; align-items:end;">
              <button id="go" type="submit">处理视频</button>
            </div>
          </div>
        </form>
        <div class="progress"><div id="bar" class="bar"></div></div>
        <div id="status" class="status">等待上传。</div>
        <div class="tiny">服务在本机运行，不会上传到云端。</div>
      </div>

      <div class="panel">
        <video id="video" controls playsinline></video>
        <a id="download" class="download" href="#" download hidden>下载结果</a>
      </div>
    </div>
  </div>

  <script>
    const form = document.getElementById('form');
    const statusEl = document.getElementById('status');
    const bar = document.getElementById('bar');
    const go = document.getElementById('go');
    const video = document.getElementById('video');
    const download = document.getElementById('download');

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    async function poll(jobId) {
      while (true) {
        const res = await fetch(`/api/jobs/${jobId}`);
        const data = await res.json();
        const progress = data.progress ?? 0;
        bar.style.width = `${progress}%`;
        statusEl.textContent = [data.status, data.message || '', data.tail || '']
          .filter(Boolean)
          .join('\n');
        if (data.status === 'done') {
          const src = data.download_url + `?v=${Date.now()}`;
          video.src = src;
          download.href = src;
          download.hidden = false;
          download.textContent = '下载结果';
          go.disabled = false;
          return;
        }
        if (data.status === 'error') {
          go.disabled = false;
          return;
        }
        await sleep(2000);
      }
    }

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      go.disabled = true;
      download.hidden = true;
      bar.style.width = '4%';
      statusEl.textContent = '正在上传…';
      const fd = new FormData(form);
      const res = await fetch('/api/process', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        statusEl.textContent = data.error || '上传失败。';
        go.disabled = false;
        return;
      }
      statusEl.textContent = `任务 ${data.job_id} 已排队`;
      poll(data.job_id);
    });
  </script>
</body>
</html>
"""


def _new_job_dir(job_id: str) -> Path:
    path = Path(tempfile.mkdtemp(prefix=f"auto_mask_{job_id}_"))
    return path


def _set_job(job_id: str, **fields):
    with job_lock:
        job = jobs.setdefault(job_id, {"log": [], "progress": 0, "status": "queued"})
        job.update(fields)
        job["job_id"] = job_id
        return job


def _append_log(job_id: str, line: str):
    with job_lock:
        job = jobs[job_id]
        log = job.setdefault("log", [])
        log.append(line.rstrip())
        if len(log) > 120:
            del log[:-120]
        job["message"] = line.rstrip()


def _process_job(job_id: str, original: Path, stylized: Path, invert_window: str, output: Path):
    _set_job(job_id, status="running", progress=4, message="开始合成。")
    cmd = [
        PYTHON,
        str(COMPOSITE),
        str(original),
        str(stylized),
        "-o",
        str(output),
    ]
    if invert_window.strip():
        cmd += ["--invert-window", invert_window.strip()]

    proc = subprocess.Popen(
        cmd,
        cwd=str(BASE_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    try:
        for line in proc.stdout or []:
            _append_log(job_id, line)
            if "frame " in line and "frame visible on" in line:
                try:
                    parts = line.strip().split()
                    frame_no = int(parts[1].rstrip(","))
                    _set_job(job_id, progress=min(95, 4 + frame_no % 96))
                except Exception:
                    pass
        rc = proc.wait()
        if rc != 0 or not output.exists():
            raise RuntimeError(f"processing failed with exit code {rc}")
        _set_job(
            job_id,
            status="done",
            progress=100,
            message="Done.",
            result=str(output),
        )
    except Exception as exc:
        _set_job(job_id, status="error", progress=100, message=str(exc), error=str(exc))


@app.route("/")
def index():
    return render_template_string(HTML)


@app.route("/api/process", methods=["POST"])
def api_process():
    original = request.files.get("original")
    stylized = request.files.get("stylized")
    invert_window = request.form.get("invert_window", "")
    if not original or not stylized:
        return jsonify({"error": "请同时上传两个视频。"}), 400

    job_id = uuid.uuid4().hex[:10]
    job_dir = _new_job_dir(job_id)
    original_name = secure_filename(original.filename or "original.mp4")
    stylized_name = secure_filename(stylized.filename or "stylized.mp4")
    original_path = job_dir / original_name
    stylized_path = job_dir / stylized_name
    output_path = job_dir / "final.mp4"
    original.save(original_path)
    stylized.save(stylized_path)

    _set_job(job_id, status="queued", progress=1, message="已排队。")
    thread = threading.Thread(
        target=_process_job,
        args=(job_id, original_path, stylized_path, invert_window, output_path),
        daemon=True,
    )
    thread.start()
    return jsonify({"job_id": job_id})


@app.route("/api/jobs/<job_id>")
def api_jobs(job_id: str):
    with job_lock:
        job = jobs.get(job_id)
        if not job:
            return jsonify({"error": "job not found"}), 404
        tail = "\n".join(job.get("log", [])[-12:])
        result = dict(job)
        result["tail"] = tail
        if job.get("status") == "done":
            result["download_url"] = url_for("download_result", job_id=job_id)
        return jsonify(result)


@app.route("/download/<job_id>")
def download_result(job_id: str):
    with job_lock:
        job = jobs.get(job_id)
        if not job or job.get("status") != "done":
            return jsonify({"error": "result not ready"}), 404
        result = Path(job["result"])
    return send_file(result, as_attachment=True, download_name="final.mp4")


def main():
    port = int(os.environ.get("PORT", "8765"))
    app.run(host="127.0.0.1", port=port, threaded=True, use_reloader=False)


if __name__ == "__main__":
    main()

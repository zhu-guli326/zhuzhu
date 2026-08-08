# FrameLab 手势取景合成

一个面向短视频创作的本地网页工具：上传原始视频和风格视频，页面会追踪双手取景框，把风格画面合成到手势框里，并支持预览、时间定位、反向蒙版、特效片段和导出。

## 功能

- 双视频上传：原始视频用于手部追踪，风格视频用于框内画面。
- 实时预览：浏览器 Canvas 直接显示合成效果。
- 时长查看：预览画面和时间轴都会显示当前时间与总时长。
- 时间定位：拖动时间轴快速跳到指定片段。
- 反向蒙版：可设置一个时间区间，把框内和框外画面反过来。
- 酷炫片段：支持故障闪切、霓虹扫描、冲击波、暗场聚焦等短片段特效。
- 本地导出：页面会完整播放一次并保存合成视频。

## 本地运行

静态网页版本：

```bash
python3 -m http.server 8124
```

打开：

```text
http://127.0.0.1:8124/?v=public-release
```

## 部署到 Cloudflare Pages

推荐用 Cloudflare Pages 连接 GitHub 仓库：

```text
Repository: zhu-guli326/painting-
Production branch: main
Framework preset: None
Build command: npm run build
Build output directory: dist
Root directory: /
```

连接完成后，每次推送到 `main` 都会自动构建并发布到 Cloudflare Pages。

服务器处理版本：

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python webapp.py
```

打开：

```text
http://127.0.0.1:8765
```

## Python 命令行合成

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python composite.py original.mp4 stylized.mp4 -o final.mp4
```

指定反向蒙版时间段：

```bash
.venv/bin/python composite.py original.mp4 stylized.mp4 -o final.mp4 --invert-window 5-10
```

## 关键帧扫描

```bash
.venv/bin/python keyframe_scan.py original.mp4 stylized.mp4 -o scan_out
```

会输出追踪报告、关键帧截图和预览视频，方便挑选适合做蒙版调整的时间段。

## 隐私说明

静态网页版本在浏览器本地处理素材，不需要 API key，也不会主动上传视频。输入视频、导出视频、模型文件和临时缓存均已加入忽略规则；仓库只保留源码和示例媒体。

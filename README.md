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
- 实时摄像头特效：`live.html` 会打开摄像头，用双手手势框住画面并实时切换像素化、梵高、霓虹、粒子等滤镜。

## 本地运行

静态网页版本：

```bash
python3 -m http.server 8124
```

打开：

```text
http://127.0.0.1:8124/?v=public-release
```

实时摄像头模式：

```text
http://127.0.0.1:8124/live.html
```

无需摄像头的演示模式：

```text
http://127.0.0.1:8124/live.html?demo
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

## 分析统计

当前项目是 vanilla HTML/CSS/JavaScript 静态站点，不需要安装 React 组件。页面已同时接入 Vercel Web Analytics 和 Google Analytics 4，GA4 Measurement ID 配在 `analytics.js` 里的 `GA_MEASUREMENT_ID`。

页面支持中英文：首次访问会根据浏览器地区码和系统时区自动选择语言，也可以用右上角 `中 / EN` 手动切换。

已接入自定义事件，记录语言切换、联系方式点击、素材上传、预览、导出、取景框工具、反向蒙版和特效操作。埋点只记录文件类型、扩展名、大小区间、时长和分辨率等技术属性，不上传文件名或素材内容。

GA4 事件名：

```text
file_uploaded
upload_rejected
upload_failed
language_changed
contact_clicked
effect_added
effect_removed
preview_started
export_started
export_completed
export_failed
frame_tool_used
invert_mask_toggled
live_camera_started
live_camera_failed
live_effect_changed
```

建议在 GA4 后台把 `export_completed` 标记为关键事件，用来判断真正完成导出的用户数。

## 部署到 Vercel

```text
Framework preset: Other
Build command: npm run build
Output directory: dist
```

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

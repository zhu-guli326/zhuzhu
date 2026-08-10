#!/usr/bin/env python3
"""Scan two videos and find stable finger-frame keyframes / spans.

Usage:
    python keyframe_scan.py original.mp4 stylized.mp4 -o out_dir

Outputs:
    out_dir/report.csv
    out_dir/summary.txt
    out_dir/frames/frame_000123.png
    out_dir/preview.mp4

The script does not composite the stylized video. It only tracks the finger
frame in the original footage and exports the best frames and a short preview.
"""

import argparse
import csv
import math
import os
import subprocess
import sys
import urllib.request

import cv2
import numpy as np

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)
MODEL_PATH = "hand_landmarker.task"

WRIST, THUMB_TIP, INDEX_TIP, MIDDLE_MCP = 0, 4, 8, 9

MAX_LOST_FRAMES = 25
JUMP_CONFIRM_FRAMES = 2
JUMP_FRACTION = 0.3
ALPHA_MIN, ALPHA_MAX = 0.35, 0.85
ALPHA_SCALE = 0.05
PRESENCE_IN, PRESENCE_OUT = 0.12, 0.05
SPREAD_ACQUIRE, SPREAD_KEEP = 0.75, 0.2
AREA_ACQUIRE, AREA_KEEP = 0.005, 0.0005


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def lerp_pt(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def polygon_area(pts):
    a = 0.0
    for i in range(len(pts)):
        p, q = pts[i], pts[(i + 1) % len(pts)]
        a += p[0] * q[1] - q[0] * p[1]
    return abs(a / 2)


def angle_sorted(pts):
    cx = sum(p[0] for p in pts) / len(pts)
    cy = sum(p[1] for p in pts) / len(pts)
    return sorted(pts, key=lambda p: math.atan2(p[1] - cy, p[0] - cx))


class FrameTracker:
    def __init__(self, width, height):
        self.w, self.h = width, height
        self.corners = None
        self.presence = 0.0
        self.frame_active = False
        self.lost_frames = 0
        self.jump_frames = 0

    def compute_quad(self, hands):
        if len(hands) != 2:
            return None
        info = []
        for lm in hands:
            px = lambda i: (lm[i].x * self.w, lm[i].y * self.h)
            index, thumb = px(INDEX_TIP), px(THUMB_TIP)
            scale = dist(px(WRIST), px(MIDDLE_MCP)) + 1
            needed = SPREAD_KEEP if self.frame_active else SPREAD_ACQUIRE
            if dist(thumb, index) < scale * needed:
                return None
            info.append({"index": index, "thumb": thumb, "wx": px(WRIST)[0]})
        info.sort(key=lambda hd: hd["wx"])
        a, b = info
        pts = angle_sorted([a["index"], b["index"], b["thumb"], a["thumb"]])
        min_area = AREA_KEEP if self.frame_active else AREA_ACQUIRE
        if polygon_area(pts) < self.w * self.h * min_area:
            return None
        return pts

    def update(self, hands):
        target = self.compute_quad(hands) if hands else None

        if target:
            if self.corners is None:
                self.lost_frames = 0
                self.frame_active = True
                self.jump_frames = 0
                self.corners = target
                self.presence = min(1.0, self.presence + PRESENCE_IN)
            else:
                moved = sum(dist(p, c) for p, c in zip(target, self.corners)) / 4
                if (
                    moved > self.w * JUMP_FRACTION
                    and self.jump_frames + 1 < JUMP_CONFIRM_FRAMES
                ):
                    self.jump_frames += 1
                    self.lost_frames += 1
                    if self.lost_frames > MAX_LOST_FRAMES:
                        self.presence = max(0.0, self.presence - PRESENCE_OUT)
                else:
                    self.lost_frames = 0
                    self.frame_active = True
                    self.jump_frames = 0
                    alpha = min(
                        ALPHA_MAX, max(ALPHA_MIN, moved / (self.w * ALPHA_SCALE))
                    )
                    self.corners = [
                        lerp_pt(c, p, alpha) for c, p in zip(self.corners, target)
                    ]
                    self.presence = min(1.0, self.presence + PRESENCE_IN)
        elif self.corners is not None and self.lost_frames < MAX_LOST_FRAMES:
            self.lost_frames += 1
            self.presence = min(1.0, self.presence + PRESENCE_IN)
        else:
            self.presence = max(0.0, self.presence - PRESENCE_OUT)
            if self.presence == 0:
                self.corners = None
                self.frame_active = False
                self.jump_frames = 0

        return self.corners if self.presence > 0.01 else None


def ensure_model():
    if not os.path.exists(MODEL_PATH):
        print("Downloading hand landmarker model …")
        urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)


def create_landmarker():
    from mediapipe.tasks import python as mp_tasks
    from mediapipe.tasks.python import vision

    return vision.HandLandmarker.create_from_options(
        vision.HandLandmarkerOptions(
            base_options=mp_tasks.BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=2,
            min_hand_detection_confidence=0.3,
            min_hand_presence_confidence=0.3,
            min_tracking_confidence=0.3,
        )
    )


def draw_quad(frame, quad):
    pts = [tuple(map(int, p)) for p in quad]
    for i in range(4):
        cv2.line(frame, pts[i], pts[(i + 1) % 4], (0, 0, 255), 4)
    for p in pts:
        cv2.circle(frame, p, 9, (0, 255, 0), -1)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("original")
    ap.add_argument("stylized")
    ap.add_argument("-o", "--output-dir", default="scan_out")
    ap.add_argument("--top", type=int, default=12, help="number of keyframes")
    ap.add_argument("--min-gap", type=int, default=15, help="minimum keyframe gap")
    ap.add_argument("--window", type=int, default=15, help="span size in frames")
    args = ap.parse_args()

    for f in (args.original, args.stylized):
        if not os.path.exists(f):
            sys.exit(f"Missing input: {f}")

    ensure_model()
    os.makedirs(args.output_dir, exist_ok=True)
    frames_dir = os.path.join(args.output_dir, "frames")
    os.makedirs(frames_dir, exist_ok=True)

    import mediapipe as mp

    cap = cv2.VideoCapture(args.original)
    sty = cv2.VideoCapture(args.stylized)
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    sty_fps = sty.get(cv2.CAP_PROP_FPS) or fps
    sty_count = int(sty.get(cv2.CAP_PROP_FRAME_COUNT))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    landmarker = create_landmarker()

    tracker = FrameTracker(w, h)
    rows = []
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break

        t = i / fps
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        result = landmarker.detect_for_video(
            mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb),
            int(i * 1000 / fps),
        )
        quad = tracker.update(result.hand_landmarks or [])

        if quad is not None:
            quad_pts = np.array(quad, dtype=np.float32)
            edge_len = sum(
                dist(quad_pts[k], quad_pts[(k + 1) % 4]) for k in range(4)
            ) / 4
            area_px = polygon_area(angle_sorted([tuple(p) for p in quad_pts]))
            score = tracker.presence * 2.0 + min(edge_len / max(w, h), 1.5)
            rows.append(
                {
                    "frame": i,
                    "time_s": round(t, 3),
                    "presence": round(tracker.presence, 3),
                    "area_px": round(area_px, 1),
                    "edge_px": round(edge_len, 1),
                    "score": round(score, 3),
                }
            )

        i += 1

    if not rows:
        sys.exit("No finger-frame candidates found.")

    rows.sort(key=lambda r: (r["score"], r["area_px"]), reverse=True)
    top = []
    for row in rows:
        if all(abs(row["frame"] - kept["frame"]) >= args.min_gap for kept in top):
            top.append(row)
            if len(top) >= args.top:
                break

    with open(os.path.join(args.output_dir, "report.csv"), "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=top[0].keys())
        writer.writeheader()
        writer.writerows(top)

    start = max(0, top[0]["frame"] - args.window // 2)
    end = min(frame_count - 1, top[0]["frame"] + args.window // 2)
    with open(os.path.join(args.output_dir, "summary.txt"), "w") as f:
        f.write(f"frames={frame_count}\n")
        f.write(f"fps={fps:.3f}\n")
        f.write(f"best_frame={top[0]['frame']}\n")
        f.write(f"best_time_s={top[0]['time_s']}\n")
        f.write(f"window={start}-{end}\n")
        f.write(f"top_candidates={len(top)}\n")

    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    landmarker = create_landmarker()
    tracker = FrameTracker(w, h)
    idx_set = {r["frame"] for r in top[: min(8, len(top))]}
    i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if i in idx_set:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            result = landmarker.detect_for_video(
                mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb),
                int(i * 1000 / fps),
            )
            quad = tracker.compute_quad(result.hand_landmarks or [])
            if quad is not None:
                draw_quad(frame, quad)
            cv2.putText(
                frame,
                f"frame {i}",
                (40, 60),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.5,
                (0, 0, 255),
                3,
                cv2.LINE_AA,
            )
            cv2.imwrite(os.path.join(frames_dir, f"frame_{i:06d}.png"), frame)
        i += 1

    preview = os.path.join(args.output_dir, "preview.mp4")
    tmp_raw = os.path.join(args.output_dir, "preview_raw.mp4")
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            args.original,
            "-ss",
            str(start / fps),
            "-t",
            str((end - start + 1) / fps),
            "-vf",
            "scale=1280:720,fps=24",
            "-c:v",
            "libx264",
            "-crf",
            "18",
            "-pix_fmt",
            "yuv420p",
            "-an",
            tmp_raw,
        ],
        check=True,
    )
    os.replace(tmp_raw, preview)

    print(os.path.join(args.output_dir, "report.csv"))
    print(os.path.join(args.output_dir, "summary.txt"))
    print(preview)


if __name__ == "__main__":
    main()

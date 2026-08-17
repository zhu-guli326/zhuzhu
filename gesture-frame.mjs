const WRIST = 0;
const THUMB_MCP = 2;
const THUMB_IP = 3;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_PIP = 6;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_PIP = 10;
const MIDDLE_TIP = 12;
const RING_MCP = 13;
const RING_PIP = 14;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_PIP = 18;
const PINKY_TIP = 20;

const FINGERS = [
  [INDEX_MCP, INDEX_PIP, INDEX_TIP],
  [MIDDLE_MCP, MIDDLE_PIP, MIDDLE_TIP],
  [RING_MCP, RING_PIP, RING_TIP],
  [PINKY_MCP, PINKY_PIP, PINKY_TIP],
];

let motionHistory = [];
let motionTimestamp = null;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 1.35);
}

function clamp(value, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / Math.max(0.000001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function polygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

function makePixelMapper(width, height, mirrorX) {
  return (landmark) => ({
    x: (mirrorX ? 1 - landmark.x : landmark.x) * width,
    y: landmark.y * height,
  });
}

function makeNormalizedMapper(mirrorX) {
  return (landmark) => ({
    x: mirrorX ? 1 - landmark.x : landmark.x,
    y: landmark.y,
    z: Number.isFinite(landmark.z) ? landmark.z : 0,
  });
}

function computeTwoHandQuad(hands, options, toPixel) {
  const info = hands.map((landmarks) => ({
    landmarks,
    index: toPixel(landmarks[INDEX_TIP]),
    thumb: toPixel(landmarks[THUMB_TIP]),
    wristX: toPixel(landmarks[WRIST]).x,
    scale: dist(toPixel(landmarks[WRIST]), toPixel(landmarks[MIDDLE_MCP])) + 1,
  }));
  const requiredSpread = options.active ? 0.2 : 0.75;
  if (info.some((hand) => dist(hand.thumb, hand.index) < hand.scale * requiredSpread)) {
    return null;
  }

  info.sort((a, b) => a.wristX - b.wristX);
  const [left, right] = info;
  const quad = [left.index, right.index, right.thumb, left.thumb];
  const center = quad.reduce(
    (sum, point) => ({ x: sum.x + point.x / 4, y: sum.y + point.y / 4 }),
    { x: 0, y: 0 }
  );
  const hull = [...quad].sort(
    (a, b) =>
      Math.atan2(a.y - center.y, a.x - center.x) -
      Math.atan2(b.y - center.y, b.x - center.x)
  );
  const minArea = options.active ? 0.0005 : 0.005;
  return polygonArea(hull) >= options.width * options.height * minArea ? quad : null;
}

function isOpenHand(landmarks, active, toPixel) {
  const wrist = toPixel(landmarks[WRIST]);
  const middleMcp = toPixel(landmarks[MIDDLE_MCP]);
  const scale = dist(wrist, middleMcp) + 1;
  const extensionDelta = scale * (active ? 0.08 : 0.16);
  const minFingerLength = scale * (active ? 0.4 : 0.55);

  const fingersOpen = FINGERS.every(([mcpIndex, pipIndex, tipIndex]) => {
    const mcp = toPixel(landmarks[mcpIndex]);
    const pip = toPixel(landmarks[pipIndex]);
    const tip = toPixel(landmarks[tipIndex]);
    return (
      dist(wrist, tip) > dist(wrist, pip) + extensionDelta &&
      dist(mcp, tip) > minFingerLength
    );
  });
  if (!fingersOpen) return false;

  const thumbMcp = toPixel(landmarks[THUMB_MCP]);
  const thumbIp = toPixel(landmarks[THUMB_IP]);
  const thumbTip = toPixel(landmarks[THUMB_TIP]);
  const indexMcp = toPixel(landmarks[INDEX_MCP]);
  const thumbOpen =
    dist(wrist, thumbTip) > dist(wrist, thumbIp) + scale * (active ? 0.03 : 0.08) &&
    dist(thumbMcp, thumbTip) > minFingerLength * 0.8 &&
    dist(indexMcp, thumbTip) > scale * (active ? 0.55 : 0.75);
  if (!thumbOpen) return false;

  const tips = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP].map(
    (index) => toPixel(landmarks[index])
  );
  const widestTipSpan = tips.reduce(
    (widest, point, index) =>
      Math.max(
        widest,
        ...tips.slice(index + 1).map((other) => dist(point, other))
      ),
    0
  );
  return widestTipSpan > scale * (active ? 1.35 : 1.65);
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y);
  if (length < 0.0001) return null;
  return { x: vector.x / length, y: vector.y / length };
}

function computeOpenHandQuad(landmarks, options, toPixel) {
  if (!isOpenHand(landmarks, options.active, toPixel)) return null;

  const wrist = toPixel(landmarks[WRIST]);
  const indexMcp = toPixel(landmarks[INDEX_MCP]);
  const middleMcp = toPixel(landmarks[MIDDLE_MCP]);
  const pinkyMcp = toPixel(landmarks[PINKY_MCP]);
  const side = normalize({ x: pinkyMcp.x - indexMcp.x, y: pinkyMcp.y - indexMcp.y });
  if (!side) return null;

  let forward = { x: -side.y, y: side.x };
  const palmDirection = { x: middleMcp.x - wrist.x, y: middleMcp.y - wrist.y };
  if (forward.x * palmDirection.x + forward.y * palmDirection.y < 0) {
    forward = { x: -forward.x, y: -forward.y };
  }

  const points = [
    wrist,
    indexMcp,
    middleMcp,
    pinkyMcp,
    ...[THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP].map((index) =>
      toPixel(landmarks[index])
    ),
  ];
  const projections = points.map((point) => ({
    side: point.x * side.x + point.y * side.y,
    forward: point.x * forward.x + point.y * forward.y,
  }));
  let minSide = Math.min(...projections.map((point) => point.side));
  let maxSide = Math.max(...projections.map((point) => point.side));
  let minForward = Math.min(...projections.map((point) => point.forward));
  let maxForward = Math.max(...projections.map((point) => point.forward));
  const scale = dist(wrist, middleMcp) + 1;
  const padding = scale * 0.12;
  minSide -= padding;
  maxSide += padding;
  minForward -= padding;
  maxForward += padding;

  const fromProjection = (sideValue, forwardValue) => ({
    x: side.x * sideValue + forward.x * forwardValue,
    y: side.y * sideValue + forward.y * forwardValue,
  });
  return [
    fromProjection(minSide, maxForward),
    fromProjection(maxSide, maxForward),
    fromProjection(maxSide, minForward),
    fromProjection(minSide, minForward),
  ];
}

function gestureTimestamp(options) {
  if (Number.isFinite(options.timestamp)) return options.timestamp;
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function createHand3DInfo(landmarks, mirrorX) {
  const toNormalized = makeNormalizedMapper(mirrorX);
  const wrist = toNormalized(landmarks[WRIST]);
  const thumbTip = toNormalized(landmarks[THUMB_TIP]);
  const indexTip = toNormalized(landmarks[INDEX_TIP]);
  const indexMcp = toNormalized(landmarks[INDEX_MCP]);
  const middleMcp = toNormalized(landmarks[MIDDLE_MCP]);
  const pinkyMcp = toNormalized(landmarks[PINKY_MCP]);
  const palm = {
    x: (wrist.x + indexMcp.x + middleMcp.x + pinkyMcp.x) / 4,
    y: (wrist.y + indexMcp.y + middleMcp.y + pinkyMcp.y) / 4,
    z: (wrist.z + indexMcp.z + middleMcp.z + pinkyMcp.z) / 4,
  };
  const palmScale = dist3(wrist, middleMcp) + 0.0001;
  const pinchRatio = dist3(thumbTip, indexTip) / palmScale;
  const pinchStrength = 1 - smoothstep(0.32, 1.08, pinchRatio);
  return {
    x: palm.x,
    y: palm.y,
    z: palm.z,
    palmScale,
    pinchRatio,
    pinchStrength,
    pinch: {
      x: (thumbTip.x + indexTip.x) / 2,
      y: (thumbTip.y + indexTip.y) / 2,
      z: (thumbTip.z + indexTip.z) / 2,
      tiltZ: thumbTip.z - indexTip.z,
    },
    wrist,
    thumbTip,
    indexTip,
    indexMcp,
    middleMcp,
    pinkyMcp,
  };
}

function attachMotion(hands3D, timestamp, trackMotion) {
  const sorted = [...hands3D].sort((a, b) => a.x - b.x);
  if (!trackMotion) {
    return sorted.map((hand) => ({
      ...hand,
      vx: 0,
      vy: 0,
      vz: 0,
      speed: 0,
      swipeStrength: 0,
      swipeAxis: "x",
      swipeDirection: 0,
    }));
  }

  const dt = motionTimestamp == null
    ? 1 / 60
    : clamp((timestamp - motionTimestamp) / 1000, 1 / 120, 0.12);
  const nextHistory = [];
  const withMotion = sorted.map((hand, index) => {
    const previous = motionHistory[index];
    const rawVx = previous ? (hand.x - previous.x) / dt : 0;
    const rawVy = previous ? (hand.y - previous.y) / dt : 0;
    const rawVz = previous ? (hand.z - previous.z) / dt : 0;
    const smoothing = previous ? 0.64 : 1;
    const vx = previous ? previous.vx * (1 - smoothing) + rawVx * smoothing : rawVx;
    const vy = previous ? previous.vy * (1 - smoothing) + rawVy * smoothing : rawVy;
    const vz = previous ? previous.vz * (1 - smoothing) + rawVz * smoothing : rawVz;
    const speed = Math.hypot(vx, vy);
    const swipeStrength = smoothstep(0.45, 1.75, speed);
    const swipeAxis = Math.abs(vx) >= Math.abs(vy) ? "x" : "y";
    const swipeDirection = Math.sign(swipeAxis === "x" ? vx : vy) || 0;
    const enriched = {
      ...hand,
      vx,
      vy,
      vz,
      speed,
      swipeStrength,
      swipeAxis,
      swipeDirection,
    };
    nextHistory.push({ x: hand.x, y: hand.y, z: hand.z, vx, vy, vz });
    return enriched;
  });
  motionHistory = nextHistory;
  motionTimestamp = timestamp;
  return withMotion;
}

function create3DSignal(hands, options, quad, trackMotion) {
  const timestamp = gestureTimestamp(options);
  const mirrorX = Boolean(options.mirrorX);
  const handInfos = attachMotion(
    hands.map((landmarks) => createHand3DInfo(landmarks, mirrorX)),
    timestamp,
    trackMotion
  );

  const dominantPinch = handInfos.reduce(
    (best, hand, index) =>
      !best || hand.pinchStrength > best.strength
        ? { handIndex: index, strength: hand.pinchStrength, ...hand.pinch }
        : best,
    null
  );
  const dominantSwipe = handInfos.reduce(
    (best, hand, index) =>
      !best || hand.swipeStrength > best.strength
        ? {
            handIndex: index,
            strength: hand.swipeStrength,
            axis: hand.swipeAxis,
            direction: hand.swipeDirection,
            x: hand.x,
            y: hand.y,
            z: hand.z,
            vx: hand.vx,
            vy: hand.vy,
            vz: hand.vz,
            speed: hand.speed,
          }
        : best,
    null
  );

  let frame = {
    valid: false,
    quad: null,
    depth: 0,
    depthDelta: 0,
    depthSpread: 0,
    cornerDepths: [],
  };

  if (quad && hands.length === 2) {
    const sorted = hands
      .map((landmarks) => ({
        landmarks,
        wristX: makeNormalizedMapper(mirrorX)(landmarks[WRIST]).x,
      }))
      .sort((a, b) => a.wristX - b.wristX);
    const left = sorted[0].landmarks;
    const right = sorted[1].landmarks;
    const cornerDepths = [
      Number(left[INDEX_TIP].z) || 0,
      Number(right[INDEX_TIP].z) || 0,
      Number(right[THUMB_TIP].z) || 0,
      Number(left[THUMB_TIP].z) || 0,
    ];
    const depth = cornerDepths.reduce((sum, value) => sum + value, 0) / 4;
    const leftDepth = (cornerDepths[0] + cornerDepths[3]) / 2;
    const rightDepth = (cornerDepths[1] + cornerDepths[2]) / 2;
    frame = {
      valid: true,
      quad: quad.map((point) => ({
        x: point.x / options.width,
        y: point.y / options.height,
      })),
      depth,
      depthDelta: leftDepth - rightDepth,
      depthSpread: Math.max(...cornerDepths) - Math.min(...cornerDepths),
      cornerDepths,
    };
  }

  const normalizedQuad = quad
    ? quad.map((point) => ({
        x: point.x / options.width,
        y: point.y / options.height,
      }))
    : null;

  return {
    version: 1,
    timestamp,
    handCount: hands.length,
    quadValid: Boolean(normalizedQuad),
    quad: normalizedQuad,
    hands: handInfos,
    pinch: dominantPinch || { handIndex: -1, strength: 0, x: 0.5, y: 0.5, z: 0, tiltZ: 0 },
    swipe: dominantSwipe || {
      handIndex: -1,
      strength: 0,
      axis: "x",
      direction: 0,
      x: 0.5,
      y: 0.5,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      speed: 0,
    },
    frame,
  };
}

function normalizedOptions(options) {
  return {
    active: Boolean(options.active),
    width: Number(options.width),
    height: Number(options.height),
    mirrorX: Boolean(options.mirrorX),
    timestamp: options.timestamp,
  };
}

function validGestureInput(hands, options) {
  return (
    Array.isArray(hands) &&
    Number.isFinite(options.width) &&
    Number.isFinite(options.height) &&
    options.width > 0 &&
    options.height > 0 &&
    hands.every((hand) => hand?.length >= 21)
  );
}

function computeQuadInternal(hands, options) {
  const toPixel = makePixelMapper(options.width, options.height, options.mirrorX);
  if (hands.length === 2) return computeTwoHandQuad(hands, options, toPixel);
  if (hands.length === 1) return computeOpenHandQuad(hands[0], options, toPixel);
  return null;
}

function publishSignal(signal) {
  if (typeof globalThis !== "undefined") {
    globalThis.FRAMELAB_GESTURE_3D = signal;
  }
}

function createEmptyGestureSignal(options = {}) {
  const timestamp = gestureTimestamp(options);
  return {
    version: 1,
    timestamp,
    handCount: 0,
    quadValid: false,
    quad: null,
    hands: [],
    pinch: { handIndex: -1, strength: 0, x: 0.5, y: 0.5, z: 0, tiltZ: 0 },
    swipe: {
      handIndex: -1,
      strength: 0,
      axis: "x",
      direction: 0,
      x: 0.5,
      y: 0.5,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      speed: 0,
    },
    frame: {
      valid: false,
      quad: null,
      depth: 0,
      depthDelta: 0,
      depthSpread: 0,
      cornerDepths: [],
    },
  };
}

function publishEmptySignal(options = {}) {
  publishSignal(createEmptyGestureSignal(options));
}

function clearMotionTracking() {
  motionHistory = [];
  motionTimestamp = null;
}

export function resetGesture3DTracking() {
  clearMotionTracking();
  if (typeof globalThis !== "undefined") delete globalThis.FRAMELAB_GESTURE_3D;
}

export function computeGesture3DSignals(hands, options = {}) {
  const normalized = normalizedOptions(options);
  if (!Array.isArray(hands) || hands.length === 0) {
    clearMotionTracking();
    return createEmptyGestureSignal(normalized);
  }
  if (!validGestureInput(hands, normalized)) return createEmptyGestureSignal(normalized);
  const quad = computeQuadInternal(hands, normalized);
  return create3DSignal(hands, normalized, quad, false);
}

export function computeGestureQuad(hands, options = {}) {
  const normalized = normalizedOptions(options);
  if (!Array.isArray(hands) || hands.length === 0) {
    clearMotionTracking();
    publishEmptySignal(normalized);
    return null;
  }
  if (!validGestureInput(hands, normalized)) {
    publishEmptySignal(normalized);
    return null;
  }
  const quad = computeQuadInternal(hands, normalized);
  publishSignal(create3DSignal(hands, normalized, quad, true));
  return quad;
}

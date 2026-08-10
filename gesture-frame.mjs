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

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
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

function computeTwoHandQuad(hands, options, toPixel) {
  const info = hands.map((landmarks) => ({
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

export function computeGestureQuad(hands, options = {}) {
  const width = Number(options.width);
  const height = Number(options.height);
  if (!Array.isArray(hands) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  if (width <= 0 || height <= 0 || !hands.every((hand) => hand?.length >= 21)) {
    return null;
  }

  const normalizedOptions = {
    active: Boolean(options.active),
    width,
    height,
  };
  const toPixel = makePixelMapper(width, height, Boolean(options.mirrorX));
  if (hands.length === 2) {
    return computeTwoHandQuad(hands, normalizedOptions, toPixel);
  }
  if (hands.length === 1) {
    return computeOpenHandQuad(hands[0], normalizedOptions, toPixel);
  }
  return null;
}

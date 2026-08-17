import test from "node:test";
import assert from "node:assert/strict";

import {
  computeGesture3DSignals,
  computeGestureQuad,
  resetGesture3DTracking,
} from "../gesture-frame.mjs";

function makeHand({ wristX = 0.3, z = 0, pinch = false, offsetX = 0 } = {}) {
  const lm = Array.from({ length: 21 }, () => ({ x: wristX + offsetX, y: 0.6, z }));
  lm[0] = { x: wristX + offsetX, y: 0.72, z };
  lm[5] = { x: wristX - 0.03 + offsetX, y: 0.52, z: z - 0.01 };
  lm[9] = { x: wristX + offsetX, y: 0.48, z: z - 0.015 };
  lm[17] = { x: wristX + 0.05 + offsetX, y: 0.54, z: z + 0.01 };
  lm[8] = { x: wristX - 0.035 + offsetX, y: 0.28, z: z - 0.04 };
  lm[4] = pinch
    ? { x: wristX - 0.025 + offsetX, y: 0.295, z: z - 0.038 }
    : { x: wristX + 0.08 + offsetX, y: 0.56, z: z + 0.02 };
  return lm;
}

test("3D pinch strength rises when thumb and index meet in xyz", () => {
  const open = computeGesture3DSignals([makeHand({ pinch: false })], {
    width: 1000,
    height: 800,
    mirrorX: true,
  });
  const pinched = computeGesture3DSignals([makeHand({ pinch: true })], {
    width: 1000,
    height: 800,
    mirrorX: true,
  });

  assert.ok(pinched.pinch.strength > open.pinch.strength);
  assert.ok(pinched.pinch.strength > 0.65);
  assert.ok(Number.isFinite(pinched.pinch.z));
});

test("two-hand frame publishes per-corner z depth", () => {
  const left = makeHand({ wristX: 0.25, z: -0.08 });
  const right = makeHand({ wristX: 0.75, z: 0.04 });
  const signal = computeGesture3DSignals([left, right], {
    width: 1000,
    height: 800,
    mirrorX: false,
    active: true,
  });

  assert.equal(signal.frame.valid, true);
  assert.equal(signal.frame.cornerDepths.length, 4);
  assert.ok(Math.abs(signal.frame.depthDelta) > 0.05);
});

test("tracked motion produces a 3D swipe signal", () => {
  resetGesture3DTracking();
  computeGestureQuad([makeHand({ wristX: 0.28 })], {
    width: 1000,
    height: 800,
    mirrorX: false,
    timestamp: 0,
  });
  computeGestureQuad([makeHand({ wristX: 0.28, offsetX: 0.12 })], {
    width: 1000,
    height: 800,
    mirrorX: false,
    timestamp: 50,
  });

  const signal = globalThis.FRAMELAB_GESTURE_3D;
  assert.ok(signal.swipe.strength > 0.6);
  assert.equal(signal.swipe.axis, "x");
  assert.equal(signal.swipe.direction, 1);
});

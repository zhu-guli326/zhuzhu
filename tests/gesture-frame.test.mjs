import test from "node:test";
import assert from "node:assert/strict";

import { computeGestureQuad } from "../gesture-frame.mjs";

const WIDTH = 1000;
const HEIGHT = 800;

function point(x, y) {
  return { x, y, z: 0 };
}

function handWith(overrides) {
  const landmarks = Array.from({ length: 21 }, () => point(0.5, 0.68));
  for (const [index, value] of Object.entries(overrides)) {
    landmarks[Number(index)] = point(value[0], value[1]);
  }
  return landmarks;
}

function openHand() {
  return handWith({
    0: [0.5, 0.82],
    1: [0.42, 0.72],
    2: [0.35, 0.64],
    3: [0.29, 0.57],
    4: [0.2, 0.5],
    5: [0.43, 0.58],
    6: [0.39, 0.43],
    7: [0.37, 0.3],
    8: [0.35, 0.16],
    9: [0.5, 0.55],
    10: [0.5, 0.38],
    11: [0.5, 0.23],
    12: [0.5, 0.08],
    13: [0.57, 0.58],
    14: [0.6, 0.42],
    15: [0.62, 0.3],
    16: [0.64, 0.17],
    17: [0.64, 0.62],
    18: [0.7, 0.49],
    19: [0.74, 0.4],
    20: [0.78, 0.31],
  });
}

function closedHand() {
  return handWith({
    0: [0.5, 0.82],
    2: [0.42, 0.66],
    3: [0.45, 0.7],
    4: [0.5, 0.69],
    5: [0.43, 0.59],
    6: [0.42, 0.52],
    7: [0.46, 0.57],
    8: [0.49, 0.63],
    9: [0.5, 0.56],
    10: [0.5, 0.49],
    11: [0.51, 0.55],
    12: [0.52, 0.62],
    13: [0.57, 0.59],
    14: [0.58, 0.52],
    15: [0.57, 0.57],
    16: [0.56, 0.64],
    17: [0.63, 0.63],
    18: [0.65, 0.57],
    19: [0.62, 0.61],
    20: [0.59, 0.67],
  });
}

function legacyFrameHands() {
  return [
    handWith({
      0: [0.25, 0.72],
      4: [0.18, 0.58],
      8: [0.27, 0.24],
      9: [0.25, 0.52],
    }),
    handWith({
      0: [0.75, 0.72],
      4: [0.82, 0.58],
      8: [0.73, 0.24],
      9: [0.75, 0.52],
    }),
  ];
}

function compute(hands, active = false) {
  return computeGestureQuad(hands, {
    active,
    width: WIDTH,
    height: HEIGHT,
  });
}

test("keeps the existing two-hand thumb-and-index frame gesture", () => {
  const quad = compute(legacyFrameHands());

  assert.equal(quad?.length, 4);
  assert.ok(Math.abs(quad[0].x - 270) < 0.001);
  assert.ok(Math.abs(quad[0].y - 192) < 0.001);
  assert.ok(Math.abs(quad[2].x - 820) < 0.001);
  assert.ok(Math.abs(quad[2].y - 464) < 0.001);
});

test("forms a frame from one hand when all five fingers are open", () => {
  const quad = compute([openHand()]);

  assert.equal(quad?.length, 4);
  assert.ok(Math.min(...quad.map((corner) => corner.x)) < 250);
  assert.ok(Math.max(...quad.map((corner) => corner.x)) > 750);
  assert.ok(Math.min(...quad.map((corner) => corner.y)) < 100);
  assert.ok(Math.max(...quad.map((corner) => corner.y)) > 600);
});

test("does not treat a closed hand as a five-finger frame", () => {
  assert.equal(compute([closedHand()]), null);
});

test("does not treat a one-hand two-finger pose as a five-finger frame", () => {
  const pose = openHand();
  for (const tip of [4, 12, 16, 20]) pose[tip] = point(0.5, 0.65);

  assert.equal(compute([pose]), null);
});

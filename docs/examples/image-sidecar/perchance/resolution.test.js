import assert from "node:assert/strict";
import { test } from "node:test";
import { nearestPerchanceResolution } from "./resolution.js";

test("nearestPerchanceResolution picks landscape for wide canvases", () => {
  assert.equal(nearestPerchanceResolution(1024, 576), "768x512");
});

test("nearestPerchanceResolution picks portrait for tall canvases", () => {
  assert.equal(nearestPerchanceResolution(576, 1024), "512x768");
});

test("nearestPerchanceResolution picks square for equal dimensions", () => {
  assert.equal(nearestPerchanceResolution(768, 768), "768x768");
});

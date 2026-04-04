import { describe, expect, it } from "vitest";

import {
  CAMERA_DISTANCE,
  INITIAL_ROTATION_X,
  INITIAL_ROTATION_Y,
  MAX_ROTATION_X,
  applyRotation,
  buildCameraPosition,
  buildObjectModelMatrix,
  buildModelMatrix,
  buildModelViewProjectionMatrix,
  buildViewProjectionMatrix,
  createIdentityMatrix,
  multiplyMatrices,
  perspectiveMatrix,
  rotationXMatrix,
  rotationYMatrix,
  translationMatrix,
} from "./math";

function toArray(matrix: Float32Array): number[] {
  return Array.from(matrix);
}

describe("applyRotation", () => {
  it("clamps x rotation while preserving y accumulation", () => {
    const next = applyRotation(INITIAL_ROTATION_X, INITIAL_ROTATION_Y, 10, 0.25);

    expect(next.rotationX).toBe(MAX_ROTATION_X);
    expect(next.rotationY).toBeCloseTo(INITIAL_ROTATION_Y + 0.25);
  });

  it("clamps negative x rotation", () => {
    const next = applyRotation(INITIAL_ROTATION_X, INITIAL_ROTATION_Y, -10, 0);

    expect(next.rotationX).toBe(-MAX_ROTATION_X);
    expect(next.rotationY).toBe(INITIAL_ROTATION_Y);
  });
});

describe("matrix helpers", () => {
  it("returns identity for zero x rotation", () => {
    expect(toArray(rotationXMatrix(0))).toEqual([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, -0, 1, 0,
      0, 0, 0, 1,
    ]);
  });

  it("preserves a matrix when multiplied by identity", () => {
    const identity = createIdentityMatrix();
    const translation = translationMatrix(1, 2, 3);

    expect(toArray(multiplyMatrices(identity, translation))).toEqual(toArray(translation));
    expect(toArray(multiplyMatrices(translation, identity))).toEqual(toArray(translation));
  });

  it("creates an identity matrix", () => {
    expect(toArray(createIdentityMatrix())).toEqual([
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]);
  });

  it("builds a model matrix from y and x rotations", () => {
    const matrix = buildModelMatrix(0.25, -0.4);
    const expected = multiplyMatrices(rotationYMatrix(-0.4), rotationXMatrix(0.25));

    expect(toArray(matrix)).toEqual(toArray(expected));
  });

  it("builds a finite perspective projection matrix", () => {
    const matrix = perspectiveMatrix(Math.PI / 3, 16 / 9, 0.1, 100);

    expect(matrix.every(Number.isFinite)).toBe(true);
    expect(matrix[0]).toBeGreaterThan(0);
    expect(matrix[5]).toBeGreaterThan(0);
    expect(matrix[11]).toBe(-1);
  });

  it("builds a model-view-projection matrix that changes with rotation", () => {
    const a = buildModelViewProjectionMatrix(16 / 9, INITIAL_ROTATION_X, INITIAL_ROTATION_Y);
    const b = buildModelViewProjectionMatrix(16 / 9, INITIAL_ROTATION_X + 0.2, INITIAL_ROTATION_Y + 0.3);

    expect(a.every(Number.isFinite)).toBe(true);
    expect(b.every(Number.isFinite)).toBe(true);
    expect(toArray(a)).not.toEqual(toArray(b));
  });

  it("builds a camera position that orbits around the scene", () => {
    const center = buildCameraPosition(0, 0);
    const rotated = buildCameraPosition(0, Math.PI / 2);

    expect(center[0]).toBeCloseTo(0, 5);
    expect(center[1]).toBeCloseTo(0, 5);
    expect(center[2]).toBeCloseTo(CAMERA_DISTANCE, 5);
    expect(center[3]).toBe(1);
    expect(rotated[0]).toBeCloseTo(CAMERA_DISTANCE, 5);
    expect(rotated[1]).toBeCloseTo(0, 5);
    expect(rotated[2]).toBeCloseTo(0, 5);
    expect(rotated[3]).toBe(1);
  });

  it("builds a finite view-projection matrix", () => {
    const wide = buildViewProjectionMatrix(16 / 9);
    const square = buildViewProjectionMatrix(1);

    expect(wide.every(Number.isFinite)).toBe(true);
    expect(square.every(Number.isFinite)).toBe(true);
    expect(wide[0]).not.toBe(square[0]);
    expect(wide[5]).toBe(square[5]);
  });

  it("builds an object model matrix with uniform scale and x-y translation", () => {
    const matrix = buildObjectModelMatrix({
      offsetX: 0.4,
      offsetY: -0.25,
      scale: 1.6,
    });

    expect(matrix[0]).toBeCloseTo(1.6, 5);
    expect(matrix[5]).toBeCloseTo(1.6, 5);
    expect(matrix[10]).toBeCloseTo(1.6, 5);
    expect(matrix[12]).toBeCloseTo(0.4, 5);
    expect(matrix[13]).toBeCloseTo(-0.25, 5);
    expect(matrix[15]).toBe(1);
  });
});

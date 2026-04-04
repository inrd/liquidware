import { describe, expect, it } from "vitest";

import { applyRetroGrade, bayerOffset, quantizeChannel } from "./postprocess";

describe("quantizeChannel", () => {
  it("snaps values to the requested number of bands", () => {
    expect(quantizeChannel(0, 6)).toBe(0);
    expect(quantizeChannel(255, 6)).toBe(255);
    expect(quantizeChannel(120, 6)).toBeCloseTo(102, 0);
  });
});

describe("bayerOffset", () => {
  it("repeats the threshold pattern every four pixels", () => {
    expect(bayerOffset(0, 0, 0.2)).toBeCloseTo(bayerOffset(4, 4, 0.2), 5);
    expect(bayerOffset(1, 0, 0.2)).not.toBeCloseTo(bayerOffset(0, 0, 0.2), 5);
  });
});

describe("applyRetroGrade", () => {
  it("preserves alpha while reducing colors to a smaller palette", () => {
    const source = new Uint8ClampedArray([
      120, 90, 210, 255,
      121, 91, 211, 128,
    ]);

    const graded = applyRetroGrade(source, 2, 1, {
      redLevels: 4,
      greenLevels: 4,
      blueLevels: 4,
      ditherStrength: 0,
      scanlineStrength: 0,
      chromaBleed: 0,
    });

    expect(Array.from(graded)).toEqual([
      85, 85, 170, 255,
      85, 85, 170, 128,
    ]);
  });

  it("adds scanlines and horizontal chroma bleed in the video pass", () => {
    const source = new Uint8ClampedArray([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ]);

    const graded = applyRetroGrade(source, 2, 2, {
      redLevels: 2,
      greenLevels: 2,
      blueLevels: 2,
      ditherStrength: 0,
      scanlineStrength: 0.25,
      chromaBleed: 0.5,
    });

    expect(Array.from(graded)).toEqual([
      255, 0, 0, 255,
      128, 255, 0, 255,
      0, 0, 191, 255,
      96, 191, 191, 255,
    ]);
  });
});

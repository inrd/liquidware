export type RetroGrade = {
  redLevels: number;
  greenLevels: number;
  blueLevels: number;
  ditherStrength: number;
  scanlineStrength: number;
  chromaBleed: number;
};

export const DEFAULT_RETRO_GRADE: RetroGrade = {
  redLevels: 6,
  greenLevels: 6,
  blueLevels: 5,
  ditherStrength: 0.2,
  scanlineStrength: 0.12,
  chromaBleed: 0.35,
};

const BAYER_4X4 = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

export function quantizeChannel(value: number, levels: number): number {
  if (levels <= 1) {
    return 0;
  }

  const clamped = clampByte(value);
  const stepCount = levels - 1;
  return Math.round((clamped / 255) * stepCount) * (255 / stepCount);
}

export function bayerOffset(x: number, y: number, strength: number): number {
  const threshold = BAYER_4X4[((y & 3) * 4) + (x & 3)];
  const normalized = (threshold + 0.5) / 16 - 0.5;
  return normalized * strength * 255;
}

export function applyRetroGrade(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  grade: RetroGrade = DEFAULT_RETRO_GRADE,
): Uint8ClampedArray {
  const quantized = new Uint8ClampedArray(pixels);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width + x) * 4;
      const offset = bayerOffset(x, y, grade.ditherStrength);

      quantized[pixelIndex] = clampByte(quantizeChannel(pixels[pixelIndex] + offset, grade.redLevels));
      quantized[pixelIndex + 1] = clampByte(
        quantizeChannel(pixels[pixelIndex + 1] + offset, grade.greenLevels),
      );
      quantized[pixelIndex + 2] = clampByte(
        quantizeChannel(pixels[pixelIndex + 2] + offset, grade.blueLevels),
      );
      quantized[pixelIndex + 3] = pixels[pixelIndex + 3];
    }
  }

  const next = new Uint8ClampedArray(quantized);

  for (let y = 0; y < height; y += 1) {
    const scanlineFactor = 1 - ((y & 1) * grade.scanlineStrength);

    for (let x = 0; x < width; x += 1) {
      const pixelIndex = (y * width + x) * 4;
      const leftX = Math.max(0, x - 1);
      const rightX = Math.min(width - 1, x + 1);
      const leftIndex = (y * width + leftX) * 4;
      const rightIndex = (y * width + rightX) * 4;

      const red = blendChannel(quantized[pixelIndex], quantized[leftIndex], grade.chromaBleed);
      const green = quantized[pixelIndex + 1];
      const blue = blendChannel(quantized[pixelIndex + 2], quantized[rightIndex + 2], grade.chromaBleed);

      next[pixelIndex] = clampByte(red * scanlineFactor);
      next[pixelIndex + 1] = clampByte(green * scanlineFactor);
      next[pixelIndex + 2] = clampByte(blue * scanlineFactor);
      next[pixelIndex + 3] = quantized[pixelIndex + 3];
    }
  }

  return next;
}

function blendChannel(center: number, neighbor: number, amount: number): number {
  return center * (1 - amount) + neighbor * amount;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export const MATRIX_FLOAT_COUNT = 16;
export const INITIAL_ROTATION_X = -0.45;
export const INITIAL_ROTATION_Y = 0.7;
export const MAX_ROTATION_X = Math.PI * 0.45;

export type Mat4 = Float32Array;

export function perspectiveMatrix(fieldOfView: number, aspectRatio: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fieldOfView / 2);
  const rangeInverse = 1 / (near - far);

  return new Float32Array([
    f / aspectRatio, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * rangeInverse, -1,
    0, 0, near * far * rangeInverse, 0,
  ]);
}

export function translationMatrix(x: number, y: number, z: number): Mat4 {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

export function rotationXMatrix(angle: number): Mat4 {
  const s = Math.sin(angle);
  const c = Math.cos(angle);

  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

export function rotationYMatrix(angle: number): Mat4 {
  const s = Math.sin(angle);
  const c = Math.cos(angle);

  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

export function multiplyMatrices(a: Mat4, b: Mat4): Mat4 {
  const result = new Float32Array(MATRIX_FLOAT_COUNT);

  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;

      for (let i = 0; i < 4; i += 1) {
        sum += a[i * 4 + row] * b[column * 4 + i];
      }

      result[column * 4 + row] = sum;
    }
  }

  return result;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function applyRotation(
  rotationX: number,
  rotationY: number,
  deltaX: number,
  deltaY: number,
): { rotationX: number; rotationY: number } {
  return {
    rotationX: clamp(rotationX + deltaX, -MAX_ROTATION_X, MAX_ROTATION_X),
    rotationY: rotationY + deltaY,
  };
}

export function buildModelViewProjectionMatrix(
  aspectRatio: number,
  rotationX: number,
  rotationY: number,
): Mat4 {
  const projection = perspectiveMatrix((60 * Math.PI) / 180, aspectRatio, 0.1, 100);
  const view = translationMatrix(0, 0, -3.2);
  const modelRotationX = rotationXMatrix(rotationX);
  const modelRotationY = rotationYMatrix(rotationY);
  const model = multiplyMatrices(modelRotationY, modelRotationX);
  const viewModel = multiplyMatrices(view, model);

  return multiplyMatrices(projection, viewModel);
}

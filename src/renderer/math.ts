export const MATRIX_FLOAT_COUNT = 16;
export const INITIAL_ROTATION_X = -0.45;
export const INITIAL_ROTATION_Y = 0.7;
export const MAX_ROTATION_X = Math.PI * 0.45;
export const CAMERA_DISTANCE = 3.2;

export type Mat4 = Float32Array;
export type ObjectTransform = {
  offsetX: number;
  offsetY: number;
  scale: number;
};

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
  const projection = buildProjectionMatrix(aspectRatio);
  const view = buildViewMatrix(rotationX, rotationY);
  return multiplyMatrices(projection, view);
}

export function buildModelMatrix(rotationX: number, rotationY: number): Mat4 {
  const modelRotationX = rotationXMatrix(rotationX);
  const modelRotationY = rotationYMatrix(rotationY);
  return multiplyMatrices(modelRotationY, modelRotationX);
}

export function buildViewProjectionMatrix(aspectRatio: number): Mat4 {
  return multiplyMatrices(buildProjectionMatrix(aspectRatio), buildViewMatrix(0, 0));
}

export function buildCameraPosition(rotationX: number, rotationY: number): Float32Array {
  const sceneRotation = buildModelMatrix(rotationX, rotationY);
  return transformPoint(sceneRotation, new Float32Array([0, 0, CAMERA_DISTANCE, 1]));
}

export function createIdentityMatrix(): Mat4 {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

export function buildObjectModelMatrix(transform: ObjectTransform): Mat4 {
  const scale = Math.max(0.05, transform.scale);

  return new Float32Array([
    scale, 0, 0, 0,
    0, scale, 0, 0,
    0, 0, scale, 0,
    transform.offsetX, transform.offsetY, 0, 1,
  ]);
}

function buildProjectionMatrix(aspectRatio: number): Mat4 {
  return perspectiveMatrix((60 * Math.PI) / 180, aspectRatio, 0.1, 100);
}

function buildViewMatrix(rotationX: number, rotationY: number): Mat4 {
  const cameraTranslation = translationMatrix(0, 0, -CAMERA_DISTANCE);
  const inverseRotation = multiplyMatrices(rotationXMatrix(-rotationX), rotationYMatrix(-rotationY));
  return multiplyMatrices(cameraTranslation, inverseRotation);
}

function transformPoint(matrix: Mat4, point: Float32Array): Float32Array {
  const result = new Float32Array(4);

  for (let row = 0; row < 4; row += 1) {
    let sum = 0;

    for (let column = 0; column < 4; column += 1) {
      sum += matrix[column * 4 + row] * point[column];
    }

    result[row] = sum;
  }

  return result;
}

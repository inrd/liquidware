const VERTEX_COMPONENT_COUNT = 9;

type Vec3 = [number, number, number];
type ObjFaceVertex = {
  positionIndex: number;
  normalIndex: number | null;
};

export type MeshData = {
  vertices: Float32Array;
  indices: Uint16Array | Uint32Array;
  indexFormat: GPUIndexFormat;
};

export function createDefaultCubeMesh(): MeshData {
  const vertices = new Float32Array([
    -0.5, -0.5, 0.5, 1, 1, 1, 0, 0, 1,
    0.5, -0.5, 0.5, 1, 1, 1, 0, 0, 1,
    0.5, 0.5, 0.5, 1, 1, 1, 0, 0, 1,
    -0.5, 0.5, 0.5, 1, 1, 1, 0, 0, 1,

    -0.5, -0.5, -0.5, 1, 1, 1, 0, 0, -1,
    -0.5, 0.5, -0.5, 1, 1, 1, 0, 0, -1,
    0.5, 0.5, -0.5, 1, 1, 1, 0, 0, -1,
    0.5, -0.5, -0.5, 1, 1, 1, 0, 0, -1,

    -0.5, -0.5, -0.5, 1, 1, 1, -1, 0, 0,
    -0.5, -0.5, 0.5, 1, 1, 1, -1, 0, 0,
    -0.5, 0.5, 0.5, 1, 1, 1, -1, 0, 0,
    -0.5, 0.5, -0.5, 1, 1, 1, -1, 0, 0,

    0.5, -0.5, 0.5, 1, 1, 1, 1, 0, 0,
    0.5, -0.5, -0.5, 1, 1, 1, 1, 0, 0,
    0.5, 0.5, -0.5, 1, 1, 1, 1, 0, 0,
    0.5, 0.5, 0.5, 1, 1, 1, 1, 0, 0,

    -0.5, 0.5, 0.5, 1, 1, 1, 0, 1, 0,
    0.5, 0.5, 0.5, 1, 1, 1, 0, 1, 0,
    0.5, 0.5, -0.5, 1, 1, 1, 0, 1, 0,
    -0.5, 0.5, -0.5, 1, 1, 1, 0, 1, 0,

    -0.5, -0.5, -0.5, 1, 1, 1, 0, -1, 0,
    0.5, -0.5, -0.5, 1, 1, 1, 0, -1, 0,
    0.5, -0.5, 0.5, 1, 1, 1, 0, -1, 0,
    -0.5, -0.5, 0.5, 1, 1, 1, 0, -1, 0,
  ]);

  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11,
    12, 13, 14, 12, 14, 15,
    16, 17, 18, 16, 18, 19,
    20, 21, 22, 20, 22, 23,
  ]);

  return {
    vertices,
    indices,
    indexFormat: "uint16",
  };
}

export function createFloorMesh(): MeshData {
  const vertices = new Float32Array([
    -4.0, -1.05, -4.5, 1, 1, 1, 0, 1, 0,
    4.0, -1.05, -4.5, 1, 1, 1, 0, 1, 0,
    4.0, -1.05, 4.5, 1, 1, 1, 0, 1, 0,
    -4.0, -1.05, 4.5, 1, 1, 1, 0, 1, 0,
  ]);

  const indices = new Uint16Array([0, 1, 2, 0, 2, 3]);

  return {
    vertices,
    indices,
    indexFormat: "uint16",
  };
}

export function parseObjMesh(source: string): MeshData {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const faces: ObjFaceVertex[][] = [];

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const [keyword, ...tokens] = line.split(/\s+/u);

    switch (keyword) {
      case "v":
        positions.push(parseVec3(tokens, "vertex"));
        break;
      case "vn":
        normals.push(normalizeVector(parseVec3(tokens, "normal")));
        break;
      case "f":
        if (tokens.length < 3) {
          throw new Error("OBJ faces must contain at least three vertices.");
        }

        faces.push(tokens.map((token) => parseFaceVertex(token, positions.length, normals.length)));
        break;
      default:
        break;
    }
  }

  if (positions.length === 0) {
    throw new Error("OBJ file did not contain any vertex positions.");
  }

  if (faces.length === 0) {
    throw new Error("OBJ file did not contain any faces.");
  }

  const normalizedPositions = normalizePositions(positions);
  const vertexData: number[] = [];
  const indexData: number[] = [];

  for (const face of faces) {
    for (let faceIndex = 1; faceIndex < face.length - 1; faceIndex += 1) {
      const triangle = [face[0], face[faceIndex], face[faceIndex + 1]] as const;
      const trianglePositions = triangle.map((vertex) => normalizedPositions[vertex.positionIndex]);
      const generatedNormal = normalizeVector(
        computeFaceNormal(trianglePositions[0], trianglePositions[1], trianglePositions[2]),
      );
      const hasTriangleNormals = triangle.every((vertex) => vertex.normalIndex !== null);
      const triangleNormal =
        vectorLength(generatedNormal) > 0 ? generatedNormal : ([0, 1, 0] as Vec3);

      for (const vertex of triangle) {
        const position = normalizedPositions[vertex.positionIndex];
        const normal = hasTriangleNormals
          ? normals[vertex.normalIndex as number]
          : triangleNormal;

        vertexData.push(
          position[0],
          position[1],
          position[2],
          1,
          1,
          1,
          normal[0],
          normal[1],
          normal[2],
        );
        indexData.push(indexData.length);
      }
    }
  }

  return createMeshData(vertexData, indexData);
}

function createMeshData(vertices: number[], indices: number[]): MeshData {
  const vertexArray = new Float32Array(vertices);
  const indexFormat: GPUIndexFormat = indices.length > 0xffff ? "uint32" : "uint16";
  const indexArray =
    indexFormat === "uint32" ? new Uint32Array(indices) : new Uint16Array(indices);

  return {
    vertices: vertexArray,
    indices: indexArray,
    indexFormat,
  };
}

function parseVec3(tokens: string[], label: string): Vec3 {
  if (tokens.length < 3) {
    throw new Error(`OBJ ${label} is missing coordinates.`);
  }

  const x = Number(tokens[0]);
  const y = Number(tokens[1]);
  const z = Number(tokens[2]);

  if (![x, y, z].every(Number.isFinite)) {
    throw new Error(`OBJ ${label} contains a non-numeric coordinate.`);
  }

  return [x, y, z];
}

function parseFaceVertex(token: string, positionCount: number, normalCount: number): ObjFaceVertex {
  const parts = token.split("/");
  const positionIndex = resolveObjIndex(parts[0], positionCount, "position");
  const normalToken = parts.length >= 3 ? parts[2] : "";
  const normalIndex =
    normalToken !== "" ? resolveObjIndex(normalToken, normalCount, "normal") : null;

  return {
    positionIndex,
    normalIndex,
  };
}

function resolveObjIndex(token: string, count: number, label: string): number {
  const rawIndex = Number(token);

  if (!Number.isInteger(rawIndex) || rawIndex === 0) {
    throw new Error(`OBJ ${label} index must be a non-zero integer.`);
  }

  const resolved = rawIndex > 0 ? rawIndex - 1 : count + rawIndex;

  if (resolved < 0 || resolved >= count) {
    throw new Error(`OBJ ${label} index is out of range.`);
  }

  return resolved;
}

function normalizePositions(positions: Vec3[]): Vec3[] {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (const [x, y, z] of positions) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const extentX = maxX - minX;
  const extentY = maxY - minY;
  const extentZ = maxZ - minZ;
  const maxExtent = Math.max(extentX, extentY, extentZ);
  const scale = maxExtent > 0 ? 1 / maxExtent : 1;

  return positions.map(([x, y, z]) => [
    (x - centerX) * scale,
    (y - centerY) * scale,
    (z - centerZ) * scale,
  ]);
}

function computeFaceNormal(a: Vec3, b: Vec3, c: Vec3): Vec3 {
  const ab: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac: Vec3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];

  return [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
}

function normalizeVector(vector: Vec3): Vec3 {
  const length = vectorLength(vector);

  if (length === 0) {
    return [0, 0, 0];
  }

  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function vectorLength([x, y, z]: Vec3): number {
  return Math.hypot(x, y, z);
}

export const MESH_VERTEX_STRIDE = VERTEX_COMPONENT_COUNT * Float32Array.BYTES_PER_ELEMENT;

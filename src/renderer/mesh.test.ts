import { describe, expect, it } from "vitest";

import { createDefaultCubeMesh, parseObjMesh } from "./mesh";

describe("createDefaultCubeMesh", () => {
  it("returns the baked cube in the interleaved vertex format", () => {
    const mesh = createDefaultCubeMesh();

    expect(mesh.vertices.length).toBe(24 * 9);
    expect(mesh.indices.length).toBe(36);
    expect(mesh.indexFormat).toBe("uint16");
  });
});

describe("parseObjMesh", () => {
  it("triangulates polygon faces and recenters the result", () => {
    const mesh = parseObjMesh(`
      v 2 0 0
      v 4 0 0
      v 4 2 0
      v 2 2 0
      f 1 2 3 4
    `);

    expect(mesh.indices.length).toBe(6);
    expect(mesh.vertices.length).toBe(6 * 9);

    const xs = collectAttribute(mesh.vertices, 0);
    const ys = collectAttribute(mesh.vertices, 1);

    expect(Math.min(...xs)).toBeCloseTo(-0.5, 5);
    expect(Math.max(...xs)).toBeCloseTo(0.5, 5);
    expect(Math.min(...ys)).toBeCloseTo(-0.5, 5);
    expect(Math.max(...ys)).toBeCloseTo(0.5, 5);
  });

  it("supports negative face indices and generates flat normals when needed", () => {
    const mesh = parseObjMesh(`
      v -1 0 0
      v 1 0 0
      v 0 1 0
      f -3 -2 -1
    `);

    expect(mesh.indices.length).toBe(3);
    expect(mesh.indexFormat).toBe("uint16");

    const normals = collectTriples(mesh.vertices, 6);
    for (const [x, y, z] of normals) {
      expect(x).toBeCloseTo(0, 5);
      expect(y).toBeCloseTo(0, 5);
      expect(z).toBeCloseTo(1, 5);
    }
  });

  it("uses supplied vertex normals when they are present", () => {
    const mesh = parseObjMesh(`
      v 0 0 0
      v 1 0 0
      v 0 1 0
      vn 0 0 -1
      f 1//1 2//1 3//1
    `);

    const normals = collectTriples(mesh.vertices, 6);
    for (const [x, y, z] of normals) {
      expect(x).toBeCloseTo(0, 5);
      expect(y).toBeCloseTo(0, 5);
      expect(z).toBeCloseTo(-1, 5);
    }
  });

  it("rejects OBJ files without faces", () => {
    expect(() => parseObjMesh("v 0 0 0")).toThrow("faces");
  });
});

function collectAttribute(vertices: Float32Array, offset: number): number[] {
  const values: number[] = [];

  for (let index = offset; index < vertices.length; index += 9) {
    values.push(vertices[index]);
  }

  return values;
}

function collectTriples(vertices: Float32Array, offset: number): number[][] {
  const values: number[][] = [];

  for (let index = offset; index < vertices.length; index += 9) {
    values.push([vertices[index], vertices[index + 1], vertices[index + 2]]);
  }

  return values;
}

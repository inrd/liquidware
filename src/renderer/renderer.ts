import shaderSource from "./shaders.wgsl?raw";
import {
  MESH_VERTEX_STRIDE,
  MeshData,
  createDefaultCubeMesh,
  createFloorMesh,
} from "./mesh";
import {
  INITIAL_ROTATION_X,
  INITIAL_ROTATION_Y,
  MATRIX_FLOAT_COUNT,
  applyRotation,
  buildCameraPosition,
  buildObjectModelMatrix,
  buildModelViewProjectionMatrix,
  createIdentityMatrix,
  ObjectTransform,
} from "./math";

const SCENE_UNIFORM_FLOAT_COUNT = MATRIX_FLOAT_COUNT * 2 + 12;
const SCENE_UNIFORM_BUFFER_SIZE = SCENE_UNIFORM_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT;
const DEPTH_FORMAT = "depth24plus";

type MaterialSettings = {
  color: { r: number; g: number; b: number };
  surface: number;
  gloss: number;
  bleed: number;
};

const DEFAULT_MATERIAL: MaterialSettings = {
  color: { r: 0.22, g: 0.76, b: 0.88 },
  surface: 0.38,
  gloss: 0.62,
  bleed: 0.22,
};
const DEFAULT_OBJECT_TRANSFORM: ObjectTransform = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
};

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private presentationFormat: GPUTextureFormat | null = null;
  private skyPipeline: GPURenderPipeline | null = null;
  private shadowPipeline: GPURenderPipeline | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private objectVertexBuffer: GPUBuffer | null = null;
  private objectIndexBuffer: GPUBuffer | null = null;
  private objectIndexCount = 0;
  private objectIndexFormat: GPUIndexFormat = "uint16";
  private floorVertexBuffer: GPUBuffer | null = null;
  private floorIndexBuffer: GPUBuffer | null = null;
  private floorIndexCount = 0;
  private floorIndexFormat: GPUIndexFormat = "uint16";
  private objectUniformBuffer: GPUBuffer | null = null;
  private floorUniformBuffer: GPUBuffer | null = null;
  private objectBindGroup: GPUBindGroup | null = null;
  private floorBindGroup: GPUBindGroup | null = null;
  private depthTexture: GPUTexture | null = null;
  private depthTextureView: GPUTextureView | null = null;
  private rotationX = INITIAL_ROTATION_X;
  private rotationY = INITIAL_ROTATION_Y;
  private material: MaterialSettings = DEFAULT_MATERIAL;
  private objectTransform: ObjectTransform = DEFAULT_OBJECT_TRANSFORM;

  public constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  public async initialize(): Promise<void> {
    this.adapter = await navigator.gpu.requestAdapter();

    if (!this.adapter) {
      throw new Error("Failed to acquire a WebGPU adapter.");
    }

    this.device = await this.adapter.requestDevice();
    this.context = this.canvas.getContext("webgpu");

    if (!this.context) {
      throw new Error("Failed to acquire a WebGPU canvas context.");
    }

    this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    this.createSceneResources();
    this.configureContext();
  }

  public resize(width: number, height: number, devicePixelRatio: number): void {
    const scaledWidth = Math.max(1, Math.floor(width * Math.max(1, devicePixelRatio)));
    const scaledHeight = Math.max(1, Math.floor(height * Math.max(1, devicePixelRatio)));

    if (this.canvas.width !== scaledWidth || this.canvas.height !== scaledHeight) {
      this.canvas.width = scaledWidth;
      this.canvas.height = scaledHeight;
      this.configureContext();
    }
  }

  public rotate(deltaX: number, deltaY: number): void {
    const nextRotation = applyRotation(this.rotationX, this.rotationY, deltaX, deltaY);
    this.rotationX = nextRotation.rotationX;
    this.rotationY = nextRotation.rotationY;
  }

  public setMaterial(nextMaterial: Partial<MaterialSettings>): void {
    this.material = {
      ...this.material,
      ...nextMaterial,
      color: {
        ...this.material.color,
        ...nextMaterial.color,
      },
    };
  }

  public setObjectMesh(mesh: MeshData): void {
    if (!this.device) {
      return;
    }

    this.objectVertexBuffer = this.createVertexBuffer(mesh.vertices);
    this.objectIndexBuffer = this.createIndexBuffer(mesh.indices);
    this.objectIndexCount = mesh.indices.length;
    this.objectIndexFormat = mesh.indexFormat;
  }

  public resetObjectMesh(): void {
    this.setObjectMesh(createDefaultCubeMesh());
  }

  public setObjectTransform(nextTransform: Partial<ObjectTransform>): void {
    this.objectTransform = {
      ...this.objectTransform,
      ...nextTransform,
    };
  }

  public render(): void {
    if (
      !this.device ||
      !this.context ||
      !this.skyPipeline ||
      !this.shadowPipeline ||
      !this.pipeline ||
      !this.objectVertexBuffer ||
      !this.objectIndexBuffer ||
      !this.floorVertexBuffer ||
      !this.floorIndexBuffer ||
      !this.objectBindGroup ||
      !this.floorBindGroup ||
      !this.depthTextureView
    ) {
      return;
    }

    this.updateSceneUniforms();

    const commandEncoder = this.device.createCommandEncoder();
    const renderPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.78, g: 0.63, b: 0.7, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: this.depthTextureView,
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    renderPass.setPipeline(this.skyPipeline);
    renderPass.draw(3);
    renderPass.setPipeline(this.pipeline);
    renderPass.setVertexBuffer(0, this.floorVertexBuffer);
    renderPass.setIndexBuffer(this.floorIndexBuffer, this.floorIndexFormat);
    renderPass.setBindGroup(0, this.floorBindGroup);
    renderPass.drawIndexed(this.floorIndexCount);
    renderPass.setPipeline(this.shadowPipeline);
    renderPass.setVertexBuffer(0, this.objectVertexBuffer);
    renderPass.setIndexBuffer(this.objectIndexBuffer, this.objectIndexFormat);
    renderPass.setBindGroup(0, this.objectBindGroup);
    renderPass.drawIndexed(this.objectIndexCount);
    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.objectBindGroup);
    renderPass.drawIndexed(this.objectIndexCount);
    renderPass.end();
    this.device.queue.submit([commandEncoder.finish()]);
  }

  private configureContext(): void {
    if (!this.device || !this.context || !this.presentationFormat) {
      return;
    }

    this.context.configure({
      device: this.device,
      format: this.presentationFormat,
      alphaMode: "opaque",
    });

    this.createDepthTexture();
  }

  private createSceneResources(): void {
    if (!this.device || !this.presentationFormat) {
      return;
    }

    this.objectUniformBuffer = this.device.createBuffer({
      size: SCENE_UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.floorUniformBuffer = this.device.createBuffer({
      size: SCENE_UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const shaderModule = this.device.createShaderModule({
      code: shaderSource,
    });

    const sceneBindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: {
            type: "uniform",
          },
        },
      ],
    });

    const scenePipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [sceneBindGroupLayout],
    });

    this.skyPipeline = this.device.createRenderPipeline({
      layout: "auto",
      vertex: {
        module: shaderModule,
        entryPoint: "sky_vs_main",
      },
      fragment: {
        module: shaderModule,
        entryPoint: "sky_fs_main",
        targets: [
          {
            format: this.presentationFormat,
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
      depthStencil: {
        format: DEPTH_FORMAT,
        depthWriteEnabled: false,
        depthCompare: "always",
      },
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: scenePipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: MESH_VERTEX_STRIDE,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
              {
                shaderLocation: 1,
                offset: 3 * Float32Array.BYTES_PER_ELEMENT,
                format: "float32x3",
              },
              {
                shaderLocation: 2,
                offset: 6 * Float32Array.BYTES_PER_ELEMENT,
                format: "float32x3",
              },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format: this.presentationFormat,
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
      },
      depthStencil: {
        format: DEPTH_FORMAT,
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    });

    this.shadowPipeline = this.device.createRenderPipeline({
      layout: scenePipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "shadow_vs_main",
        buffers: [
          {
            arrayStride: MESH_VERTEX_STRIDE,
            attributes: [
              {
                shaderLocation: 0,
                offset: 0,
                format: "float32x3",
              },
              {
                shaderLocation: 1,
                offset: 3 * Float32Array.BYTES_PER_ELEMENT,
                format: "float32x3",
              },
              {
                shaderLocation: 2,
                offset: 6 * Float32Array.BYTES_PER_ELEMENT,
                format: "float32x3",
              },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "shadow_fs_main",
        targets: [
          {
            format: this.presentationFormat,
            blend: {
              color: {
                srcFactor: "src-alpha",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
              alpha: {
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
                operation: "add",
              },
            },
          },
        ],
      },
      primitive: {
        topology: "triangle-list",
        cullMode: "none",
      },
      depthStencil: {
        format: DEPTH_FORMAT,
        depthWriteEnabled: false,
        depthCompare: "less",
      },
    });

    this.objectBindGroup = this.device.createBindGroup({
      layout: sceneBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.objectUniformBuffer,
          },
        },
      ],
    });

    this.floorBindGroup = this.device.createBindGroup({
      layout: sceneBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.floorUniformBuffer,
          },
        },
      ],
    });

    this.setObjectMesh(createDefaultCubeMesh());
    this.setFloorMesh(createFloorMesh());
  }

  private updateSceneUniforms(): void {
    if (!this.device || !this.objectUniformBuffer || !this.floorUniformBuffer) {
      return;
    }

    const aspectRatio = this.canvas.width / this.canvas.height;
    const sceneViewProjection = buildModelViewProjectionMatrix(
      aspectRatio,
      this.rotationX,
      this.rotationY,
    );
    const sceneModelMatrix = buildObjectModelMatrix(this.objectTransform);
    const cameraPosition = buildCameraPosition(this.rotationX, this.rotationY);
    const objectUniforms = new Float32Array(SCENE_UNIFORM_FLOAT_COUNT);
    const floorUniforms = new Float32Array(SCENE_UNIFORM_FLOAT_COUNT);

    objectUniforms.set(sceneViewProjection, 0);
    objectUniforms.set(sceneModelMatrix, MATRIX_FLOAT_COUNT);
    objectUniforms.set(cameraPosition, MATRIX_FLOAT_COUNT * 2);
    objectUniforms.set(
      [this.material.color.r, this.material.color.g, this.material.color.b, 1],
      MATRIX_FLOAT_COUNT * 2 + 4,
    );
    objectUniforms.set(
      [this.material.surface, this.material.gloss, this.material.bleed, 0],
      MATRIX_FLOAT_COUNT * 2 + 8,
    );

    floorUniforms.set(sceneViewProjection, 0);
    floorUniforms.set(createIdentityMatrix(), MATRIX_FLOAT_COUNT);
    floorUniforms.set(cameraPosition, MATRIX_FLOAT_COUNT * 2);
    floorUniforms.set([0, 0, 0, 0], MATRIX_FLOAT_COUNT * 2 + 4);
    floorUniforms.set([1, 0.08, 1, 0], MATRIX_FLOAT_COUNT * 2 + 8);

    this.device.queue.writeBuffer(this.objectUniformBuffer, 0, objectUniforms);
    this.device.queue.writeBuffer(this.floorUniformBuffer, 0, floorUniforms);
  }

  private setFloorMesh(mesh: MeshData): void {
    if (!this.device) {
      return;
    }

    this.floorVertexBuffer = this.createVertexBuffer(mesh.vertices);
    this.floorIndexBuffer = this.createIndexBuffer(mesh.indices);
    this.floorIndexCount = mesh.indices.length;
    this.floorIndexFormat = mesh.indexFormat;
  }

  private createVertexBuffer(vertices: Float32Array): GPUBuffer {
    const buffer = this.device!.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device!.queue.writeBuffer(buffer, 0, vertices);
    return buffer;
  }

  private createIndexBuffer(indices: Uint16Array | Uint32Array): GPUBuffer {
    const buffer = this.device!.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device!.queue.writeBuffer(buffer, 0, indices);
    return buffer;
  }

  private createDepthTexture(): void {
    if (!this.device || this.canvas.width === 0 || this.canvas.height === 0) {
      return;
    }

    this.depthTexture = this.device.createTexture({
      size: {
        width: this.canvas.width,
        height: this.canvas.height,
        depthOrArrayLayers: 1,
      },
      format: DEPTH_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthTextureView = this.depthTexture.createView();
  }
}

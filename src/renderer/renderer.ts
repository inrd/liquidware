import shaderSource from "./shaders.wgsl?raw";
import {
  INITIAL_ROTATION_X,
  INITIAL_ROTATION_Y,
  MATRIX_FLOAT_COUNT,
  applyRotation,
  buildCameraPosition,
  buildModelViewProjectionMatrix,
  createIdentityMatrix,
} from "./math";

const CUBE_VERTEX_STRIDE = 9 * Float32Array.BYTES_PER_ELEMENT;
const CUBE_INDEX_COUNT = 36;
const FLOOR_INDEX_COUNT = 6;
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

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private presentationFormat: GPUTextureFormat | null = null;
  private skyPipeline: GPURenderPipeline | null = null;
  private shadowPipeline: GPURenderPipeline | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private cubeUniformBuffer: GPUBuffer | null = null;
  private floorUniformBuffer: GPUBuffer | null = null;
  private cubeBindGroup: GPUBindGroup | null = null;
  private floorBindGroup: GPUBindGroup | null = null;
  private depthTexture: GPUTexture | null = null;
  private depthTextureView: GPUTextureView | null = null;
  private rotationX = INITIAL_ROTATION_X;
  private rotationY = INITIAL_ROTATION_Y;
  private material: MaterialSettings = DEFAULT_MATERIAL;

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

  public render(): void {
    if (
      !this.device ||
      !this.context ||
      !this.skyPipeline ||
      !this.shadowPipeline ||
      !this.pipeline ||
      !this.vertexBuffer ||
      !this.indexBuffer ||
      !this.cubeBindGroup ||
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
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.setIndexBuffer(this.indexBuffer, "uint16");
    renderPass.setBindGroup(0, this.floorBindGroup);
    renderPass.drawIndexed(FLOOR_INDEX_COUNT, 1, CUBE_INDEX_COUNT);
    renderPass.setPipeline(this.shadowPipeline);
    renderPass.setBindGroup(0, this.cubeBindGroup);
    renderPass.drawIndexed(CUBE_INDEX_COUNT);
    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.cubeBindGroup);
    renderPass.drawIndexed(CUBE_INDEX_COUNT);
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

    const vertices = new Float32Array([
      -0.5, -0.5,  0.5, 0.14, 0.22, 0.46,  0.0,  0.0,  1.0,
       0.5, -0.5,  0.5, 0.14, 0.22, 0.46,  0.0,  0.0,  1.0,
       0.5,  0.5,  0.5, 0.14, 0.22, 0.46,  0.0,  0.0,  1.0,
      -0.5,  0.5,  0.5, 0.14, 0.22, 0.46,  0.0,  0.0,  1.0,

      -0.5, -0.5, -0.5, 0.94, 0.54, 0.23,  0.0,  0.0, -1.0,
      -0.5,  0.5, -0.5, 0.94, 0.54, 0.23,  0.0,  0.0, -1.0,
       0.5,  0.5, -0.5, 0.94, 0.54, 0.23,  0.0,  0.0, -1.0,
       0.5, -0.5, -0.5, 0.94, 0.54, 0.23,  0.0,  0.0, -1.0,

      -0.5, -0.5, -0.5, 0.18, 0.68, 0.90, -1.0,  0.0,  0.0,
      -0.5, -0.5,  0.5, 0.18, 0.68, 0.90, -1.0,  0.0,  0.0,
      -0.5,  0.5,  0.5, 0.18, 0.68, 0.90, -1.0,  0.0,  0.0,
      -0.5,  0.5, -0.5, 0.18, 0.68, 0.90, -1.0,  0.0,  0.0,

       0.5, -0.5,  0.5, 0.38, 0.84, 0.56,  1.0,  0.0,  0.0,
       0.5, -0.5, -0.5, 0.38, 0.84, 0.56,  1.0,  0.0,  0.0,
       0.5,  0.5, -0.5, 0.38, 0.84, 0.56,  1.0,  0.0,  0.0,
       0.5,  0.5,  0.5, 0.38, 0.84, 0.56,  1.0,  0.0,  0.0,

      -0.5,  0.5,  0.5, 0.84, 0.28, 0.42,  0.0,  1.0,  0.0,
       0.5,  0.5,  0.5, 0.84, 0.28, 0.42,  0.0,  1.0,  0.0,
       0.5,  0.5, -0.5, 0.84, 0.28, 0.42,  0.0,  1.0,  0.0,
      -0.5,  0.5, -0.5, 0.84, 0.28, 0.42,  0.0,  1.0,  0.0,

      -0.5, -0.5, -0.5, 0.95, 0.84, 0.32,  0.0, -1.0,  0.0,
       0.5, -0.5, -0.5, 0.95, 0.84, 0.32,  0.0, -1.0,  0.0,
       0.5, -0.5,  0.5, 0.95, 0.84, 0.32,  0.0, -1.0,  0.0,
      -0.5, -0.5,  0.5, 0.95, 0.84, 0.32,  0.0, -1.0,  0.0,

      -4.0, -1.05, -4.5, 0.82, 0.77, 0.71,  0.0,  1.0,  0.0,
       4.0, -1.05, -4.5, 0.82, 0.77, 0.71,  0.0,  1.0,  0.0,
       4.0, -1.05,  4.5, 0.82, 0.77, 0.71,  0.0,  1.0,  0.0,
      -4.0, -1.05,  4.5, 0.82, 0.77, 0.71,  0.0,  1.0,  0.0,
    ]);

    this.vertexBuffer = this.device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.vertexBuffer, 0, vertices);

    const indices = new Uint16Array([
       0,  1,  2,  0,  2,  3,
       4,  5,  6,  4,  6,  7,
       8,  9, 10,  8, 10, 11,
      12, 13, 14, 12, 14, 15,
      16, 17, 18, 16, 18, 19,
      20, 21, 22, 20, 22, 23,
      24, 25, 26, 24, 26, 27,
    ]);

    this.indexBuffer = this.device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.indexBuffer, 0, indices);

    this.cubeUniformBuffer = this.device.createBuffer({
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
            arrayStride: CUBE_VERTEX_STRIDE,
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
            arrayStride: CUBE_VERTEX_STRIDE,
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

    this.cubeBindGroup = this.device.createBindGroup({
      layout: sceneBindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.cubeUniformBuffer,
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
  }

  private updateSceneUniforms(): void {
    if (!this.device || !this.cubeUniformBuffer || !this.floorUniformBuffer) {
      return;
    }

    const aspectRatio = this.canvas.width / this.canvas.height;
    const sceneViewProjection = buildModelViewProjectionMatrix(
      aspectRatio,
      this.rotationX,
      this.rotationY,
    );
    const sceneModelMatrix = createIdentityMatrix();
    const cameraPosition = buildCameraPosition(this.rotationX, this.rotationY);
    const cubeUniforms = new Float32Array(SCENE_UNIFORM_FLOAT_COUNT);
    const floorUniforms = new Float32Array(SCENE_UNIFORM_FLOAT_COUNT);

    cubeUniforms.set(sceneViewProjection, 0);
    cubeUniforms.set(sceneModelMatrix, MATRIX_FLOAT_COUNT);
    cubeUniforms.set(cameraPosition, MATRIX_FLOAT_COUNT * 2);
    cubeUniforms.set(
      [this.material.color.r, this.material.color.g, this.material.color.b, 1],
      MATRIX_FLOAT_COUNT * 2 + 4,
    );
    cubeUniforms.set(
      [this.material.surface, this.material.gloss, this.material.bleed, 0],
      MATRIX_FLOAT_COUNT * 2 + 8,
    );

    floorUniforms.set(sceneViewProjection, 0);
    floorUniforms.set(sceneModelMatrix, MATRIX_FLOAT_COUNT);
    floorUniforms.set(cameraPosition, MATRIX_FLOAT_COUNT * 2);
    floorUniforms.set([0, 0, 0, 0], MATRIX_FLOAT_COUNT * 2 + 4);
    floorUniforms.set([1, 0.08, 1, 0], MATRIX_FLOAT_COUNT * 2 + 8);

    this.device.queue.writeBuffer(this.cubeUniformBuffer, 0, cubeUniforms);
    this.device.queue.writeBuffer(this.floorUniformBuffer, 0, floorUniforms);
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

import shaderSource from "./shaders.wgsl?raw";
import {
  INITIAL_ROTATION_X,
  INITIAL_ROTATION_Y,
  MATRIX_FLOAT_COUNT,
  applyRotation,
  buildModelViewProjectionMatrix,
} from "./math";

const CUBE_VERTEX_STRIDE = 6 * Float32Array.BYTES_PER_ELEMENT;
const CUBE_INDEX_COUNT = 36;
const MATRIX_BUFFER_SIZE = MATRIX_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT;
const DEPTH_FORMAT = "depth24plus";

export class Renderer {
  private readonly canvas: HTMLCanvasElement;
  private adapter: GPUAdapter | null = null;
  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private presentationFormat: GPUTextureFormat | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private vertexBuffer: GPUBuffer | null = null;
  private indexBuffer: GPUBuffer | null = null;
  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private depthTexture: GPUTexture | null = null;
  private depthTextureView: GPUTextureView | null = null;
  private rotationX = INITIAL_ROTATION_X;
  private rotationY = INITIAL_ROTATION_Y;

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

  public render(): void {
    if (
      !this.device ||
      !this.context ||
      !this.pipeline ||
      !this.vertexBuffer ||
      !this.indexBuffer ||
      !this.uniformBuffer ||
      !this.bindGroup ||
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
          clearValue: { r: 0.04, g: 0.08, b: 0.17, a: 1 },
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

    renderPass.setPipeline(this.pipeline);
    renderPass.setBindGroup(0, this.bindGroup);
    renderPass.setVertexBuffer(0, this.vertexBuffer);
    renderPass.setIndexBuffer(this.indexBuffer, "uint16");
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
      -0.5, -0.5,  0.5, 0.14, 0.22, 0.46,
       0.5, -0.5,  0.5, 0.14, 0.22, 0.46,
       0.5,  0.5,  0.5, 0.14, 0.22, 0.46,
      -0.5,  0.5,  0.5, 0.14, 0.22, 0.46,

      -0.5, -0.5, -0.5, 0.94, 0.54, 0.23,
      -0.5,  0.5, -0.5, 0.94, 0.54, 0.23,
       0.5,  0.5, -0.5, 0.94, 0.54, 0.23,
       0.5, -0.5, -0.5, 0.94, 0.54, 0.23,

      -0.5, -0.5, -0.5, 0.18, 0.68, 0.90,
      -0.5, -0.5,  0.5, 0.18, 0.68, 0.90,
      -0.5,  0.5,  0.5, 0.18, 0.68, 0.90,
      -0.5,  0.5, -0.5, 0.18, 0.68, 0.90,

       0.5, -0.5,  0.5, 0.38, 0.84, 0.56,
       0.5, -0.5, -0.5, 0.38, 0.84, 0.56,
       0.5,  0.5, -0.5, 0.38, 0.84, 0.56,
       0.5,  0.5,  0.5, 0.38, 0.84, 0.56,

      -0.5,  0.5,  0.5, 0.84, 0.28, 0.42,
       0.5,  0.5,  0.5, 0.84, 0.28, 0.42,
       0.5,  0.5, -0.5, 0.84, 0.28, 0.42,
      -0.5,  0.5, -0.5, 0.84, 0.28, 0.42,

      -0.5, -0.5, -0.5, 0.95, 0.84, 0.32,
       0.5, -0.5, -0.5, 0.95, 0.84, 0.32,
       0.5, -0.5,  0.5, 0.95, 0.84, 0.32,
      -0.5, -0.5,  0.5, 0.95, 0.84, 0.32,
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
    ]);

    this.indexBuffer = this.device.createBuffer({
      size: indices.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.indexBuffer, 0, indices);

    this.uniformBuffer = this.device.createBuffer({
      size: MATRIX_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const shaderModule = this.device.createShaderModule({
      code: shaderSource,
    });

    this.pipeline = this.device.createRenderPipeline({
      layout: "auto",
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

    this.bindGroup = this.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformBuffer,
          },
        },
      ],
    });
  }

  private updateSceneUniforms(): void {
    if (!this.device || !this.uniformBuffer) {
      return;
    }

    const aspectRatio = this.canvas.width / this.canvas.height;
    const modelViewProjection = buildModelViewProjectionMatrix(
      aspectRatio,
      this.rotationX,
      this.rotationY,
    );

    this.device.queue.writeBuffer(this.uniformBuffer, 0, modelViewProjection);
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

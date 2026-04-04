import shaderSource from "./shaders.wgsl?raw";

const CUBE_VERTEX_STRIDE = 6 * Float32Array.BYTES_PER_ELEMENT;
const CUBE_INDEX_COUNT = 36;
const MATRIX_FLOAT_COUNT = 16;
const MATRIX_BUFFER_SIZE = MATRIX_FLOAT_COUNT * Float32Array.BYTES_PER_ELEMENT;
const DEPTH_FORMAT = "depth24plus";

type Mat4 = Float32Array;

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
  private rotationX = -0.45;
  private rotationY = 0.7;

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
    this.rotationX = clamp(this.rotationX + deltaX, -Math.PI * 0.45, Math.PI * 0.45);
    this.rotationY += deltaY;
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
    const projection = perspectiveMatrix((60 * Math.PI) / 180, aspectRatio, 0.1, 100);
    const view = translationMatrix(0, 0, -3.2);
    const rotationX = rotationXMatrix(this.rotationX);
    const rotationY = rotationYMatrix(this.rotationY);
    const model = multiplyMatrices(rotationY, rotationX);
    const viewModel = multiplyMatrices(view, model);
    const modelViewProjection = multiplyMatrices(projection, viewModel);

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

function perspectiveMatrix(fieldOfView: number, aspectRatio: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fieldOfView / 2);
  const rangeInverse = 1 / (near - far);

  return new Float32Array([
    f / aspectRatio, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * rangeInverse, -1,
    0, 0, near * far * rangeInverse, 0,
  ]);
}

function translationMatrix(x: number, y: number, z: number): Mat4 {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

function rotationXMatrix(angle: number): Mat4 {
  const s = Math.sin(angle);
  const c = Math.cos(angle);

  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

function rotationYMatrix(angle: number): Mat4 {
  const s = Math.sin(angle);
  const c = Math.cos(angle);

  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

function multiplyMatrices(a: Mat4, b: Mat4): Mat4 {
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

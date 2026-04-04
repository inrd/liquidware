type GPUTextureFormat = string;
type GPUVertexFormat = string;
type GPUIndexFormat = "uint16" | "uint32";
type GPUCompareFunction = "never" | "less" | "equal" | "less-equal" | "greater" | "not-equal" | "greater-equal" | "always";

interface GPU {
  getPreferredCanvasFormat(): GPUTextureFormat;
  requestAdapter(): Promise<GPUAdapter | null>;
}

interface GPUAdapter {
  requestDevice(): Promise<GPUDevice>;
}

interface GPUDevice {
  readonly queue: GPUQueue;
  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer;
  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup;
  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout;
  createCommandEncoder(): GPUCommandEncoder;
  createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout;
  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule;
  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline;
  createTexture(descriptor: GPUTextureDescriptor): GPUTexture;
}

interface GPUQueue {
  submit(commandBuffers: GPUCommandBuffer[]): void;
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: ArrayBufferView<ArrayBufferLike> | ArrayBufferLike): void;
}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder;
  finish(): GPUCommandBuffer;
}

interface GPURenderPassDescriptor {
  colorAttachments: GPURenderPassColorAttachment[];
  depthStencilAttachment?: GPURenderPassDepthStencilAttachment;
}

interface GPURenderPassColorAttachment {
  view: GPUTextureView;
  clearValue: GPUColor;
  loadOp: "clear" | "load";
  storeOp: "store" | "discard";
}

interface GPUColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface GPURenderPassEncoder {
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
  drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number): void;
  setBindGroup(index: number, bindGroup: GPUBindGroup): void;
  setIndexBuffer(buffer: GPUBuffer, indexFormat: GPUIndexFormat): void;
  setPipeline(pipeline: GPURenderPipeline): void;
  setVertexBuffer(slot: number, buffer: GPUBuffer): void;
  end(): void;
}

interface GPURenderPassDepthStencilAttachment {
  view: GPUTextureView;
  depthClearValue?: number;
  depthLoadOp?: "clear" | "load";
  depthStoreOp?: "store" | "discard";
}

interface GPUCommandBuffer {}
interface GPUBuffer {}

interface GPUBufferDescriptor {
  size: number;
  usage: number;
}

interface GPUBindGroup {}

interface GPUBindGroupDescriptor {
  layout: GPUBindGroupLayout;
  entries: GPUBindGroupEntry[];
}

interface GPUBindGroupEntry {
  binding: number;
  resource: GPUBindingResource;
}

type GPUBindingResource = GPUBufferBinding;

interface GPUBufferBinding {
  buffer: GPUBuffer;
}

interface GPUShaderModule {}

interface GPUShaderModuleDescriptor {
  code: string;
}

interface GPURenderPipeline {
  getBindGroupLayout(index: number): GPUBindGroupLayout;
}

interface GPUBindGroupLayout {}

interface GPUBindGroupLayoutDescriptor {
  entries: GPUBindGroupLayoutEntry[];
}

interface GPUBindGroupLayoutEntry {
  binding: number;
  visibility: number;
  buffer?: GPUBufferBindingLayout;
}

interface GPUBufferBindingLayout {
  type?: "uniform" | "storage" | "read-only-storage";
}

interface GPURenderPipelineDescriptor {
  layout: GPUPipelineLayout | "auto";
  vertex: GPUVertexState;
  fragment?: GPUFragmentState;
  primitive?: GPUPrimitiveState;
  depthStencil?: GPUDepthStencilState;
}

interface GPUVertexState {
  module: GPUShaderModule;
  entryPoint: string;
  buffers?: GPUVertexBufferLayout[];
}

interface GPUVertexBufferLayout {
  arrayStride: number;
  attributes: GPUVertexAttribute[];
}

interface GPUVertexAttribute {
  shaderLocation: number;
  offset: number;
  format: GPUVertexFormat;
}

interface GPUFragmentState {
  module: GPUShaderModule;
  entryPoint: string;
  targets: GPUColorTargetState[];
}

interface GPUColorTargetState {
  format: GPUTextureFormat;
  blend?: GPUBlendState;
}

interface GPUPrimitiveState {
  topology?: GPUPrimitiveTopology;
  cullMode?: GPUCullMode;
}

interface GPUDepthStencilState {
  format: GPUTextureFormat;
  depthWriteEnabled?: boolean;
  depthCompare?: GPUCompareFunction;
}

type GPUPrimitiveTopology = "triangle-list" | "triangle-strip" | "line-list" | "line-strip" | "point-list";
type GPUBlendFactor =
  | "zero"
  | "one"
  | "src"
  | "one-minus-src"
  | "src-alpha"
  | "one-minus-src-alpha"
  | "dst"
  | "one-minus-dst"
  | "dst-alpha"
  | "one-minus-dst-alpha";
type GPUBlendOperation = "add" | "subtract" | "reverse-subtract" | "min" | "max";
type GPUCullMode = "none" | "front" | "back";
interface GPUPipelineLayoutDescriptor {
  bindGroupLayouts: GPUBindGroupLayout[];
}

type GPUPipelineLayout = object;

interface GPUBlendComponent {
  srcFactor?: GPUBlendFactor;
  dstFactor?: GPUBlendFactor;
  operation?: GPUBlendOperation;
}

interface GPUBlendState {
  color: GPUBlendComponent;
  alpha: GPUBlendComponent;
}

interface GPUCanvasContext {
  configure(configuration: GPUCanvasConfiguration): void;
  getCurrentTexture(): GPUTexture;
}

interface GPUCanvasConfiguration {
  device: GPUDevice;
  format: GPUTextureFormat;
  alphaMode?: "opaque" | "premultiplied";
}

interface GPUTexture {
  createView(): GPUTextureView;
}

interface GPUTextureView {}

interface GPUExtent3D {
  width: number;
  height: number;
  depthOrArrayLayers: number;
}

interface GPUTextureDescriptor {
  size: GPUExtent3D;
  format: GPUTextureFormat;
  usage: number;
}

interface HTMLCanvasElement {
  getContext(contextId: "webgpu"): GPUCanvasContext | null;
}

interface Navigator {
  gpu: GPU;
}

declare const GPUBufferUsage: {
  readonly COPY_DST: number;
  readonly INDEX: number;
  readonly UNIFORM: number;
  readonly VERTEX: number;
};

declare const GPUShaderStage: {
  readonly VERTEX: number;
  readonly FRAGMENT: number;
  readonly COMPUTE: number;
};

declare const GPUTextureUsage: {
  readonly RENDER_ATTACHMENT: number;
};

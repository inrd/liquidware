struct SceneUniforms {
  modelViewProjection: mat4x4f,
  modelMatrix: mat4x4f,
};

@group(0) @binding(0)
var<uniform> scene: SceneUniforms;

struct VertexInput {
  @location(0) position: vec3f,
  @location(1) color: vec3f,
  @location(2) normal: vec3f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) worldPosition: vec3f,
  @location(2) worldNormal: vec3f,
};

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let worldPosition = scene.modelMatrix * vec4f(input.position, 1.0);
  let worldNormal = normalize((scene.modelMatrix * vec4f(input.normal, 0.0)).xyz);
  output.position = scene.modelViewProjection * vec4f(input.position, 1.0);
  output.color = input.color;
  output.worldPosition = worldPosition.xyz;
  output.worldNormal = worldNormal;
  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let normal = normalize(input.worldNormal);
  let cameraPosition = vec3f(0.0, 0.0, 3.2);
  let viewDirection = normalize(cameraPosition - input.worldPosition);
  let keyLightDirection = normalize(vec3f(-0.7, 0.8, 0.55));
  let fillLightDirection = normalize(vec3f(0.9, 0.35, 0.2));
  let ambientLight = vec3f(0.26, 0.22, 0.31);
  let keyLightColor = vec3f(1.0, 0.78, 0.62);
  let fillLightColor = vec3f(0.48, 0.58, 0.92);

  let keyDiffuse = max(dot(normal, keyLightDirection), 0.0);
  let fillDiffuse = max(dot(normal, fillLightDirection), 0.0);
  let halfVector = normalize(viewDirection + keyLightDirection);
  let specular = pow(max(dot(normal, halfVector), 0.0), 20.0) * 0.5;

  let lighting =
    ambientLight +
    keyDiffuse * keyLightColor +
    fillDiffuse * 0.45 * fillLightColor +
    specular * vec3f(1.0, 0.92, 0.86);
  let shadedColor = input.color * lighting;

  return vec4f(shadedColor, 1.0);
}

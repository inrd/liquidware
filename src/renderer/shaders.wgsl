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

struct SkyVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

fn sky_color(mixValue: f32) -> vec3f {
  let horizonColor = vec3f(0.78, 0.63, 0.7);
  let zenithColor = vec3f(0.06, 0.09, 0.2);
  let t = clamp(pow(mixValue, 0.72), 0.0, 1.0);

  return mix(horizonColor, zenithColor, t);
}

@vertex
fn sky_vs_main(@builtin(vertex_index) vertexIndex: u32) -> SkyVertexOutput {
  var positions = array<vec2f, 3>(
    vec2f(-1.0, -3.0),
    vec2f(-1.0, 1.0),
    vec2f(3.0, 1.0),
  );

  var output: SkyVertexOutput;
  let clipPosition = positions[vertexIndex];
  output.position = vec4f(clipPosition, 0.0, 1.0);
  output.uv = clipPosition * vec2f(0.5, -0.5) + vec2f(0.5, 0.5);
  return output;
}

@fragment
fn sky_fs_main(input: SkyVertexOutput) -> @location(0) vec4f {
  return vec4f(sky_color(input.uv.y), 1.0);
}

@vertex
fn vs_main(input: VertexInput) -> VertexOutput {
  var output: VertexOutput;
  let worldPosition = scene.modelMatrix * vec4f(input.position, 1.0);
  let worldNormal = normalize((scene.modelMatrix * vec4f(input.normal, 0.0)).xyz);
  let clipPosition = scene.modelViewProjection * vec4f(input.position, 1.0);
  output.position = clipPosition;
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
  let viewDistance = distance(cameraPosition, input.worldPosition);
  let keyLightDirection = normalize(vec3f(-0.7, 0.8, 0.55));
  let fillLightDirection = normalize(vec3f(0.9, 0.35, 0.2));
  let ambientLight = vec3f(0.26, 0.22, 0.31);
  let keyLightColor = vec3f(1.0, 0.78, 0.62);
  let fillLightColor = vec3f(0.48, 0.58, 0.92);
  let fogNear = 3.8;
  let fogFar = 8.8;
  let fogStrength = 0.58;
  let isFloor = abs(input.worldPosition.y + 1.05) < 0.02 && normal.y > 0.95;
  let tileScale = 1.2;
  let tileCoordinates = floor((input.worldPosition.xz + vec2f(12.0, 12.0)) * tileScale);
  let tileIndex = i32(tileCoordinates.x + tileCoordinates.y);
  let tileMask = f32(tileIndex & 1);
  let floorBaseA = vec3f(0.87, 0.84, 0.8);
  let floorBaseB = vec3f(0.16, 0.13, 0.12);
  let floorTint = mix(floorBaseA, floorBaseB, tileMask);
  let baseColor = select(input.color, floorTint, isFloor);
  let atmosphereHeight = clamp((input.worldPosition.y + 1.2) / 3.8, 0.0, 1.0);
  let fogColor = sky_color(mix(0.12, 0.58, atmosphereHeight));

  let keyDiffuse = max(dot(normal, keyLightDirection), 0.0);
  let fillDiffuse = max(dot(normal, fillLightDirection), 0.0);
  let halfVector = normalize(viewDirection + keyLightDirection);
  let specular = pow(max(dot(normal, halfVector), 0.0), 20.0) * 0.5;

  let lighting =
    ambientLight +
    keyDiffuse * keyLightColor +
    fillDiffuse * 0.45 * fillLightColor +
    specular * vec3f(1.0, 0.92, 0.86);
  let shadedColor = baseColor * lighting;
  let distanceFog = smoothstep(fogNear, fogFar, viewDistance);
  let fogAmount = distanceFog * fogStrength;
  let finalColor = mix(shadedColor, fogColor, fogAmount);

  return vec4f(finalColor, 1.0);
}

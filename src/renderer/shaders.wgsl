struct SceneUniforms {
  viewProjection: mat4x4f,
  modelMatrix: mat4x4f,
  cameraPosition: vec4f,
  materialColor: vec4f,
  materialProps: vec4f,
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

struct ShadowVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) intensity: f32,
};

struct SkyVertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

const floorY = -1.05;
const shadowLift = 0.002;

fn get_key_light_direction() -> vec3f {
  return normalize(vec3f(-0.7, 0.8, 0.55));
}

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
  let clipPosition = scene.viewProjection * worldPosition;
  output.position = clipPosition;
  output.color = input.color;
  output.worldPosition = worldPosition.xyz;
  output.worldNormal = worldNormal;
  return output;
}

@vertex
fn shadow_vs_main(input: VertexInput) -> ShadowVertexOutput {
  var output: ShadowVertexOutput;
  let worldPosition = scene.modelMatrix * vec4f(input.position, 1.0);
  let keyLightDirection = get_key_light_direction();
  let lightTravel = max((worldPosition.y - floorY) / keyLightDirection.y, 0.0);
  let shadowPosition = worldPosition.xyz - keyLightDirection * lightTravel + vec3f(0.0, shadowLift, 0.0);
  let heightFactor = clamp((worldPosition.y - floorY) / 1.8, 0.0, 1.0);
  output.position = scene.viewProjection * vec4f(shadowPosition, 1.0);
  output.intensity = 1.0 - 0.28 * heightFactor;
  return output;
}

@fragment
fn shadow_fs_main(input: ShadowVertexOutput) -> @location(0) vec4f {
  let shadowColor = vec3f(0.06, 0.03, 0.07);
  return vec4f(shadowColor, 0.34 * input.intensity);
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4f {
  let normal = normalize(input.worldNormal);
  let cameraPosition = scene.cameraPosition.xyz;
  let viewDirection = normalize(cameraPosition - input.worldPosition);
  let viewDistance = distance(cameraPosition, input.worldPosition);
  let keyLightDirection = get_key_light_direction();
  let fillLightDirection = normalize(vec3f(0.9, 0.35, 0.2));
  let ambientLight = vec3f(0.26, 0.22, 0.31);
  let keyLightColor = vec3f(1.0, 0.78, 0.62);
  let fillLightColor = vec3f(0.48, 0.58, 0.92);
  let fogNear = 3.8;
  let fogFar = 8.8;
  let fogStrength = 0.58;
  let isFloor = abs(input.worldPosition.y - floorY) < 0.02 && normal.y > 0.95;
  let tileScale = 1.2;
  let tileCoordinates = floor((input.worldPosition.xz + vec2f(12.0, 12.0)) * tileScale);
  let tileIndex = i32(tileCoordinates.x + tileCoordinates.y);
  let tileMask = f32(tileIndex & 1);
  let floorBaseA = vec3f(0.87, 0.84, 0.8);
  let floorBaseB = vec3f(0.16, 0.13, 0.12);
  let floorTint = mix(floorBaseA, floorBaseB, tileMask);
  let materialColor = scene.materialColor.xyz;
  let baseColor = select(materialColor, floorTint, isFloor);
  let atmosphereHeight = clamp((input.worldPosition.y + 1.2) / 3.8, 0.0, 1.0);
  let fogColor = sky_color(mix(0.12, 0.58, atmosphereHeight));
  let surface = clamp(scene.materialProps.x, 0.02, 1.0);
  let gloss = clamp(scene.materialProps.y, 0.0, 1.0);
  let bleed = clamp(scene.materialProps.z, 0.0, 1.0);
  let keyDiffuse = max(dot(normal, keyLightDirection), 0.0);
  let fillDiffuse = max(dot(normal, fillLightDirection), 0.0);
  let rimLight = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.6);
  let backScatter = pow(max(dot(-normal, keyLightDirection), 0.0), 1.6);
  let retroSurface = smoothstep(0.0, 1.0, surface);
  let diffuseCrunch = mix(1.15, 0.74, retroSurface);
  let fillPresence = mix(0.52, 0.22, retroSurface);
  let ambientPresence = mix(1.02, 0.82, retroSurface);
  let grainBand = mix(0.12, 0.55, retroSurface);
  let surfaceBands = floor((keyDiffuse + grainBand) * 3.2) / 3.0;
  let retroDiffuse = mix(keyDiffuse, clamp(surfaceBands, 0.0, 1.0), 0.68 * retroSurface);
  let halfVector = normalize(viewDirection + keyLightDirection);
  let glossTightness = mix(10.0, 72.0, gloss);
  let surfaceSoftness = mix(1.55, 0.52, retroSurface);
  let highlightPower = glossTightness * surfaceSoftness;
  let highlightMask = pow(max(dot(normal, halfVector), 0.0), highlightPower);
  let glossColor = mix(vec3f(1.0, 0.95, 0.88), materialColor * 1.45, 0.42);
  let specular = highlightMask * (0.05 + gloss * 1.45) * mix(1.15, 0.58, retroSurface);
  let bleedColor = mix(materialColor * 0.92, vec3f(1.0, 0.72, 0.64), 0.28);
  let bleedGlow = (0.22 + rimLight * 0.78 + backScatter * 1.1) * bleed;

  let lighting =
    ambientLight * ambientPresence +
    retroDiffuse * diffuseCrunch * keyLightColor +
    fillDiffuse * fillPresence * fillLightColor +
    specular * glossColor;
  let shadedColor = baseColor * lighting + bleedGlow * bleedColor;
  let distanceFog = smoothstep(fogNear, fogFar, viewDistance);
  let fogAmount = distanceFog * fogStrength;
  let finalColor = mix(shadedColor, fogColor, fogAmount);

  return vec4f(finalColor, 1.0);
}

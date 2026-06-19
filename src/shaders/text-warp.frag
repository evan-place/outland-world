uniform sampler2D uTextureA;
uniform sampler2D uTextureB;
uniform float uProgress;
uniform float uTime;
uniform float uWarpStrength;
uniform float uChroma;
uniform float uAspect;

varying vec2 vUv;

float parabola(float t, float peak) {
  return 4.0 * t * (1.0 - t);
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
  vec2 uv = vUv;
  float warpAmt = parabola(uProgress, 2.0) * uWarpStrength;
  float n = noise(uv * 4.0 + vec2(uTime * 0.15, uProgress * 3.0));
  float wave = sin(uv.y * 12.0 + uTime * 0.8 + uProgress * 6.28) * 0.5 + 0.5;

  vec2 disp = vec2(
    (n - 0.5) * warpAmt + sin(uv.y * 8.0 + uTime) * warpAmt * 0.35,
    (wave - 0.5) * warpAmt * 0.6
  );

  vec2 uvA = uv + disp * (1.0 - uProgress);
  vec2 uvB = uv - disp * uProgress;

  float chroma = uChroma * parabola(uProgress, 2.0);
  vec4 colA = texture2D(uTextureA, uvA + vec2(chroma, 0.0));
  vec4 colB = texture2D(uTextureB, uvB - vec2(chroma, 0.0));

  vec4 color = mix(colA, colB, smoothstep(0.0, 1.0, uProgress));
  gl_FragColor = color;
}

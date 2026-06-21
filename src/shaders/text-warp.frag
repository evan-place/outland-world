uniform sampler2D uTextureA;
uniform sampler2D uTextureB;
uniform float uProgress;
uniform vec2 uResolution;
uniform float uFrameAspectA;
uniform float uFrameAspectB;

varying vec2 vUv;

vec2 containUV(vec2 uv, float frameAspect) {
  float viewAspect = uResolution.x / max(uResolution.y, 0.001);
  vec2 scale = vec2(1.0);
  if (frameAspect > viewAspect) {
    scale.y = viewAspect / frameAspect;
  } else {
    scale.x = frameAspect / viewAspect;
  }
  return clamp((uv - 0.5) / scale + 0.5, 0.002, 0.998);
}

void main() {
  float t = clamp(uProgress, 0.0, 1.0);

  if (t <= 0.001) {
    gl_FragColor = texture2D(uTextureA, containUV(vUv, uFrameAspectA));
    return;
  }

  if (t >= 0.999) {
    gl_FragColor = texture2D(uTextureB, containUV(vUv, uFrameAspectB));
    return;
  }

  float warp = sin(t * 3.14159265) * (0.5 + t * 0.55);
  vec2 uvA = containUV(vUv, uFrameAspectA);
  vec2 uvB = containUV(vUv, uFrameAspectB);

  float edge = max(abs(vUv.x - 0.5), abs(vUv.y - 0.5)) * 2.0;
  float innerLimit = mix(0.92, 0.28, smoothstep(0.0, 1.0, t));
  float edgeMask = smoothstep(max(innerLimit - 0.24, 0.0), 1.0, edge);
  edgeMask = edgeMask * edgeMask * (3.0 - 2.0 * edgeMask);
  float distort = warp * edgeMask * 3.0;

  vec2 cA = uvA - 0.5;
  float radialA = pow(dot(cA, cA) * 4.0, 1.9);
  vec2 sampleA = cA / (1.0 + distort * radialA) + 0.5;
  sampleA = containUV(sampleA, uFrameAspectA);

  vec2 cB = uvB - 0.5;
  float radialB = pow(dot(cB, cB) * 4.0, 1.9);
  vec2 sampleB = cB / (1.0 + distort * radialB) + 0.5;
  sampleB = containUV(sampleB, uFrameAspectB);

  vec4 fromCol = texture2D(uTextureA, sampleA);
  vec4 toCol = texture2D(uTextureB, sampleB);

  float mixAmt = smoothstep(0.08, 0.92, t);
  vec4 col = mix(fromCol, toCol, mixAmt);

  col.rgb *= 1.0 - edgeMask * warp * 0.18;
  col.rgb -= sin((vUv.y + t * 0.08) * uResolution.y * 1.8) * 0.01 * warp * edgeMask;

  gl_FragColor = col;
}

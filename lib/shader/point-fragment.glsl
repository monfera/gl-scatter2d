precision lowp float;

uniform vec4 color, borderColor;
uniform float centerFraction;

float smoothStep(float x, float y) {
  return 1.0 / (1.0 + exp(50.0*(x - y)));
}

void main() {
  float radius = length(2.0*gl_PointCoord.xy-1.0);
  if(radius > 1.0) {
    discard;
  }
  vec4 baseColor = mix(borderColor, color, smoothStep(radius, centerFraction));
  gl_FragColor = vec4(baseColor.rgb * baseColor.a, baseColor.a);
}

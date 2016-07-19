precision lowp float;

uniform vec4 color, borderColor;
uniform float centerFraction;

varying float simplify;

void main() {
  float radius;
  vec4 baseColor;
  if(simplify >= 5.0) {
    radius = length(2.0*gl_PointCoord.xy-1.0);
    if(radius > 1.0) {
      discard;
    }
    baseColor = mix(borderColor, color, step(radius, centerFraction));
    gl_FragColor = vec4(baseColor.rgb * baseColor.a, baseColor.a);
    } else {
      gl_FragColor = color;
    }
}

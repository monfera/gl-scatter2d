precision mediump float;

attribute vec2 position;

uniform mat3 matrix;
uniform float pointSize;

varying float simplify;

void main() {
  vec3 hgPosition = matrix * vec3(position, 1);
  gl_Position  = vec4(hgPosition.xy, 0, hgPosition.z);
  simplify = pointSize;
  float multiplier = 0.886; // for the same square surface as circle would be
  if(pointSize >= 5.0) {
    multiplier = 1.0;
  }
  gl_PointSize = pointSize * multiplier;
}

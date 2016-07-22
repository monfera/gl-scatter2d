precision mediump float;

attribute vec2 position;

uniform mat3 matrix;
uniform float pointSize;
uniform float pointCloud;

float rand(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec3 hgPosition = matrix * vec3(position, 1);
  gl_Position  = vec4(hgPosition.xy, 0, hgPosition.z);
  if(pointCloud != 0.0) { // pointCloud is truthy
    // 0.886: for the same square surface as circle would be
    // rand: if we don't jitter the point size, overall point cloud
    // saturation 'jumps', which is disturbing or confusing
    gl_PointSize = pointSize * 0.886 * ((10.0 + rand(position)) / 10.0);
  } else {
    gl_PointSize = pointSize;
  }
}

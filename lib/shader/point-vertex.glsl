precision highp float;

attribute vec2 positionHi, positionLo;

uniform vec2 scaleHi, scaleLo, translateHi, translateLo;

void main() {
  gl_Position = vec4(scaleHi * positionHi + translateHi
                   + scaleLo * positionHi
                    + translateLo
                   + scaleHi * positionLo
                   + scaleLo * positionLo
                   ,0.0, 1.0);
  gl_PointSize = 10.0;
}
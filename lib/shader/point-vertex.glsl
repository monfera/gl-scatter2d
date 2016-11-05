precision highp float;

attribute vec2 positionHi, positionLo;

uniform vec2 scaleHi, scaleLo, translateHi, translateLo;

void main() {
  gl_Position = vec4((positionHi + translateHi) * scaleHi
                   + (positionLo + translateLo) * scaleHi
                   + (positionHi + translateHi) * scaleLo
                   + (positionLo + translateLo) * scaleLo
                   ,0.0, 1.0);
  gl_PointSize = 10.0;
}
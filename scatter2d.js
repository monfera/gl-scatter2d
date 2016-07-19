'use strict'

var createShader = require('gl-shader')
var createBuffer = require('gl-buffer')

var pool = require('typedarray-pool')

var SHADERS = require('./lib/shader')

module.exports = createScatter2D

function Scatter2D(plot, offsetBuffer, pickBuffer, shader, pickShader) {
  this.plot           = plot
  this.offsetBuffer   = offsetBuffer
  this.pickBuffer     = pickBuffer
  this.shader         = shader
  this.pickShader     = pickShader
  this.scales         = []
  this.size           = 12.0
  this.borderSize     = 1.0
  this.pointCount     = 0
  this.color          = [1, 0, 0, 1]
  this.borderColor    = [0, 0, 0, 1]
  this.bounds         = [Infinity, Infinity, -Infinity, -Infinity]
  this.pickOffset     = 0
  this.points         = null
  this.xCoords        = null
}

var proto = Scatter2D.prototype

proto.dispose = function() {
  this.shader.dispose()
  this.pickShader.dispose()
  this.offsetBuffer.dispose()
  this.pickBuffer.dispose()
  if(this.xCoords) {
    pool.free(this.xCoords)
  }
  this.plot.removeObject(this)
}

proto.update = function(options) {

  var i, j

  options = options || {}

  function dflt(opt, value) {
    if(opt in options) {
      return options[opt]
    }
    return value
  }

  this.size         = dflt('size', 12.0)
  this.color        = dflt('color', [1, 0, 0, 1]).slice()
  this.borderSize   = dflt('borderSize', 1)
  this.borderColor  = dflt('borderColor', [0, 0, 0, 1]).slice()

  //Update point data
  if(this.xCoords) {
    pool.free(this.xCoords)
  }
  var data          = options.positions
  var packed        = pool.mallocFloat32(data.length)
  var packedId      = pool.mallocInt32(data.length >>> 1)
  packed.set(data)
  this.points       = data

  this.scales = [{count: data.length >>> 1, offset: 0, pixelSize: 1}]
  var min = 0
  var max = 10
  this.bounds = [min, min, max, max]
  for(i = 0; i < data.length >>> 1; i++) {
    packedId[i] = i
  }
  for(i = 0; i < data.length; i++) {
    packed[i] = (packed[i] - min) / (max - min)
  }

  this.offsetBuffer.update(packed)
  this.pickBuffer.update(packedId)
  var xCoords = pool.mallocFloat32(data.length >>> 1)
  for(i = 0, j = 0; i < data.length; i += 2, ++j) {
    xCoords[j] = packed[i]
  }
  pool.free(packedId)
  pool.free(packed)

  this.xCoords = xCoords

  this.pointCount = data.length >>> 1
  this.pickOffset = 0
}

proto.drawPick = (function() {
  var MATRIX = [1, 0, 0,
                0, 1, 0,
                0, 0, 1]
  var PICK_VEC4 = [0, 0, 0, 0]
return function(pickOffset) {
  var plot          = this.plot
  var shader        = this.pickShader
  var scales        = this.scales
  var offsetBuffer  = this.offsetBuffer
  var pickBuffer    = this.pickBuffer
  var bounds        = this.bounds
  var size          = this.size
  var borderSize    = this.borderSize
  var gl            = plot.gl
  var pixelRatio    = plot.pickPixelRatio
  var viewBox       = plot.viewBox
  var dataBox       = plot.dataBox

  if(this.pointCount === 0) {
    return pickOffset
  }

  var boundX  = bounds[2] - bounds[0]
  var boundY  = bounds[3] - bounds[1]
  var dataX   = dataBox[2] - dataBox[0]
  var dataY   = dataBox[3] - dataBox[1]
  var screenX = (viewBox[2] - viewBox[0]) * pixelRatio / plot.pixelRatio
  var screenY = (viewBox[3] - viewBox[1]) * pixelRatio / plot.pixelRatio

  var pixelSize = Math.min(dataX / screenX, dataY / screenY)

  MATRIX[0] = 2.0 * boundX / dataX
  MATRIX[4] = 2.0 * boundY / dataY
  MATRIX[6] = 2.0 * (bounds[0] - dataBox[0]) / dataX - 1.0
  MATRIX[7] = 2.0 * (bounds[1] - dataBox[1]) / dataY - 1.0

  this.pickOffset = pickOffset
  PICK_VEC4[0] = ( pickOffset        & 0xff)
  PICK_VEC4[1] = ((pickOffset >> 8)  & 0xff)
  PICK_VEC4[2] = ((pickOffset >> 16) & 0xff)
  PICK_VEC4[3] = ((pickOffset >> 24) & 0xff)

  shader.bind()
  shader.uniforms.matrix      = MATRIX
  shader.uniforms.color       = this.color
  shader.uniforms.borderColor = this.borderColor
  shader.uniforms.pointSize   = pixelRatio * (size + borderSize)
  shader.uniforms.pickOffset  = PICK_VEC4

  if(this.borderSize === 0) {
    shader.uniforms.centerFraction = 2.0;
  } else {
    shader.uniforms.centerFraction = size / (size + borderSize + 1.25)
  }

  offsetBuffer.bind()
  shader.attributes.position.pointer()
  pickBuffer.bind()
  shader.attributes.pickId.pointer(gl.UNSIGNED_BYTE)

  for(var scaleNum = scales.length-1; scaleNum >= 0; --scaleNum) {
    var lod = scales[scaleNum]
    if(lod.pixelSize < pixelSize && scaleNum > 1) {
      continue
    }

    gl.drawArrays(gl.POINTS, 0, lod.count)
  }

  return pickOffset + this.pointCount
}
})()

proto.draw = (function() {
  var MATRIX = [1, 0, 0,
                0, 1, 0,
                0, 0, 1]

  return function() {
    var plot          = this.plot
    var shader        = this.shader
    var scales        = this.scales
    var offsetBuffer  = this.offsetBuffer
    var bounds        = this.bounds
    var size          = this.size
    var borderSize    = this.borderSize
    var gl            = plot.gl
    var pixelRatio    = plot.pixelRatio
    var viewBox       = plot.viewBox
    var dataBox       = plot.dataBox

    if(this.pointCount === 0) {
      return
    }

    var boundX  = bounds[2] - bounds[0]
    var boundY  = bounds[3] - bounds[1]
    var dataX   = dataBox[2] - dataBox[0]
    var dataY   = dataBox[3] - dataBox[1]
    var screenX = viewBox[2] - viewBox[0]
    var screenY = viewBox[3] - viewBox[1]

    var pixelSize = Math.min(dataX / screenX, dataY / screenY)

    MATRIX[0] = 2.0 * boundX / dataX
    MATRIX[4] = 2.0 * boundY / dataY
    MATRIX[6] = 2.0 * (bounds[0] - dataBox[0]) / dataX - 1.0
    MATRIX[7] = 2.0 * (bounds[1] - dataBox[1]) / dataY - 1.0

    shader.bind()
    shader.uniforms.matrix      = MATRIX
    shader.uniforms.color       = this.color
    shader.uniforms.borderColor = this.borderColor
    shader.uniforms.pointSize   = pixelRatio * (size + borderSize) * /*Math.sqrt*/(1 / pixelSize / 100) /*/ 2*/

    if(this.borderSize === 0) {
      shader.uniforms.centerFraction = 2.0
    } else {
      shader.uniforms.centerFraction = size / (size + borderSize + 1.25)
    }

    offsetBuffer.bind()
    shader.attributes.position.pointer()

    var firstLevel = true

    for(var scaleNum = scales.length-1; scaleNum >= 0; --scaleNum) {
      var lod = scales[scaleNum]
      if(lod.pixelSize < pixelSize && scaleNum > 1) {
        continue
      }

      gl.drawArrays(gl.POINTS, 0, lod.count)

      if(firstLevel) {
        firstLevel = false
      }
    }
  }
})()

proto.pick = function(x, y, value) {
  var pickOffset = this.pickOffset
  var pointCount = this.pointCount
  if(value < pickOffset || value >= pickOffset + pointCount) {
    return null
  }
  var pointId = value - pickOffset
  var points = this.points
  return {
    object: this,
    pointId: pointId,
    dataCoord: [points[2 * pointId], points[2 * pointId + 1] ]
  }
}

function createScatter2D(plot, options) {
  var gl = plot.gl
  var buffer = createBuffer(gl)
  var pickBuffer = createBuffer(gl)
  var shader = createShader(gl, SHADERS.pointVertex, SHADERS.pointFragment)
  var pickShader = createShader(gl, SHADERS.pickVertex, SHADERS.pickFragment)

  var result = new Scatter2D(plot, buffer, pickBuffer, shader, pickShader)
  result.update(options)

  //Register with plot
  plot.addObject(result)

  return result
}

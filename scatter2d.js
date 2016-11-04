'use strict'

var createShader = require('gl-shader')
var createBuffer = require('gl-buffer')
var search = require('binary-search-bounds')
var snapPoints = require('snap-points-2d')
var pool = require('typedarray-pool')
var SHADERS = require('./lib/shader')

module.exports = createScatter2D

function Scatter2D(plot, positionBufferHi, positionBufferLo, pickBuffer, weightBuffer, shader, pickShader) {
  this.plot             = plot
  this.positionBufferHi = positionBufferHi
  this.positionBufferLo = positionBufferLo
  this.pickBuffer       = pickBuffer
  this.weightBuffer     = weightBuffer
  this.shader           = shader
  this.pickShader       = pickShader
  this.scales           = []
  this.size             = 12.0
  this.borderSize       = 1.0
  this.pointCount       = 0
  this.color            = [1, 0, 0, 1]
  this.borderColor      = [0, 0, 0, 1]
  this.bounds           = [Infinity, Infinity, -Infinity, -Infinity]
  this.pickOffset       = 0
  this.points           = null
  this.xCoords          = null
}

var proto = Scatter2D.prototype
var scaleHi = new Float32Array(2)
var scaleLo = new Float32Array(2)
var translateHi = new Float32Array(2)
var translateLo = new Float32Array(2)
var PICK_VEC4 = [0, 0, 0, 0]

proto.dispose = function() {
  this.shader.dispose()
  this.pickShader.dispose()
  this.positionBufferHi.dispose()
  this.positionBufferLo.dispose()
  this.pickBuffer.dispose()
  if(this.xCoords) pool.free(this.xCoords)
  this.plot.removeObject(this)
}

proto.update = function(options) {
  options = options || {}

  function dflt(opt, value) {
    return opt in options ? options[opt] : value
  }

  this.size         = dflt('size', 12)
  this.color        = dflt('color', [1, 0, 0, 1]).slice()
  this.borderSize   = dflt('borderSize', 1)
  this.borderColor  = dflt('borderColor', [0, 0, 0, 1]).slice()

  if(this.xCoords) pool.free(this.xCoords)

  this.points             = options.positions
  var pointCount          = this.points.length >>> 1
  var packedId            = pool.mallocInt32(pointCount)
  var packedW             = pool.mallocFloat32(2 * pointCount)
  var packed              = pool.mallocFloat64(2 * pointCount)
  packed.set(this.points)
  this.scales             = snapPoints(packed, packedId, packedW, this.bounds)

  var xCoords             = pool.mallocFloat64(pointCount)
  var packedHi            = pool.mallocFloat32(2 * pointCount)
  var packedLo            = pool.mallocFloat32(2 * pointCount)
  packedHi.set(packed)
  for(var i = 0, j = 0; i < pointCount; i++, j += 2) {
    packedLo[j] = packed[j] - packedHi[j]
    packedLo[j + 1] = packed[j + 1] - packedHi[j + 1]
    xCoords[i] = packed[j]
  }
  this.positionBufferHi.update(packedHi)
  this.position = packed.slice()
  this.positionBufferLo.update(packedLo)
  this.pickBuffer.update(packedId)
  this.weightBuffer.update(packedW)

  pool.free(packedId)
  pool.free(packed)
  pool.free(packedHi)
  pool.free(packedLo)
  pool.free(packedW)

  this.xCoords = xCoords
  this.pointCount = pointCount
  this.pickOffset = 0
}

proto.draw = function(pickOffset) {

  var pick = pickOffset !== void(0)

  var plot             = this.plot
  var shader           = pick ? this.pickShader : this.shader
  var scales           = this.scales
  var positionBufferHi = this.positionBufferHi
  var positionBufferLo = this.positionBufferLo
  var pickBuffer       = this.pickBuffer
  var fullDataDomains  = this.bounds
  var size             = this.size
  var borderSize       = this.borderSize
  var gl               = plot.gl
  var pixelRatio       = pick ? plot.pickPixelRatio : plot.pixelRatio
  var viewBox          = plot.viewBox
  var visibleDataDomains = plot.dataBox

  if(this.pointCount === 0)
    return pickOffset

  var fullDataDomainX  = fullDataDomains[2] - fullDataDomains[0]
  var fullDataDomainY  = fullDataDomains[3] - fullDataDomains[1]
  var visibleDataDomainX   = visibleDataDomains[2] - visibleDataDomains[0]
  var visibleDataDomainY   = visibleDataDomains[3] - visibleDataDomains[1]
  var screenX = (viewBox[2] - viewBox[0]) * pixelRatio / plot.pixelRatio
  var screenY = (viewBox[3] - viewBox[1]) * pixelRatio / plot.pixelRatio

  var pixelSize = Math.min(visibleDataDomainX / screenX, visibleDataDomainY / screenY)

  var scaleX = 2 * fullDataDomainX / visibleDataDomainX
  var scaleY = 2 * fullDataDomainY / visibleDataDomainY

  scaleHi[0] = scaleX
  scaleHi[1] = scaleY

  scaleLo[0] = scaleX - scaleHi[0]
  scaleLo[1] = scaleY - scaleHi[1]

  var translateX = 2 * (fullDataDomains[0] - visibleDataDomains[0]) / visibleDataDomainX - 1
  var translateY = 2 * (fullDataDomains[1] - visibleDataDomains[1]) / visibleDataDomainY - 1

  translateHi[0] = translateX
  translateHi[1] = translateY

  translateLo[0] = translateX - translateHi[0]
  translateLo[1] = translateY - translateHi[1]

  shader.bind()
  shader.uniforms.scaleHi     = scaleHi
  shader.uniforms.scaleLo     = scaleLo
  shader.uniforms.translateHi = translateHi
  shader.uniforms.translateLo = translateLo
  shader.uniforms.color       = this.color
  shader.uniforms.borderColor = this.borderColor
  shader.uniforms.pointSize   = pixelRatio * (size + borderSize)
  shader.uniforms.centerFraction = this.borderSize === 0 ? 2 : size / (size + borderSize + 1.25)

  positionBufferHi.bind()
  shader.attributes.positionHi.pointer()

  positionBufferLo.bind()
  shader.attributes.positionLo.pointer()

  if(pick) {

    this.pickOffset = pickOffset
    PICK_VEC4[0] = ( pickOffset        & 0xff)
    PICK_VEC4[1] = ((pickOffset >> 8)  & 0xff)
    PICK_VEC4[2] = ((pickOffset >> 16) & 0xff)
    PICK_VEC4[3] = ((pickOffset >> 24) & 0xff)
    shader.uniforms.pickOffset = PICK_VEC4

    pickBuffer.bind()
    shader.attributes.pickId.pointer(gl.UNSIGNED_BYTE)

  } else {

    shader.uniforms.useWeight = 1
    this.weightBuffer.bind()
    //shader.attributes.weight.pointer()


  }

  var xCoords = this.xCoords
  var xStart = (visibleDataDomains[0] - fullDataDomains[0] - pixelSize * size * pixelRatio) / fullDataDomainX
  var xEnd   = (visibleDataDomains[2] - fullDataDomains[0] + pixelSize * size * pixelRatio) / fullDataDomainX

  var firstLevel = true

  for(var scaleNum = scales.length - 1; scaleNum >= 0; scaleNum--) {
    var lod = scales[scaleNum]
    if(lod.pixelSize < pixelSize && scaleNum > 1)
      continue

    var intervalStart = lod.offset
    var intervalEnd   = lod.count + intervalStart

    var startOffset = search.ge(xCoords, xStart, intervalStart, intervalEnd - 1)
    var endOffset   = search.lt(xCoords, xEnd, startOffset, intervalEnd - 1) + 1

    if(!pick)
    if(true || endOffset > startOffset)
      gl.drawArrays(gl.POINTS, 0, 4)

    for(var i = 0; i < 4; i++) {
      if(i !== 2) continue
      var position = this.position[i * 2]
      console.log(i, position, scaleX, translateX, position * scaleX + translateX, (position * scaleX + translateX) / 2  * (viewBox[2] - viewBox[0]))
      //console.log(i, position, scaleHi[0], translateHi[0], position * scaleX + translateX)
    }

    if(!pick && firstLevel) {
      firstLevel = false
      shader.uniforms.useWeight = 0
    }
  }
}

proto.drawPick = proto.draw

proto.pick = function(x, y, value) {
  var pointId = value - this.pickOffset
  return pointId < 0 || pointId >= this.pointCount
    ? null : {
    object:  this,
    pointId: pointId,
    dataCoord: [ this.points[2 * pointId], this.points[2 * pointId + 1] ]
  }
}

function createScatter2D(plot, options) {
  var gl = plot.gl
  var positionBufferHi = createBuffer(gl)
  var positionBufferLo = createBuffer(gl)
  var pickBuffer = createBuffer(gl)
  var weightBuffer = createBuffer(gl)
  var shader = createShader(gl, SHADERS.pointVertex, SHADERS.pointFragment)
  var pickShader = createShader(gl, SHADERS.pickVertex, SHADERS.pickFragment)

  var result = new Scatter2D(plot, positionBufferHi, positionBufferLo, pickBuffer, weightBuffer, shader, pickShader)
  result.update(options)

  plot.addObject(result) // register with plot

  return result
}
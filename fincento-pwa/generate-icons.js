#!/usr/bin/env node
// Gera os ícones PNG necessários para o PWA
// Execute: node generate-icons.js

const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')

const SIZES = [192, 512]
const OUT_DIR = path.join(__dirname, 'public', 'icons')

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true })

SIZES.forEach(size => {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Background
  const r = size * 0.22
  ctx.beginPath()
  ctx.moveTo(r, 0)
  ctx.lineTo(size - r, 0)
  ctx.quadraticCurveTo(size, 0, size, r)
  ctx.lineTo(size, size - r)
  ctx.quadraticCurveTo(size, size, size - r, size)
  ctx.lineTo(r, size)
  ctx.quadraticCurveTo(0, size, 0, size - r)
  ctx.lineTo(0, r)
  ctx.quadraticCurveTo(0, 0, r, 0)
  ctx.closePath()
  ctx.fillStyle = '#0D0D1A'
  ctx.fill()

  // Texto "f"
  ctx.fillStyle = '#ffffff'
  ctx.font = `bold ${size * 0.62}px Georgia, serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('f', size * 0.1, size * 0.78)

  // Ponto laranja
  ctx.fillStyle = '#FF6B00'
  ctx.beginPath()
  ctx.arc(size * 0.76, size * 0.62, size * 0.13, 0, Math.PI * 2)
  ctx.fill()

  const buffer = canvas.toBuffer('image/png')
  fs.writeFileSync(path.join(OUT_DIR, `icon-${size}.png`), buffer)
  console.log(`✓ icon-${size}.png gerado`)
})

console.log('\nÍcones prontos em public/icons/')

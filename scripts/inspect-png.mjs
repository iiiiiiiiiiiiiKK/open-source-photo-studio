// 纯 Node 的极简 PNG 解码 + ASCII 预览，用于在没有图像查看器时粗略检查版面结构。
// 用法：node scripts/inspect-png.mjs <file.png> [宽=96]
import fs from 'node:fs'
import zlib from 'node:zlib'

function decodePng(buffer) {
  if (buffer.slice(1, 4).toString() !== 'PNG') throw new Error('不是 PNG')
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 8
  let colorType = 6
  const idat = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.slice(offset + 4, offset + 8).toString()
    const data = buffer.slice(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      if (data[12] !== 0) throw new Error('不支持隔行扫描 PNG')
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += 12 + length
  }
  if (bitDepth !== 8) throw new Error(`仅支持 8 位深，实际 ${bitDepth}`)
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0
  if (!channels) throw new Error(`不支持的色彩类型 ${colorType}`)

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const line = raw.slice(pos, pos + stride)
    pos += stride
    const out = pixels.slice(y * stride, (y + 1) * stride)
    const prev = y > 0 ? pixels.slice((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[x - channels] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= channels ? prev[x - channels] : 0
      let value = line[x]
      if (filter === 1) value += a
      else if (filter === 2) value += b
      else if (filter === 3) value += Math.floor((a + b) / 2)
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[x] = value & 0xff
    }
  }
  return { width, height, channels, pixels }
}

const file = process.argv[2]
const cols = Number(process.argv[3] || 96)
if (!file) {
  console.error('用法：node scripts/inspect-png.mjs <file.png> [宽]')
  process.exit(1)
}
const image = decodePng(fs.readFileSync(file))
const rows = Math.max(8, Math.round((cols * image.height) / image.width / 2.1))
const ramp = ' .:-=+*#%@'

console.log(`${file}  ${image.width}×${image.height}  →  ${cols}×${rows} ASCII`)
const lines = []
for (let r = 0; r < rows; r++) {
  let line = ''
  for (let c = 0; c < cols; c++) {
    const x0 = Math.floor((c * image.width) / cols)
    const x1 = Math.max(x0 + 1, Math.floor(((c + 1) * image.width) / cols))
    const y0 = Math.floor((r * image.height) / rows)
    const y1 = Math.max(y0 + 1, Math.floor(((r + 1) * image.height) / rows))
    let sum = 0
    let count = 0
    for (let y = y0; y < y1; y += Math.max(1, Math.floor((y1 - y0) / 4))) {
      for (let x = x0; x < x1; x += Math.max(1, Math.floor((x1 - x0) / 4))) {
        const i = (y * image.width + x) * image.channels
        const l = 0.2126 * image.pixels[i] + 0.7152 * image.pixels[i + 1] + 0.0722 * image.pixels[i + 2]
        sum += 1 - l / 255 // 越暗越"重"
        count++
      }
    }
    const ink = count ? sum / count : 0
    line += ramp[Math.min(ramp.length - 1, Math.round(ink * (ramp.length - 1)))]
  }
  lines.push(line)
}
console.log(lines.join('\n'))

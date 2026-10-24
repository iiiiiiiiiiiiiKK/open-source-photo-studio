// 截图质量检查：统计亮度分布与主色，判断是否抓到了"白屏/加载中"页面。
// 用法：node scripts/shot-quality.mjs <file.png>
import fs from 'node:fs'
import zlib from 'node:zlib'

function decodePng(buffer) {
  if (buffer.slice(1, 4).toString() !== 'PNG') throw new Error('不是 PNG')
  let offset = 8
  let width = 0
  let height = 0
  let colorType = 6
  const idat = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.slice(offset + 4, offset + 8).toString()
    const data = buffer.slice(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 2
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
const image = decodePng(fs.readFileSync(file))
let sum = 0
let count = 0
let light = 0
let dark = 0
const buckets = new Array(10).fill(0)
const colorCount = new Map()

for (let y = 0; y < image.height; y += 3) {
  for (let x = 0; x < image.width; x += 3) {
    const i = (y * image.width + x) * image.channels
    const r = image.pixels[i]
    const g = image.pixels[i + 1]
    const b = image.pixels[i + 2]
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
    sum += l
    count++
    if (l > 240) light++
    if (l < 40) dark++
    buckets[Math.min(9, Math.floor(l / 25.6))]++
    const key = `${r >> 4},${g >> 4},${b >> 4}`
    colorCount.set(key, (colorCount.get(key) || 0) + 1)
  }
}

const top = [...colorCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
console.log(`${file}  ${image.width}×${image.height}`)
console.log(`平均亮度 ${(sum / count).toFixed(1)} / 255`)
console.log(`近白像素 ${((light / count) * 100).toFixed(1)}%   近黑像素 ${((dark / count) * 100).toFixed(1)}%`)
console.log(`亮度直方图 ${buckets.map((n) => ((n / count) * 100).toFixed(0)).join('|')}`)
console.log(`主要颜色（量化）：${top.map(([k, n]) => `${k}(${((n / count) * 100).toFixed(1)}%)`).join('  ')}`)
const whiteRatio = light / count
if (whiteRatio > 0.9) {
  console.log('⚠ 警告：超过 90% 是白色，可能是白屏或未加载完成')
  process.exitCode = 2
} else if (colorCount.size < 6) {
  console.log('⚠ 警告：颜色种类极少，可能是空白页面')
  process.exitCode = 2
} else {
  console.log('✓ 截图内容看起来正常')
}

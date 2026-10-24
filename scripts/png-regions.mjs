// 版面色块分析：把 PNG 切成网格，统计每格"墨量"，用于判断版面是否有内容、是否有大片空白。
// 用法：node scripts/png-regions.mjs <file.png> [列=12] [行=8]
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
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0
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
const cols = Number(process.argv[3] || 12)
const rows = Number(process.argv[4] || 8)
const image = decodePng(fs.readFileSync(file))

// 用"出现次数最多的颜色"作为背景估计（避免采样到顶部的强调色横条）
const bg = (() => {
  const counts = new Map()
  for (let y = 0; y < image.height; y += 7) {
    for (let x = 0; x < image.width; x += 7) {
      const i = (y * image.width + x) * image.channels
      const key = `${image.pixels[i]},${image.pixels[i + 1]},${image.pixels[i + 2]}`
      counts.set(key, (counts.get(key) || 0) + 1)
    }
  }
  let bestKey = '255,255,255'
  let bestCount = -1
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count
      bestKey = key
    }
  }
  return bestKey.split(',').map(Number)
})()

console.log(`${file}  ${image.width}×${image.height}  背景≈rgb(${bg.join(',')})`)
const grid = []
for (let r = 0; r < rows; r++) {
  const row = []
  for (let c = 0; c < cols; c++) {
    const x0 = Math.floor((c * image.width) / cols)
    const x1 = Math.floor(((c + 1) * image.width) / cols)
    const y0 = Math.floor((r * image.height) / rows)
    const y1 = Math.floor(((r + 1) * image.height) / rows)
    let sum = 0
    let count = 0
    let colored = 0
    for (let y = y0; y < y1; y += 3) {
      for (let x = x0; x < x1; x += 3) {
        const i = (y * image.width + x) * image.channels
        const dr = Math.abs(image.pixels[i] - bg[0])
        const dg = Math.abs(image.pixels[i + 1] - bg[1])
        const db = Math.abs(image.pixels[i + 2] - bg[2])
        const diff = (dr + dg + db) / 3
        sum += Math.min(1, diff / 90)
        if (dr + dg + db > 60) colored++
        count++
      }
    }
    row.push({ ink: sum / Math.max(1, count), colored: colored / Math.max(1, count) })
  }
  grid.push(row)
}

for (let r = 0; r < rows; r++) {
  const cells = grid[r].map((cell) => {
    const value = Math.round(cell.ink * 9)
    return String(value).padStart(2)
  })
  console.log(`r${r}`.padEnd(3) + cells.join(' '))
}
const empty = []
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    if (grid[r][c].ink < 0.02) empty.push(`r${r}c${c}`)
  }
}
console.log(`\n空白格（墨量<2%）：${empty.length} / ${rows * cols}`)
console.log(empty.length ? empty.join(' ') : '无')

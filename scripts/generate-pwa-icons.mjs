import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')
const svgPath = join(publicDir, 'favicon.svg')
const svg = readFileSync(svgPath)

const sizes = [120, 152, 167, 180, 192, 512]
for (const size of sizes) {
  const buf = await sharp(svg).resize(size, size).png().toBuffer()
  writeFileSync(join(publicDir, `apple-touch-icon-${size}x${size}.png`), buf)
}
const defaultBuf = await sharp(svg).resize(180, 180).png().toBuffer()
writeFileSync(join(publicDir, 'apple-touch-icon.png'), defaultBuf)
console.log('Generated PWA icons for iOS')

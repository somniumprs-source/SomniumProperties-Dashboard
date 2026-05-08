#!/usr/bin/env node
/**
 * Sync da landing de investidores para a pasta servida pelo Express.
 *
 * Copia:
 *   somnium-investidores.html        →  public/investir/index.html
 *   assets/landing/projeto-1-img1.jpg →  public/investir/assets/landing/projeto-1-img1.jpg
 *   assets/landing/projeto-1-img2.jpg →  public/investir/assets/landing/projeto-1-img2.jpg
 *
 * Corre automaticamente como `prebuild` (sempre que `npm run build` é executado,
 * incluindo no Render). Pode também correr manualmente com `npm run sync-landing`.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const PAIRS = [
  { src: 'somnium-investidores.html',          dst: 'public/investir/index.html' },
  { src: 'assets/landing/projeto-1-img1.jpg',  dst: 'public/investir/assets/landing/projeto-1-img1.jpg' },
  { src: 'assets/landing/projeto-1-img2.jpg',  dst: 'public/investir/assets/landing/projeto-1-img2.jpg' },
]

async function copyIfChanged(srcRel, dstRel) {
  const src = path.join(root, srcRel)
  const dst = path.join(root, dstRel)

  try {
    await fs.access(src)
  } catch {
    console.warn(`[sync-landing] Origem não existe, ignorado: ${srcRel}`)
    return false
  }

  await fs.mkdir(path.dirname(dst), { recursive: true })

  const [srcStat, dstStat] = await Promise.all([
    fs.stat(src),
    fs.stat(dst).catch(() => null),
  ])
  if (dstStat && dstStat.size === srcStat.size && dstStat.mtimeMs >= srcStat.mtimeMs) {
    return false
  }

  await fs.copyFile(src, dst)
  console.log(`[sync-landing] ${srcRel} → ${dstRel}`)
  return true
}

let copied = 0
for (const { src, dst } of PAIRS) {
  if (await copyIfChanged(src, dst)) copied++
}
console.log(`[sync-landing] ${copied} ficheiro(s) actualizado(s).`)

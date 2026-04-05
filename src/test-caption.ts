#!/usr/bin/env node
/**
 * Test subtitle generation & burn secara isolated.
 * Tidak perlu download ulang — cukup pakai clip & VTT yang sudah ada.
 *
 * Usage:
 *   bun run test-caption <video.mp4> [subtitle.vtt] [--style hype] [--start 0] [--end 90]
 *
 * Output:
 *   <video>_captioned_<style>.mp4  di folder yang sama
 */

import path from 'path'
import fs from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import { CaptionTool } from './tools/CaptionTool/index.js'
import { STYLE_NAMES, type CaptionStyleName } from './utils/captionStyles.js'
import { overlayStickers, type StickerEvent } from './tools/StickerOverlayTool/index.js'
import { resolveStickerPath } from './utils/stickerMap.js'

// ── Parse args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)

function getFlag(flag: string, fallback = ''): string {
  const i = args.indexOf(flag)
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback
}

const videoPath  = args.find(a => a.endsWith('.mp4'))
const vttPath    = args.find(a => a.endsWith('.vtt'))
const styleName  = (getFlag('--style', 'hype')) as CaptionStyleName
const clipStart  = parseFloat(getFlag('--start', '0'))
const clipEnd    = parseFloat(getFlag('--end', ''))

if (!videoPath || !fs.existsSync(videoPath)) {
  console.error('❌  Pakai: bun run test-caption <video.mp4> [subtitle.vtt] [--style hype] [--start 0] [--end 90]')
  console.error(`   Style tersedia: ${STYLE_NAMES.join(' | ')}`)
  process.exit(1)
}

if (!STYLE_NAMES.includes(styleName)) {
  console.error(`❌  Style "${styleName}" tidak dikenal. Pilihan: ${STYLE_NAMES.join(' | ')}`)
  process.exit(1)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function vttTimeToSecs(t: string): number {
  const parts = t.replace(',', '.').split(':')
  if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
}

// ── Detect video duration via ffprobe ─────────────────────────────────────────

function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) reject(err)
      else resolve(meta.format.duration ?? 90)
    })
  })
}

// ── Burn ASS subtitle ─────────────────────────────────────────────────────────

function burnSubtitles(inputPath: string, assPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const escaped = assPath
      .replace(/\\/g, '/')
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')

    ffmpeg(inputPath)
      .videoFilter(`subtitles='${escaped}'`)
      .outputOptions([
        '-c:v libx264',
        '-c:a copy',
        '-preset fast',
        '-crf 23',
        '-movflags +faststart',
        '-pix_fmt yuv420p',
      ])
      .output(outputPath)
      .on('end', () => resolve())
      .on('error', reject)
      .run()
  })
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const duration = clipEnd || await getVideoDuration(videoPath!)
  const start    = clipStart
  const end      = clipEnd || duration

  console.log(`\n📹  Video  : ${path.basename(videoPath!)}`)
  console.log(`🎨  Style  : ${styleName}`)
  console.log(`⏱️   Window : ${start}s → ${end}s  (durasi ${Math.round(end - start)}s)`)
  if (vttPath) console.log(`📝  VTT    : ${path.basename(vttPath)}`)
  else         console.log(`📝  VTT    : tidak ada (akan coba Whisper)`)

  // 1. Generate ASS
  console.log('\n⏳  Generating subtitles...')
  const captioner  = new CaptionTool()
  const captResult = await captioner.call({
    clipPath:  videoPath!,
    clipStart: start,
    clipEnd:   end,
    vttPath,
    language:  'id',
    style:     styleName,
  })

  if (!captResult.success || !captResult.data) {
    console.error(`❌  Gagal generate subtitle: ${captResult.error}`)
    process.exit(1)
  }

  const { assPath, source } = captResult.data
  console.log(`✅  ASS dibuat via ${source}: ${path.basename(assPath)}`)

  // 2. Parse sticker events dari VTT (hanya untuk style vibe)
  let stickerEvents: StickerEvent[] = []
  if (styleName === 'vibe' && vttPath && fs.existsSync(vttPath)) {
    const vttContent = fs.readFileSync(vttPath, 'utf-8')
    const blocks = vttContent.split(/\n\n+/)
    const seen = new Set<string>()

    for (const block of blocks) {
      const timeLine = block.split('\n').find(l => l.includes('-->'))
      if (!timeLine) continue
      const tm = timeLine.match(/(\d{1,2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3})/)
      if (!tm || seen.has(tm[1])) continue
      seen.add(tm[1])

      const segStart = vttTimeToSecs(tm[1])
      const segEnd   = vttTimeToSecs(tm[2])
      if (segEnd <= start || segStart >= end) continue

      const text = block.split('\n')
        .filter(l => !l.includes('-->') && !l.match(/^\d+$/) && l.trim())
        .map(l => l.replace(/<[^>]*>/g, '').trim())
        .filter(Boolean).join(' ')
      if (!text) continue

      stickerEvents.push({
        start: Math.max(0, segStart - start),
        end:   Math.min(end - start, segEnd - start),
        text,
      })
    }

    // Throttle: keep max 1 sticker per 3 seconds to avoid visual clutter
    const MIN_GAP = 3.0
    const throttled: StickerEvent[] = []
    let lastEnd = -MIN_GAP
    for (const e of stickerEvents) {
      if (e.start >= lastEnd + MIN_GAP) {
        throttled.push(e)
        lastEnd = e.start
      }
    }
    stickerEvents = throttled

    console.log(`📌  Sticker events: ${stickerEvents.length} segmen (after throttle)`)
    const preview = stickerEvents.slice(0, 3).map(e =>
      `  ${e.start.toFixed(1)}s-${e.end.toFixed(1)}s → ${path.basename(resolveStickerPath(e.text) ?? 'none')}`
    )
    preview.forEach(p => console.log(p))
  }

  // 3. Burn subtitle + sticker overlay
  const ext        = path.extname(videoPath!)
  const base       = path.basename(videoPath!, ext)
  const dir        = path.dirname(videoPath!)
  const burnedPath = path.join(dir, `${base}_burned_tmp${ext}`)
  const outputPath = path.join(dir, `${base}_captioned_${styleName}${ext}`)

  console.log(`⏳  Burning subtitle ke video...`)
  try {
    await burnSubtitles(videoPath!, assPath, burnedPath)
  } catch (err) {
    console.error(`❌  Burn gagal: ${err}`)
    process.exit(1)
  }

  if (fs.existsSync(assPath)) fs.unlinkSync(assPath)

  // 4. Overlay stickers (vibe only)
  if (styleName === 'vibe' && stickerEvents.length > 0) {
    console.log(`⏳  Overlaying stickers...`)
    const ok = await overlayStickers({
      videoPath: burnedPath,
      events: stickerEvents,
      outputPath,
    })
    fs.unlinkSync(burnedPath)
    if (!ok) {
      console.warn(`⚠️   Sticker overlay gagal, pakai versi tanpa sticker`)
      fs.renameSync(burnedPath, outputPath)
    }
  } else {
    fs.renameSync(burnedPath, outputPath)
  }

  console.log(`\n✅  Selesai!`)
  console.log(`📁  Output : ${outputPath}`)
  console.log(`\n💡  Tips: coba style lain dengan --style word-focus / --style karaoke / --style neo / --style minimal\n`)
}

main().catch(err => {
  console.error('❌  Error:', err)
  process.exit(1)
})

import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { resolveStickerPath } from '../../utils/stickerMap.js'

export interface StickerEvent {
  start: number        // seconds, relative to clip
  end: number          // seconds
  text: string         // segment text — used to pick sticker
}

export interface StickerOverlayInput {
  videoPath: string
  events: StickerEvent[]
  outputPath: string
  size?: number        // sticker base px (default 180)
  posX?: string        // ffmpeg expr (default: centered)
  posY?: string        // ffmpeg expr (default: upper-center ~30% from top)
}

// ── Build ffmpeg filter_complex for sticker overlays ─────────────────────────
// Each event gets its own scale chain with a pop-in animation:
//   scale w = SIZE * (1 + 0.45*exp(-20*(t - START)))  clamped to [1, SIZE*1.5]
// This produces a quick "bounce pop" that settles to normal size.

export async function overlayStickers(input: StickerOverlayInput): Promise<boolean> {
  const {
    videoPath,
    events,
    outputPath,
    size = 180,
    posX = '(W-w)/2',
    posY = 'H*0.28',
  } = input

  if (events.length === 0) return false

  // ── Resolve sticker paths ────────────────────────────────────────────────────
  const resolvedEvents = events
    .map(e => ({ ...e, stickerPath: resolveStickerPath(e.text) }))
    .filter((e): e is typeof e & { stickerPath: string } => !!e.stickerPath)

  if (resolvedEvents.length === 0) return false

  // ── Collect unique sticker input files (preserve insertion order) ────────────
  const uniqueStickers: string[] = []
  const stickerInputIdx = new Map<string, number>()

  for (const e of resolvedEvents) {
    if (!stickerInputIdx.has(e.stickerPath)) {
      stickerInputIdx.set(e.stickerPath, uniqueStickers.length + 1) // 0 = video
      uniqueStickers.push(e.stickerPath)
    }
  }

  // ── Build filter_complex ──────────────────────────────────────────────────────
  // Per-event chain:
  //   [inputIdx:v] scale=w='expr':h=-1:eval=frame, format=rgba [sN]
  //   [prevLabel][sN] overlay=X:Y:enable='between(t,start,end)' [vN]

  const filterParts: string[] = []
  let prevLabel = '0:v'

  resolvedEvents.forEach((e, idx) => {
    const inputIdx = stickerInputIdx.get(e.stickerPath)!
    const scaleLabel  = `s${idx}`
    const overlayLabel = `v${idx}`

    // Pop-in: starts ~45% larger, decays exponentially to base size in ~0.2s
    const popExpr = `min(${Math.round(size * 1.45)},max(1,round(${size}*(1+0.45*exp(-20*(t-${e.start.toFixed(3)}))))))`

    filterParts.push(
      `[${inputIdx}:v]scale=w='${popExpr}':h=-1:eval=frame,format=rgba[${scaleLabel}]`
    )
    filterParts.push(
      `[${prevLabel}][${scaleLabel}]overlay=${posX}:${posY}:enable='between(t,${e.start.toFixed(3)},${e.end.toFixed(3)})'[${overlayLabel}]`
    )
    prevLabel = overlayLabel
  })

  const filterComplex = filterParts.join(';')
  const finalLabel = `v${resolvedEvents.length - 1}`

  return new Promise(resolve => {
    const cmd = ffmpeg(videoPath)

    for (const p of uniqueStickers) cmd.input(p)

    cmd
      .complexFilter(filterComplex)
      .outputOptions([
        `-map [${finalLabel}]`,
        '-map 0:a',
        '-c:v libx264',
        '-c:a copy',
        '-preset fast',
        '-crf 23',
        '-movflags +faststart',
        '-pix_fmt yuv420p',
      ])
      .output(outputPath)
      .on('end', () => resolve(true))
      .on('error', (err) => {
        console.error('Sticker overlay error:', err.message)
        resolve(false)
      })
      .run()
  })
}

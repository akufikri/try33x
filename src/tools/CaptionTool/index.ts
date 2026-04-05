import { Tool, type ToolResult } from '../../Tool.js'
import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs'
import path from 'path'
import { type StyleDef, type CaptionStyleName, getStyle, pickEmoji } from '../../utils/captionStyles.js'

export interface CaptionInput {
  clipPath: string
  clipStart: number
  clipEnd: number
  vttPath?: string
  language?: string
  style?: CaptionStyleName
}

export interface CaptionOutput {
  assPath: string
  source: 'vtt' | 'whisper'
}

// ── Time helpers ─────────────────────────────────────────────────────────────

function toAssTime(seconds: number): string {
  const h  = Math.floor(seconds / 3600)
  const m  = Math.floor((seconds % 3600) / 60)
  const s  = Math.floor(seconds % 60)
  const cs = Math.round((seconds % 1) * 100)
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

function vttTimeToSeconds(t: string): number {
  const parts = t.replace(',', '.').split(':')
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2])
  }
  return parseFloat(parts[0]) * 60 + parseFloat(parts[1])
}

// ── ASS header ───────────────────────────────────────────────────────────────

function buildAssHeader(style: StyleDef): string {
  return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontName},${style.fontSize},${style.primaryColor},${style.secondaryColor},${style.outlineColor},${style.backColor},${style.bold ? -1 : 0},0,0,0,100,100,0,0,${style.borderStyle},${style.outline},${style.shadow},${style.alignment},30,30,${style.marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`
}

// ── VTT parsing ───────────────────────────────────────────────────────────────

interface WordEntry { word: string; start: number; end: number }
interface SubEntry  { start: number; end: number; text: string; words?: WordEntry[] }

/**
 * Parse VTT including YouTube word-level timestamps.
 * YouTube auto-captions use: <00:00:01.040><c> word</c>
 */
function parseVttWithWords(content: string): SubEntry[] {
  const blocks = content.split(/\n\n+/)
  const seen   = new Set<string>()
  const result: SubEntry[] = []

  for (const block of blocks) {
    const lines    = block.trim().split('\n')
    const timeLine = lines.find(l => l.includes('-->'))
    if (!timeLine) continue

    const tm = timeLine.match(
      /(\d{1,2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[.,]\d{3})/
    )
    if (!tm) continue

    // Deduplicate cues that share the same start time (YouTube repeats them)
    if (seen.has(tm[1])) continue
    seen.add(tm[1])

    const segStart = vttTimeToSeconds(tm[1])
    const segEnd   = vttTimeToSeconds(tm[2])

    const textLines = lines.filter(
      l => !l.includes('-->') && !l.match(/^\d+$/) && l.trim()
    )

    // ── Try to extract word-level timestamps ──────────────────────────────
    // YouTube format: <00:00:01.040><c> word</c>
    const WORD_RE = /<(\d{1,2}:\d{2}:\d{2}[.,]\d{3})><c>([^<]+)<\/c>/g
    const words: WordEntry[] = []

    for (const tl of textLines) {
      WORD_RE.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = WORD_RE.exec(tl)) !== null) {
        const wText = m[2].trim()
        if (!wText) continue
        const wStart = vttTimeToSeconds(m[1])
        // Update end of previous word
        if (words.length > 0) words[words.length - 1].end = wStart
        words.push({ word: wText, start: wStart, end: segEnd })
      }
    }

    // ── Full text (strip all tags) ────────────────────────────────────────
    const fullText = textLines
      .map(l => l.replace(/<[^>]*>/g, '').trim())
      .filter(Boolean)
      .join(' ')

    if (!fullText.trim()) continue

    result.push({
      start: segStart,
      end:   segEnd,
      text:  fullText,
      words: words.length > 1 ? words : undefined,
    })
  }

  return result.sort((a, b) => a.start - b.start)
}

// ── Rebase & clip entries to the clip window ──────────────────────────────────

function sliceAndRebase(entries: SubEntry[], clipStart: number, clipEnd: number): SubEntry[] {
  return entries
    .filter(e => e.end > clipStart && e.start < clipEnd)
    .map(e => ({
      start: Math.max(0, e.start - clipStart),
      end:   Math.min(clipEnd - clipStart, e.end - clipStart),
      text:  e.text,
      words: e.words
        ?.map(w => ({
          word:  w.word,
          start: Math.max(0, w.start - clipStart),
          end:   Math.min(clipEnd - clipStart, w.end - clipStart),
        }))
        .filter(w => w.end > 0 && w.start < clipEnd - clipStart),
    }))
    .filter(e => e.end > e.start)
}

// ── ASS generators ────────────────────────────────────────────────────────────

/**
 * Build the emoji suffix tag to append at end of a dialogue line.
 * Uses a slightly larger font size and resets color to full opacity.
 */
function buildEmojiSuffix(kaomoji: string, size: number, activeTag: string): string {
  // Kaomoji (ASCII text emoticon) renders in any font — no special font needed.
  // Styled with the style's active colour so it visually matches the highlighted word.
  return ` {\\fs${size}${activeTag}}${kaomoji}`
}

/** Classic karaoke mode — one Dialogue line per segment with {\kf} tags */
function generateKaraokeAss(entries: SubEntry[], style: StyleDef): string {
  const header = buildAssHeader(style)
  const lineFade = style.entryAnim ? `{${style.entryAnim}}` : ''

  const dialogue = entries.map(e => {
    const words     = e.text.split(/\s+/).filter(Boolean)
    const perWord   = words.length > 0 ? (e.end - e.start) / words.length : 0
    const kText     = words
      .map(w => `{\\kf${Math.round(perWord * 100)}}${w}`)
      .join(' ')
    const emoji = style.emojiEnabled
      ? buildEmojiSuffix(pickEmoji(e.text), style.emojiFontSize || style.fontSize + 10, style.activeTag)
      : ''
    return `Dialogue: 0,${toAssTime(e.start)},${toAssTime(e.end)},Default,,0,0,0,,${lineFade}${kText}${emoji}`
  })

  return [header, ...dialogue].join('\n')
}

/**
 * Word-by-word mode:
 *
 * showContext=false (word-focus) → one Dialogue per word, only that word shown
 * showContext=true  (hype/neo)   → one Dialogue per word, full line shown
 *                                  with active/inactive colour overrides
 *
 * Falls back to karaoke if no word-level timestamps exist.
 */
function generateWordByWordAss(entries: SubEntry[], style: StyleDef): string {
  const header   = buildAssHeader(style)
  const dialogue: string[] = []

  for (const entry of entries) {
    const words = entry.words

    // Pre-compute emoji suffix for this entire segment (same emoji for all words in segment)
    const emojiSuffix = style.emojiEnabled
      ? buildEmojiSuffix(pickEmoji(entry.text), style.emojiFontSize || style.fontSize + 10)
      : ''

    if (!words || words.length === 0) {
      // No word timing available — emit single block with fade
      const fade = style.entryAnim ? `{${style.entryAnim}}` : '{\\fad(150,100)}'
      const text = style.uppercase ? entry.text.toUpperCase() : entry.text
      dialogue.push(
        `Dialogue: 0,${toAssTime(entry.start)},${toAssTime(entry.end)},Default,,0,0,0,,${fade}${text}${emojiSuffix}`
      )
      continue
    }

    if (!style.showContext) {
      // ── Word-focus: one word per Dialogue, pop + fade animation ──────────
      for (let i = 0; i < words.length; i++) {
        const w    = words[i]
        const wEnd = i < words.length - 1 ? words[i + 1].start : entry.end
        if (wEnd <= w.start) continue
        const text = style.uppercase ? w.word.toUpperCase() : w.word
        const anim = style.entryAnim ? `{${style.entryAnim}}` : '{\\fad(120,100)}'
        // Emoji only on last word to avoid repetition in single-word mode
        const suffix = style.emojiEnabled && i === words.length - 1 ? emojiSuffix : ''
        dialogue.push(
          `Dialogue: 0,${toAssTime(w.start)},${toAssTime(wEnd)},Default,,0,0,0,,${anim}${text}${suffix}`
        )
      }
    } else {
      // ── Context mode: full line, per-word colour overrides ────────────────
      for (let i = 0; i < words.length; i++) {
        const w    = words[i]
        const wEnd = i < words.length - 1 ? words[i + 1].start : entry.end
        if (wEnd <= w.start) continue

        let line = ''
        for (let j = 0; j < words.length; j++) {
          const wj   = words[j]
          const text = style.uppercase ? wj.word.toUpperCase() : wj.word

          if (j === i) {
            // Active word: active colour + larger font size
            line += `{\\fs${style.activeFontSize}${style.activeTag}}${text} `
          } else {
            // Inactive word: dim + smaller
            line += `{\\fs${style.inactiveFontSize}${style.inactiveTag}}${text} `
          }
        }

        // Entry animation on the dialogue line itself
        const anim = style.entryAnim ? `{${style.entryAnim}}` : ''
        dialogue.push(
          `Dialogue: 0,${toAssTime(w.start)},${toAssTime(wEnd)},Default,,0,0,0,,${anim}${line.trim()}${emojiSuffix}`
        )
      }
    }
  }

  return [header, ...dialogue].join('\n')
}

// ── Main conversion: VTT → ASS ────────────────────────────────────────────────

function vttToAss(
  vttPath: string,
  clipStart: number,
  clipEnd: number,
  style: StyleDef,
): string | null {
  if (!fs.existsSync(vttPath)) return null

  const content = fs.readFileSync(vttPath, 'utf-8')
  const all     = parseVttWithWords(content)
  const entries = sliceAndRebase(all, clipStart, clipEnd)
  if (entries.length === 0) return null

  // Use word-by-word if style requires it AND we have word timestamps
  const hasWordTimings = entries.some(e => (e.words?.length ?? 0) > 1)
  if (style.mode === 'word-by-word' && hasWordTimings) {
    return generateWordByWordAss(entries, style)
  }

  // Karaoke mode (or word-by-word fallback when no word timestamps)
  return generateKaraokeAss(entries, style)
}

// ── Whisper fallback ──────────────────────────────────────────────────────────

function extractAudio(clipPath: string, audioPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(clipPath)
      .noVideo()
      .audioFrequency(16000)
      .audioChannels(1)
      .audioBitrate('64k')
      .format('mp3')
      .output(audioPath)
      .on('end', resolve)
      .on('error', (err: Error) => reject(err))
      .run()
  })
}

async function whisperToAss(
  clipPath: string,
  language: string,
  style: StyleDef,
): Promise<string | null> {
  const audioPath = clipPath.replace(/\.\w+$/, '_audio.mp3')

  try {
    const { getAIClient } = await import('../../utils/aiClient.js')
    const { client }      = getAIClient()

    await extractAudio(clipPath, audioPath)
    const audioBuffer = fs.readFileSync(audioPath)
    const audioFile   = new File([audioBuffer], path.basename(audioPath), { type: 'audio/mp3' })

    const transcription = await (client.audio.transcriptions.create as Function)({
      file: audioFile,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
      language,
    })

    fs.unlinkSync(audioPath)

    const rawWords: Array<{ word: string; start: number; end: number }> =
      (transcription as { words?: Array<{ word: string; start: number; end: number }> }).words ?? []

    if (rawWords.length === 0) return null

    // Group Whisper words into 4-word segments
    const entries: SubEntry[] = []
    let buf: typeof rawWords  = []

    for (const w of rawWords) {
      buf.push(w)
      if (buf.length >= 4 || /[.!?,;:]$/.test(w.word)) {
        const segWords: WordEntry[] = buf.map(b => ({ word: b.word, start: b.start, end: b.end }))
        entries.push({
          start: buf[0].start,
          end:   buf[buf.length - 1].end,
          text:  buf.map(b => b.word).join(' '),
          words: segWords,
        })
        buf = []
      }
    }
    if (buf.length > 0) {
      entries.push({
        start: buf[0].start,
        end:   buf[buf.length - 1].end,
        text:  buf.map(b => b.word).join(' '),
        words: buf.map(b => ({ word: b.word, start: b.start, end: b.end })),
      })
    }

    // Whisper timestamps are already relative to clip start
    if (style.mode === 'word-by-word') {
      return generateWordByWordAss(entries, style)
    }
    return generateKaraokeAss(entries, style)

  } catch {
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
    return null
  }
}

// ── Tool ─────────────────────────────────────────────────────────────────────

export class CaptionTool extends Tool<CaptionInput, CaptionOutput> {
  name        = 'CaptionTool'
  description = 'Generates styled ASS subtitles from VTT (preferred) or Whisper (fallback)'

  async call(input: CaptionInput): Promise<ToolResult & { data?: CaptionOutput }> {
    const {
      clipPath, clipStart, clipEnd,
      vttPath,
      language = 'id',
      style:    styleName = 'karaoke',
    } = input

    const style   = getStyle(styleName)
    const assPath = clipPath.replace(/\.mp4$/, '.ass')

    // Strategy 1: VTT from yt-dlp
    if (vttPath) {
      const assContent = vttToAss(vttPath, clipStart, clipEnd, style)
      if (assContent) {
        fs.writeFileSync(assPath, assContent, 'utf-8')
        return { success: true, data: { assPath, source: 'vtt' } }
      }
    }

    // Strategy 2: Whisper transcription
    const assContent = await whisperToAss(clipPath, language, style)
    if (assContent) {
      fs.writeFileSync(assPath, assContent, 'utf-8')
      return { success: true, data: { assPath, source: 'whisper' } }
    }

    return { success: false, error: 'Could not generate subtitles (no VTT and Whisper unavailable)' }
  }
}

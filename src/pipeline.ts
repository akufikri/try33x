import ffmpeg from 'fluent-ffmpeg'
import { DownloadTool, type DownloadProgressCallback } from './tools/DownloadTool/index.js'
import { HighlightTool, type Highlight } from './tools/HighlightTool/index.js'
import { ClipTool } from './tools/ClipTool/index.js'
import { CaptionTool } from './tools/CaptionTool/index.js'
import { type CaptionStyleName, STYLE_NAMES } from './utils/captionStyles.js'
import { MetadataTool, type ClipMetadata } from './tools/MetadataTool/index.js'
import { ensureOutputDir } from './utils/paths.js'
import path from 'path'
import fs from 'fs'

export type PipelineStage =
  | 'downloading'
  | 'analyzing'
  | 'clipping'
  | 'captioning'
  | 'metadata'
  | 'done'
  | 'error'

export interface DownloadProgress {
  percent: number
  speed: string
  eta: string
}

export interface PipelineProgress {
  stage: PipelineStage
  message: string
  highlights?: Highlight[]
  currentClip?: number
  totalClips?: number
  outputDir?: string
  totalCost?: number
  clips?: Array<{ path: string; metadata: ClipMetadata; highlight: Highlight }>
  error?: string
  downloadProgress?: DownloadProgress
}

export { STYLE_NAMES, type CaptionStyleName }

export interface PipelineOptions {
  url: string
  maxClips?: number
  clipDuration?: number
  portrait?: boolean
  captions?: boolean
  captionLang?: string
  captionStyle?: CaptionStyleName
  outputBase?: string
  userIntent?: string
  onProgress?: (progress: PipelineProgress) => void
}

// Burn ASS subtitle file into a video — returns true on success
function burnSubtitles(inputPath: string, assPath: string, outputPath: string): Promise<boolean> {
  return new Promise(resolve => {
    // Escape path for ffmpeg subtitles filter (macOS/Linux)
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
      .on('end', () => resolve(true))
      .on('error', () => resolve(false))
      .run()
  })
}

export async function runPipeline(opts: PipelineOptions): Promise<PipelineProgress> {
  const {
    url,
    maxClips     = 3,
    clipDuration = 90,
    portrait     = true,
    captions      = true,
    captionLang   = 'id',
    captionStyle  = 'hype' as CaptionStyleName,
    outputBase    = './output',
    userIntent   = '',
    onProgress   = () => {},
  } = opts

  const outputDir = ensureOutputDir(outputBase)
  let totalCost = 0

  const download    = new DownloadTool()
  const highlighter = new HighlightTool()
  const clipper     = new ClipTool()
  const captioner   = new CaptionTool()
  const metadataGen = new MetadataTool()

  // ── Stage 1: Download ──────────────────────────────────────────────────────
  onProgress({ stage: 'downloading', message: 'Downloading video and subtitles...' })

  const onDownloadProgress: DownloadProgressCallback = (dp) => {
    onProgress({ stage: 'downloading', message: 'Downloading video and subtitles...', downloadProgress: dp })
  }

  const dlResult = await download.call({ url, outputDir, onProgress: onDownloadProgress })
  if (!dlResult.success || !dlResult.data) {
    return { stage: 'error', message: 'Download failed', error: dlResult.error }
  }

  const { videoPath, title, duration, transcriptPath, transcriptPaths } = dlResult.data

  // Pick VTT matching captionLang, fallback to preferred order id → en → any
  const captionVtt =
    transcriptPaths?.[captionLang] ??
    transcriptPaths?.['id'] ??
    transcriptPaths?.['en'] ??
    transcriptPath

  // ── Stage 2: Highlight analysis ────────────────────────────────────────────
  onProgress({
    stage: 'analyzing',
    message: userIntent ? 'Extracting intent + filtering context...' : `Analyzing "${title}"...`,
  })

  const hlResult = await highlighter.call({
    transcriptPath: transcriptPath ?? '',
    videoTitle: title,
    videoDuration: duration,
    maxClips,
    clipDuration,
    userIntent,
  })

  if (!hlResult.success || !hlResult.data) {
    return { stage: 'error', message: 'Highlight detection failed', error: hlResult.error }
  }

  const { highlights } = hlResult.data
  totalCost += hlResult.data.totalCost

  onProgress({
    stage: 'clipping',
    message: `Found ${highlights.length} highlights. Clipping...`,
    highlights,
    totalClips: highlights.length,
  })

  // ── Stages 3–5: Clip → Caption → Metadata (per clip) ─────────────────────
  const clips: Array<{ path: string; metadata: ClipMetadata; highlight: Highlight }> = []

  for (let i = 0; i < highlights.length; i++) {
    const highlight = highlights[i]

    // 3. Cut + portrait crop (no subtitles yet — they come after transcription)
    onProgress({
      stage: 'clipping',
      message: `Clipping ${i + 1}/${highlights.length}`,
      currentClip: i + 1,
      totalClips: highlights.length,
      highlights,
    })

    const clipResult = await clipper.call({ videoPath, highlight, outputDir, index: i, portrait })
    if (!clipResult.success || !clipResult.data) continue

    let finalClipPath = clipResult.data.clipPath

    // 4. Generate captions and burn into clip
    if (captions) {
      onProgress({
        stage: 'captioning',
        message: `Generating subtitles for clip ${i + 1}/${highlights.length}...`,
        currentClip: i + 1,
        totalClips: highlights.length,
        highlights,
      })

      const captionResult = await captioner.call({
        clipPath: clipResult.data.clipPath,
        clipStart: highlight.start,
        clipEnd: highlight.end,
        vttPath: captionVtt,
        language: captionLang,
        style: captionStyle,
      })

      if (captionResult.success && captionResult.data) {
        // Burn subtitles: output to a distinct temp file, then replace original
        const burnedPath = clipResult.data.clipPath.replace('.mp4', '_burned.mp4')

        const burnResult = await burnSubtitles(
          clipResult.data.clipPath,
          captionResult.data.assPath,
          burnedPath,
        )

        if (burnResult) {
          fs.unlinkSync(clipResult.data.clipPath)
          fs.renameSync(burnedPath, clipResult.data.clipPath)
          finalClipPath = clipResult.data.clipPath
        }

        // Clean up .ass file
        if (fs.existsSync(captionResult.data.assPath)) {
          fs.unlinkSync(captionResult.data.assPath)
        }
      }
    }

    // 5. Metadata
    onProgress({
      stage: 'metadata',
      message: `Generating metadata for clip ${i + 1}...`,
      currentClip: i + 1,
      totalClips: highlights.length,
    })

    const metaResult = await metadataGen.call({ videoTitle: title, highlight, index: i })
    const metadata = metaResult.data ?? {
      title: `Clip ${i + 1}`,
      description: highlight.reason,
      hashtags: ['#shorts'],
    }

    const metaPath = finalClipPath.replace(/\.mp4$/, '.json')
    fs.writeFileSync(metaPath, JSON.stringify({ highlight, metadata }, null, 2))

    clips.push({ path: finalClipPath, metadata, highlight })
  }

  return {
    stage: 'done',
    message: `Done! ${clips.length} clips saved to ${path.resolve(outputDir)}`,
    highlights,
    clips,
    outputDir: path.resolve(outputDir),
    totalCost,
  }
}

import { Tool, type ToolResult } from '../../Tool.js'
import ffmpeg from 'fluent-ffmpeg'
import path from 'path'
import type { Highlight } from '../HighlightTool/index.js'

export interface ClipInput {
  videoPath: string
  highlight: Highlight
  outputDir: string
  index: number
  portrait?: boolean   // convert to 9:16, default true
  assPath?: string     // optional: burn ASS subtitles into clip
}

export interface ClipOutput {
  clipPath: string
  duration: number
}

export class ClipTool extends Tool<ClipInput, ClipOutput> {
  name = 'ClipTool'
  description = 'Cuts a video segment, converts to 9:16 portrait, and optionally burns subtitles'

  async call(input: ClipInput): Promise<ToolResult & { data?: ClipOutput }> {
    const { videoPath, highlight, outputDir, index, portrait = true, assPath } = input
    const duration   = highlight.end - highlight.start
    const outputFile = path.join(outputDir, `clip_${String(index + 1).padStart(2, '0')}_score${highlight.score}.mp4`)

    return new Promise((resolve) => {
      let command = ffmpeg(videoPath)
        .seekInput(highlight.start)
        .duration(duration)

      if (portrait) {
        if (assPath) {
          // When burning subtitles, we need a single complex filtergraph
          // Scale + crop → subtitles overlay
          const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:')
          command = command.complexFilter([
            // Step 1: scale to height 1920
            '[0:v]scale=-2:1920[scaled]',
            // Step 2: center crop to 1080x1920
            '[scaled]crop=1080:1920:(iw-1080)/2:0[cropped]',
            // Step 3: burn ASS subtitles
            `[cropped]subtitles='${escapedAss}'[out]`,
          ], 'out')
        } else {
          command = command.videoFilter([
            'scale=-2:1920',
            'crop=1080:1920:(iw-1080)/2:0',
          ])
        }
      } else if (assPath) {
        const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:')
        command = command.videoFilter(`subtitles='${escapedAss}'`)
      }

      command
        .outputOptions([
          '-c:v libx264',
          '-c:a aac',
          '-preset fast',
          '-crf 23',
          '-movflags +faststart',
          '-pix_fmt yuv420p',
        ])
        .output(outputFile)
        .on('end', () => {
          resolve({ success: true, data: { clipPath: outputFile, duration } })
        })
        .on('error', (err: Error) => {
          resolve({ success: false, error: err.message })
        })
        .run()
    })
  }
}

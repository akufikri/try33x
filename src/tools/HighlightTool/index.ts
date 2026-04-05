import { Tool, type ToolResult } from '../../Tool.js'
import fs from 'fs'
import { chat } from '../../utils/aiClient.js'
import { optimizeContext } from '../../utils/tokenOptimizer.js'

export interface HighlightInput {
  transcriptPath: string
  videoTitle: string
  videoDuration: number
  maxClips?: number
  clipDuration?: number
  userIntent?: string
}

export interface Highlight {
  start: number
  end: number
  reason: string
  score: number
}

export interface HighlightOutput {
  highlights: Highlight[]
  totalCost: number
}

function parseVttWithTimestamps(vttContent: string): Array<{ time: number; text: string }> {
  const blocks = vttContent.split(/\n\n+/)
  const result: Array<{ time: number; text: string }> = []

  for (const block of blocks) {
    const lines = block.split('\n')
    const timeLine = lines.find(l => l.includes('-->'))
    if (!timeLine) continue

    const startMatch = timeLine.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})/)
    if (!startMatch) continue

    const seconds =
      parseInt(startMatch[1]) * 3600 +
      parseInt(startMatch[2]) * 60 +
      parseInt(startMatch[3])

    const text = lines
      .filter(l => !l.includes('-->') && l.trim() && !l.match(/^\d+$/))
      .map(l => l.replace(/<[^>]*>/g, '').trim())
      .join(' ')

    if (text) result.push({ time: seconds, text })
  }

  return result
}

export class HighlightTool extends Tool<HighlightInput, HighlightOutput> {
  name = 'HighlightTool'
  description = 'Uses AI to analyze transcript and detect the best highlight segments'

  async call(input: HighlightInput): Promise<ToolResult & { data?: HighlightOutput }> {
    const { transcriptPath, videoTitle, videoDuration, maxClips = 3, clipDuration = 90, userIntent = '' } = input

    try {
      let timestampedSegments: Array<{ time: number; text: string }> = []

      if (transcriptPath && fs.existsSync(transcriptPath)) {
        const vttContent = fs.readFileSync(transcriptPath, 'utf-8')
        timestampedSegments = parseVttWithTimestamps(vttContent)
      }

      if (timestampedSegments.length === 0) {
        return { success: false, error: 'No transcript available. Cannot detect highlights without transcript.' }
      }

      // Token optimization: extract intent + filter transcript with fast model
      const { intent, filteredSegments, compressionRatio, totalCost: optimizerCost } =
        await optimizeContext(userIntent, timestampedSegments)

      const formattedTranscript = filteredSegments
        .map(s => `[${s.time}s] ${s.text}`)
        .join('\n')

      const intentDescription = userIntent
        ? `User wants: ${intent.contentType}. Topics: ${intent.topics.join(', ')}.`
        : 'Find the most engaging moments.'

      const prompt = `You are a viral short-form content expert. Analyze this YouTube transcript and find the ${maxClips} best segments to clip.

Video: "${videoTitle}" (${videoDuration}s total)
${intentDescription}

FILTERED TRANSCRIPT (${Math.round(compressionRatio * 100)}% of video, most relevant sections):
${formattedTranscript}

Find exactly ${maxClips} segments:
- ${clipDuration}±15 seconds long
- Match the user's intent above
- Self-contained, strong hook in first 3 seconds

Respond with ONLY valid JSON:
{
  "highlights": [
    {
      "start": <start_second>,
      "end": <end_second>,
      "reason": "<why this matches the request>",
      "score": <1-10>
    }
  ]
}`

      const result = await chat(prompt, 'smart', 1024)

      let parsed: { highlights: Highlight[] }
      try {
        parsed = JSON.parse(result.text)
      } catch {
        const jsonMatch = result.text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('AI returned invalid JSON')
        parsed = JSON.parse(jsonMatch[0])
      }

      const highlights = parsed.highlights.map(h => ({
        ...h,
        start: Math.max(0, h.start),
        end: Math.min(videoDuration, h.end),
      }))

      return {
        success: true,
        data: { highlights, totalCost: optimizerCost + result.cost },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }
}

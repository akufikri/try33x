import { Tool, type ToolResult } from '../../Tool.js'
import { chat } from '../../utils/aiClient.js'
import type { Highlight } from '../HighlightTool/index.js'

export interface MetadataInput {
  videoTitle: string
  highlight: Highlight
  index: number
}

export interface ClipMetadata {
  title: string
  description: string
  hashtags: string[]
}

export class MetadataTool extends Tool<MetadataInput, ClipMetadata> {
  name = 'MetadataTool'
  description = 'Generates SEO-optimized title, description, and hashtags for a clip'

  async call(input: MetadataInput): Promise<ToolResult & { data?: ClipMetadata }> {
    const { videoTitle, highlight, index } = input

    try {
      const result = await chat(
        `Generate viral short-form metadata for this clip.

Source video: "${videoTitle}"
Clip #${index + 1}: ${highlight.reason}
Engagement score: ${highlight.score}/10

Respond ONLY with valid JSON:
{
  "title": "<catchy title under 60 chars, no emojis>",
  "description": "<2-3 sentence description for YouTube Shorts>",
  "hashtags": ["<tag1>", "<tag2>", "<tag3>", "<tag4>", "<tag5>"]
}`,
        'fast',
        512,
      )

      const jsonMatch = result.text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('Invalid JSON')

      const parsed: ClipMetadata = JSON.parse(jsonMatch[0])
      return { success: true, data: parsed }
    } catch {
      return {
        success: true,
        data: {
          title: `${videoTitle.slice(0, 40)} - Clip ${index + 1}`,
          description: highlight.reason,
          hashtags: ['#shorts', '#viral', '#youtube'],
        },
      }
    }
  }
}

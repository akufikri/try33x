import { chat } from './aiClient.js'

export interface ExtractedIntent {
  topics: string[]
  tones: string[]
  keywords: string[]
  contentType: string
}

export interface ScoredChunk {
  segments: Array<{ time: number; text: string }>
  startTime: number
  endTime: number
  score: number
  matchReason?: string
}

const CHUNK_SIZE = 40

function chunkSegments(
  segments: Array<{ time: number; text: string }>
): Array<{ segments: Array<{ time: number; text: string }>; startTime: number; endTime: number }> {
  const chunks = []
  for (let i = 0; i < segments.length; i += CHUNK_SIZE) {
    const slice = segments.slice(i, i + CHUNK_SIZE)
    if (slice.length === 0) continue
    chunks.push({
      segments: slice,
      startTime: slice[0].time,
      endTime: slice[slice.length - 1].time,
    })
  }
  return chunks
}

export async function extractIntent(
  userInput: string
): Promise<{ intent: ExtractedIntent; cost: number }> {
  if (!userInput || userInput.trim().length < 10) {
    return {
      intent: {
        topics: ['interesting moments', 'key points'],
        tones: ['engaging', 'surprising', 'insightful'],
        keywords: [],
        contentType: 'general highlights',
      },
      cost: 0,
    }
  }

  const result = await chat(
    `Extract the core intent from this video clip request. Be concise.

USER REQUEST:
"${userInput.slice(0, 2000)}"

Respond ONLY with valid JSON:
{
  "topics": ["<topic1>", "<topic2>"],
  "tones": ["<tone1>", "<tone2>"],
  "keywords": ["<keyword1>", "<keyword2>"],
  "contentType": "<one sentence describing what they want>"
}`,
    'fast',
    256,
  )

  const jsonMatch = result.text.match(/\{[\s\S]*\}/)
  let intent: ExtractedIntent
  try {
    intent = JSON.parse(jsonMatch?.[0] ?? '{}')
  } catch {
    intent = {
      topics: [],
      tones: ['engaging'],
      keywords: [],
      contentType: userInput.slice(0, 100),
    }
  }

  return { intent, cost: result.cost }
}

async function scoreChunk(
  chunk: { segments: Array<{ time: number; text: string }>; startTime: number; endTime: number },
  intent: ExtractedIntent
): Promise<ScoredChunk> {
  const text = chunk.segments.map(s => s.text).join(' ')
  const lowerText = text.toLowerCase()

  const hasKeyword = intent.keywords.some(k => lowerText.includes(k.toLowerCase()))
  const hasTopicWord = intent.topics.some(t =>
    t.split(' ').some(w => w.length > 3 && lowerText.includes(w.toLowerCase()))
  )

  if (intent.keywords.length > 0 && !hasKeyword && !hasTopicWord) {
    return { ...chunk, score: 0 }
  }

  const result = await chat(
    `Score this transcript segment (0-10) for relevance to: "${intent.contentType}"
Topics: ${intent.topics.join(', ')}
Tones: ${intent.tones.join(', ')}

SEGMENT [${chunk.startTime}s-${chunk.endTime}s]:
${text.slice(0, 800)}

Respond ONLY with JSON: {"score": <0-10>, "reason": "<10 words max>"}`,
    'fast',
    64,
  )

  const jsonMatch = result.text.match(/\{[\s\S]*\}/)
  try {
    const parsed = JSON.parse(jsonMatch?.[0] ?? '{}')
    return { ...chunk, score: parsed.score ?? 0, matchReason: parsed.reason }
  } catch {
    return { ...chunk, score: hasKeyword ? 5 : 0 }
  }
}

export interface OptimizeResult {
  intent: ExtractedIntent
  filteredSegments: Array<{ time: number; text: string }>
  scoredChunks: ScoredChunk[]
  totalCost: number
  compressionRatio: number
}

export async function optimizeContext(
  userIntent: string,
  segments: Array<{ time: number; text: string }>
): Promise<OptimizeResult> {
  if (segments.length === 0) {
    return {
      intent: { topics: [], tones: [], keywords: [], contentType: 'general highlights' },
      filteredSegments: [],
      scoredChunks: [],
      totalCost: 0,
      compressionRatio: 1,
    }
  }

  const { intent, cost: intentCost } = await extractIntent(userIntent)
  const chunks = chunkSegments(segments)
  const scoredChunks = await Promise.all(chunks.map(c => scoreChunk(c, intent)))

  const sorted = [...scoredChunks].sort((a, b) => b.score - a.score)
  const topChunks = new Set(sorted.slice(0, 3).map(c => c.startTime))
  const relevantChunks = scoredChunks.filter(c => c.score >= 4 || topChunks.has(c.startTime))
  const filteredSegments = relevantChunks.flatMap(c => c.segments)

  return {
    intent,
    filteredSegments,
    scoredChunks,
    totalCost: intentCost,
    compressionRatio: filteredSegments.length / segments.length,
  }
}

/**
 * Unified AI client — supports any OpenAI-compatible provider
 *
 * Config via environment variables:
 *   AI_BASE_URL   = https://ai.sumopod.com/v1  (default: Anthropic compat endpoint)
 *   AI_API_KEY    = sk-xxx                       (or ANTHROPIC_API_KEY as fallback)
 *   AI_SMART_MODEL = gpt-4o                      (default: claude-opus-4-6)
 *   AI_FAST_MODEL  = gpt-4o-mini                 (default: claude-haiku-4-5-20251001)
 */

import OpenAI from 'openai'
import { readConfig } from './config.js'

export interface AIConfig {
  baseURL: string
  apiKey: string
  smartModel: string  // used for complex analysis (HighlightTool)
  fastModel: string   // used for quick tasks (MetadataTool, tokenOptimizer)
  providerName: string
}

// Provider presets — user can also set custom via env
const PRESETS: Record<string, Partial<AIConfig>> = {
  anthropic: {
    baseURL: 'https://api.anthropic.com/v1',
    smartModel: 'claude-opus-4-6',
    fastModel: 'claude-haiku-4-5-20251001',
    providerName: 'Anthropic',
  },
  sumopod: {
    baseURL: 'https://ai.sumopod.com/v1',
    smartModel: 'gpt-4o',
    fastModel: 'gpt-4o-mini',
    providerName: 'SumoPod',
  },
  openai: {
    baseURL: 'https://api.openai.com/v1',
    smartModel: 'gpt-4o',
    fastModel: 'gpt-4o-mini',
    providerName: 'OpenAI',
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com/v1',
    smartModel: 'deepseek-chat',
    fastModel: 'deepseek-chat',
    providerName: 'DeepSeek',
  },
  groq: {
    baseURL: 'https://api.groq.com/openai/v1',
    smartModel: 'llama-3.3-70b-versatile',
    fastModel: 'llama-3.1-8b-instant',
    providerName: 'Groq',
  },
  gemini: {
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    smartModel: 'gemini-2.0-flash',
    fastModel: 'gemini-2.0-flash-lite',
    providerName: 'Gemini',
  },
  grok: {
    baseURL: 'https://api.x.ai/v1',
    smartModel: 'grok-3',
    fastModel: 'grok-3-mini',
    providerName: 'Grok (xAI)',
  },
  qwen: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    smartModel: 'qwen-max',
    fastModel: 'qwen-turbo',
    providerName: 'Qwen (Alibaba)',
  },
  byteplus: {
    baseURL: 'https://api.bytedance.com/v1',
    smartModel: 'seed-2-0',
    fastModel: 'seed-2-0-mini-free',
    providerName: 'BytePlus',
  },
}

export function getAIConfig(): AIConfig {
  // Priority: env vars → config file (~/.try33x/config.json) → error
  const saved = readConfig()
  const preset = process.env.AI_PROVIDER
    ? PRESETS[process.env.AI_PROVIDER.toLowerCase()]
    : undefined

  const baseURL =
    process.env.AI_BASE_URL ??
    preset?.baseURL ??
    saved?.baseURL ??
    PRESETS.anthropic.baseURL!

  const apiKey =
    process.env.AI_API_KEY ??
    process.env.ANTHROPIC_API_KEY ??
    saved?.apiKey ??
    (() => { throw new Error('No API key found. Run "try33x setup" to configure.') })()

  const smartModel =
    process.env.AI_SMART_MODEL ??
    preset?.smartModel ??
    saved?.smartModel ??
    PRESETS.anthropic.smartModel!

  const fastModel =
    process.env.AI_FAST_MODEL ??
    preset?.fastModel ??
    saved?.fastModel ??
    PRESETS.anthropic.fastModel!

  const providerName =
    preset?.providerName ??
    saved?.providerName ??
    'Custom'

  return { baseURL, apiKey, smartModel, fastModel, providerName }
}

// Singleton client
let _client: OpenAI | null = null
let _config: AIConfig | null = null

export function getAIClient(): { client: OpenAI; config: AIConfig } {
  if (!_client || !_config) {
    _config = getAIConfig()

    const clientOptions: ConstructorParameters<typeof OpenAI>[0] = {
      apiKey: _config.apiKey,
      baseURL: _config.baseURL,
    }

    // Anthropic's OpenAI-compatible endpoint requires this header
    if (_config.baseURL.includes('anthropic.com')) {
      clientOptions.defaultHeaders = { 'anthropic-version': '2023-06-01' }
    }

    _client = new OpenAI(clientOptions)
  }

  return { client: _client, config: _config }
}

// Convenience: chat completion with token tracking
export interface ChatResult {
  text: string
  inputTokens: number
  outputTokens: number
  cost: number
}

// Cost per token — rough estimates per 1M tokens
const COST_PER_TOKEN: Record<string, { in: number; out: number }> = {
  'claude-opus-4-6':          { in: 0.000015,  out: 0.000075  },
  'claude-haiku-4-5-20251001':{ in: 0.000001,  out: 0.000005  },
  'gpt-4o':                   { in: 0.0000025, out: 0.00001   },
  'gpt-4o-mini':              { in: 0.00000015,out: 0.0000006 },
  'deepseek-chat':            { in: 0.00000027,out: 0.0000011 },
  'gemini-2.0-flash':         { in: 0.0000001, out: 0.0000004 },
  'seed-2-0-mini-free':       { in: 0,         out: 0         },
}

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_TOKEN[model] ?? { in: 0.000001, out: 0.000002 }
  return inputTokens * rates.in + outputTokens * rates.out
}

export async function chat(
  prompt: string,
  model: 'smart' | 'fast',
  maxTokens = 1024,
): Promise<ChatResult> {
  const { client, config } = getAIClient()
  const modelId = model === 'smart' ? config.smartModel : config.fastModel

  const response = await client.chat.completions.create({
    model: modelId,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.choices[0]?.message?.content ?? ''
  const inputTokens  = response.usage?.prompt_tokens     ?? 0
  const outputTokens = response.usage?.completion_tokens ?? 0
  const cost = estimateCost(modelId, inputTokens, outputTokens)

  return { text, inputTokens, outputTokens, cost }
}

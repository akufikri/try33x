import React, { useState } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import {
  CLAUDE_ORANGE, SUBTLE_GRAY, INACTIVE_GRAY,
  SUCCESS_GREEN, ERROR_RED,
} from './Logo.js'
import { writeConfig, CONFIG_FILE_PATH } from '../utils/config.js'

// ── Provider presets ──────────────────────────────────────────────────────────

interface Preset {
  name: string
  label: string
  baseURL: string
  smartModel: string
  fastModel: string
  keyHint: string
}

const PRESETS: Preset[] = [
  {
    name: 'anthropic',
    label: 'Anthropic (Claude)',
    baseURL: 'https://api.anthropic.com/v1',
    smartModel: 'claude-opus-4-6',
    fastModel: 'claude-haiku-4-5-20251001',
    keyHint: 'sk-ant-...',
  },
  {
    name: 'sumopod',
    label: 'SumoPod (multi-model)',
    baseURL: 'https://ai.sumopod.com/v1',
    smartModel: 'gpt-4o',
    fastModel: 'seed-2-0-mini-free',
    keyHint: 'sk-...',
  },
  {
    name: 'openai',
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    smartModel: 'gpt-4o',
    fastModel: 'gpt-4o-mini',
    keyHint: 'sk-...',
  },
  {
    name: 'deepseek',
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    smartModel: 'deepseek-chat',
    fastModel: 'deepseek-chat',
    keyHint: 'sk-...',
  },
  {
    name: 'groq',
    label: 'Groq (free tier)',
    baseURL: 'https://api.groq.com/openai/v1',
    smartModel: 'llama-3.3-70b-versatile',
    fastModel: 'llama-3.1-8b-instant',
    keyHint: 'gsk_...',
  },
  {
    name: 'gemini',
    label: 'Gemini (Google)',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    smartModel: 'gemini-2.0-flash',
    fastModel: 'gemini-2.0-flash-lite',
    keyHint: 'AIzaSy...',
  },
  {
    name: 'grok',
    label: 'Grok (xAI)',
    baseURL: 'https://api.x.ai/v1',
    smartModel: 'grok-3',
    fastModel: 'grok-3-mini',
    keyHint: 'xai-...',
  },
  {
    name: 'qwen',
    label: 'Qwen (Alibaba)',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    smartModel: 'qwen-max',
    fastModel: 'qwen-turbo',
    keyHint: 'sk-...',
  },
  {
    name: 'byteplus',
    label: 'BytePlus / Seed',
    baseURL: 'https://api.bytedance.com/v1',
    smartModel: 'seed-2-0',
    fastModel: 'seed-2-0-mini-free',
    keyHint: '...',
  },
  {
    name: 'custom',
    label: 'Custom (any OpenAI-compatible)',
    baseURL: '',
    smartModel: '',
    fastModel: '',
    keyHint: 'sk-...',
  },
]

// ── Steps ─────────────────────────────────────────────────────────────────────

type Step = 'provider' | 'apikey' | 'baseurl' | 'models' | 'done'

interface SetupScreenProps {
  onDone: () => void
}

export function SetupScreen({ onDone }: SetupScreenProps) {
  const { exit } = useApp()

  const [step, setStep]                 = useState<Step>('provider')
  const [selectedIdx, setSelectedIdx]   = useState(0)
  const [apiKey, setApiKey]             = useState('')
  const [baseURL, setBaseURL]           = useState('')
  const [smartModel, setSmartModel]     = useState('')
  const [fastModel, setFastModel]       = useState('')
  const [activeModel, setActiveModel]   = useState<'smart' | 'fast'>('smart')
  const [saved, setSaved]               = useState(false)
  const [error, setError]               = useState('')

  const preset = PRESETS[selectedIdx]

  useInput((input, key) => {
    if (key.ctrl && input === 'c') { exit(); return }

    // ── Provider selection ──
    if (step === 'provider') {
      if (key.upArrow)   setSelectedIdx(i => (i - 1 + PRESETS.length) % PRESETS.length)
      if (key.downArrow) setSelectedIdx(i => (i + 1) % PRESETS.length)
      if (key.return) {
        const p = PRESETS[selectedIdx]
        setBaseURL(p.baseURL)
        setSmartModel(p.smartModel)
        setFastModel(p.fastModel)
        setStep('apikey')
      }
      return
    }

    // ── API Key input ──
    if (step === 'apikey') {
      if (key.escape) { setStep('provider'); return }
      if (key.return) {
        if (!apiKey.trim()) { setError('API key cannot be empty'); return }
        setError('')
        // Custom provider needs baseURL, presets skip to models
        setStep(preset.name === 'custom' ? 'baseurl' : 'models')
        return
      }
      if (key.backspace || key.delete) setApiKey(k => k.slice(0, -1))
      else if (!key.ctrl && !key.meta && input) setApiKey(k => k + input)
      return
    }

    // ── Base URL input (custom only) ──
    if (step === 'baseurl') {
      if (key.escape) { setStep('apikey'); return }
      if (key.return) {
        if (!baseURL.trim()) { setError('Base URL cannot be empty'); return }
        setError('')
        setStep('models')
        return
      }
      if (key.backspace || key.delete) setBaseURL(u => u.slice(0, -1))
      else if (!key.ctrl && !key.meta && input) setBaseURL(u => u + input)
      return
    }

    // ── Models input ──
    if (step === 'models') {
      if (key.escape) {
        setStep(preset.name === 'custom' ? 'baseurl' : 'apikey')
        return
      }
      if (key.tab) {
        setActiveModel(m => m === 'smart' ? 'fast' : 'smart')
        return
      }
      if (key.return) {
        // Save config
        try {
          writeConfig({
            providerName: preset.label,
            baseURL: baseURL.trim(),
            apiKey: apiKey.trim(),
            smartModel: (smartModel.trim() || preset.smartModel),
            fastModel: (fastModel.trim() || preset.fastModel),
          })
          setSaved(true)
          setStep('done')
          setTimeout(() => onDone(), 1200)
        } catch (e) {
          setError(String(e))
        }
        return
      }
      if (activeModel === 'smart') {
        if (key.backspace || key.delete) setSmartModel(m => m.slice(0, -1))
        else if (!key.ctrl && !key.meta && input) setSmartModel(m => m + input)
      } else {
        if (key.backspace || key.delete) setFastModel(m => m.slice(0, -1))
        else if (!key.ctrl && !key.meta && input) setFastModel(m => m + input)
      }
      return
    }
  })

  // ── Masked key display ──
  const maskedKey = apiKey.length > 6
    ? apiKey.slice(0, 4) + '••••' + apiKey.slice(-4)
    : '••••••••'

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>

      {/* Header */}
      <Box flexDirection="column">
        <Box flexDirection="row" gap={2}>
          <Text bold color={CLAUDE_ORANGE}>try33x</Text>
          <Text color={SUBTLE_GRAY}>—</Text>
          <Text color={SUBTLE_GRAY}>AI Setup</Text>
        </Box>
        <Text color={INACTIVE_GRAY} dimColor>
          Configure your AI provider. Saved to ~/.try33x/config.json
        </Text>
      </Box>

      {/* ── Step: Provider ── */}
      {step === 'provider' && (
        <Box flexDirection="column" gap={1}>
          <Text color={CLAUDE_ORANGE} bold>Step 1 of 3 — Choose Provider</Text>
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={CLAUDE_ORANGE}
            paddingX={1}
            gap={0}
          >
            {PRESETS.map((p, i) => {
              const isSelected = i === selectedIdx
              return (
                <Box key={p.name} flexDirection="row" gap={2}>
                  <Text color={isSelected ? CLAUDE_ORANGE : INACTIVE_GRAY} bold={isSelected}>
                    {isSelected ? '❯' : ' '}
                  </Text>
                  <Text color={isSelected ? 'white' : SUBTLE_GRAY} bold={isSelected}>
                    {p.label}
                  </Text>
                  {isSelected && (
                    <Text color={INACTIVE_GRAY} dimColor>{p.baseURL || 'custom base URL'}</Text>
                  )}
                </Box>
              )
            })}
          </Box>
          <Text color={INACTIVE_GRAY} dimColor>↑↓ select  Enter confirm</Text>
        </Box>
      )}

      {/* ── Step: API Key ── */}
      {step === 'apikey' && (
        <Box flexDirection="column" gap={1}>
          <Text color={CLAUDE_ORANGE} bold>Step 2 of 3 — API Key</Text>
          <Box flexDirection="column" gap={0}>
            <Text color={SUBTLE_GRAY}>Provider: <Text color="white" bold>{preset.label}</Text></Text>
            {preset.baseURL && <Text color={INACTIVE_GRAY} dimColor>URL: {preset.baseURL}</Text>}
          </Box>
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={CLAUDE_ORANGE}
            paddingX={1}
          >
            <Text color={INACTIVE_GRAY} dimColor>API Key  (hint: {preset.keyHint})</Text>
            <Box flexDirection="row">
              <Text color={CLAUDE_ORANGE} bold>❯ </Text>
              <Text color="white">{apiKey || ' '}</Text>
              <Text color={CLAUDE_ORANGE}>█</Text>
            </Box>
            {apiKey.length > 0 && (
              <Text color={INACTIVE_GRAY} dimColor>Preview: {maskedKey}</Text>
            )}
          </Box>
          {error && <Text color={ERROR_RED}>{error}</Text>}
          <Text color={INACTIVE_GRAY} dimColor>Enter confirm  Esc back</Text>
        </Box>
      )}

      {/* ── Step: Base URL (custom) ── */}
      {step === 'baseurl' && (
        <Box flexDirection="column" gap={1}>
          <Text color={CLAUDE_ORANGE} bold>Step 2b — Base URL</Text>
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={CLAUDE_ORANGE}
            paddingX={1}
          >
            <Text color={INACTIVE_GRAY} dimColor>Base URL  (e.g. https://ai.sumopod.com/v1)</Text>
            <Box flexDirection="row">
              <Text color={CLAUDE_ORANGE} bold>❯ </Text>
              <Text color="white">{baseURL || ' '}</Text>
              <Text color={CLAUDE_ORANGE}>█</Text>
            </Box>
          </Box>
          {error && <Text color={ERROR_RED}>{error}</Text>}
          <Text color={INACTIVE_GRAY} dimColor>Enter confirm  Esc back</Text>
        </Box>
      )}

      {/* ── Step: Models ── */}
      {step === 'models' && (
        <Box flexDirection="column" gap={1}>
          <Text color={CLAUDE_ORANGE} bold>Step 3 of 3 — Models</Text>
          <Text color={INACTIVE_GRAY} dimColor>
            Press Enter to keep defaults. Tab to switch fields.
          </Text>

          {/* Smart model */}
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={activeModel === 'smart' ? CLAUDE_ORANGE : INACTIVE_GRAY}
            paddingX={1}
          >
            <Text color={INACTIVE_GRAY} dimColor>
              Smart model  <Text color={SUBTLE_GRAY}>(complex analysis — default: {preset.smartModel})</Text>
            </Text>
            <Box flexDirection="row">
              <Text color={activeModel === 'smart' ? CLAUDE_ORANGE : INACTIVE_GRAY} bold>❯ </Text>
              <Text color={smartModel ? 'white' : INACTIVE_GRAY}>
                {smartModel || preset.smartModel}
              </Text>
              {activeModel === 'smart' && <Text color={CLAUDE_ORANGE}>█</Text>}
            </Box>
          </Box>

          {/* Fast model */}
          <Box
            flexDirection="column"
            borderStyle="single"
            borderColor={activeModel === 'fast' ? CLAUDE_ORANGE : INACTIVE_GRAY}
            paddingX={1}
          >
            <Text color={INACTIVE_GRAY} dimColor>
              Fast model  <Text color={SUBTLE_GRAY}>(quick tasks — default: {preset.fastModel})</Text>
            </Text>
            <Box flexDirection="row">
              <Text color={activeModel === 'fast' ? CLAUDE_ORANGE : INACTIVE_GRAY} bold>❯ </Text>
              <Text color={fastModel ? 'white' : INACTIVE_GRAY}>
                {fastModel || preset.fastModel}
              </Text>
              {activeModel === 'fast' && <Text color={CLAUDE_ORANGE}>█</Text>}
            </Box>
          </Box>

          {error && <Text color={ERROR_RED}>{error}</Text>}
          <Text color={INACTIVE_GRAY} dimColor>Tab switch  Enter save  Esc back</Text>
        </Box>
      )}

      {/* ── Done ── */}
      {step === 'done' && (
        <Box flexDirection="column" gap={0}>
          <Box flexDirection="row" gap={1}>
            <Text color={SUCCESS_GREEN} bold>✓</Text>
            <Text color="white" bold>Config saved!</Text>
          </Box>
          <Text color={INACTIVE_GRAY} dimColor>{CONFIG_FILE_PATH}</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color={SUBTLE_GRAY}>Provider:     <Text color="white">{preset.label}</Text></Text>
            <Text color={SUBTLE_GRAY}>Smart model:  <Text color="white">{smartModel || preset.smartModel}</Text></Text>
            <Text color={SUBTLE_GRAY}>Fast model:   <Text color="white">{fastModel || preset.fastModel}</Text></Text>
          </Box>
        </Box>
      )}

      {/* Persistent footer */}
      {step !== 'done' && (
        <Box
          borderStyle="single"
          borderColor={INACTIVE_GRAY}
          borderTop
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
          flexDirection="row"
          gap={3}
        >
          <Text color={INACTIVE_GRAY} dimColor><Text color={SUBTLE_GRAY}>Ctrl+C</Text> quit</Text>
          <Text color={INACTIVE_GRAY} dimColor><Text color={SUBTLE_GRAY}>Esc</Text> back</Text>
        </Box>
      )}

    </Box>
  )
}

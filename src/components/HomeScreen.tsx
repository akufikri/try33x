import React, { useState, useEffect } from 'react'
import { Box, Text, useInput, useApp } from 'ink'
import fs from 'fs'
import path from 'path'
import os from 'os'
import {
  CLAUDE_ORANGE, SUBTLE_GRAY, INACTIVE_GRAY,
  SUCCESS_GREEN, ERROR_RED, WARNING_AMBER,
} from './Logo.js'
import { STYLE_NAMES, CAPTION_STYLES, type CaptionStyleName } from '../utils/captionStyles.js'

// ── Clip record ───────────────────────────────────────────────────────────────

interface ClipRecord {
  fileName: string
  filePath: string
  title: string
  score: number
  duration: number
  hashtags: string[]
  createdAt: Date
  sizeMB: number
}

const OUTPUT_DIR = path.join(os.homedir(), 'output')

function loadClips(): ClipRecord[] {
  try {
    if (!fs.existsSync(OUTPUT_DIR)) return []

    return fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.endsWith('.mp4') && f.startsWith('clip_'))
      .map(f => {
        const filePath = path.join(OUTPUT_DIR, f)
        const jsonPath = filePath.replace('.mp4', '.json')
        const stat     = fs.statSync(filePath)

        let title    = f.replace('.mp4', '')
        let score    = 0
        let duration = 0
        let hashtags: string[] = []

        try {
          if (fs.existsSync(jsonPath)) {
            const meta = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
            title    = meta.metadata?.title    ?? title
            score    = meta.highlight?.score   ?? 0
            duration = meta.highlight ? Math.round(meta.highlight.end - meta.highlight.start) : 0
            hashtags = meta.metadata?.hashtags ?? []
          }
        } catch {}

        return {
          fileName: f,
          filePath,
          title,
          score,
          duration,
          hashtags,
          createdAt: stat.mtime,
          sizeMB: Math.round((stat.size / 1024 / 1024) * 10) / 10,
        }
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  } catch {
    return []
  }
}

function formatDate(d: Date): string {
  const now  = Date.now()
  const diff = now - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'just now'
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24)  return `${hrs}h ago`
  return d.toLocaleDateString()
}

function scoreColor(score: number): string {
  if (score >= 8) return SUCCESS_GREEN
  if (score >= 5) return WARNING_AMBER
  return INACTIVE_GRAY
}

// ── Option config ─────────────────────────────────────────────────────────────

interface Option {
  key: string
  label: string
  value: string | number | boolean
  type: 'number' | 'boolean' | 'enum'
  min?: number
  max?: number
  values?: string[]   // for enum type
}

// ── HomeScreen ────────────────────────────────────────────────────────────────

interface HomeScreenProps {
  onSubmit: (url: string, opts: { maxClips: number; clipDuration: number; portrait: boolean; captionStyle: CaptionStyleName; intent: string }) => void
}

type Focus = 'url' | 'intent' | 'opts' | 'clips'

export function HomeScreen({ onSubmit }: HomeScreenProps) {
  const { exit } = useApp()
  const [url, setUrl]         = useState('')
  const [intent, setIntent]   = useState('')
  const [focus, setFocus]     = useState<Focus>('url')
  const [selectedOpt, setSelectedOpt] = useState(0)
  const [selectedClip, setSelectedClip] = useState(0)
  const [clips, setClips]     = useState<ClipRecord[]>(() => loadClips())
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const [opts, setOpts] = useState({
    maxClips: 3, clipDuration: 90, portrait: true,
    captionStyle: 'hype' as CaptionStyleName,
  })

  const options: Option[] = [
    { key: 'n', label: 'Clips',    value: opts.maxClips,      type: 'number',  min: 1, max: 10 },
    { key: 'd', label: 'Duration', value: opts.clipDuration,  type: 'number',  min: 30, max: 300 },
    { key: 'p', label: 'Portrait', value: opts.portrait,      type: 'boolean' },
    { key: 's', label: 'Style',    value: opts.captionStyle,  type: 'enum', values: STYLE_NAMES },
  ]

  const FOCUS_ORDER: Focus[] = ['url', 'intent', 'opts', ...(clips.length > 0 ? ['clips' as Focus] : [])]

  useInput((input, key) => {
    if (key.ctrl && input === 'c') { exit(); return }

    // Tab cycles focus
    if (key.tab) {
      const idx = FOCUS_ORDER.indexOf(focus)
      setFocus(FOCUS_ORDER[(idx + 1) % FOCUS_ORDER.length])
      return
    }

    // ── URL ──
    if (focus === 'url') {
      if (key.return) {
        if (!url.trim()) return
        setFocus('intent')
        return
      }
      if (key.backspace || key.delete) setUrl(u => u.slice(0, -1))
      else if (!key.ctrl && !key.meta && input) setUrl(u => u + input)
      return
    }

    // ── Intent ──
    if (focus === 'intent') {
      if (key.return) {
        if (!url.trim()) { setFocus('url'); return }
        onSubmit(url.trim(), { ...opts, intent: intent.trim() })
        return
      }
      if (key.backspace || key.delete) setIntent(i => i.slice(0, -1))
      else if (!key.ctrl && !key.meta && input) setIntent(i => i + input)
      return
    }

    // ── Options ──
    if (focus === 'opts') {
      if (key.upArrow)   setSelectedOpt(i => (i - 1 + options.length) % options.length)
      if (key.downArrow) setSelectedOpt(i => (i + 1) % options.length)
      if (key.return)    { setFocus('url'); return }

      if (key.leftArrow || key.rightArrow) {
        const opt  = options[selectedOpt]
        const step = key.leftArrow ? -1 : 1
        if (opt.type === 'boolean') {
          setOpts(o => ({ ...o, portrait: !o.portrait }))
        } else if (opt.key === 'n') {
          setOpts(o => ({ ...o, maxClips: Math.min(opt.max!, Math.max(opt.min!, o.maxClips + step)) }))
        } else if (opt.key === 'd') {
          setOpts(o => ({ ...o, clipDuration: Math.min(opt.max!, Math.max(opt.min!, o.clipDuration + step * 15)) }))
        } else if (opt.type === 'enum' && opt.values) {
          const idx  = opt.values.indexOf(String(opt.value))
          const next = (idx + step + opt.values.length) % opt.values.length
          setOpts(o => ({ ...o, captionStyle: opt.values![next] as CaptionStyleName }))
        }
      }
      return
    }

    // ── Clips list ──
    if (focus === 'clips') {
      if (key.upArrow)   { setSelectedClip(i => Math.max(0, i - 1)); setDeleteConfirm(null); return }
      if (key.downArrow) { setSelectedClip(i => Math.min(clips.length - 1, i + 1)); setDeleteConfirm(null); return }

      // 'd' = request delete confirm
      if (input === 'd' && !deleteConfirm) {
        const clip = clips[selectedClip]
        if (clip) setDeleteConfirm(clip.filePath)
        return
      }

      // 'y' = confirm delete
      if (input === 'y' && deleteConfirm) {
        const jsonPath = deleteConfirm.replace('.mp4', '.json')
        const assPath  = deleteConfirm.replace('.mp4', '.ass')
        try {
          if (fs.existsSync(deleteConfirm)) fs.unlinkSync(deleteConfirm)
          if (fs.existsSync(jsonPath))      fs.unlinkSync(jsonPath)
          if (fs.existsSync(assPath))       fs.unlinkSync(assPath)
        } catch {}
        const updated = loadClips()
        setClips(updated)
        setSelectedClip(i => Math.min(i, Math.max(0, updated.length - 1)))
        setDeleteConfirm(null)
        return
      }

      // 'n' / Esc = cancel delete
      if ((input === 'n' || key.escape) && deleteConfirm) {
        setDeleteConfirm(null)
        return
      }

      // 'r' = refresh list
      if (input === 'r') {
        setClips(loadClips())
        return
      }

      return
    }
  })

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1} gap={1}>

      {/* ── Header ── */}
      <Box flexDirection="row" gap={2}>
        <Text bold color={CLAUDE_ORANGE}>try33x</Text>
        <Text color={SUBTLE_GRAY}>AI YouTube Short Clipper</Text>
      </Box>

      {/* ── URL input ── */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={focus === 'url' ? CLAUDE_ORANGE : INACTIVE_GRAY}
        paddingX={1}
      >
        <Text color={INACTIVE_GRAY} dimColor>YouTube URL</Text>
        <Box flexDirection="row">
          <Text color={focus === 'url' ? CLAUDE_ORANGE : INACTIVE_GRAY} bold>❯ </Text>
          <Text color={url ? 'white' : INACTIVE_GRAY}>
            {url || (focus !== 'url' ? 'https://youtube.com/watch?v=...' : '')}
          </Text>
          {focus === 'url' && <Text color={CLAUDE_ORANGE}>█</Text>}
        </Box>
      </Box>

      {/* ── Intent ── */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={focus === 'intent' ? CLAUDE_ORANGE : INACTIVE_GRAY}
        paddingX={1}
      >
        <Text color={INACTIVE_GRAY} dimColor>Intent <Text dimColor>(optional)</Text></Text>
        <Box flexDirection="row">
          <Text color={focus === 'intent' ? CLAUDE_ORANGE : INACTIVE_GRAY} bold>❯ </Text>
          <Text color={intent ? 'white' : INACTIVE_GRAY}>
            {intent || (focus !== 'intent' ? 'e.g. "funny moments where they laugh"' : '')}
          </Text>
          {focus === 'intent' && <Text color={CLAUDE_ORANGE}>█</Text>}
        </Box>
      </Box>

      {/* ── Options ── */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={focus === 'opts' ? CLAUDE_ORANGE : INACTIVE_GRAY}
        paddingX={1}
      >
        <Text color={INACTIVE_GRAY} dimColor>Options  <Text dimColor>↑↓ select  ←→ change</Text></Text>
        {options.map((opt, i) => {
          const isSel = focus === 'opts' && selectedOpt === i
          let valStr: string
          let valColor: string
          let hint: string

          if (opt.type === 'boolean') {
            valStr   = opt.value ? 'yes' : 'no'
            valColor = opt.value ? SUCCESS_GREEN : INACTIVE_GRAY
            hint     = '← → toggle'
          } else if (opt.type === 'enum') {
            const styleDef = CAPTION_STYLES[opt.value as CaptionStyleName]
            valStr   = styleDef ? styleDef.label : String(opt.value)
            valColor = CLAUDE_ORANGE
            hint     = '← → cycle'
          } else {
            valStr   = opt.key === 'd' ? `${opt.value}s` : String(opt.value)
            valColor = CLAUDE_ORANGE
            hint     = '← −  → +'
          }

          const styleDesc = isSel && opt.type === 'enum'
            ? CAPTION_STYLES[opt.value as CaptionStyleName]?.description
            : undefined

          return (
            <Box key={opt.key} flexDirection="column">
              <Box flexDirection="row" gap={2}>
                <Text color={isSel ? CLAUDE_ORANGE : INACTIVE_GRAY}>{isSel ? '❯' : ' '} {opt.label.padEnd(10)}</Text>
                <Text color={valColor} bold={isSel}>{valStr}</Text>
                {isSel && <Text color={INACTIVE_GRAY} dimColor>{hint}</Text>}
              </Box>
              {styleDesc && (
                <Box marginLeft={4}>
                  <Text color={INACTIVE_GRAY} dimColor>{styleDesc}</Text>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>

      {/* ── Recent Clips ── */}
      {clips.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={focus === 'clips' ? CLAUDE_ORANGE : INACTIVE_GRAY}
          paddingX={1}
          gap={0}
        >
          <Box flexDirection="row" justifyContent="space-between">
            <Text color={INACTIVE_GRAY} dimColor>
              Recent Clips ({clips.length})
              <Text dimColor>  ↑↓ select  d delete  r refresh</Text>
            </Text>
            <Text color={INACTIVE_GRAY} dimColor>{OUTPUT_DIR.replace(os.homedir(), '~')}</Text>
          </Box>

          {clips.map((clip, i) => {
            const isSel = focus === 'clips' && selectedClip === i
            const isDeleting = deleteConfirm === clip.filePath

            return (
              <Box key={clip.filePath} flexDirection="column">
                <Box flexDirection="row" gap={1}>
                  <Text color={isSel ? CLAUDE_ORANGE : INACTIVE_GRAY} bold={isSel}>
                    {isSel ? '❯' : ' '}
                  </Text>

                  {/* Score badge */}
                  <Text color={scoreColor(clip.score)} bold>★{clip.score}</Text>

                  {/* Title */}
                  <Text color={isSel ? 'white' : SUBTLE_GRAY} bold={isSel}>
                    {clip.title.slice(0, 45)}{clip.title.length > 45 ? '…' : ''}
                  </Text>

                  {/* Meta */}
                  <Text color={INACTIVE_GRAY} dimColor>
                    {clip.duration}s · {clip.sizeMB}MB · {formatDate(clip.createdAt)}
                  </Text>
                </Box>

                {/* Hashtags when selected */}
                {isSel && !isDeleting && clip.hashtags.length > 0 && (
                  <Box marginLeft={4}>
                    <Text color={INACTIVE_GRAY} dimColor>{clip.hashtags.join(' ')}</Text>
                  </Box>
                )}

                {/* Delete confirm */}
                {isSel && isDeleting && (
                  <Box marginLeft={4} flexDirection="row" gap={1}>
                    <Text color={ERROR_RED} bold>Delete "{clip.title.slice(0, 30)}"?</Text>
                    <Text color={SUCCESS_GREEN} bold>y</Text>
                    <Text color={INACTIVE_GRAY}> yes  </Text>
                    <Text color={INACTIVE_GRAY} bold>n</Text>
                    <Text color={INACTIVE_GRAY}> no</Text>
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      )}

      {/* ── Footer ── */}
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
        <Text color={INACTIVE_GRAY} dimColor><Text color={SUBTLE_GRAY}>Tab</Text> switch</Text>
        <Text color={INACTIVE_GRAY} dimColor><Text color={SUBTLE_GRAY}>Enter</Text> start</Text>
        {focus === 'clips' && (
          <>
            <Text color={INACTIVE_GRAY} dimColor><Text color={ERROR_RED}>d</Text> delete</Text>
            <Text color={INACTIVE_GRAY} dimColor><Text color={SUBTLE_GRAY}>r</Text> refresh</Text>
          </>
        )}
        <Text color={INACTIVE_GRAY} dimColor><Text color={SUBTLE_GRAY}>Ctrl+C</Text> quit</Text>
      </Box>

    </Box>
  )
}

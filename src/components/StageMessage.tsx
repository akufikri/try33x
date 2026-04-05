import React from 'react'
import { Box, Text } from 'ink'
import {
  CLAUDE_ORANGE, SUCCESS_GREEN, ERROR_RED,
  WARNING_AMBER, SUBTLE_GRAY, INACTIVE_GRAY,
} from './Logo.js'
import type { Highlight } from '../tools/HighlightTool/index.js'
import type { ClipMetadata } from '../tools/MetadataTool/index.js'

// ── Individual stage log entry ────────────────────────────────────────────────

export type StageStatus = 'running' | 'done' | 'error' | 'info'

export interface StageEntry {
  id: string
  status: StageStatus
  label: string
  detail?: string
}

interface StageMessageProps {
  entry: StageEntry
}

const STATUS_ICON: Record<StageStatus, string> = {
  running: '●',
  done:    '✓',
  error:   '✗',
  info:    '›',
}

const STATUS_COLOR: Record<StageStatus, string> = {
  running: CLAUDE_ORANGE,
  done:    SUCCESS_GREEN,
  error:   ERROR_RED,
  info:    SUBTLE_GRAY,
}

export function StageMessage({ entry }: StageMessageProps) {
  const icon  = STATUS_ICON[entry.status]
  const color = STATUS_COLOR[entry.status]

  return (
    <Box flexDirection="row" gap={1} paddingLeft={1}>
      <Text color={color} bold={entry.status === 'running'}>{icon}</Text>
      <Box flexDirection="column">
        <Text color={entry.status === 'done' ? 'white' : color}>{entry.label}</Text>
        {entry.detail && (
          <Text color={INACTIVE_GRAY} dimColor>{entry.detail}</Text>
        )}
      </Box>
    </Box>
  )
}

// ── Highlight cards ───────────────────────────────────────────────────────────

interface HighlightListProps {
  highlights: Highlight[]
}

function formatTime(s: number) {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const sec = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${sec}`
}

function scoreColor(score: number): string {
  if (score >= 8) return SUCCESS_GREEN
  if (score >= 5) return WARNING_AMBER
  return INACTIVE_GRAY
}

export function HighlightList({ highlights }: HighlightListProps) {
  return (
    <Box flexDirection="column" gap={0} marginLeft={3} marginTop={0}>
      {highlights.map((h, i) => (
        <Box key={i} flexDirection="row" gap={1}>
          <Text color={INACTIVE_GRAY}>#{i + 1}</Text>
          <Text color={SUBTLE_GRAY}>[{formatTime(h.start)}→{formatTime(h.end)}]</Text>
          <Text color={scoreColor(h.score)} bold>★{h.score}</Text>
          <Text color="white">{h.reason.slice(0, 55)}{h.reason.length > 55 ? '…' : ''}</Text>
        </Box>
      ))}
    </Box>
  )
}

// ── Clip progress bar ─────────────────────────────────────────────────────────

interface ClipProgressProps {
  current: number
  total: number
}

export function ClipProgress({ current, total }: ClipProgressProps) {
  const filled = Math.round((current / total) * 20)
  const empty  = 20 - filled

  return (
    <Box flexDirection="row" gap={1} marginLeft={3}>
      <Text color={CLAUDE_ORANGE}>{'█'.repeat(filled)}</Text>
      <Text color={INACTIVE_GRAY} dimColor>{'░'.repeat(empty)}</Text>
      <Text color={SUBTLE_GRAY}>{current}/{total}</Text>
    </Box>
  )
}

// ── Final results ─────────────────────────────────────────────────────────────

interface ResultsProps {
  clips: Array<{ path: string; metadata: ClipMetadata; highlight: Highlight }>
  outputDir: string
  totalCost: number
}

export function Results({ clips, outputDir, totalCost }: ResultsProps) {
  return (
    <Box flexDirection="column" gap={1} marginTop={1}>
      {/* Clips */}
      <Box flexDirection="column" gap={0} marginLeft={1}>
        {clips.map((c, i) => (
          <Box key={i} flexDirection="column" marginBottom={0}>
            <Box flexDirection="row" gap={1}>
              <Text color={SUCCESS_GREEN} bold>{i + 1}.</Text>
              <Text color="white" bold>{c.metadata.title}</Text>
              <Text color={INACTIVE_GRAY}>★{c.highlight.score}</Text>
            </Box>
            <Box marginLeft={3} flexDirection="column">
              <Text color={INACTIVE_GRAY} dimColor>{c.path.replace(process.env.HOME ?? '', '~')}</Text>
              <Text color={SUBTLE_GRAY}>{c.metadata.hashtags.join(' ')}</Text>
            </Box>
          </Box>
        ))}
      </Box>

      {/* Footer status bar — like Claude Code's status line */}
      <Box
        borderStyle="single"
        borderColor={INACTIVE_GRAY}
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        paddingTop={0}
        flexDirection="row"
        justifyContent="space-between"
      >
        <Text color={INACTIVE_GRAY} dimColor>
          {clips.length} clip{clips.length !== 1 ? 's' : ''} saved → {outputDir.replace(process.env.HOME ?? '', '~')}
        </Text>
        <Text color={INACTIVE_GRAY} dimColor>
          cost ${totalCost.toFixed(4)}
        </Text>
      </Box>
    </Box>
  )
}

import React, { useState, useEffect, useRef } from 'react'
import { Box, Text } from 'ink'
import { CLAUDE_ORANGE, INACTIVE_GRAY, SUBTLE_GRAY } from './Logo.js'
import type { DownloadProgress } from '../pipeline.js'

export type { DownloadProgress }

// Braille frames — same as Claude Code
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

// Shimmer: cycles through color intensities
const SHIMMER = [
  CLAUDE_ORANGE,
  'rgb(235,149,117)',
  'rgb(255,179,147)',
  'rgb(235,149,117)',
  CLAUDE_ORANGE,
  'rgb(195,99,57)',
]

function useElapsed(startRef: React.MutableRefObject<number>) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])
  return elapsed
}

function formatElapsed(s: number): string {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m${s % 60}s`
}

interface SpinnerProps {
  message: string
  subMessage?: string
  step?: number      // current step (1-based)
  totalSteps?: number
  progress?: DownloadProgress
}

export function Spinner({ message, subMessage, step, totalSteps, progress }: SpinnerProps) {
  const [frame, setFrame]     = useState(0)
  const [shimmer, setShimmer] = useState(0)
  const startRef              = useRef(Date.now())
  const elapsed               = useElapsed(startRef)

  useEffect(() => {
    const t = setInterval(() => {
      setFrame(f  => (f  + 1) % FRAMES.length)
      setShimmer(s => (s + 1) % SHIMMER.length)
    }, 80)
    return () => clearInterval(t)
  }, [])

  const color     = SHIMMER[shimmer]
  const barWidth  = 20
  const filled    = progress ? Math.round((progress.percent / 100) * barWidth) : 0
  const empty     = barWidth - filled

  return (
    <Box flexDirection="column" gap={0} paddingLeft={1}>

      {/* Main spinner row */}
      <Box flexDirection="row" gap={1}>
        <Text color={color} bold>{FRAMES[frame]}</Text>
        <Text color={color} bold>{message}</Text>

        {/* Step indicator */}
        {step && totalSteps && (
          <Text color={INACTIVE_GRAY} dimColor>
            ({step}/{totalSteps})
          </Text>
        )}

        {/* Elapsed */}
        <Text color={INACTIVE_GRAY} dimColor>[{formatElapsed(elapsed)}]</Text>
      </Box>

      {/* Download progress bar */}
      {progress && (
        <Box flexDirection="row" gap={1} marginLeft={2}>
          <Text color={color}>{'█'.repeat(filled)}</Text>
          <Text color={INACTIVE_GRAY} dimColor>{'░'.repeat(empty)}</Text>
          <Text color={color} bold>{progress.percent.toFixed(1)}%</Text>
          {progress.speed && (
            <Text color={INACTIVE_GRAY} dimColor>{progress.speed}</Text>
          )}
          {progress.eta && progress.eta !== '00:00' && (
            <Text color={INACTIVE_GRAY} dimColor>ETA {progress.eta}</Text>
          )}
        </Box>
      )}

      {/* Sub-message */}
      {subMessage && (
        <Box marginLeft={2}>
          <Text color={SUBTLE_GRAY} dimColor>{subMessage}</Text>
        </Box>
      )}

    </Box>
  )
}

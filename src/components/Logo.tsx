import React from 'react'
import { Box, Text } from 'ink'
import { getAIConfig } from '../utils/aiClient.js'

// Claude Code color palette
export const CLAUDE_ORANGE = 'rgb(215,119,87)'
export const CLAUDE_GRAY   = 'rgb(153,153,153)'
export const SUCCESS_GREEN = 'rgb(44,122,57)'
export const ERROR_RED     = 'rgb(171,43,63)'
export const WARNING_AMBER = 'rgb(150,108,30)'
export const SUBTLE_GRAY   = 'rgb(175,175,175)'
export const INACTIVE_GRAY = 'rgb(102,102,102)'

interface LogoProps {
  url?: string
}

export function Logo({ url }: LogoProps) {
  let config: { providerName: string; smartModel: string; fastModel: string } | null = null
  try {
    config = getAIConfig()
  } catch {}

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Top border */}
      <Box borderStyle="single" borderColor={CLAUDE_ORANGE} paddingX={2} paddingY={0} flexDirection="column" gap={0}>
        {/* Title row */}
        <Box flexDirection="row" gap={2} justifyContent="space-between">
          <Box flexDirection="row" gap={1}>
            <Text bold color={CLAUDE_ORANGE}>try33x</Text>
            <Text color={SUBTLE_GRAY}>—</Text>
            <Text color={SUBTLE_GRAY}>AI YouTube Short Clipper</Text>
          </Box>
          <Box flexDirection="row" gap={1}>
            {config && (
              <>
                <Text color={INACTIVE_GRAY}>{config.providerName}</Text>
                <Text color={INACTIVE_GRAY}>·</Text>
                <Text color={INACTIVE_GRAY}>{config.smartModel}</Text>
              </>
            )}
            <Text color={INACTIVE_GRAY}>v1.0.0</Text>
          </Box>
        </Box>

        {/* URL row */}
        {url && (
          <Box>
            <Text color={INACTIVE_GRAY}>❯ </Text>
            <Text color="white">{url}</Text>
          </Box>
        )}
      </Box>
    </Box>
  )
}

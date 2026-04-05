#!/usr/bin/env node
import React, { useState, useEffect, useRef } from 'react'
import { render, Box, Text, useApp } from 'ink'
import { Command } from 'commander'
import { runPipeline, type PipelineProgress, type PipelineStage, type CaptionStyleName } from './pipeline.js'
import { Logo, CLAUDE_ORANGE, ERROR_RED, INACTIVE_GRAY } from './components/Logo.js'
import { Spinner } from './components/Spinner.js'
import { StageMessage, HighlightList, ClipProgress, Results, type StageEntry } from './components/StageMessage.js'
import { HomeScreen } from './components/HomeScreen.js'
import { SetupScreen } from './components/SetupScreen.js'
import { configExists } from './utils/config.js'

// ─── Stage → log entries mapper ───────────────────────────────────────────────

function progressToEntries(progress: PipelineProgress, prev: StageEntry[]): StageEntry[] {
  const entries = [...prev]

  const upsert = (id: string, entry: Omit<StageEntry, 'id'>) => {
    const idx = entries.findIndex(e => e.id === id)
    if (idx >= 0) {
      entries[idx] = { id, ...entry }
    } else {
      entries.push({ id, ...entry })
    }
  }

  switch (progress.stage) {
    case 'downloading':
      upsert('download', { status: 'running', label: 'Downloading video & subtitles' })
      break

    case 'analyzing':
      upsert('download', { status: 'done', label: 'Download complete' })
      upsert('analyze', { status: 'running', label: progress.message })
      break

    case 'clipping': {
      upsert('download', { status: 'done', label: 'Download complete' })
      upsert('analyze', { status: 'done', label: `Detected ${progress.highlights?.length ?? 0} highlights` })
      const clipLabel = progress.currentClip
        ? `Clipping ${progress.currentClip}/${progress.totalClips}`
        : 'Starting clips…'
      upsert('clip', { status: 'running', label: clipLabel })
      break
    }

    case 'captioning':
      upsert('clip',    { status: 'done', label: `Clipping ${progress.currentClip}/${progress.totalClips}` })
      upsert('caption', { status: 'running', label: `Transcribing clip ${progress.currentClip}/${progress.totalClips} with Whisper` })
      break

    case 'metadata':
      upsert('caption', { status: 'done', label: 'Subtitles burned' })
      upsert('meta',    { status: 'running', label: `Generating metadata ${progress.currentClip}/${progress.totalClips}` })
      break

    case 'done':
      upsert('download', { status: 'done', label: 'Download complete' })
      upsert('analyze',  { status: 'done', label: `Detected ${progress.highlights?.length ?? 0} highlights` })
      upsert('clip',     { status: 'done', label: `${progress.clips?.length ?? 0} clips exported` })
      upsert('caption',  { status: 'done', label: 'Karaoke subtitles burned' })
      upsert('meta',     { status: 'done', label: 'Metadata generated' })
      break

    case 'error':
      // Mark last running entry as errored
      const lastRunning = [...entries].reverse().find(e => e.status === 'running')
      if (lastRunning) {
        upsert(lastRunning.id, { status: 'error', label: lastRunning.label, detail: progress.error })
      } else {
        upsert('error', { status: 'error', label: 'Failed', detail: progress.error })
      }
      break
  }

  return entries
}

// ─── Main App ─────────────────────────────────────────────────────────────────

interface AppProps {
  url: string
  maxClips: number
  clipDuration: number
  portrait: boolean
  captions: boolean
  captionLang: string
  captionStyle: CaptionStyleName
  output: string
  intent: string
}

function App({ url, maxClips, clipDuration, portrait, captions, captionLang, captionStyle, output, intent }: AppProps) {
  const { exit } = useApp()
  const [progress, setProgress] = useState<PipelineProgress>({ stage: 'downloading', message: '' })
  const [entries, setEntries]   = useState<StageEntry[]>([])
  const prevEntriesRef          = useRef<StageEntry[]>([])

  useEffect(() => {
    runPipeline({
      url, maxClips, clipDuration, portrait,
      captions, captionLang, captionStyle,
      outputBase: output, userIntent: intent,
      onProgress: (p) => {
        setProgress(p)
        const next = progressToEntries(p, prevEntriesRef.current)
        prevEntriesRef.current = next
        setEntries([...next])
      },
    }).then((final) => {
      setProgress(final)
      const next = progressToEntries(final, prevEntriesRef.current)
      prevEntriesRef.current = next
      setEntries([...next])
      setTimeout(() => exit(), 200)
    })
  }, [])

  const isRunning = progress.stage !== 'done' && progress.stage !== 'error'

  // Current spinner label
  const spinnerLabel: Record<PipelineStage, string> = {
    downloading: 'Downloading',
    analyzing:   'Analyzing with AI',
    clipping:    `Clipping ${progress.currentClip ?? ''}/${progress.totalClips ?? ''}`,
    captioning:  `Transcribing clip ${progress.currentClip ?? ''}/${progress.totalClips ?? ''}`,
    metadata:    'Generating metadata',
    done:        '',
    error:       '',
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={0}>

      {/* Header */}
      <Logo url={url} />

      {/* Options row */}
      <Box flexDirection="row" gap={3} paddingLeft={2} marginBottom={1}>
        <Text color={INACTIVE_GRAY}>clips <Text color="white">{maxClips}</Text></Text>
        <Text color={INACTIVE_GRAY}>duration <Text color="white">~{clipDuration}s</Text></Text>
        <Text color={INACTIVE_GRAY}>format <Text color="white">{portrait ? '9:16' : '16:9'}</Text></Text>
        {intent && <Text color={INACTIVE_GRAY}>intent <Text color={CLAUDE_ORANGE}>"{intent.slice(0, 40)}"</Text></Text>}
      </Box>

      {/* Stage log — like Claude Code's message list */}
      <Box flexDirection="column" gap={0} paddingLeft={1}>
        {entries.map(entry => (
          <StageMessage key={entry.id} entry={entry} />
        ))}
      </Box>

      {/* Detected highlights */}
      {progress.highlights && progress.highlights.length > 0 && (
        <HighlightList highlights={progress.highlights} />
      )}

      {/* Clip progress bar */}
      {progress.stage === 'clipping' && progress.currentClip && progress.totalClips && (
        <ClipProgress current={progress.currentClip} total={progress.totalClips} />
      )}

      {/* Active spinner — like Claude Code's SpinnerWithVerb */}
      {isRunning && (
        <Box marginTop={1} paddingLeft={1}>
          <Spinner
            message={spinnerLabel[progress.stage]}
            progress={progress.downloadProgress}
          />
        </Box>
      )}

      {/* Final results */}
      {progress.stage === 'done' && progress.clips && progress.outputDir && (
        <Results
          clips={progress.clips}
          outputDir={progress.outputDir}
          totalCost={progress.totalCost ?? 0}
        />
      )}

      {/* Error display */}
      {progress.stage === 'error' && (
        <Box marginTop={1} paddingLeft={2} flexDirection="column">
          <Text color={ERROR_RED} bold>Error</Text>
          <Text color={ERROR_RED} dimColor>{progress.error}</Text>
        </Box>
      )}

    </Box>
  )
}

// ─── Root: switches between HomeScreen and ClipApp ───────────────────────────

interface RootProps {
  initialUrl?: string
  initialOpts?: { maxClips: number; clipDuration: number; portrait: boolean; captions: boolean; captionLang: string; captionStyle: CaptionStyleName; output: string; intent: string }
  forceSetup?: boolean
}

type Screen = 'setup' | 'home' | 'clip'

function Root({ initialUrl, initialOpts, forceSetup = false }: RootProps) {
  const [screen, setScreen] = useState<Screen>(() => {
    if (forceSetup) return 'setup'
    if (initialUrl) return 'clip'
    if (!configExists()) return 'setup'
    return 'home'
  })

  const [clipArgs, setClipArgs] = useState(initialUrl
    ? { url: initialUrl, ...initialOpts! }
    : null
  )

  if (screen === 'setup') {
    return <SetupScreen onDone={() => setScreen('home')} />
  }

  if (screen === 'home' || !clipArgs) {
    return (
      <HomeScreen
        onSubmit={(url, opts) => {
          setClipArgs({ url, output: './output', captions: true, captionLang: 'id', captionStyle: 'hype', ...opts })
          setScreen('clip')
        }}
      />
    )
  }

  return <App {...clipArgs} />
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

const program = new Command()

program
  .name('try33x')
  .description('AI-powered YouTube Short Clipper')
  .version('1.0.0')
  // Default: no args → home screen (or setup if not configured)
  .action(() => {
    const { waitUntilExit } = render(<Root />, { exitOnCtrlC: false })
    waitUntilExit()
  })

program
  .command('setup')
  .description('Configure AI provider credentials')
  .action(() => {
    const { waitUntilExit } = render(<Root forceSetup />, { exitOnCtrlC: false })
    waitUntilExit()
  })

program
  .command('clip <url>')
  .description('Auto-detect and clip the best highlights from a YouTube video')
  .option('-n, --clips <number>',   'number of clips to generate', '3')
  .option('-d, --duration <secs>',  'target clip duration in seconds', '90')
  .option('--no-portrait',          'keep original 16:9 (default: convert to 9:16)')
  .option('--no-captions',          'skip subtitle generation')
  .option('-l, --lang <code>',      'subtitle language hint for Whisper (e.g. id, en)', 'id')
  .option('-s, --style <name>',     'subtitle style: karaoke|word-focus|hype|minimal|neo', 'hype')
  .option('-o, --output <dir>',     'output directory', './output')
  .option('-i, --intent <text>',    'describe what clips you want', '')
  .action((url: string, opts: { clips: string; duration: string; portrait: boolean; captions: boolean; lang: string; style: string; output: string; intent: string }) => {
    const { waitUntilExit } = render(
      <Root
        initialUrl={url}
        initialOpts={{
          maxClips: parseInt(opts.clips, 10),
          clipDuration: parseInt(opts.duration, 10),
          portrait: opts.portrait,
          captions: opts.captions,
          captionLang: opts.lang,
          captionStyle: opts.style as CaptionStyleName,
          output: opts.output,
          intent: opts.intent,
        }}
      />,
      { exitOnCtrlC: true },
    )
    waitUntilExit()
  })

program.parse()

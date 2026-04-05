import { Tool, type ToolResult } from '../../Tool.js'
import ytDlpExecDefault, { create } from 'yt-dlp-exec'
import { execSync, spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

export interface DownloadProgressData {
  percent: number
  speed: string
  eta: string
}

export type DownloadProgressCallback = (progress: DownloadProgressData) => void

// Prefer system-installed yt-dlp over the one bundled with the package
function resolveYtDlp() {
  try {
    const systemPath = execSync('which yt-dlp', { encoding: 'utf-8' }).trim()
    if (systemPath) return { exec: create(systemPath), bin: systemPath }
  } catch {}
  return { exec: ytDlpExecDefault, bin: 'yt-dlp' }
}

const { exec: ytDlpExec, bin: ytDlpBin } = resolveYtDlp()

// Run yt-dlp download and parse progress from stdout
function downloadWithProgress(
  bin: string,
  args: string[],
  onProgress?: DownloadProgressCallback,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

    const PROGRESS_RE = /\[download\]\s+([\d.]+)%.*?at\s+([\S]+).*?ETA\s+(\S+)/

    const onLine = (line: string) => {
      if (!onProgress) return
      const m = PROGRESS_RE.exec(line)
      if (m) {
        onProgress({ percent: parseFloat(m[1]), speed: m[2], eta: m[3] })
      }
    }

    let stdoutBuf = ''
    let stderrBuf = ''

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutBuf += chunk.toString()
      const lines = stdoutBuf.split('\n')
      stdoutBuf = lines.pop() ?? ''
      lines.forEach(onLine)
    })

    // yt-dlp writes progress AND errors to stderr
    proc.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      stderrBuf += text
      text.split('\n').forEach(onLine)
    })

    proc.on('close', code => {
      if (stdoutBuf) onLine(stdoutBuf)
      if (code === 0) {
        resolve()
      } else {
        // Surface the last meaningful stderr line as the error message
        const errLine = stderrBuf
          .split('\n')
          .map(l => l.trim())
          .filter(l => l && !l.startsWith('[debug]'))
          .pop() ?? `exit code ${code}`
        reject(new Error(errLine))
      }
    })

    proc.on('error', (err) => reject(new Error(`Failed to launch yt-dlp: ${err.message}`)))
  })
}

export interface DownloadInput {
  url: string
  outputDir: string
  onProgress?: DownloadProgressCallback
}

export interface DownloadOutput {
  videoPath: string
  title: string
  duration: number
  transcriptPath?: string        // preferred language VTT
  transcriptPaths?: Record<string, string>  // all available VTTs keyed by lang code
}

export class DownloadTool extends Tool<DownloadInput, DownloadOutput> {
  name = 'DownloadTool'
  description = 'Downloads a YouTube video and extracts subtitles/transcript'

  async call(input: DownloadInput): Promise<ToolResult & { data?: DownloadOutput }> {
    const { url, outputDir, onProgress } = input

    try {
      const baseFlags = {
        noWarnings: true,
        cookiesFromBrowser: 'edge',
        noCheckFormats: true,
        jsRuntimes: 'node',
      }

      // Get video info first
      const info = await ytDlpExec(url, {
        ...baseFlags,
        dumpSingleJson: true,
      }) as { title: string; duration: number; id: string }

      const safeTitle = info.title.replace(/[^a-z0-9\-_]/gi, '_').slice(0, 60)
      // Use %(ext)s so yt-dlp fills in the actual extension (webm, mp4, mkv, etc.)
      const outputTemplate = path.join(outputDir, `${safeTitle}.%(ext)s`)

      // Download video + auto-subtitles (via spawn for real-time progress)
      await downloadWithProgress(ytDlpBin, [
        url,
        '--no-warnings',
        '--cookies-from-browser', 'edge',
        '--no-check-formats',
        '--js-runtimes', 'node',
        '--output', outputTemplate,
        '--format', 'bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4',
        '--write-auto-sub',
        '--write-sub',
        '--sub-langs', 'en,id',
        '--sub-format', 'vtt',
        '--newline',
      ], onProgress)

      // Find actual downloaded video file (yt-dlp fills in the extension)
      const videoExtensions = ['mp4', 'webm', 'mkv', 'mov']
      const videoPath = videoExtensions
        .map(ext => path.join(outputDir, `${safeTitle}.${ext}`))
        .find(p => fs.existsSync(p)) ?? path.join(outputDir, `${safeTitle}.mp4`)

      // Collect all VTT files for this video, keyed by language code
      // yt-dlp names them: {safeTitle}.{ext}.{lang}.vtt
      const allFiles = fs.readdirSync(outputDir)
      const vttFiles = allFiles.filter(f => f.startsWith(safeTitle) && f.endsWith('.vtt'))

      const transcriptPaths: Record<string, string> = {}
      for (const f of vttFiles) {
        // Extract lang code from filename: something.mp4.id.vtt → 'id'
        const langMatch = f.match(/\.([a-z]{2,5})\.vtt$/)
        if (langMatch) {
          transcriptPaths[langMatch[1]] = path.join(outputDir, f)
        }
      }

      // Prefer id → en → first available
      const preferredLangs = ['id', 'en']
      const transcriptPath =
        preferredLangs.map(l => transcriptPaths[l]).find(Boolean) ??
        Object.values(transcriptPaths)[0]

      return {
        success: true,
        data: {
          videoPath,
          title: info.title,
          duration: info.duration,
          transcriptPath,
          transcriptPaths,
        },
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  }
}

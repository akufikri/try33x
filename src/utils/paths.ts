import path from 'path'
import fs from 'fs'

export function ensureOutputDir(base: string = './output'): string {
  const dir = path.resolve(base)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9\-_]/gi, '_').slice(0, 80)
}

import fs from 'fs'
import path from 'path'
import os from 'os'

const CONFIG_DIR  = path.join(os.homedir(), '.try33x')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

export interface SavedConfig {
  providerName: string
  baseURL: string
  apiKey: string
  smartModel: string
  fastModel: string
}

export function readConfig(): SavedConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null
    const raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
    return JSON.parse(raw) as SavedConfig
  } catch {
    return null
  }
}

export function writeConfig(config: SavedConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true })
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

export function configExists(): boolean {
  if (!fs.existsSync(CONFIG_FILE)) return false
  const c = readConfig()
  return !!c?.apiKey
}

export const CONFIG_FILE_PATH = CONFIG_FILE

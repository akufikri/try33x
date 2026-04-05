import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const ASSETS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../assets')

// ── Keyword → sticker filename ────────────────────────────────────────────────

const STICKER_MAP: Array<{ words: string[]; file: string }> = [
  { words: ['trading', 'trader', 'saham', 'profit', 'chart', 'bullish', 'naik'],      file: 'chart_with_upwards_trend.png' },
  { words: ['rugi', 'loss', 'bearish', 'turun', 'drop', 'jual'],                       file: 'chart_with_downwards_trend.png' },
  { words: ['uang', 'kaya', 'keuangan', 'money', 'rich', 'rupiah', 'income', 'gaji'], file: 'moneybag.png' },
  { words: ['investasi', 'invest', 'modal', 'aset', 'portofolio'],                     file: 'money_with_wings.png' },
  { words: ['belajar', 'pelajari', 'tips', 'cara', 'strategi', 'ilmu', 'paham'],      file: 'bulb.png' },
  { words: ['pikir', 'rencana', 'analisa', 'analisis', 'riset', 'otak'],               file: 'brain.png' },
  { words: ['takut', 'panik', 'panic', 'fear', 'khawatir', 'cemas', 'galau'],         file: 'cold_sweat.png' },
  { words: ['kenapa', 'gimana', 'bagaimana', 'mengapa', 'apa', 'why', 'how', 'what'], file: 'thinking_face.png' },
  { words: ['sukses', 'berhasil', 'menang', 'juara', 'win', 'champion', 'terbaik'],   file: 'trophy.png' },
  { words: ['semangat', 'motivasi', 'kuat', 'berani', 'action', 'gas', 'bisa'],       file: 'muscle.png' },
  { words: ['tujuan', 'goal', 'target', 'mimpi', 'dream', 'visi', 'masa depan'],      file: 'rocket.png' },
  { words: ['hati-hati', 'warning', 'bahaya', 'waspada', 'awas', 'risiko', 'jangan'],file: 'warning.png' },
  { words: ['miskin', 'broke', 'gagal', 'fail', 'kalah', 'jatuh', 'sedih'],           file: 'cry.png' },
  { words: ['luar biasa', 'amazing', 'gila', 'wow', 'unbelievable', 'hebat'],         file: 'boom.png' },
  { words: ['seru', 'senang', 'bahagia', 'celebrate', 'pesta', 'rayakan'],            file: 'partying_face.png' },
  { words: ['mantap', 'keren', 'bagus', 'oke', 'setuju', 'tepuk'],                    file: 'clap.png' },
  { words: ['perhatikan', 'lihat', 'fokus', 'ini dia', 'check', 'cek'],               file: 'eyes.png' },
  { words: ['mulai', 'start', 'langkah', 'pertama', 'awal', 'sekarang'],              file: 'zap.png' },
]

const DEFAULT_STICKERS = ['fire.png', 'star.png', 'zap.png', 'boom.png', 'fire.png']

export function resolveStickerPath(text: string): string | null {
  const lower = text.toLowerCase()

  for (const { words, file } of STICKER_MAP) {
    if (words.some(w => lower.includes(w))) {
      const p = path.join(ASSETS_DIR, file)
      if (fs.existsSync(p)) return p
    }
  }

  // Fallback: generic hype sticker based on text hash
  const hash = [...text].reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const fallback = path.join(ASSETS_DIR, DEFAULT_STICKERS[hash % DEFAULT_STICKERS.length])
  return fs.existsSync(fallback) ? fallback : null
}

export { ASSETS_DIR }

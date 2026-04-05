// ── Caption Style Presets ─────────────────────────────────────────────────────
// Inspired by pycaps templates: word-level highlighting, animations, themes

export type CaptionStyleName = 'karaoke' | 'word-focus' | 'hype' | 'minimal' | 'neo' | 'vibe'

export interface StyleDef {
  label: string
  description: string
  // ASS [V4+ Styles] fields
  fontName: string
  fontSize: number
  bold: boolean
  primaryColor: string      // &HAABBGGRR  (used in style sheet)
  secondaryColor: string    // karaoke sweep color
  outlineColor: string
  backColor: string
  outline: number
  shadow: number
  borderStyle: number       // 1=outline+shadow  3=opaque box  4=semi-transparent box
  marginV: number
  alignment: number         // numpad: 2=bottom-center
  // Generation mode
  mode: 'karaoke' | 'word-by-word'
  showContext: boolean       // word-by-word: show full line (true) or single word (false)
  // Per-word font sizes used in context mode
  activeFontSize: number
  inactiveFontSize: number
  // Inline override tags (ready to embed inside {…})
  // e.g. '\1c&H00FFFF&\1a&H00&'
  activeTag: string         // tags for the currently-spoken word
  inactiveTag: string       // tags for past/future words in context mode
  // Entry animation applied once per dialogue line (word-by-word mode)
  entryAnim: string
  uppercase: boolean
  // Emoji
  emojiEnabled: boolean     // append auto-detected emoji at end of each segment line
  emojiFontSize: number     // size of the emoji character
}

// ── Colour helpers ────────────────────────────────────────────────────────────
// ASS inline colour format:  \1c&HBBGGRR&   (B G R order, 6 hex digits)
// ASS inline alpha format:   \1a&HAA&        (00=opaque  FF=transparent)

const active = {
  yellow: '\\1c&H00FFFF&\\1a&H00&',   // yellow (R=FF,G=FF,B=00)
  cyan:   '\\1c&HFFFF00&\\1a&H00&',   // cyan   (R=00,G=FF,B=FF)
  white:  '\\1c&HFFFFFF&\\1a&H00&',   // white
  orange: '\\1c&H00A5FF&\\1a&H00&',   // orange (R=FF,G=A5,B=00)
}

const inactive = {
  dimWhite:  '\\1c&HFFFFFF&\\1a&H35&',  // white, ~79% opaque
  fadeWhite: '\\1c&HFFFFFF&\\1a&H25&',  // white, ~85% opaque
  hidden:    '\\1a&HFF&',               // fully transparent
}

// ── Kaomoji map ───────────────────────────────────────────────────────────────
// libass (ffmpeg subtitle renderer) TIDAK bisa render Unicode emoji → jadi kotak.
// Solusi: pakai kaomoji ASCII yang render sempurna di font apapun.

export const KAOMOJI_KEYWORDS: Array<{ words: string[]; face: string }> = [
  { words: ['trading', 'trader', 'saham', 'investasi', 'profit', 'chart', 'candle', 'bullish'],  face: '($.$)' },
  { words: ['rugi', 'loss', 'bearish', 'turun', 'drop'],                                          face: '(T_T)' },
  { words: ['uang', 'kaya', 'keuangan', 'financial', 'money', 'rich', 'rupiah', 'income'],        face: '(*$_$*)' },
  { words: ['belajar', 'pelajari', 'edukasi', 'tips', 'cara', 'strategi', 'ilmu', 'paham'],       face: '(._.)...' },
  { words: ['takut', 'panik', 'panic', 'fear', 'khawatir', 'cemas', 'risiko'],                    face: '(>_<)' },
  { words: ['kenapa', 'gimana', 'bagaimana', 'mengapa', 'apa', 'why', 'how', 'what'],             face: '(?_?)' },
  { words: ['sukses', 'berhasil', 'mantap', 'keren', 'win', 'bagus', 'amazing', 'terbaik'],       face: '(^_^)v' },
  { words: ['semangat', 'motivasi', 'berani', 'action', 'mulai', 'start', 'gas', 'bisa'],         face: '(>o<)!!' },
  { words: ['hati-hati', 'warning', 'bahaya', 'waspada', 'awas', 'jangan'],                       face: '(O_O)!!' },
  { words: ['kerja', 'usaha', 'bisnis', 'business', 'karir', 'career'],                           face: '(-_-)z' },
  { words: ['mimpi', 'dream', 'tujuan', 'goal', 'target', 'masa depan', 'harapan'],               face: '(*^*)~' },
  { words: ['miskin', 'broke', 'susah', 'gagal', 'fail', 'kalah', 'jatuh'],                       face: '(;_;)' },
  { words: ['seru', 'asik', 'gila', 'wow', 'incredible', 'luar biasa'],                           face: '(o_O)!!' },
]

export const DEFAULT_KAOMOJI = ['(^_^)', '(o_o)!', '(*_*)', '(^o^)/', '(>_<)!!']

export function pickEmoji(text: string): string {
  const lower = text.toLowerCase()
  for (const { words, face } of KAOMOJI_KEYWORDS) {
    if (words.some(w => lower.includes(w))) return face
  }
  const hash = [...text].reduce((a, c) => a + c.charCodeAt(0), 0)
  return DEFAULT_KAOMOJI[hash % DEFAULT_KAOMOJI.length]
}

// ── Presets ───────────────────────────────────────────────────────────────────

export const CAPTION_STYLES: Record<CaptionStyleName, StyleDef> = {

  // ── Karaoke (classic sweep) ──────────────────────────────────────────────
  karaoke: {
    label: 'Karaoke',
    description: 'Classic word-sweep highlight',
    fontName: 'Arial Black',
    fontSize: 72,
    bold: true,
    primaryColor: '&H00FFFFFF',
    secondaryColor: '&H0000FFFF',   // yellow sweep
    outlineColor: '&H00000000',
    backColor: '&H80000000',
    outline: 4,
    shadow: 2,
    borderStyle: 1,
    marginV: 380,
    alignment: 2,
    mode: 'karaoke',
    showContext: true,
    activeFontSize: 72,
    inactiveFontSize: 72,
    activeTag: active.yellow,
    inactiveTag: '',
    entryAnim: '\\fad(150,0)',
    uppercase: false,
    emojiEnabled: false,
    emojiFontSize: 0,
  },

  // ── Word Focus (one word at a time — viral TikTok style) ─────────────────
  'word-focus': {
    label: 'Word Focus',
    description: 'One word at a time, large & centered',
    fontName: 'Arial Black',
    fontSize: 92,
    bold: true,
    primaryColor: '&H00FFFFFF',
    secondaryColor: '&H00FFFFFF',
    outlineColor: '&H00000000',
    backColor: '&HFF000000',
    outline: 6,
    shadow: 3,
    borderStyle: 1,
    marginV: 380,
    alignment: 2,
    mode: 'word-by-word',
    showContext: false,
    activeFontSize: 92,
    inactiveFontSize: 92,
    activeTag: active.white,
    inactiveTag: inactive.hidden,
    entryAnim: '\\fad(120,100)\\fscx100\\fscy100\\t(0,180,\\fscx118\\fscy118)\\t(180,330,\\fscx100\\fscy100)',
    uppercase: true,
    emojiEnabled: false,
    emojiFontSize: 0,
  },

  // ── Hype (full context, active word pops in yellow) ──────────────────────
  hype: {
    label: 'Hype',
    description: 'Full line, active word highlighted yellow & larger',
    fontName: 'Arial Black',
    fontSize: 62,
    bold: true,
    primaryColor: '&H00FFFFFF',
    secondaryColor: '&H0000FFFF',
    outlineColor: '&H00000000',
    backColor: '&H80000000',
    outline: 4,
    shadow: 2,
    borderStyle: 1,
    marginV: 380,
    alignment: 2,
    mode: 'word-by-word',
    showContext: true,
    activeFontSize: 80,
    inactiveFontSize: 58,
    activeTag: active.yellow,
    inactiveTag: inactive.dimWhite,
    entryAnim: '',
    uppercase: false,
    emojiEnabled: false,
    emojiFontSize: 0,
  },

  // ── Minimal (clean box, subtle karaoke) ──────────────────────────────────
  minimal: {
    label: 'Minimal',
    description: 'Clean box background, soft karaoke sweep',
    fontName: 'Arial',
    fontSize: 58,
    bold: false,
    primaryColor: '&H00FFFFFF',
    secondaryColor: '&H0080FFFF',   // soft yellow
    outlineColor: '&H00000000',
    backColor: '&HA0000000',        // ~62% opaque black box
    outline: 0,
    shadow: 0,
    borderStyle: 4,                 // semi-transparent box
    marginV: 380,
    alignment: 2,
    mode: 'karaoke',
    showContext: true,
    activeFontSize: 58,
    inactiveFontSize: 58,
    activeTag: '\\1c&H80FFFF&\\1a&H00&',  // soft yellow
    inactiveTag: '',
    entryAnim: '\\fad(200,150)',
    uppercase: false,
    emojiEnabled: false,
    emojiFontSize: 0,
  },

  // ── Neo (context mode, cyan active, modern dark look) ────────────────────
  neo: {
    label: 'Neo',
    description: 'Modern style, cyan active word, soft context',
    fontName: 'Arial',
    fontSize: 68,
    bold: true,
    primaryColor: '&H80FFFFFF',
    secondaryColor: '&H00FFFF00',
    outlineColor: '&H00002020',
    backColor: '&HC0000000',
    outline: 2,
    shadow: 0,
    borderStyle: 1,
    marginV: 380,
    alignment: 2,
    mode: 'word-by-word',
    showContext: true,
    activeFontSize: 80,
    inactiveFontSize: 62,
    activeTag: active.cyan,
    inactiveTag: inactive.fadeWhite,
    entryAnim: '\\fad(150,0)',
    uppercase: false,
    emojiEnabled: false,
    emojiFontSize: 0,
  },

  // ── Vibe (hype + emoji otomatis per kalimat) ──────────────────────────────
  vibe: {
    label: 'Vibe',
    description: 'Kata aktif oranye + emoji otomatis dari konteks kalimat',
    fontName: 'Arial Black',
    fontSize: 62,
    bold: true,
    primaryColor: '&H00FFFFFF',
    secondaryColor: '&H00A5FF00',    // orange sweep (BGR: 00=B, A5=G, FF=R)
    outlineColor: '&H00000000',
    backColor: '&H80000000',
    outline: 4,
    shadow: 2,
    borderStyle: 1,
    marginV: 380,
    alignment: 2,
    mode: 'word-by-word',
    showContext: true,
    activeFontSize: 80,
    inactiveFontSize: 58,
    activeTag: active.orange,
    inactiveTag: inactive.dimWhite,
    entryAnim: '',
    uppercase: false,
    emojiEnabled: false,
    emojiFontSize: 0,
  },
}

// 'vibe' is kept in CAPTION_STYLES for future use but excluded from public list
export const STYLE_NAMES = (Object.keys(CAPTION_STYLES) as CaptionStyleName[]).filter(n => n !== 'vibe')

export function getStyle(name: CaptionStyleName): StyleDef {
  return CAPTION_STYLES[name] ?? CAPTION_STYLES.karaoke
}

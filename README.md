# try33x - AI-powered YouTube Short Clipper CLI.

![SCR-20260405-meih](https://github.com/user-attachments/assets/cde09240-ff98-4795-a060-6d2fc1200e0b)
![SCR-20260405-mfte](https://github.com/user-attachments/assets/fb68a35d-a316-465b-a6ee-8eb44d095532)


AI-powered YouTube Short Clipper CLI. Paste a YouTube URL and get ready-to-upload Short clips — auto-detected highlights, portrait crop, burned-in karaoke subtitles, and generated metadata.

```
try33x clip https://youtube.com/watch?v=...
```

---

## Features

- **AI Highlight Detection** — uses Claude or GPT-4o to find the best moments in any video
- **Auto-Clip** — extracts N clips at your target duration (default 90s)
- **Portrait Mode** — auto-converts 16:9 → 9:16 for Shorts / TikTok / Reels
- **Karaoke Subtitles** — word-level highlighted captions burned directly into the video
- **5 Caption Styles** — karaoke, hype, word-focus, minimal, neo
- **Metadata Generation** — AI-written title, description, and hashtags per clip
- **Interactive UI** — beautiful terminal interface built with Ink
- **Intent Mode** — describe what kind of clips you want with `--intent`

---

## Prerequisites

Before installing, make sure these are available on your system:

| Dependency | Install |
|---|---|
| **Node.js** ≥ 18 | [nodejs.org](https://nodejs.org) |
| **ffmpeg** | `brew install ffmpeg` / `apt install ffmpeg` |
| **yt-dlp** | `brew install yt-dlp` / `pip install yt-dlp` |

---

## Installation

```bash
npm install -g try33x
```

---

## Setup

Run the setup wizard to enter your API key(s):

```bash
try33x setup
```

You need at least one of:

| Provider | Used for |
|---|---|
| **Anthropic** (Claude) | Highlight detection, metadata generation |
| **OpenAI** | Whisper transcription (fallback when no subtitle available) |

---

## Usage

### Interactive mode

```bash
try33x
```

Opens a home screen where you can paste a URL and configure options interactively.

---

### Direct clip

```bash
try33x clip <youtube-url> [options]
```

**Options:**

| Flag | Default | Description |
|---|---|---|
| `-n, --clips <n>` | `3` | Number of clips to generate |
| `-d, --duration <secs>` | `90` | Target duration per clip (seconds) |
| `--no-portrait` | — | Keep original 16:9 aspect ratio |
| `--no-captions` | — | Skip subtitle generation |
| `-l, --lang <code>` | `id` | Language hint for Whisper (e.g. `en`, `id`, `es`) |
| `-s, --style <name>` | `hype` | Caption style (see below) |
| `-o, --output <dir>` | `./output` | Output directory |
| `-i, --intent <text>` | — | Describe the clips you want |

**Examples:**

```bash
# 3 clips, 60 seconds each, hype captions
try33x clip https://youtu.be/abc123 -n 3 -d 60

# Keep 16:9, English subtitles, minimal style
try33x clip https://youtu.be/abc123 --no-portrait -l en -s minimal

# Tell the AI what you want
try33x clip https://youtu.be/abc123 --intent "motivational moments only"

# No captions, 5 clips saved to custom folder
try33x clip https://youtu.be/abc123 --no-captions -n 5 -o ./clips
```

---

## Caption Styles

| Style | Description |
|---|---|
| `hype` | Full line visible, active word pops yellow & larger *(default)* |
| `karaoke` | Classic word-sweep highlight |
| `word-focus` | One word at a time, large & centered — TikTok style |
| `minimal` | Clean semi-transparent box, soft sweep |
| `neo` | Modern dark look, cyan active word |

---

## Output

Each clip is saved to the output directory with:

```
output/
  clip_1.mp4          ← video with burned subtitles
  clip_1_meta.json    ← title, description, hashtags
  clip_2.mp4
  clip_2_meta.json
  ...
```

---

## Test Subtitles

If you already have a clip and `.vtt` file and just want to test caption styles without re-downloading:

```bash
bun run test-caption <video.mp4> [subtitle.vtt] [--style hype] [--start 0] [--end 90]
```

---

## Tech Stack

- **TypeScript** + **Bun**
- **Ink** (React for terminal UIs)
- **fluent-ffmpeg** (video processing)
- **yt-dlp** (YouTube download)
- **Claude / GPT-4o** (highlight detection + metadata)
- **Whisper** (speech-to-text fallback)

---

## License

MIT

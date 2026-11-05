<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/wordmark-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/wordmark-light.svg">
    <img src="docs/assets/wordmark-light.svg" alt="Minimax-coder" width="760">
  </picture>
</p>

<h1 align="center">Minimax-coder</h1>
<p align="center"><strong>High-Performance, Lean-Token Senior AI Coding Agent for the Terminal</strong></p>
<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#key-features">Key Features</a> ·
  <a href="#byok-providers--pricing">BYOK & Pricing</a> ·
  <a href="#slash-commands">Slash Commands</a> ·
  <a href="README_ZH.md">简体中文文档</a>
</p>
<p align="center"><strong>English</strong> · <a href="README_ZH.md">简体中文</a></p>

---

## Overview

**Minimax-coder** is an ultra-fast, minimal, and token-frugal terminal coding agent engineered for developers who demand peak coding capability without burning unnecessary tokens or waiting on sluggish cloud round-trips.

Featuring the signature **MiniMax pink-to-orange gradient aesthetic** (`#FF007A` → `#FF7A00`) and high-fidelity waveform terminal branding, Minimax-coder runs as a **single standalone binary (`./Minimax-coder`)** or node CLI. It strips away cloud telemetry, daily check-ins, and marketing bloat—leaving a blazing-fast, laser-focused senior engineering agent with universal BYOK support (OpenAI, Google Gemini, Anthropic Claude, DeepSeek, and Ollama) and real-time Chinese Yuan (¥ CNY) cost tracking.

---

## Key Features

### 1. 🚀 Token Diet Engine (70%+ Token Reduction)
- **Inline Tool Output Cap**: Restricts tool outputs to 8KB / 200 lines inline; large logs and payloads are seamlessly spilled to `.mcode/artifacts/` with concise summaries.
- **Quiet Test Backpressure**: Filters noisy stack traces and duplicate test passes into compact receipts (`PASS (4/4 tests)`).
- **Read Deduplication**: Re-reading identical files in the same turn returns an instant memory pointer without consuming prompt tokens.
- **Observation Masking**: Automatically rolls older tool execution logs into concise markers while preserving conversation logic.
- **Terse 7-Tool Core**: Exactly 7 minimal schemas (`bash`, `read_file`, `edit_file`, `write_file`, `glob`, `grep`, `git`). System prompt + tools use just **722 tokens** (under half of the 1,500 token budget).

### 2. 🧠 Senior Staff Engineer Coding Standard
- **Production-Ready Quality**: Writes clean, type-safe, modular, performant, and well-architected code following modern software design patterns.
- **Mandatory Simplified Chinese Docstrings & Comments**: All code comments, inline documentation, and function docstrings are strictly written in **Simplified Chinese (简体中文)**, while preserving standard English identifiers.

### 3. 🌐 Massive Context Windows & Universal BYOK
- **Massive Context Support**: Automatically recognizes and unlocks the full context ceilings of your models:
  - **Google Gemini** (`gemini-3.8-flash-high`, `gemini-3-flash`, `gemini-2.5-flash`): **1,000,000 tokens (1.0M)**
  - **Gemini Pro** (`gemini-3-pro`, `gemini-2.5-pro`, `gemini-1.5-pro`): **2,000,000 tokens (2.0M)**
  - **Anthropic Claude** (`claude-3-7-sonnet`, `claude-3-5-sonnet`): **200,000 tokens (200k)**
  - **DeepSeek & OpenAI** (`deepseek-v3`, `deepseek-r1`, `gpt-4o`, `o1`, `o3-mini`): **128,000+ tokens (131k)**
  - **Default Floor**: **131,072 tokens (128k)** baseline.
- **Universal BYOK**: Connect any OpenAI-compatible, Google Gemini, Anthropic Claude, or local Ollama endpoint without vendor lock-in.

### 4. 💰 Real-Time CNY Cost & Token Telemetry
- **Live Status Bar**: Always visible at the bottom of the screen:
  ```text
  🧠 52k/1.0M (5%) · 💰 ¥0.027 · 🔁 3
  ```
- **Fuzzy Model Matcher**: Reads official rates from `pricing.json` with support for cache-hit and cache-miss pricing.
- **Interactive `/cost` Command**: Displays detailed per-session cost and token breakdowns.

### 5. 🎨 Ultra-Compact TUI & Colored File Diffs
- Single-line tool events with emojis:
  ```text
  ✏️  packages/tui/src/index.ts (+23)(-3)
  ✅ $ pnpm test 2.1s
  📖 src/api.ts 120L
  🔍 grep "renderWaveform" 4 matches
  ```
- File additions in **green `(+23)`** and deletions in **red `(-3)`**, guaranteed to appear on every edit or file write.

### 6. 🛡️ Decluttered & Private
- Zero cloud tracking, analytics, or telemetry.
- No daily check-in popups or cloud deploy nudges.
- Standalone self-contained executable: no global node_modules needed.

---

## Quick Start

### Option A: Run Standalone Binary
Launch the pre-compiled native binary directly:
```bash
./Minimax-coder
```

### Option B: Build from Source
```bash
# 1. Install dependencies
pnpm install

# 2. Build packages and binary
pnpm build
pnpm run build:binary

# 3. Launch Minimax-coder
./Minimax-coder
```

---

## Configuring Providers (BYOK)

You can configure any API endpoint using the CLI:

### 1. Google Gemini (e.g. `gemini-3.8-flash-high` / `gemini-3-flash`)
```bash
export GEMINI_API_KEY="your-gemini-key"
./Minimax-coder provider add \
  --name gemini \
  --base-url https://generativelanguage.googleapis.com/v1beta/openai/ \
  --api-format openai-completions \
  --model gemini-3.8-flash-high \
  --api-key-env GEMINI_API_KEY \
  --use
```

### 2. DeepSeek (e.g. `deepseek-v3` / `deepseek-r1`)
```bash
export DEEPSEEK_API_KEY="your-deepseek-key"
./Minimax-coder provider add \
  --name deepseek \
  --base-url https://api.deepseek.com/v1 \
  --api-format openai-completions \
  --model deepseek-v3 \
  --api-key-env DEEPSEEK_API_KEY \
  --use
```

### 3. Anthropic Claude (e.g. `claude-3-7-sonnet`)
```bash
export ANTHROPIC_API_KEY="your-claude-key"
./Minimax-coder provider add \
  --name anthropic \
  --base-url https://api.anthropic.com \
  --api-format anthropic-messages \
  --model claude-3-7-sonnet-20250219 \
  --api-key-env ANTHROPIC_API_KEY \
  --use
```

### 4. Local Ollama
```bash
./Minimax-coder provider add \
  --name local-ollama \
  --base-url http://localhost:11434/v1 \
  --api-format openai-completions \
  --model qwen2.5-coder:32b \
  --use
```

---

## Model Pricing Reference (`pricing.json`)

Pricing is stored in `pricing.json` in Chinese Yuan (¥ CNY) per 1M tokens:

| Model Family | Cache-Hit Prompt | Cache-Miss Prompt | Output Tokens | Context Window |
|---|---|---|---|---|
| **Google Gemini 3.8 Flash High** | ¥0.136 / 1M | ¥0.544 / 1M | ¥2.175 / 1M | **1,000,000 (1.0M)** |
| **Google Gemini 3 Flash** | ¥0.136 / 1M | ¥0.544 / 1M | ¥2.175 / 1M | **1,000,000 (1.0M)** |
| **Google Gemini 3 Pro / 2.5 Pro** | ¥2.270 / 1M | ¥9.060 / 1M | ¥36.250 / 1M | **2,000,000 (2.0M)** |
| **DeepSeek V3** | ¥0.500 / 1M | ¥2.000 / 1M | ¥8.000 / 1M | **131,072 (128k)** |
| **DeepSeek R1** | ¥1.000 / 1M | ¥4.000 / 1M | ¥16.000 / 1M | **131,072 (128k)** |
| **MiniMax Text 01 / 02** | ¥1.000 / 1M | ¥1.000 / 1M | ¥1.000 / 1M | **131,072 (128k)** |
| **Claude 3.7 Sonnet** | ¥2.720 / 1M | ¥21.750 / 1M | ¥108.750 / 1M | **200,000 (200k)** |
| **OpenAI GPT-4o** | ¥9.060 / 1M | ¥18.130 / 1M | ¥72.500 / 1M | **128,000 (128k)** |
| **OpenAI o3-mini** | ¥4.000 / 1M | ¥8.000 / 1M | ¥32.000 / 1M | **128,000 (128k)** |
| **OpenAI o1** | ¥54.380 / 1M | ¥108.750 / 1M | ¥435.000 / 1M | **128,000 (128k)** |
| **Local Ollama** | ¥0.000 | ¥0.000 | ¥0.000 | Local |

---

## Interactive Slash Commands

Inside the terminal UI, use slash commands to inspect and manage your session:

| Command | Description |
|---|---|
| `/cost` | Display detailed session cost breakdown (cache hits, misses, output tokens, total ¥ CNY) |
| `/context` | Inspect current context headroom, active memory, and compaction state |
| `/diff` | Review current working tree code modifications with compact unified diffs |
| `/undo` | Revert the last file modification made by the agent |
| `/test` | Run the workspace test suite with quiet backpressure filtering |
| `/compact` | Trigger manual context compaction to reclaim token headroom |
| `/plan` | Switch to architectural plan mode before executing edits |
| `/provider` | Switch or manage active AI models and providers |

---

## Architecture & Code Quality

```
minimax-code/
├── bin/
│   └── Minimax-coder         # Main standalone binary entrypoint
├── packages/
│   ├── agent-tools/          # 7 lean tool schemas & token diet primitives
│   ├── config/               # Lean agent configuration & defaults
│   ├── local-runtime-v2/     # Core agent runtime & session orchestration
│   └── tui/                  # Terminal interface, cost tracker, ANSI gradient
├── pricing.json              # Official model pricing in CNY
└── test/                     # Verification test suites
```

### Coding Rules Enforced in System Prompt
1. **Senior Staff Engineer Standards**: Produces robust, clean, modular, and idiomatic code with full error handling.
2. **Simplified Chinese Annotations**: Every code comment, function docstring, and inline explanation must be in **Simplified Chinese (简体中文)**.
3. **grep-before-read**: Fast regex indexing before opening large files.
4. **diff-only edits**: Targeted hunk modifications, avoiding unnecessary full file overwrites.

---

## License

This project is licensed under the [MIT License](LICENSE-STATUS.md).

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/wordmark-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/wordmark-light.svg">
    <img src="docs/assets/wordmark-light.svg" alt="Minimax-coder" width="760">
  </picture>
</p>

<h1 align="center">Minimax-coder</h1>
<p align="center"><strong>面向终端的高性能、极致省 Token 资深工程师 AI 编程助手</strong></p>
<p align="center">
  <a href="#快速上手">快速上手</a> ·
  <a href="#核心特性">核心特性</a> ·
  <a href="#模型提供商与价格表">BYOK 与价格表</a> ·
  <a href="#斜杠指令">斜杠指令</a> ·
  <a href="README.md">English Documentation</a>
</p>
<p align="center"><a href="README.md">English</a> · <strong>简体中文</strong></p>

---

## 概述

**Minimax-coder** 是专为追求极致响应速度、代码工程质量与超低 Token 消耗的开发者打造的终端 AI 编程助手。

界面采用 MiniMax 标志性的**粉橙渐变艺术设计**（`#FF007A` → `#FF7A00`）与高精度声波 Logo，可直接作为**单一原生独立二进制文件（`./Minimax-coder`）**运行。它彻底剔除了云端遥测打点、每日签到和登录限制等无关包袱，专注于提供顶级资深架构师（Senior Staff Engineer）级别的代码实现，强制使用规范的**简体中文注释与文档**，支持 Google Gemini、Anthropic Claude、DeepSeek、OpenAI 与本地 Ollama 的全功能 BYOK 接入，并具备实时人民币（¥ CNY）消耗监控。

---

## 核心特性

### 1. 🚀 极致省 Token 引擎（节省 70%+ Token 消耗）
- **工具输出内联限制**：单次工具输出限制在 8KB / 200 行以内；超大日志与结果自动沉淀至 `.mcode/artifacts/` 并生成高密度摘要。
- **静默测试背压（Quiet Test Backpressure）**：过滤冗余堆栈噪音与冗长通过记录，仅保留核心回执（如 `PASS (4/4 tests)`）。
- **会话内读取去重**：单轮对话中重复读取相同文件直接返回内存指针，不再重复计入上下文 Prompt。
- **历史观测压缩（Observation Masking）**：智能折叠早期工具调用结果，仅保留最新交互内容，保持上下文高度精简。
- **精简 7 工具核心协议**：仅提供最核心的 7 个精炼工具（`bash`, `read_file`, `edit_file`, `write_file`, `glob`, `grep`, `git`）。系统提示词 + 工具模式仅占 **722 tokens**（远低于 1500 tokens 上限）。

### 2. 🧠 资深架构师编码规范（Senior Staff Engineer）
- **工业级生产质量**：输出类型安全、架构严谨、性能卓越、可扩展且符合工程最佳实践的高质量代码。
- **强制简体中文注释与文档**：所有代码注释、函数 Docstring、行内注解与设计说明**一律使用简体中文编写**，代码标识符保留标准英文命名。

### 3. 🌐 超大上下文窗口与全能 BYOK
- **自动解锁超大上下文**：根据模型智能适配真实上下文上限：
  - **Google Gemini**（`gemini-3.8-flash-high`, `gemini-3-flash`, `gemini-2.5-flash`）：**1,000,000 tokens（1.0M）**
  - **Gemini Pro**（`gemini-3-pro`, `gemini-2.5-pro`, `gemini-1.5-pro`）：**2,000,000 tokens（2.0M）**
  - **Anthropic Claude**（`claude-3-7-sonnet`, `claude-3-5-sonnet`）：**200,000 tokens（200k）**
  - **DeepSeek 与 OpenAI**（`deepseek-v3`, `deepseek-r1`, `gpt-4o`, `o1`, `o3-mini`）：**128,000+ tokens（131k）**
  - **默认兜底下限**：**131,072 tokens（128k）**。
- **通用 BYOK 支持**：一键接入任意 OpenAI 兼容端点、Google Gemini API、Anthropic Claude 或本地 Ollama 模型，彻底摆脱平台锁定。

### 4. 💰 实时人民币（CNY）花费与 Token 消耗监控
- **底部常驻状态栏**：
  ```text
  🧠 52k/1.0M (5%) · 💰 ¥0.027 · 🔁 3
  ```
- **智能模糊匹配**：基于 `pricing.json` 自动解析模型家族，精确计算 Cache-hit（缓存命中）与 Cache-miss（首次输入）人民币费用。
- **交互式 `/cost` 指令**：随时查看当前会话的详细花费、Token 数量与缓存命中率。

### 5. 🎨 极简单行 TUI 与彩色文件 Diff 标识
- 单行 Emoji 紧凑工具呈现：
  ```text
  ✏️  packages/tui/src/index.ts (+23)(-3)
  ✅ $ pnpm test 2.1s
  📖 src/api.ts 120L
  🔍 grep "renderWaveform" 4 matches
  ```
- 修改文件时**绿色增加行 `(+23)`** 与**红色删除行 `(-3)`** 实时高亮显示。

### 6. 🛡️ 纯净轻量，零冗余
- 禁用一切云端遥测、统计与私有埋点。
- 禁用每日签到弹窗与云端网站部署引导。
- 独立可执行二进制文件，开箱即用。

---

## 快速上手

### 方式 1：运行独立二进制程序
直接运行预构建的二进制文件：
```bash
./Minimax-coder
```

### 方式 2：从源码编译构建
```bash
# 1. 安装项目依赖
pnpm install

# 2. 构建项目及二进制可执行文件
pnpm build
pnpm run build:binary

# 3. 运行 Minimax-coder
./Minimax-coder
```

---

## 配置模型服务商（BYOK）

在终端中轻松配置并切换任意模型：

### 1. Google Gemini（例如 `gemini-3.8-flash-high` / `gemini-3-flash`）
```bash
export GEMINI_API_KEY="你的-gemini-key"
./Minimax-coder provider add \
  --name gemini \
  --base-url https://generativelanguage.googleapis.com/v1beta/openai/ \
  --api-format openai-completions \
  --model gemini-3.8-flash-high \
  --api-key-env GEMINI_API_KEY \
  --use
```

### 2. DeepSeek（例如 `deepseek-v3` / `deepseek-r1`）
```bash
export DEEPSEEK_API_KEY="你的-deepseek-key"
./Minimax-coder provider add \
  --name deepseek \
  --base-url https://api.deepseek.com/v1 \
  --api-format openai-completions \
  --model deepseek-v3 \
  --api-key-env DEEPSEEK_API_KEY \
  --use
```

### 3. Anthropic Claude（例如 `claude-3-7-sonnet`）
```bash
export ANTHROPIC_API_KEY="你的-claude-key"
./Minimax-coder provider add \
  --name anthropic \
  --base-url https://api.anthropic.com \
  --api-format anthropic-messages \
  --model claude-3-7-sonnet-20250219 \
  --api-key-env ANTHROPIC_API_KEY \
  --use
```

### 4. 本地 Ollama
```bash
./Minimax-coder provider add \
  --name local-ollama \
  --base-url http://localhost:11434/v1 \
  --api-format openai-completions \
  --model qwen2.5-coder:32b \
  --use
```

---

## 模型价格参考表（`pricing.json`）

计价数据配置于根目录 `pricing.json`，单位为人民币（¥ CNY / 每百万 Tokens）：

| 模型系列 | 缓存命中输入 (Cache Hit) | 首次输入 (Cache Miss) | 输出 Token | 上下文窗口限制 |
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
| **本地 Ollama** | ¥0.000 | ¥0.000 | ¥0.000 | 本地免费 |

---

## 常用斜杠指令（Slash Commands）

在交互式终端中，随时输入指令管理当前会话：

| 指令 | 说明 |
|---|---|
| `/cost` | 查看当前会话的费用统计（缓存命中数、首次输入数、输出数与累计人民币花费） |
| `/context` | 查看当前会话上下文占用、使用百分比与压缩状态 |
| `/diff` | 查看当前代码修改的紧凑 Unified Diff |
| `/undo` | 撤销上一步 AI 工具对代码文件的修改 |
| `/test` | 运行静默测试背压套件，获取简明测试回执 |
| `/compact` | 手动触发上下文压缩，释放可用 Token 空间 |
| `/plan` | 切换至架构规划模式，先设计再执行 |
| `/provider` | 管理或切换当前使用的 AI 模型与提供商 |

---

## 许可证

本项目遵循 [MIT 许可证](LICENSE-STATUS.md)。

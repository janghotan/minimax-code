/**
 * Lean Agent configuration settings for token-efficient coding.
 * Provides unified thresholds for tool output caps, backpressure,
 * read deduplication, search limits, and fuzzy edits.
 */

export interface LeanToolOutputConfig {
  /** Maximum inline bytes per tool result before spilling to an artifact (default: 8 KiB) */
  readonly maxInlineBytes: number;
  /** Maximum inline lines per tool result before spilling (default: 200 lines) */
  readonly maxInlineLines: number;
  /** Relative artifact storage directory (default: .mcode/artifacts) */
  readonly artifactDir: string;
}

export interface LeanTestRunnerConfig {
  /** Enable test backpressure and summarization (default: true) */
  readonly enabled: boolean;
  /** Inject fail-fast flags where safe (pytest -x, jest --bail, go test -failfast) (default: true) */
  readonly injectFailFast: boolean;
  /** Filter stack trace noise and internal frames on test failure (default: true) */
  readonly filterStackNoise: boolean;
}

export interface LeanReadFileConfig {
  /** Default lines returned if limit omitted (default: 300) */
  readonly defaultLimit: number;
  /** Deduplicate identical file reads in the same session (default: true) */
  readonly dedupeSessionReads: boolean;
}

export interface LeanSearchConfig {
  /** Maximum matches returned by grep (default: 100) */
  readonly maxGrepMatches: number;
  /** Maximum matches returned by glob (default: 100) */
  readonly maxGlobMatches: number;
}

export interface LeanEditConfig {
  /** Enable whitespace and indentation-tolerant fuzzy match fallback (default: true) */
  readonly fuzzyMatchFallback: boolean;
  /** Edit format preference: 'udiff' | 'diff' | 'whole' (default: 'udiff') */
  readonly editFormat: 'udiff' | 'diff' | 'whole';
}

export interface LeanContextManagementConfig {
  /** Floor for context window in tokens if unknown or <= 0 (default: 64 * 1024) */
  readonly contextWindowFloor: number;
  /** Keep tool results for the last K rounds (default: 5) */
  readonly keepRecentToolRounds: number;
  /** Batch masking trigger threshold as ratio of context window (default: 0.40) */
  readonly batchMaskThreshold: number;
  /** Compaction safety bound threshold as ratio of context window (default: 0.60) */
  readonly compactionThreshold: number;
  /** Keep the last N turns raw during compaction (default: 2) */
  readonly keepRawTurns: number;
}

export interface LeanDeclutterConfig {
  /** Hard-disable daily check-in application (default: true) */
  readonly disableDailyCheckin: boolean;
  /** Hard-disable cloud website deployment (default: true) */
  readonly disableCloudWebsiteDeploy: boolean;
  /** Hard-disable Matrix/cloud MCP host (default: true) */
  readonly disableMatrixTools: boolean;
  /** Hard-disable telemetry network calls (default: true) */
  readonly disableTelemetry: boolean;
  /** Hard-disable mcode login and MiniMax account flows (default: true) */
  readonly disableLoginFlows: boolean;
}

export interface LeanProviderConfig {
  /** Primary API format (default: 'openai-completions') */
  readonly defaultApiFormat: 'openai-completions' | 'anthropic-messages';
  /** Default model ID (default: 'deepseek-chat') */
  readonly defaultModel: string;
}

export interface LeanTuiConfig {
  /** Project name displayed in header (default: 'yourname') */
  readonly projectName: string;
  /** USD to CNY exchange rate fallback when model pricing is only available in USD (default: 7.25) */
  readonly usdToCnyRate: number;
  /** Context lines for compact unified diffs (default: 2) */
  readonly diffContextLines: number;
}

export interface LeanAgentSettings {
  readonly toolOutput: LeanToolOutputConfig;
  readonly testRunner: LeanTestRunnerConfig;
  readonly readFile: LeanReadFileConfig;
  readonly search: LeanSearchConfig;
  readonly edit: LeanEditConfig;
  readonly contextManagement: LeanContextManagementConfig;
  readonly declutter: LeanDeclutterConfig;
  readonly provider: LeanProviderConfig;
  readonly tui: LeanTuiConfig;
}

export const DEFAULT_LEAN_AGENT_SETTINGS: Readonly<LeanAgentSettings> = {
  toolOutput: {
    maxInlineBytes: 8 * 1024,
    maxInlineLines: 200,
    artifactDir: '.mcode/artifacts',
  },
  testRunner: {
    enabled: true,
    injectFailFast: true,
    filterStackNoise: true,
  },
  readFile: {
    defaultLimit: 300,
    dedupeSessionReads: true,
  },
  search: {
    maxGrepMatches: 100,
    maxGlobMatches: 100,
  },
  edit: {
    fuzzyMatchFallback: true,
    editFormat: 'udiff',
  },
  contextManagement: {
    contextWindowFloor: 64 * 1024,
    keepRecentToolRounds: 5,
    batchMaskThreshold: 0.40,
    compactionThreshold: 0.60,
    keepRawTurns: 2,
  },
  declutter: {
    disableDailyCheckin: true,
    disableCloudWebsiteDeploy: true,
    disableMatrixTools: true,
    disableTelemetry: true,
    disableLoginFlows: true,
  },
  provider: {
    defaultApiFormat: 'openai-completions',
    defaultModel: 'deepseek-chat',
  },
  tui: {
    projectName: 'Minimax-coder',
    usdToCnyRate: 7.25,
    diffContextLines: 2,
  },
};

let currentLeanSettings: LeanAgentSettings = { ...DEFAULT_LEAN_AGENT_SETTINGS };

export function getLeanAgentSettings(): LeanAgentSettings {
  return currentLeanSettings;
}

export function updateLeanAgentSettings(overrides: Partial<LeanAgentSettings>): void {
  currentLeanSettings = {
    toolOutput: { ...currentLeanSettings.toolOutput, ...(overrides.toolOutput ?? {}) },
    testRunner: { ...currentLeanSettings.testRunner, ...(overrides.testRunner ?? {}) },
    readFile: { ...currentLeanSettings.readFile, ...(overrides.readFile ?? {}) },
    search: { ...currentLeanSettings.search, ...(overrides.search ?? {}) },
    edit: { ...currentLeanSettings.edit, ...(overrides.edit ?? {}) },
    contextManagement: {
      ...currentLeanSettings.contextManagement,
      ...(overrides.contextManagement ?? {}),
    },
    declutter: {
      ...currentLeanSettings.declutter,
      ...(overrides.declutter ?? {}),
    },
    provider: {
      ...currentLeanSettings.provider,
      ...(overrides.provider ?? {}),
    },
    tui: {
      ...currentLeanSettings.tui,
      ...(overrides.tui ?? {}),
    },
  };
}

export function resetLeanAgentSettings(): void {
  currentLeanSettings = { ...DEFAULT_LEAN_AGENT_SETTINGS };
}

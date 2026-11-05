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

export interface LeanAgentSettings {
  readonly toolOutput: LeanToolOutputConfig;
  readonly testRunner: LeanTestRunnerConfig;
  readonly readFile: LeanReadFileConfig;
  readonly search: LeanSearchConfig;
  readonly edit: LeanEditConfig;
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
  };
}

export function resetLeanAgentSettings(): void {
  currentLeanSettings = { ...DEFAULT_LEAN_AGENT_SETTINGS };
}

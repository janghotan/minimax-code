import { test, expect, beforeEach } from 'vitest';
import {
  applyPinkToOrangeGradient,
  renderWaveformHeader,
} from '../packages/tui/src/tui/shell/lean-header.js';
import { formatUltraCompactToolLine } from '../packages/tui/src/tui/transcript/presentation/ultra-compact-tool.js';
import { formatCompactUnifiedDiff, formatGitCompactDiff } from '../packages/agent-tools/src/desktop/compact-diff.js';
import {
  recordEditCheckpoint,
  undoLastEdit,
  getEditCheckpointCount,
  clearEditCheckpoints,
} from '../packages/agent-tools/src/desktop/edit-checkpoint.js';
import {
  LeanCostTracker,
  loadPricingTable,
} from '../packages/tui/src/tui/shell/lean-cost-tracker.js';
import { getLeanAgentSettings, updateLeanAgentSettings, resetLeanAgentSettings } from '@mavis/config';
import { TUI_COMMAND_DESCRIPTORS } from '../packages/tui/src/application/command-descriptors.js';
import { createTuiCommandCatalog } from '../packages/tui/src/tui/commands/catalog.js';
import type { TranscriptCell } from '../packages/tui/src/tui/transcript/model.js';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

beforeEach(() => {
  resetLeanAgentSettings();
  clearEditCheckpoints();
});

test('waveform header: renders MiniMax logo with pink-to-orange ANSI gradient without placeholder', () => {
  const colored = renderWaveformHeader(50);
  expect(colored.length).toBeGreaterThan(0);
  // Must NOT contain placeholder 'yourname'
  expect(colored.some((l) => l.includes('yourname'))).toBe(false);

  // When colors are forced off, should contain uncolored text without ANSI escapes
  const plainGradient = applyPinkToOrangeGradient('test-text', false);
  expect(plainGradient).toBe('test-text');

  // When colors are forced on, should contain ANSI escape codes \x1b[38;2;...m
  const coloredGradient = applyPinkToOrangeGradient('test-text', true);
  expect(coloredGradient).toContain('\x1b[38;2;');
  expect(coloredGradient).toContain('\x1b[0m');
});

test('ultra-compact tool lines: formats edit, bash, read, and grep with emojis and color', () => {
  // 1. Edit tool with additions (green) and deletions (red)
  const editCell: TranscriptCell = {
    id: 'cell-1',
    kind: 'tool',
    title: 'edit_file',
    content: JSON.stringify({ file_path: 'src/index.ts' }),
    status: 'succeeded',
    structuredPreview: {
      schemaVersion: 1,
      state: 'applied',
      blocks: [
        {
          kind: 'diff',
          path: 'src/index.ts',
          diff: '@@ -1,2 +1,2 @@\n-old\n+new',
          addedLines: 23,
          removedLines: 2,
          truncated: false,
        },
      ],
    },
  };
  const editLine = formatUltraCompactToolLine(editCell);
  expect(editLine).toContain('✏️');
  expect(editLine).toContain('src/index.ts');
  expect(editLine).toContain('(+23)');
  expect(editLine).toContain('(-2)');
  // Additions green (\x1b[32m), deletions red (\x1b[31m)
  expect(editLine).toContain('\x1b[32m(+23)');
  expect(editLine).toContain('\x1b[31m(-2)');

  // 2. Bash tool succeeded vs failed
  const bashSuccessCell: TranscriptCell = {
    id: 'cell-2',
    kind: 'tool',
    title: 'bash',
    content: JSON.stringify({ command: 'npm test' }),
    status: 'succeeded',
    durationMs: 4200,
  };
  const bashPassLine = formatUltraCompactToolLine(bashSuccessCell);
  expect(bashPassLine).toContain('✅ $ npm test');
  expect(bashPassLine).toContain('4.2s');

  const bashFailCell: TranscriptCell = {
    id: 'cell-3',
    kind: 'tool',
    title: 'bash',
    content: JSON.stringify({ command: 'npm test' }),
    status: 'failed',
    durationMs: 1500,
  };
  const bashFailLine = formatUltraCompactToolLine(bashFailCell);
  expect(bashFailLine).toContain('❌ $ npm test');
  expect(bashFailLine).toContain('1.5s');

  // 3. Read tool
  const readCell: TranscriptCell = {
    id: 'cell-4',
    kind: 'tool',
    title: 'read_file',
    content: JSON.stringify({ file_path: 'src/api.ts', limit: 120 }),
    status: 'succeeded',
  };
  const readLine = formatUltraCompactToolLine(readCell);
  expect(readLine).toContain('📖 src/api.ts 120L');

  // 4. Grep tool
  const grepCell: TranscriptCell = {
    id: 'cell-5',
    kind: 'tool',
    title: 'grep',
    content: JSON.stringify({ pattern: 'foo' }),
    status: 'succeeded',
    detail: '14 matches found across 3 files',
  };
  const grepLine = formatUltraCompactToolLine(grepCell);
  expect(grepLine).toContain('🔍 grep "foo" 14 matches');
});

test('compact unified diff: generates changed hunks only with 2 lines of context', () => {
  const oldText = [
    'line 1',
    'line 2',
    'line 3',
    'line 4',
    'old content to change',
    'line 6',
    'line 7',
    'line 8',
    'line 9',
  ].join('\n');

  const newText = [
    'line 1',
    'line 2',
    'line 3',
    'line 4',
    'new content replaced',
    'line 6',
    'line 7',
    'line 8',
    'line 9',
  ].join('\n');

  const diff = formatCompactUnifiedDiff(oldText, newText, 'src/test.ts', 2);
  // Must start with @@ hunk header, not diff --git
  expect(diff.startsWith('@@')).toBe(true);
  expect(diff).not.toContain('diff --git');
  expect(diff).toContain('-old content to change');
  expect(diff).toContain('+new content replaced');

  // Context should only have 2 lines before (line 3, line 4) and 2 lines after (line 6, line 7)
  expect(diff).toContain(' line 3');
  expect(diff).toContain(' line 4');
  expect(diff).toContain(' line 6');
  expect(diff).toContain(' line 7');
  expect(diff).not.toContain(' line 1');
  expect(diff).not.toContain(' line 9');
});

test('edit checkpoint and undo: records file state and reverts cleanly', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'mcode-undo-test-'));
  const testFile = join(tempDir, 'sample.txt');

  writeFileSync(testFile, 'initial content before edit', 'utf8');
  expect(getEditCheckpointCount()).toBe(0);

  // 1. Record checkpoint before edit
  recordEditCheckpoint(testFile, 'initial content before edit');
  expect(getEditCheckpointCount()).toBe(1);

  // 2. Perform modification
  writeFileSync(testFile, 'modified content after edit', 'utf8');
  expect(readFileSync(testFile, 'utf8')).toBe('modified content after edit');

  // 3. Undo edit
  const undoResult = await undoLastEdit(tempDir);
  expect(undoResult.success).toBe(true);
  expect(undoResult.message).toContain('Reverted last edit');
  expect(readFileSync(testFile, 'utf8')).toBe('initial content before edit');
  expect(getEditCheckpointCount()).toBe(0);

  // 4. Undo when stack empty returns safe warning
  const emptyUndo = await undoLastEdit(tempDir);
  expect(emptyUndo.success).toBe(false);
  expect(emptyUndo.message).toContain('No edit checkpoint available');
});

test('cost tracker: computes CNY cost strictly with ¥ symbol from hit/miss/output counters', () => {
  const tracker = new LeanCostTracker();

  // Test DeepSeek official rates:
  // Hit: ¥0.50 / 1M tokens
  // Miss: ¥2.00 / 1M tokens
  // Output: ¥8.00 / 1M tokens
  tracker.recordUsage({
    model: 'deepseek-chat',
    promptTokens: 1_000_000,
    promptCacheHitTokens: 600_000,
    promptCacheMissTokens: 400_000,
    completionTokens: 100_000,
  });

  const cost = tracker.calculateCost('deepseek-chat');
  expect(cost.hasPrice).toBe(true);
  expect(cost.currency).toBe('CNY');
  // (600k * 0.50 + 400k * 2.00 + 100k * 8.00) / 1M = (0.30 + 0.80 + 0.80) = ¥1.90
  expect(cost.totalCny).toBeCloseTo(1.90, 4);

  // Persistent status line format: 🧠 used/limit (%) · 💰 ¥cost · 🔁 turn
  const statusLine = tracker.formatPersistentStatusLine(65536);
  expect(statusLine).toContain('🧠');
  expect(statusLine).toContain('💰 ¥1.900');
  expect(statusLine).toContain('🔁 1');
  expect(statusLine).not.toContain('$');
  expect(statusLine).not.toContain('USD');
  expect(statusLine).not.toContain('yen');

  // Cost breakdown for /cost explicitly prints "CNY" label
  const breakdown = tracker.formatCostBreakdown('deepseek-chat');
  expect(breakdown).toContain('Session Cost Breakdown (CNY)');
  expect(breakdown).toContain('Cache-hit input: 600,000 tokens');
  expect(breakdown).toContain('Cache-miss input: 400,000 tokens');
  expect(breakdown).toContain('Output tokens: 100,000 tokens');
  expect(breakdown).toContain('Cache-hit ratio: 60.0%');
  expect(breakdown).toContain('Total Cost: ¥1.9000 CNY');
});

test('cost tracker: unlisted model shows "no price" marker without guessing', () => {
  const tracker = new LeanCostTracker();
  tracker.recordUsage({
    model: 'unlisted-exotic-model',
    promptTokens: 50_000,
    completionTokens: 1_000,
  });

  const cost = tracker.calculateCost('unlisted-exotic-model');
  expect(cost.hasPrice).toBe(false);
  expect(cost.marker).toBe('no price');

  const statusLine = tracker.formatPersistentStatusLine(65536, 'unlisted-exotic-model');
  expect(statusLine).toContain('💰 no price');
  expect(statusLine).toContain('🧠');

  const breakdown = tracker.formatCostBreakdown('unlisted-exotic-model');
  expect(breakdown).toContain('Total Cost: no price (model unlisted in pricing.json)');
});

test('cost tracker: custom provider prefixes (e.g. custom_provider:gem/gemini-3-flash) match normalized models', () => {
  const tracker = new LeanCostTracker();
  tracker.recordUsage({
    model: 'custom_provider:gem/gemini-3-flash',
    promptTokens: 100_000,
    promptCacheHitTokens: 20_000,
    promptCacheMissTokens: 80_000,
    completionTokens: 10_000,
    contextWindow: 1_000_000,
  });

  const cost = tracker.calculateCost('custom_provider:gem/gemini-3-flash');
  expect(cost.hasPrice).toBe(true);
  expect(cost.currency).toBe('CNY');
  expect(cost.totalCny).toBeGreaterThan(0);

  const statusLine = tracker.formatPersistentStatusLine(1_000_000, 'custom_provider:gem/gemini-3-flash');
  expect(statusLine).toContain('💰 ¥');
  expect(statusLine).toContain('🧠 110k/1000k (11%)');
});

test('cost tracker: usage-missing fallback estimates from chars/4 and marks with ~', () => {
  const tracker = new LeanCostTracker();
  // Server omits usage (promptTokens undefined), provides 4,000 chars of text
  tracker.recordUsage({
    model: 'deepseek-chat',
    rawChars: 4000,
    completionTokens: 200,
  });

  expect(tracker.isEstimated).toBe(true);
  // 4000 chars / 4 = 1000 estimated prompt tokens
  expect(tracker.promptCacheMissTokens).toBe(1000);

  const statusLine = tracker.formatPersistentStatusLine(65536);
  // Must mark estimated number with ~
  expect(statusLine).toContain('~');
  expect(statusLine).toContain('🧠 ~1.2k/66k'); // 1000 prompt + 200 completion = 1200
  expect(statusLine).toContain('💰 ~¥');
});

test('slash commands: diff, test, undo, cost are properly declared in descriptors and catalog', () => {
  expect(TUI_COMMAND_DESCRIPTORS.diff).toBeDefined();
  expect(TUI_COMMAND_DESCRIPTORS.test).toBeDefined();
  expect(TUI_COMMAND_DESCRIPTORS.undo).toBeDefined();
  expect(TUI_COMMAND_DESCRIPTORS.cost).toBeDefined();

  const catalog = createTuiCommandCatalog(
    undefined,
    {
      diff: async () => {},
      test: async () => {},
      undo: async () => {},
      cost: async () => {},
    },
    () => ({
      hasSession: true,
      hasParentSession: false,
      managedTokenPresent: false,
      queueEnabled: true,
      hasLiveRun: false,
      queuedCount: 0,
      canRetry: false,
    }),
  );

  const commandNames = catalog.commands.map((c) => c.name);
  expect(commandNames).toContain('diff');
  expect(commandNames).toContain('test');
  expect(commandNames).toContain('undo');
  expect(commandNames).toContain('cost');
  expect(commandNames).toContain('compact');
});

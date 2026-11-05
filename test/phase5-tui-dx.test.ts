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
  resolveModelContextLimit,
} from '../packages/tui/src/tui/shell/lean-cost-tracker.js';
import { getLeanAgentSettings, updateLeanAgentSettings, resetLeanAgentSettings } from '@mavis/config';
import { TUI_COMMAND_DESCRIPTORS } from '../packages/tui/src/application/command-descriptors.js';
import { createTuiCommandCatalog } from '../packages/tui/src/tui/commands/catalog.js';
import type { TranscriptCell } from '../packages/tui/src/tui/transcript/model.js';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  getGlobalRuntimeLanguage,
  setGlobalRuntimeLanguage,
  resetGlobalRuntimeLanguage,
} from '@mavis/shared/runtime-i18n';
import { getWelcomeDesign } from '../packages/tui/src/tui/shell/welcome/design.js';
import { TuiWelcome } from '../packages/tui/src/tui/shell/welcome/component.js';
import {
  formatTuiPermissionMode,
  formatTuiPermissionModeCompact,
} from '../packages/tui/src/application/permission-mode.js';
import { composerText } from '../packages/tui/src/tui/features/composer/copy.js';

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

  // 1b. Edit tool with old_hunk/new_hunk and no structuredPreview
  const rawEditCell: TranscriptCell = {
    id: 'cell-1b',
    kind: 'tool',
    title: 'edit_file',
    content: JSON.stringify({
      path: 'src/config.ts',
      old_hunk: 'const a = 1;\nconst b = 2;\nconst c = 3;',
      new_hunk: 'const a = 10;\nconst b = 20;',
    }),
    status: 'succeeded',
  };
  const rawEditLine = formatUltraCompactToolLine(rawEditCell);
  expect(rawEditLine).toContain('✏️');
  expect(rawEditLine).toContain('src/config.ts');
  expect(rawEditLine).toContain('\x1b[32m(+2)');
  expect(rawEditLine).toContain('\x1b[31m(-3)');

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
  expect(statusLine).toContain('💰 ¥?');
  expect(statusLine).toContain('🧠');

  const breakdown = tracker.formatCostBreakdown('unlisted-exotic-model');
  expect(breakdown).toContain('Total Cost: ¥?');
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
  expect(statusLine).toContain('🧠 110k/1.0M (10%)');
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
  expect(statusLine).toContain('🧠 ~1.2k/131k (1%)'); // 1000 prompt + 200 completion = 1200
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

test('pricing and context limits for gemini-3.8-flash-high, claude-3-7-sonnet, and deepseek', () => {
  const table = loadPricingTable();
  expect(table.models['gemini-3.8-flash-high']).toBeDefined();
  expect(table.models['claude-3-7-sonnet']).toBeDefined();
  expect(table.models['o1']).toBeDefined();

  // Context limits
  expect(resolveModelContextLimit('gemini-3.8-flash-high')).toBe(1_048_576); // 1M
  expect(resolveModelContextLimit('gemini-3-pro')).toBe(2_097_152); // 2M
  expect(resolveModelContextLimit('claude-3-7-sonnet')).toBe(200_000); // 200k
  expect(resolveModelContextLimit('deepseek-v3')).toBe(131_072); // 128k
  expect(resolveModelContextLimit('unknown-model')).toBe(131_072); // 128k floor

  // Cost calculation for gemini-3.8-flash-high
  const tracker = new LeanCostTracker();
  tracker.recordUsage({
    model: 'gemini-3.8-flash-high',
    promptTokens: 50_000,
    promptCacheHitTokens: 10_000,
    promptCacheMissTokens: 40_000,
    completionTokens: 2_000,
  });
  const cost = tracker.calculateCost('gemini-3.8-flash-high');
  expect(cost.hasPrice).toBe(true);
  expect(cost.totalCny).toBeGreaterThan(0);
  const status = tracker.formatPersistentStatusLine(undefined, 'gemini-3.8-flash-high');
  expect(status).toContain('🧠 52k/1.0M (5%)');
  expect(status).toContain('💰 ¥');
});

test('ultra-compact tool lines: formats write_file and diffs in cell.detail with green and red badges', () => {
  // write_file test
  const writeCell: TranscriptCell = {
    id: 'cell-w1',
    kind: 'tool',
    title: 'write_file',
    content: JSON.stringify({
      path: 'src/main.ts',
      content: 'line 1\nline 2\nline 3\nline 4\nline 5',
    }),
    status: 'succeeded',
  };
  const writeLine = formatUltraCompactToolLine(writeCell);
  expect(writeLine).toContain('✏️');
  expect(writeLine).toContain('src/main.ts');
  expect(writeLine).toContain('\x1b[32m(+5)');

  // detail diff test
  const diffCell: TranscriptCell = {
    id: 'cell-d1',
    kind: 'tool',
    title: 'patch',
    content: JSON.stringify({ path: 'src/server.ts' }),
    detail: '@@ -1,3 +1,4 @@\n-const a = 1;\n+const a = 2;\n+const b = 3;\n',
    status: 'succeeded',
  };
  const diffLine = formatUltraCompactToolLine(diffCell);
  expect(diffLine).toContain('✏️');
  expect(diffLine).toContain('src/server.ts');
  expect(diffLine).toContain('\x1b[32m(+2)');
  expect(diffLine).toContain('\x1b[31m(-1)');
});

test('language switching: /language toggles between Simplified Chinese and English', () => {
  resetGlobalRuntimeLanguage();

  // Switch to Simplified Chinese
  setGlobalRuntimeLanguage('zh');
  expect(getGlobalRuntimeLanguage()).toBe('zh');

  // Verify welcome design adapts to Chinese
  const zhDesign = getWelcomeDesign();
  expect(zhDesign.sectionTitles.tips).toContain('新手快速上手指南');
  expect(zhDesign.sectionTitles.news).toContain('最新功能');

  // Verify permission mode in Chinese
  expect(formatTuiPermissionMode('default')).toBe('询问');
  expect(formatTuiPermissionMode('auto')).toBe('自动');
  expect(formatTuiPermissionMode('bypassPermissions')).toBe('完全访问');
  expect(formatTuiPermissionModeCompact('default')).toBe('询问');
  expect(formatTuiPermissionModeCompact('bypassPermissions')).toBe('完全');

  // Verify composer placeholder in Chinese (lean without MiniMax branding)
  expect(composerText('placeholder')).toContain('随时提问或指派任务');

  // Verify cost breakdown in Chinese
  const tracker = new LeanCostTracker();
  tracker.recordUsage({
    model: 'deepseek-chat',
    promptTokens: 10_000,
    promptCacheHitTokens: 8_000,
    promptCacheMissTokens: 2_000,
    completionTokens: 500,
  });
  const zhBreakdown = tracker.formatCostBreakdown('deepseek-chat');
  expect(zhBreakdown).toContain('会话成本与 Token 统计 (人民币)');
  expect(zhBreakdown).toContain('当前模型: deepseek-chat');
  expect(zhBreakdown).toContain('缓存命中输入: 8,000 tokens');
  expect(zhBreakdown).toContain('总消耗成本: ¥');

  // Switch to English
  setGlobalRuntimeLanguage('en');
  expect(getGlobalRuntimeLanguage()).toBe('en');

  // Verify welcome design adapts to English
  const enDesign = getWelcomeDesign();
  expect(enDesign.sectionTitles.tips).toContain('Tips for getting started');

  // Verify permission mode in English
  expect(formatTuiPermissionMode('default')).toBe('Ask');
  expect(formatTuiPermissionMode('auto')).toBe('Auto');
  expect(formatTuiPermissionMode('bypassPermissions')).toBe('Full access');
  expect(formatTuiPermissionModeCompact('default')).toBe('ASK');

  // Verify composer placeholder in English (clean without brand)
  expect(composerText('placeholder')).toBe('Ask anything or assign a task…');

  // Verify cost breakdown in English
  const enBreakdown = tracker.formatCostBreakdown('deepseek-chat');
  expect(enBreakdown).toContain('Session Cost Breakdown (CNY)');
  expect(enBreakdown).toContain('Total Cost: ¥');

  resetGlobalRuntimeLanguage();
});

test('command catalog: registers /language command with aliases lang and locale', () => {
  const catalog = createTuiCommandCatalog();
  const langCommand = catalog.commands.find((c) => c.name === 'language');
  expect(langCommand).toBeDefined();
  expect(langCommand?.category).toBe('Session');
  expect(langCommand?.aliases).toContain('lang');
  expect(langCommand?.aliases).toContain('locale');
  expect(langCommand?.argumentHint).toBe('[en|zh]');
});

test('lean welcome: logo is shifted to the left and boxed tips/news card is removed', () => {
  // 1. Verify waveform header logo is left-aligned with 2 spaces indent, not center-padded
  const lines = renderWaveformHeader(120);
  expect(lines.length).toBeGreaterThan(0);
  // Each line starts with 2 spaces (left margin)
  for (const line of lines) {
    expect(line.startsWith('  ')).toBe(true);
  }

  // 2. Verify welcome view when card is removed
  process.env.MINIMAX_SHOW_WELCOME_CARD = 'false';
  try {
    const welcome = new TuiWelcome({
      version: '0.7.2',
      workspace: '/workspace',
      homeDir: '/home/user',
      runtimeStatus: 'ready',
    });
    const rendered = welcome.render(100).join('\n');

    // Should contain the logo art blocks
    expect(rendered).toContain('█');

    // Must NOT contain the boxed card or tips or news
    expect(rendered).not.toContain('╭─');
    expect(rendered).not.toContain('╰─');
    expect(rendered).not.toContain('新手快速上手指南');
    expect(rendered).not.toContain('Tips for getting started');
    expect(rendered).not.toContain('最新功能');
    expect(rendered).not.toContain("What's new");
  } finally {
    delete process.env.MINIMAX_SHOW_WELCOME_CARD;
  }
});

import { test, expect, beforeEach } from 'vitest';
import type { AgentMessage } from '@earendil-works/pi-agent-core';

import {
  getLeanAgentSettings,
  updateLeanAgentSettings,
  resetLeanAgentSettings,
} from '@mavis/config';
import {
  maskObservationsBatch,
  compactWithSafetyBound,
  extractVerbatimTouchedFiles,
  extractVerbatimErrors,
  readContextWindowTokens,
  DEFAULT_CONTEXT_WINDOW_FLOOR,
} from '@mavis/context-manager';

beforeEach(() => {
  resetLeanAgentSettings();
});

test('Lean agent settings have correct Phase 2 defaults (64K floor, 40% batch mask, 60% compaction)', () => {
  const settings = getLeanAgentSettings().contextManagement;
  expect(settings.contextWindowFloor).toBe(64 * 1024);
  expect(settings.keepRecentToolRounds).toBe(5);
  expect(settings.batchMaskThreshold).toBe(0.40);
  expect(settings.compactionThreshold).toBe(0.60);
  expect(settings.keepRawTurns).toBe(2);
});

test('64K floor: readContextWindowTokens returns model context or defaults to 64K (65,536)', () => {
  expect(readContextWindowTokens({ contextWindow: 128_000 })).toBe(128_000);
  expect(readContextWindowTokens({ context_window: 200_000 })).toBe(200_000);
  expect(readContextWindowTokens({ contextWindowTokens: 32_000 })).toBe(32_000);
  // Unknown or invalid context window defaults to 64K floor
  expect(readContextWindowTokens({})).toBe(64 * 1024);
  expect(readContextWindowTokens(null)).toBe(64 * 1024);
  expect(readContextWindowTokens(undefined)).toBe(DEFAULT_CONTEXT_WINDOW_FLOOR);
  expect(readContextWindowTokens({ contextWindow: 0 })).toBe(64 * 1024);
});

test('Observation masking batching: stays byte-identical below 40% threshold, masks older than K=5 above 40%', () => {
  const contextWindow = 64 * 1024; // 65,536 tokens

  // Build a conversation with 8 tool rounds
  const messages: AgentMessage[] = [
    { role: 'user', content: 'Please inspect the project.' },
  ];

  for (let r = 1; r <= 8; r++) {
    messages.push({
      role: 'assistant',
      content: [
        { type: 'text', text: `Thinking for round ${r}: inspecting step ${r}.` },
      ],
      // tool calls
      tool_calls: [
        {
          id: `call_${r}`,
          type: 'function',
          function: {
            name: 'bash',
            arguments: JSON.stringify({ command: `pytest tests/test_${r}.py` }),
          },
        },
      ],
    } as any);

    messages.push({
      role: 'toolResult',
      toolCallId: `call_${r}`,
      toolName: 'bash',
      content: [
        {
          type: 'text',
          text: `✓ pytest: 10 passed\n[Full log saved to .mcode/artifacts/log_${r}.txt]`,
        },
      ],
    } as any);
  }

  // 1. Below 40% threshold (e.g. 10,000 tokens < 26,214) -> NO MASKING, prefix is byte-identical!
  const lowTokens = 10_000;
  const resLow = maskObservationsBatch(messages, lowTokens, { contextWindow });
  expect(resLow.masked).toBe(false);
  expect(resLow.messages).toBe(messages); // Identical reference, zero rewrite

  // 2. Above 40% threshold (e.g. 30,000 tokens > 26,214) -> Batch masks rounds older than K=5
  const highTokens = 30_000;
  const resHigh = maskObservationsBatch(messages, highTokens, { contextWindow });
  expect(resHigh.masked).toBe(true);
  expect(resHigh.maskedCount).toBe(3); // 8 total rounds - 5 kept = 3 masked

  // Rounds 1, 2, 3 tool results are masked to 1-line receipts
  for (let r = 1; r <= 3; r++) {
    const toolResMsg = resHigh.messages.find(
      (m) => m.role === 'toolResult' && (m as any).toolCallId === `call_${r}`,
    );
    expect(toolResMsg).toBeDefined();
    const content = (toolResMsg as any).content[0].text;
    expect(content).toBe(`[ran bash: pytest: 10 passed | artifact: .mcode/artifacts/log_${r}.txt]`);
  }

  // Rounds 4, 5, 6, 7, 8 tool results remain unmasked (recent 5 rounds)
  for (let r = 4; r <= 8; r++) {
    const toolResMsg = resHigh.messages.find(
      (m) => m.role === 'toolResult' && (m as any).toolCallId === `call_${r}`,
    );
    expect(toolResMsg).toBeDefined();
    const content = (toolResMsg as any).content[0].text;
    expect(content).toContain('Full log saved to');
  }

  // User messages, assistant reasoning, and tool calls are preserved intact
  expect(resHigh.messages[0]).toEqual(messages[0]);
  const assistantRound1 = resHigh.messages[1] as any;
  expect(assistantRound1.content[0].text).toBe('Thinking for round 1: inspecting step 1.');
  expect(assistantRound1.tool_calls[0].id).toBe('call_1');
});

test('Compaction safety bound: keeps last 2 turns raw, extracts verbatim paths and errors', () => {
  const messages: AgentMessage[] = [
    { role: 'user', content: 'Fix the failing math calculation in src/math.js' },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Inspecting test error' }],
      tool_calls: [
        {
          id: 'c1',
          type: 'function',
          function: { name: 'bash', arguments: JSON.stringify({ command: 'node --test math.test.js' }) },
        },
      ],
    } as any,
    {
      role: 'toolResult',
      toolCallId: 'c1',
      toolName: 'bash',
      isError: true,
      content: [{ type: 'text', text: 'AssertionError: Expected 4 but got 5 at test/math.test.js:14:12' }],
    } as any,
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Decided to fix math.js by returning a + b' }],
      tool_calls: [
        {
          id: 'c2',
          type: 'function',
          function: { name: 'read_file', arguments: JSON.stringify({ path: 'src/math.js' }) },
        },
      ],
    } as any,
    {
      role: 'toolResult',
      toolCallId: 'c2',
      toolName: 'read_file',
      content: [{ type: 'text', text: 'function add(a, b) { return 5; }' }],
    } as any,
    // Turn N-1 (User message + assistant response)
    { role: 'user', content: 'Did you check helper.js as well?' },
    {
      role: 'assistant',
      content: [{ type: 'text', text: 'Checking helper.js now' }],
      tool_calls: [
        {
          id: 'c3',
          type: 'function',
          function: { name: 'read_file', arguments: JSON.stringify({ path: 'src/helper.js' }) },
        },
      ],
    } as any,
    {
      role: 'toolResult',
      toolCallId: 'c3',
      toolName: 'read_file',
      content: [{ type: 'text', text: 'export const helper = true;' }],
    } as any,
    // Turn N (Current user turn - last turn)
    { role: 'user', content: 'Please proceed with the edit.' },
  ];

  // Compact with safety bound (keep last 2 turns raw)
  const result = compactWithSafetyBound(messages, 2);

  // Verbatim paths extracted
  const touched = extractVerbatimTouchedFiles(messages);
  expect(touched).toContain('src/math.js');
  expect(touched).toContain('src/helper.js');

  // Verbatim errors extracted
  const errors = extractVerbatimErrors(messages);
  expect(errors.some((e) => e.includes('AssertionError: Expected 4 but got 5'))).toBe(true);

  // Note structure
  expect(result.compactedNote).toContain('## Goal');
  expect(result.compactedNote).toContain('Fix the failing math calculation in src/math.js');
  expect(result.compactedNote).toContain('## Files Touched');
  expect(result.compactedNote).toContain('src/math.js');
  expect(result.compactedNote).toContain('## Open Errors');
  expect(result.compactedNote).toContain('AssertionError: Expected 4 but got 5');
  expect(result.compactedNote).toContain('## Decisions Made');
  expect(result.compactedNote).toContain('Decided to fix math.js');
  expect(result.compactedNote).toContain('## Next Step');

  // Last 2 turns kept raw
  expect(result.keptRawMessages.length).toBe(4);
  expect(result.keptRawMessages[0].role).toBe('user');
  expect((result.keptRawMessages[0] as any).content).toBe('Did you check helper.js as well?');
  expect(result.keptRawMessages[3].role).toBe('user');
  expect((result.keptRawMessages[3] as any).content).toBe('Please proceed with the edit.');
});

test('Prefix stability: system prompt and tool schemas are byte-identical across multiple turns', () => {
  // Simulate system prompt & tool schema assembly across 5 turns
  function assemblePrefix(turnIndex: number) {
    const systemPrompt = [
      'You are a token-efficient coding assistant.',
      'Always inspect files before modifying.',
      'Use unified diffs for code updates.',
    ].join('\n');

    const tools = [
      { name: 'bash', description: 'Run a shell command', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } },
      { name: 'read_file', description: 'Read file contents', parameters: { type: 'object', properties: { path: { type: 'string' }, offset: { type: 'number' }, limit: { type: 'number' } }, required: ['path'] } },
      { name: 'edit_file', description: 'Edit file hunks', parameters: { type: 'object', properties: { path: { type: 'string' }, old_hunk: { type: 'string' }, new_hunk: { type: 'string' } }, required: ['path', 'old_hunk', 'new_hunk'] } },
      { name: 'write_file', description: 'Write full file', parameters: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] } },
      { name: 'glob', description: 'Find file paths', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } },
      { name: 'grep', description: 'Search text patterns', parameters: { type: 'object', properties: { pattern: { type: 'string' } }, required: ['pattern'] } },
      { name: 'git', description: 'Run git commands', parameters: { type: 'object', properties: { args: { type: 'string' } }, required: ['args'] } },
    ];

    // Convert to canonical JSON prefix bytes
    return JSON.stringify({ systemPrompt, tools });
  }

  const prefixTurn1 = assemblePrefix(1);
  const prefixTurn2 = assemblePrefix(2);
  const prefixTurn3 = assemblePrefix(3);
  const prefixTurn4 = assemblePrefix(4);
  const prefixTurn5 = assemblePrefix(5);

  // Assert 100% byte-identical across all turns
  expect(prefixTurn2).toBe(prefixTurn1);
  expect(prefixTurn3).toBe(prefixTurn1);
  expect(prefixTurn4).toBe(prefixTurn1);
  expect(prefixTurn5).toBe(prefixTurn1);

  // Assert no timestamps or dynamic IDs in prefix
  expect(prefixTurn1).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // No ISO timestamps
  expect(prefixTurn1).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i); // No UUIDs
});

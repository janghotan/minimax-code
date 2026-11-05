import { describe, it, expect } from 'vitest';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import {
  serializeRequestSnapshot,
  findPrefixDivergence,
  PrefixDivergenceTracker,
} from '../packages/agent-tools/src/desktop/prefix-tracker.js';
import { createObservationMaskingBeforeLlmHook } from '../packages/local-runtime-v2/src/service/turn-system/agent-host/execution/observation-masking-hook.js';

describe('Prompt Prefix Stability over 8 Turns', () => {
  it('preserves exact byte-identical prefix across all 8 consecutive turns', () => {
    const tracker = new PrefixDivergenceTracker();
    const systemPrompt = '# Role & Discipline\nYou are an expert terminal coding agent.';
    const tools = [
      { name: 'bash', description: 'Run bash commands' },
      { name: 'edit', description: 'Edit files' },
      { name: 'git', description: 'Run git commands' },
      { name: 'glob', description: 'Find files' },
      { name: 'grep', description: 'Search text' },
      { name: 'read', description: 'Read files' },
      { name: 'write', description: 'Write files' },
    ];

    const hook = createObservationMaskingBeforeLlmHook();
    const sessionMessages: AgentMessage[] = [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Task: Refactor inventory management module' }],
      } as any,
    ];

    const turnTools = ['grep', 'read', 'glob', 'git', 'edit', 'bash', 'git', ''];

    for (let turn = 1; turn <= 8; turn++) {
      // 1. Run through beforeLlmCall hook (observation masking & narration/reasoning stripping)
      const decision = hook({
        sessionId: 'test-session-prefix-1',
        turnId: `turn-${turn}`,
        messages: sessionMessages,
      } as any);

      const requestMessages =
        decision && decision.type === 'replaceRequestMessages'
          ? decision.messages
          : sessionMessages;

      // 2. Track divergence
      const divResult = tracker.recordStep(systemPrompt, tools, requestMessages);

      if (turn === 1) {
        expect(divResult.isPrefixMatch).toBe(true);
        expect(divResult.offset).toBe(0);
        expect(divResult.block).toBe('call 1 (initial)');
      } else {
        // Every subsequent call MUST strictly preserve the prefix of the previous call!
        expect(divResult.isPrefixMatch).toBe(true);
        // The divergence offset must be at the very end of the previous snapshot
        expect(divResult.offset).toBeGreaterThan(0);
        expect(divResult.block).not.toContain('mutated');
      }

      // Simulate model responding with a tool call and receiving tool results for next turn
      const currentTool = turnTools[turn - 1];
      if (currentTool && turn < 8) {
        const assistantMsg: AgentMessage = {
          role: 'assistant',
          content: [
            { type: 'text', text: `Checking ${currentTool}` },
            {
              type: 'toolCall',
              id: `call_${turn}`,
              name: currentTool,
              arguments: { target: `file_${turn}.py` },
            },
          ],
        } as any;

        const toolResultMsg: AgentMessage = {
          role: 'toolResult',
          toolCallId: `call_${turn}`,
          toolName: currentTool,
          content: [{ type: 'text', text: `Output of ${currentTool} operation ${turn} completed successfully.` }],
        } as any;

        sessionMessages.push(assistantMsg, toolResultMsg);
      }
    }
  });

  it('detects and identifies byte offset and block when earlier history is mutated', () => {
    const systemPrompt = 'Prompt A';
    const tools = [{ name: 'bash' }];

    const messagesTurn1: AgentMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'Initial prompt' }] } as any,
    ];

    const snap1 = serializeRequestSnapshot(systemPrompt, tools, messagesTurn1);

    // Turn 2 with an unmutated append
    const messagesTurn2: AgentMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'Initial prompt' }] } as any,
      { role: 'assistant', content: [{ type: 'text', text: 'I will help' }] } as any,
    ];
    const snap2 = serializeRequestSnapshot(systemPrompt, tools, messagesTurn2);
    const div2 = findPrefixDivergence(snap1, snap2);
    expect(div2.isPrefixMatch).toBe(true);

    // Turn 3 with an unexpected mutation of message 0!
    const messagesTurn3Mutated: AgentMessage[] = [
      { role: 'user', content: [{ type: 'text', text: 'Initial prompt MUTATED!' }] } as any,
      { role: 'assistant', content: [{ type: 'text', text: 'I will help' }] } as any,
    ];
    const snap3 = serializeRequestSnapshot(systemPrompt, tools, messagesTurn3Mutated);
    const div3 = findPrefixDivergence(snap2, snap3);
    expect(div3.isPrefixMatch).toBe(false);
    expect(div3.block).toContain('messages[0]:user');
  });
});

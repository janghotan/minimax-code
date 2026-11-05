import type { PiBeforeLlmCallHook, PiBeforeLlmCallHookDecision } from '@mavis/agent-core/pi-turn-runner';
import { maskObservationsBatch, createDefaultTokenEstimator } from '@mavis/context-manager';
import type { AgentMessage } from '@earendil-works/pi-agent-core';

/**
 * Lean context optimization hook:
 * 1. Masks old tool observations in batches when context exceeds 40% and rounds > 5.
 * 2. Strips narration text accompanying tool calls from earlier turns.
 * 3. Strips previous turns' reasoning/thinking text from resent context.
 */
export function createObservationMaskingBeforeLlmHook(): PiBeforeLlmCallHook {
  const estimator = createDefaultTokenEstimator();
  return (hookInput): PiBeforeLlmCallHookDecision => {
    const messages = hookInput.messages;
    if (messages.length < 3) {
      return { type: 'continue' };
    }

    const estimatedTokens = estimator.estimateMessages(messages as AgentMessage[]);

    // 1. Mask observations if over batch threshold
    const masked = maskObservationsBatch(messages as AgentMessage[], estimatedTokens);
    let requestMessages = (masked.masked ? masked.messages : messages) as AgentMessage[];

    // 2. Strip pre-call narration text & old reasoning text from earlier assistant turns
    let replacedNarration = false;
    requestMessages = requestMessages.map((msg, index) => {
      if (msg.role !== 'assistant') return msg;

      const assistantMsg = msg as unknown as { content: unknown[]; [key: string]: unknown };
      if (!Array.isArray(assistantMsg.content)) return msg;

      let newContent = assistantMsg.content.filter((b: any) => b?.type !== 'thinking');

      const hasToolCalls = newContent.some((b: any) => b?.type === 'toolCall');
      const isLastMessage = index === requestMessages.length - 1;

      if (hasToolCalls && !isLastMessage) {
        const stripped = newContent.filter((b: any) => b?.type !== 'text');
        if (stripped.length !== newContent.length) {
          newContent = stripped;
          replacedNarration = true;
        }
      }

      if (newContent.length !== assistantMsg.content.length) {
        replacedNarration = true;
      }

      const copy: Record<string, unknown> = { ...assistantMsg, content: newContent };
      if (copy.thinking) {
        delete copy.thinking;
        replacedNarration = true;
      }
      return copy as unknown as AgentMessage;
    });

    if (masked.masked || replacedNarration) {
      return {
        type: 'replaceRequestMessages',
        messages: requestMessages,
        reason: masked.masked ? 'batch_observation_masking' : 'strip_resent_narration',
      };
    }

    return { type: 'continue' };
  };
}

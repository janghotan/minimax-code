import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { getLeanAgentSettings } from '@mavis/config';

export interface MaskingResult {
  readonly masked: boolean;
  readonly messages: readonly AgentMessage[];
  readonly maskedCount: number;
}

export interface ObservationMaskingOptions {
  readonly keepRecentRounds?: number;
  readonly batchMaskThreshold?: number;
  readonly contextWindow?: number;
}

/**
 * Extracts a compact 1-line summary and any artifact path from tool result text.
 */
export function extractToolResultReceipt(toolName: string, text: string, toolArgs?: unknown): string {
  let artifactPath = '';
  const artifactMatch = text.match(/\.mcode\/artifacts\/[^\s\)\],]+/);
  if (artifactMatch) {
    artifactPath = artifactMatch[0];
  }

  const name = toolName.toLowerCase();
  let summary = '';

  if (text.startsWith('✓ pytest:')) {
    summary = text.split('\n')[0]?.replace('✓ ', '') ?? 'pytest: passed';
  } else if (text.startsWith('✓ jest:')) {
    summary = text.split('\n')[0]?.replace('✓ ', '') ?? 'jest: passed';
  } else if (text.startsWith('❌')) {
    summary = text.split('\n')[0]?.replace('❌ ', '') ?? `${name} failed`;
  } else if (name === 'read' || name === 'read_file') {
    const linesMatch = text.match(/lines \d+-\d+ of \d+/i);
    const filePath = typeof toolArgs === 'object' && toolArgs !== null
      ? (Reflect.get(toolArgs, 'path') ?? Reflect.get(toolArgs, 'file_path'))
      : undefined;
    summary = `${filePath ? String(filePath).split('/').pop() : 'file'} (${linesMatch ? linesMatch[0] : 'read completed'})`;
  } else if (name === 'grep') {
    const matchCount = text.match(/(\d+) matches/i);
    summary = matchCount ? `${matchCount[1]} matches` : 'grep completed';
  } else if (name === 'glob') {
    const matchCount = text.match(/(\d+) matching paths/i);
    summary = matchCount ? `${matchCount[1]} paths` : 'glob completed';
  } else if (name === 'edit' || name === 'edit_file') {
    summary = 'edit applied';
  } else if (name === 'bash') {
    const firstLine = text.trim().split('\n')[0] ?? '';
    summary = firstLine.length > 50 ? `${firstLine.slice(0, 47)}...` : (firstLine || 'command completed');
  } else {
    const firstLine = text.trim().split('\n')[0] ?? '';
    summary = firstLine.length > 50 ? `${firstLine.slice(0, 47)}...` : (firstLine || 'completed');
  }

  // Sanitize single line
  summary = summary.replace(/[\r\n]+/g, ' ').trim();

  if (artifactPath) {
    return `[ran ${name}: ${summary} | artifact: ${artifactPath}]`;
  }
  return `[ran ${name}: ${summary}]`;
}

/**
 * Cache-aware observation masking:
 * Only executes in batches when context exceeds batchMaskThreshold (default: 40%).
 * Masks tool results older than keepRecentRounds (default: 5) into one-line receipts.
 * Keeps user messages, assistant tool calls, and reasoning 100% intact.
 */
export function maskObservationsBatch(
  messages: readonly AgentMessage[],
  contextTokens: number,
  options: ObservationMaskingOptions = {},
): MaskingResult {
  const settings = getLeanAgentSettings().contextManagement;
  const keepRecentRounds = options.keepRecentRounds ?? settings.keepRecentToolRounds ?? 5;
  const batchMaskThreshold = options.batchMaskThreshold ?? settings.batchMaskThreshold ?? 0.40;
  const contextWindow = options.contextWindow ?? settings.contextWindowFloor ?? (64 * 1024);

  // 1. Prefix-cache protection: Do not touch prefix if below batch threshold
  if (contextTokens < contextWindow * batchMaskThreshold) {
    return {
      masked: false,
      messages,
      maskedCount: 0,
    };
  }

  // 2. Identify tool rounds: an assistant message with tool calls followed by tool results
  interface DetectedRound {
    assistantIndex: number;
    toolCallIds: string[];
    toolCalls: Array<{ id: string; name: string; args: unknown }>;
    resultIndexes: number[];
  }

  const rounds: DetectedRound[] = [];
  let currentRound: DetectedRound | null = null;

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg) continue;

    if (msg.role === 'assistant') {
      const toolCalls = Reflect.get(msg, 'tool_calls') ?? Reflect.get(msg, 'toolCalls');
      if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        currentRound = {
          assistantIndex: i,
          toolCallIds: toolCalls.map((tc) => tc.id),
          toolCalls: toolCalls.map((tc) => ({
            id: tc.id,
            name: tc.function?.name ?? tc.name ?? 'tool',
            args: typeof tc.function?.arguments === 'string'
              ? safeParseJson(tc.function.arguments)
              : tc.arguments ?? tc.function?.arguments,
          })),
          resultIndexes: [],
        };
        rounds.push(currentRound);
      }
    } else if (msg.role === 'toolResult' || (msg as { role: string }).role === 'tool') {
      if (currentRound) {
        currentRound.resultIndexes.push(i);
      }
    }
  }

  if (rounds.length <= keepRecentRounds) {
    return {
      masked: false,
      messages,
      maskedCount: 0,
    };
  }

  // Rounds to mask are all except the last keepRecentRounds
  const roundsToMask = rounds.slice(0, rounds.length - keepRecentRounds);
  const resultIndexesToMask = new Set<number>();
  const toolCallByResultIndex = new Map<number, { name: string; args: unknown }>();

  for (const r of roundsToMask) {
    for (const rIndex of r.resultIndexes) {
      resultIndexesToMask.add(rIndex);
      const resMsg = messages[rIndex];
      const callId = Reflect.get(resMsg ?? {}, 'toolCallId') ?? Reflect.get(resMsg ?? {}, 'tool_call_id');
      const foundCall = r.toolCalls.find((c) => c.id === callId) ?? r.toolCalls[0];
      if (foundCall) {
        toolCallByResultIndex.set(rIndex, { name: foundCall.name, args: foundCall.args });
      }
    }
  }

  if (resultIndexesToMask.size === 0) {
    return {
      masked: false,
      messages,
      maskedCount: 0,
    };
  }

  let maskedCount = 0;
  const newMessages: AgentMessage[] = messages.map((msg, index) => {
    if (!resultIndexesToMask.has(index)) return msg;

    // Never mask user messages or assistant messages
    if (msg.role !== 'toolResult' && (msg as { role: string }).role !== 'tool') return msg;

    const existingText = extractMessageText(msg);
    // If already masked with [ran ...], don't double mask
    if (existingText.startsWith('[ran ') && existingText.endsWith(']')) {
      return msg;
    }

    const toolInfo = toolCallByResultIndex.get(index);
    const toolName = Reflect.get(msg, 'toolName') ?? toolInfo?.name ?? 'tool';
    const receipt = extractToolResultReceipt(toolName, existingText, toolInfo?.args);

    maskedCount++;
    return {
      ...(msg as any),
      content: [{ type: 'text' as const, text: receipt }],
    } as AgentMessage;
  });

  return {
    masked: maskedCount > 0,
    messages: newMessages,
    maskedCount,
  };
}

function safeParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function extractMessageText(message: AgentMessage): string {
  const content = Reflect.get(message, 'content');
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => (typeof block === 'string' ? block : block.text || ''))
      .join('\n');
  }
  return '';
}

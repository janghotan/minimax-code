import type { AgentMessage } from '@earendil-works/pi-agent-core';

export interface StructuredCompactionNote {
  readonly goal: string;
  readonly filesTouched: readonly string[];
  readonly decisionsMade: readonly string[];
  readonly openErrors: readonly string[];
  readonly nextStep: string;
}

/**
 * Extracts verbatim file paths touched by tool calls.
 * Never paraphrases paths.
 */
export function extractVerbatimTouchedFiles(messages: readonly AgentMessage[]): string[] {
  const files = new Set<string>();

  for (const message of messages) {
    if (message.role === 'assistant') {
      const toolCalls = Reflect.get(message, 'tool_calls') ?? Reflect.get(message, 'toolCalls');
      if (Array.isArray(toolCalls)) {
        for (const tc of toolCalls) {
          const args = typeof tc.function?.arguments === 'string'
            ? safeParseJson(tc.function.arguments)
            : tc.arguments ?? tc.function?.arguments;

          if (args && typeof args === 'object') {
            for (const key of ['path', 'file_path', 'filePath', 'file'] as const) {
              const val = Reflect.get(args, key);
              if (typeof val === 'string' && val.trim()) {
                files.add(val.trim());
              }
            }
          }
        }
      }
    }
  }

  return [...files];
}

/**
 * Extracts verbatim open errors from tool results.
 * Never paraphrases error text.
 */
export function extractVerbatimErrors(messages: readonly AgentMessage[]): string[] {
  const errors: string[] = [];

  for (const message of messages) {
    if (message.role === 'toolResult') {
      const isError = Reflect.get(message, 'isError') === true;
      const text = extractMessageText(message);
      if (isError || text.includes('AssertionError') || text.includes('Error:') || text.includes('FAIL')) {
        const lines = text.split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && (
            line.includes('Error') ||
            line.includes('FAIL') ||
            line.includes('assertion') ||
            line.includes('failed')
          ));
        if (lines.length > 0) {
          // Take first 3 error lines verbatim to avoid blowing up note size
          errors.push(lines.slice(0, 3).join(' | '));
        } else if (text.trim()) {
          errors.push(text.trim().slice(0, 200));
        }
      }
    }
  }

  return errors;
}

/**
 * Builds a structured compaction note from past turns.
 * Strictly adheres to verbatim paths and verbatim errors.
 */
export function buildCompactionNote(input: {
  readonly goal: string;
  readonly filesTouched: readonly string[];
  readonly decisionsMade: readonly string[];
  readonly openErrors: readonly string[];
  readonly nextStep: string;
}): string {
  const filesSection = input.filesTouched.length > 0
    ? input.filesTouched.map((f) => `- ${f}`).join('\n')
    : '(none)';

  const decisionsSection = input.decisionsMade.length > 0
    ? input.decisionsMade.map((d) => `- ${d}`).join('\n')
    : '(none)';

  const errorsSection = input.openErrors.length > 0
    ? input.openErrors.map((e) => `- ${e}`).join('\n')
    : '(none)';

  return [
    '## Goal',
    input.goal || '(none)',
    '',
    '## Files Touched',
    filesSection,
    '',
    '## Decisions Made',
    decisionsSection,
    '',
    '## Open Errors',
    errorsSection,
    '',
    '## Next Step',
    input.nextStep || '(none)',
  ].join('\n');
}

/**
 * Summarizes messages older than the last N turns (default: 2) into a structured note,
 * keeping the last N turns raw and verbatim.
 */
export function compactWithSafetyBound(
  messages: readonly AgentMessage[],
  keepRawTurns = 2,
): {
  readonly compactedNote: string;
  readonly keptRawMessages: readonly AgentMessage[];
  readonly replacementMessages: AgentMessage[];
} {
  if (messages.length <= keepRawTurns * 2) {
    return {
      compactedNote: '',
      keptRawMessages: messages,
      replacementMessages: [...messages],
    };
  }

  // Count user turns from the end
  let userCount = 0;
  let cutIndex = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'user') {
      userCount++;
      if (userCount === keepRawTurns) {
        cutIndex = i;
        break;
      }
    }
  }

  const olderMessages = messages.slice(0, cutIndex);
  const keptRawMessages = messages.slice(cutIndex);

  // Extract goal from first user messages
  const userMessages = olderMessages.filter((m) => m.role === 'user');
  const firstUser = userMessages[0];
  const goal = firstUser ? extractMessageText(firstUser).slice(0, 300).trim() : 'Active coding task';

  // Extract verbatim files and errors
  const filesTouched = extractVerbatimTouchedFiles(olderMessages);
  const openErrors = extractVerbatimErrors(olderMessages);

  // Extract decisions
  const decisionsMade: string[] = [];
  for (const m of olderMessages) {
    if (m.role === 'assistant') {
      const text = extractMessageText(m);
      if (text.includes('Decided') || text.includes('Implemented') || text.includes('Fixed')) {
        const line = text.split('\n').find((l) =>
          l.includes('Decided') || l.includes('Implemented') || l.includes('Fixed')
        );
        if (line) decisionsMade.push(line.trim().slice(0, 150));
      }
    }
  }

  const compactedNote = buildCompactionNote({
    goal,
    filesTouched,
    decisionsMade,
    openErrors,
    nextStep: 'Continue execution with recent turns.',
  });

  const noteMessage: AgentMessage = {
    role: 'user',
    content: `[Context Compaction Summary]\n${compactedNote}`,
  };

  return {
    compactedNote,
    keptRawMessages,
    replacementMessages: [noteMessage, ...keptRawMessages],
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

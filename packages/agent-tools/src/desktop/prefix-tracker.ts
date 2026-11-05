import type { AgentMessage } from '@earendil-works/pi-agent-core';

export interface RequestSnapshot {
  readonly serialized: string;
  readonly blocks: readonly { name: string; start: number; end: number }[];
}

export interface DivergenceResult {
  readonly offset: number;
  readonly block: string;
  readonly isPrefixMatch: boolean;
}

/**
 * Serializes request system prompt, tools, and messages deterministically into a single string
 * and tracks byte offsets of each semantic block.
 */
export function serializeRequestSnapshot(
  systemPrompt: string,
  tools: readonly unknown[],
  messages: readonly unknown[],
): RequestSnapshot {
  const blocks: { name: string; start: number; end: number }[] = [];
  let serialized = '';

  function appendBlock(name: string, content: string) {
    const start = serialized.length;
    serialized += `[${name}]\n${content}\n`;
    const end = serialized.length;
    blocks.push({ name, start, end });
  }

  appendBlock('system_prompt', systemPrompt || '');
  appendBlock('tools', JSON.stringify(tools || []));

  if (Array.isArray(messages)) {
    messages.forEach((msg: any, idx) => {
      const role = msg?.role ?? 'unknown';
      appendBlock(`messages[${idx}]:${role}`, JSON.stringify(msg));
    });
  }

  return { serialized, blocks };
}

/**
 * Compares two request snapshots and finds the exact byte offset where they first differ,
 * and identifies which message or configuration block diverged.
 */
export function findPrefixDivergence(
  prevSnapshot: RequestSnapshot | undefined,
  currentSnapshot: RequestSnapshot,
): DivergenceResult {
  if (!prevSnapshot) {
    return {
      offset: 0,
      block: 'call 1 (initial)',
      isPrefixMatch: true,
    };
  }

  const prev = prevSnapshot.serialized;
  const curr = currentSnapshot.serialized;

  let diffOffset = 0;
  const minLen = Math.min(prev.length, curr.length);
  while (diffOffset < minLen && prev.charCodeAt(diffOffset) === curr.charCodeAt(diffOffset)) {
    diffOffset++;
  }

  // Exact prefix match: the previous call is a strict prefix of current call
  if (diffOffset === prev.length) {
    const appendedBlock = currentSnapshot.blocks.find(
      (b) => b.start <= diffOffset && diffOffset < b.end,
    );
    return {
      offset: diffOffset,
      block: appendedBlock ? appendedBlock.name : 'end_of_prior_context',
      isPrefixMatch: true,
    };
  }

  // Divergence occurred before the end of the previous request (cache bust!)
  const divergedBlock = prevSnapshot.blocks.find(
    (b) => b.start <= diffOffset && diffOffset < b.end,
  );

  return {
    offset: diffOffset,
    block: divergedBlock
      ? `${divergedBlock.name} (mutated at byte ${diffOffset - divergedBlock.start})`
      : `byte ${diffOffset}`,
    isPrefixMatch: false,
  };
}

export class PrefixDivergenceTracker {
  private lastSnapshot?: RequestSnapshot;

  recordStep(
    systemPrompt: string,
    tools: readonly unknown[],
    messages: readonly unknown[],
  ): DivergenceResult {
    const current = serializeRequestSnapshot(systemPrompt, tools, messages);
    const result = findPrefixDivergence(this.lastSnapshot, current);
    this.lastSnapshot = current;
    return result;
  }

  getLastSnapshot(): RequestSnapshot | undefined {
    return this.lastSnapshot;
  }

  reset(): void {
    this.lastSnapshot = undefined;
  }
}

const sessionTrackers = new Map<string, PrefixDivergenceTracker>();

export function getSessionPrefixTracker(sessionId: string = 'default'): PrefixDivergenceTracker {
  let tracker = sessionTrackers.get(sessionId);
  if (!tracker) {
    tracker = new PrefixDivergenceTracker();
    sessionTrackers.set(sessionId, tracker);
  }
  return tracker;
}

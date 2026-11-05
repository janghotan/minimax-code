import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

let onPricingChangedCallback: (() => void) | undefined;

export function registerPricingChangeListener(cb: () => void): void {
  onPricingChangedCallback = cb;
}

export interface LlmCallUsageEntry {
  turn: string | number;
  callId?: string;
  tools: string[];
  inputTokens: number;
  cacheHit: number;
  cacheMiss: number;
  outputTokens: number;
  reasoningTokens: number;
  latencyMs: number;
  contextSize: number;
  cacheHitPercent: number;
  divergenceOffset?: number;
  divergenceBlock?: string;
  timestamp: string;
}

export function getUsageFilePath(workspaceRoot = process.cwd()): string {
  return resolve(workspaceRoot, '.mcode', 'usage.jsonl');
}

/**
 * Appends one JSON line per LLM call to .mcode/usage.jsonl
 */
export function recordLlmCallUsage(
  entry: Partial<LlmCallUsageEntry> & { inputTokens: number },
  workspaceRoot = process.cwd(),
): LlmCallUsageEntry {
  const filePath = getUsageFilePath(workspaceRoot);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const input = Math.max(0, entry.inputTokens ?? 0);
  const cacheHit = Math.max(0, entry.cacheHit ?? 0);
  const cacheMiss = Math.max(0, entry.cacheMiss ?? Math.max(0, input - cacheHit));
  const output = Math.max(0, entry.outputTokens ?? 0);
  const reasoning = Math.max(0, entry.reasoningTokens ?? 0);
  const totalInput = cacheHit + cacheMiss || input;
  const cacheHitPercent = totalInput > 0 ? (cacheHit / totalInput) * 100 : 0;

  const fullEntry: LlmCallUsageEntry = {
    turn: entry.turn ?? 1,
    ...(entry.callId ? { callId: entry.callId } : {}),
    tools: entry.tools ?? [],
    inputTokens: input,
    cacheHit,
    cacheMiss,
    outputTokens: output,
    reasoningTokens: reasoning,
    latencyMs: Math.max(0, Math.round(entry.latencyMs ?? 0)),
    contextSize: entry.contextSize ?? input,
    cacheHitPercent: Math.round(cacheHitPercent * 10) / 10,
    ...(entry.divergenceOffset !== undefined ? { divergenceOffset: entry.divergenceOffset } : {}),
    ...(entry.divergenceBlock ? { divergenceBlock: entry.divergenceBlock } : {}),
    timestamp: entry.timestamp ?? new Date().toISOString(),
  };

  try {
    appendFileSync(filePath, JSON.stringify(fullEntry) + '\n', 'utf8');
  } catch (err) {
    // Best-effort usage logging
  }

  return fullEntry;
}

/**
 * Reads all usage entries from .mcode/usage.jsonl
 */
export function readUsageEntries(workspaceRoot = process.cwd()): LlmCallUsageEntry[] {
  const filePath = getUsageFilePath(workspaceRoot);
  if (!existsSync(filePath)) return [];

  try {
    const raw = readFileSync(filePath, 'utf8');
    const lines = raw.split('\n').filter((line) => line.trim().length > 0);
    const entries: LlmCallUsageEntry[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (typeof parsed === 'object' && parsed !== null) {
          entries.push(parsed);
        }
      } catch {
        // Skip corrupt line
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Formats /usage command output
 */
export function formatUsageCommandOutput(workspaceRoot = process.cwd()): string {
  const entries = readUsageEntries(workspaceRoot);
  if (entries.length === 0) {
    return 'No LLM calls recorded in .mcode/usage.jsonl yet.';
  }

  const totalCalls = entries.length;
  let sumInput = 0;
  let sumOutput = 0;
  let sumCacheHit = 0;
  let sumReasoning = 0;
  let sumLatency = 0;

  for (const e of entries) {
    sumInput += e.inputTokens;
    sumOutput += e.outputTokens;
    sumCacheHit += e.cacheHit;
    sumReasoning += e.reasoningTokens;
    sumLatency += e.latencyMs;
  }

  const avgInput = Math.round(sumInput / totalCalls);
  const avgOutput = Math.round(sumOutput / totalCalls);
  const avgLatency = Math.round(sumLatency / totalCalls);
  const overallHitPercent =
    sumInput > 0 ? Math.round((sumCacheHit / sumInput) * 1000) / 10 : 0;

  // Rank top 5 most expensive calls by total tokens (input + output)
  const ranked = [...entries].sort(
    (a, b) => b.inputTokens + b.outputTokens - (a.inputTokens + a.outputTokens),
  );
  const top5 = ranked.slice(0, 5);

  const lines: string[] = [
    '==================== /usage SUMMARY ====================',
    `Total LLM Calls     : ${totalCalls}`,
    `Average Input/Call  : ${avgInput.toLocaleString()} tokens`,
    `Average Output/Call : ${avgOutput.toLocaleString()} tokens`,
    `Average Latency     : ${avgLatency}ms`,
    `Overall Cache Hit   : ${overallHitPercent}% (hit: ${sumCacheHit.toLocaleString()} / total in: ${sumInput.toLocaleString()})`,
    ...(sumReasoning > 0 ? [`Total Reasoning Toks: ${sumReasoning.toLocaleString()}`] : []),
    '',
    '── Top 5 Most Expensive Calls ──',
  ];

  top5.forEach((e, idx) => {
    const toolsStr = e.tools.length > 0 ? e.tools.join(',') : '(no tools)';
    const hitLabel = `${e.cacheHitPercent}% hit`;
    lines.push(
      ` ${idx + 1}. Turn ${e.turn} [${toolsStr}]: ${e.inputTokens.toLocaleString()} in (${hitLabel}), ${e.outputTokens.toLocaleString()} out, ${e.latencyMs}ms`,
    );
  });

  // Flag calls where cache hit dropped below 90% (Step 2.7)
  const lowCacheCalls = entries.filter(
    (e, idx) => idx > 0 && e.cacheHitPercent < 90,
  );
  if (lowCacheCalls.length > 0) {
    lines.push('');
    lines.push(`── Cache Warnings (<90% hit, ${lowCacheCalls.length} calls) ──`);
    lowCacheCalls.slice(0, 3).forEach((e) => {
      const offsetHint =
        e.divergenceOffset !== undefined
          ? ` [divergence at byte ~${e.divergenceOffset}${e.divergenceBlock ? `: ${e.divergenceBlock}` : ''}]`
          : '';
      lines.push(
        ` • Turn ${e.turn} (${e.cacheHitPercent}% hit): ${e.inputTokens} in, miss: ${e.cacheMiss}${offsetHint}`,
      );
    });
  }

  lines.push('========================================================');
  return lines.join('\n');
}

/**
 * Updates pricing.json with custom rates for a model
 * e.g. /price set <model> <hit> <miss> <out>
 */
export function setPricingEntry(
  model: string,
  hitCnyPer1M: number,
  missCnyPer1M: number,
  outCnyPer1M: number,
  workspaceRoot = process.cwd(),
): boolean {
  const pricingPath = resolve(workspaceRoot, 'pricing.json');
  try {
    let data: any = {};
    if (existsSync(pricingPath)) {
      try {
        data = JSON.parse(readFileSync(pricingPath, 'utf8'));
      } catch {
        data = {};
      }
    }
    if (!data.models || typeof data.models !== 'object') {
      data.models = {};
    }
    data.models[model] = {
      prompt_cache_hit_cny_per_1m: hitCnyPer1M,
      prompt_cache_miss_cny_per_1m: missCnyPer1M,
      completion_cny_per_1m: outCnyPer1M,
      source: 'User configured via /price set',
      date: new Date().toISOString().split('T')[0],
    };

    writeFileSync(pricingPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    onPricingChangedCallback?.();
    return true;
  } catch {
    return false;
  }
}

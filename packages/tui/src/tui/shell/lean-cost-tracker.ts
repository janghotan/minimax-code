import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLeanAgentSettings } from '@mavis/config';

export interface ModelPricingEntry {
  readonly prompt_cache_hit_cny_per_1m?: number;
  readonly prompt_cache_miss_cny_per_1m?: number;
  readonly completion_cny_per_1m?: number;
  readonly prompt_usd_per_1m?: number;
  readonly prompt_cache_hit_usd_per_1m?: number;
  readonly prompt_cache_miss_usd_per_1m?: number;
  readonly completion_usd_per_1m?: number;
  readonly source?: string;
  readonly date?: string;
}

export interface PricingTable {
  readonly models: Record<string, ModelPricingEntry>;
  readonly usd_to_cny?: number;
}

const DEFAULT_PRICING: PricingTable = {
  models: {
    'deepseek-chat': {
      prompt_cache_hit_cny_per_1m: 0.5,
      prompt_cache_miss_cny_per_1m: 2.0,
      completion_cny_per_1m: 8.0,
      source: 'https://api-docs.deepseek.com/quick_start/pricing',
      date: '2024-12-26',
    },
    'deepseek-reasoner': {
      prompt_cache_hit_cny_per_1m: 1.0,
      prompt_cache_miss_cny_per_1m: 4.0,
      completion_cny_per_1m: 16.0,
      source: 'https://api-docs.deepseek.com/quick_start/pricing',
      date: '2024-12-26',
    },
  },
  usd_to_cny: 7.25,
};

let cachedPricingTable: PricingTable | undefined;

export function loadPricingTable(customPath?: string): PricingTable {
  if (cachedPricingTable && !customPath) return cachedPricingTable;
  try {
    const candidates = [
      customPath,
      resolve(process.cwd(), 'pricing.json'),
      resolve(__dirname, '../../../../../../pricing.json'),
    ].filter((p): p is string => Boolean(p));

    for (const file of candidates) {
      try {
        const raw = readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw) as PricingTable;
        if (parsed && typeof parsed.models === 'object') {
          cachedPricingTable = parsed;
          return parsed;
        }
      } catch {
        // Try next candidate
      }
    }
  } catch {
    // Fall back to defaults
  }
  return DEFAULT_PRICING;
}

export function resetPricingTableCache(): void {
  cachedPricingTable = undefined;
}

export interface RecordUsageOptions {
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  promptCacheHitTokens?: number;
  promptCacheMissTokens?: number;
  rawChars?: number;
  turnIncrement?: boolean;
  contextWindow?: number;
}

export interface CostCalculationResult {
  hasPrice: boolean;
  totalCny?: number;
  hitCost?: number;
  missCost?: number;
  outputCost?: number;
  marker?: string;
  currency: 'CNY';
}

function formatTokenK(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 10_000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${Math.round(tokens / 1000)}k`;
}

export function cleanModelName(raw: string): string {
  let name = raw.trim();
  if (name.includes(':')) {
    const parts = name.split(':');
    name = parts[parts.length - 1];
  }
  if (name.includes('/')) {
    const parts = name.split('/');
    name = parts[parts.length - 1];
  }
  if (name.includes('#')) {
    name = name.split('#')[0];
  }
  return name.toLowerCase().trim();
}

function findPricingEntry(
  table: PricingTable,
  rawModel: string,
): { entry?: ModelPricingEntry; matchedKey?: string } {
  if (table.models[rawModel]) {
    return { entry: table.models[rawModel], matchedKey: rawModel };
  }
  const clean = cleanModelName(rawModel);
  if (table.models[clean]) {
    return { entry: table.models[clean], matchedKey: clean };
  }
  // Try substring / fuzzy matching
  const keys = Object.keys(table.models);
  for (const k of keys) {
    const lk = k.toLowerCase();
    if (clean === lk || clean.includes(lk) || lk.includes(clean)) {
      return { entry: table.models[k], matchedKey: k };
    }
  }
  return {};
}

export class LeanCostTracker {
  promptCacheHitTokens = 0;
  promptCacheMissTokens = 0;
  completionTokens = 0;
  turnCount = 0;
  isEstimated = false;
  lastUsedTokens = 0;
  lastWindowLimit = 65536;
  model = 'deepseek-chat';

  setModel(model: string): void {
    if (model) this.model = model;
  }

  syncUsedTokens(used: number, limit?: number): void {
    if (used > 0) {
      this.lastUsedTokens = used;
    }
    if (limit && limit > 0) {
      this.lastWindowLimit = limit;
    }
  }

  syncFromSessionUsage(usage: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    turns?: number;
    model?: string;
  }): void {
    if (usage.model) this.model = usage.model;
    if (typeof usage.turns === 'number' && usage.turns > this.turnCount) {
      this.turnCount = usage.turns;
    }
    if (typeof usage.inputTokens === 'number' && typeof usage.outputTokens === 'number') {
      const hit = usage.cacheReadTokens ?? 0;
      const miss = Math.max(0, usage.inputTokens - hit);
      const total = usage.inputTokens + usage.outputTokens;
      if (total > this.promptCacheHitTokens + this.promptCacheMissTokens + this.completionTokens) {
        this.promptCacheHitTokens = hit;
        this.promptCacheMissTokens = miss;
        this.completionTokens = usage.outputTokens;
        this.lastUsedTokens = total;
      }
    }
  }

  recordUsage(options: RecordUsageOptions): void {
    if (options.turnIncrement !== false) {
      this.turnCount++;
    }
    if (options.model) {
      this.model = options.model;
    }
    if (options.contextWindow && options.contextWindow > 0) {
      this.lastWindowLimit = options.contextWindow;
    }

    if (options.promptTokens !== undefined && Number.isFinite(options.promptTokens)) {
      this.isEstimated = false;
      const hit = options.promptCacheHitTokens ?? 0;
      const miss = options.promptCacheMissTokens ?? Math.max(0, options.promptTokens - hit);
      const completion = options.completionTokens ?? 0;

      this.promptCacheHitTokens += hit;
      this.promptCacheMissTokens += miss;
      this.completionTokens += completion;
      this.lastUsedTokens = options.promptTokens + completion;
    } else {
      // Fallback: estimate from rawChars / 4
      this.isEstimated = true;
      const rawChars = options.rawChars ?? 0;
      const estPrompt = Math.max(1, Math.round(rawChars / 4));
      const estCompletion = options.completionTokens ?? 0;

      this.promptCacheHitTokens += 0;
      this.promptCacheMissTokens += estPrompt;
      this.completionTokens += estCompletion;
      this.lastUsedTokens = estPrompt + estCompletion;
    }
  }

  calculateCost(modelId?: string): CostCalculationResult {
    const table = loadPricingTable();
    const targetModel = modelId || this.model;
    const { entry } = findPricingEntry(table, targetModel);

    if (!entry) {
      return {
        hasPrice: false,
        marker: 'no price',
        currency: 'CNY',
      };
    }

    const usdRate =
      table.usd_to_cny ?? getLeanAgentSettings().tui.usdToCnyRate ?? 7.25;

    let hitCnyRate = entry.prompt_cache_hit_cny_per_1m;
    let missCnyRate = entry.prompt_cache_miss_cny_per_1m;
    let outCnyRate = entry.completion_cny_per_1m;

    // Convert from USD if CNY rates missing
    if (hitCnyRate === undefined && entry.prompt_cache_hit_usd_per_1m !== undefined) {
      hitCnyRate = entry.prompt_cache_hit_usd_per_1m * usdRate;
    }
    if (missCnyRate === undefined) {
      if (entry.prompt_cache_miss_usd_per_1m !== undefined) {
        missCnyRate = entry.prompt_cache_miss_usd_per_1m * usdRate;
      } else if (entry.prompt_usd_per_1m !== undefined) {
        missCnyRate = entry.prompt_usd_per_1m * usdRate;
      }
    }
    if (outCnyRate === undefined && entry.completion_usd_per_1m !== undefined) {
      outCnyRate = entry.completion_usd_per_1m * usdRate;
    }

    if (missCnyRate === undefined || outCnyRate === undefined) {
      return {
        hasPrice: false,
        marker: 'no price',
        currency: 'CNY',
      };
    }

    const effectiveHitRate = hitCnyRate ?? missCnyRate;
    const hitCost = (this.promptCacheHitTokens * effectiveHitRate) / 1_000_000;
    const missCost = (this.promptCacheMissTokens * missCnyRate) / 1_000_000;
    const outputCost = (this.completionTokens * outCnyRate) / 1_000_000;
    const totalCny = hitCost + missCost + outputCost;

    return {
      hasPrice: true,
      totalCny,
      hitCost,
      missCost,
      outputCost,
      currency: 'CNY',
    };
  }

  getCacheHitRatio(): number {
    const totalInput = this.promptCacheHitTokens + this.promptCacheMissTokens;
    if (totalInput <= 0) return 0;
    return this.promptCacheHitTokens / totalInput;
  }

  formatPersistentStatusLine(contextLimit?: number, modelId?: string): string {
    const targetModel = modelId || this.model;
    const limit = contextLimit ?? this.lastWindowLimit;
    const used = this.lastUsedTokens;
    const percent = Math.min(100, Math.round((used / limit) * 100));

    const estMark = this.isEstimated ? '~' : '';
    const usedStr = `${estMark}${formatTokenK(used)}`;
    const limitStr = formatTokenK(limit);

    const costRes = this.calculateCost(targetModel);
    let costStr = 'no price';
    if (costRes.hasPrice && costRes.totalCny !== undefined) {
      costStr = `${estMark}¥${costRes.totalCny.toFixed(3)}`;
    }

    return `🧠 ${usedStr}/${limitStr} (${percent}%) · 💰 ${costStr} · 🔁 ${this.turnCount}`;
  }

  formatCostBreakdown(modelId?: string): string {
    const targetModel = modelId || this.model;
    const costRes = this.calculateCost(targetModel);
    const hitRatio = (this.getCacheHitRatio() * 100).toFixed(1);

    const lines = [
      '📊 Session Cost Breakdown (CNY):',
      `  • Model: ${targetModel}`,
      `  • Cache-hit input: ${this.promptCacheHitTokens.toLocaleString()} tokens`,
      `  • Cache-miss input: ${this.promptCacheMissTokens.toLocaleString()} tokens`,
      `  • Output tokens: ${this.completionTokens.toLocaleString()} tokens`,
      `  • Cache-hit ratio: ${hitRatio}%`,
    ];

    if (costRes.hasPrice && costRes.totalCny !== undefined) {
      lines.push(`  • Total Cost: ¥${costRes.totalCny.toFixed(4)} CNY`);
    } else {
      lines.push('  • Total Cost: no price (model unlisted in pricing.json)');
    }

    return lines.join('\n');
  }

  reset(): void {
    this.promptCacheHitTokens = 0;
    this.promptCacheMissTokens = 0;
    this.completionTokens = 0;
    this.turnCount = 0;
    this.isEstimated = false;
    this.lastUsedTokens = 0;
  }
}

const globalCostTracker = new LeanCostTracker();

export function getGlobalCostTracker(): LeanCostTracker {
  return globalCostTracker;
}

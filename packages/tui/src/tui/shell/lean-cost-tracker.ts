import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLeanAgentSettings } from '@mavis/config';
import { getRuntimeLocaleLanguage } from '@mavis/shared/runtime-i18n';

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
  isEstimated?: boolean;
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

export function formatTokenK(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  if (tokens < 10_000) return `${(tokens / 1000).toFixed(1)}k`;
  if (tokens < 1_000_000) return `${Math.round(tokens / 1000)}k`;
  const m = tokens / 1_000_000;
  return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`;
}

export function cleanModelName(raw: string): string {
  let name = raw.trim();
  if (name.includes('#')) {
    name = name.split('#')[0];
  }
  if (name.includes(':')) {
    const parts = name.split(':');
    name = parts[parts.length - 1];
  }
  if (name.includes('/')) {
    const parts = name.split('/');
    name = parts[parts.length - 1];
  }
  return name.toLowerCase().trim();
}

/**
 * Resolves model-appropriate context window ceiling:
 * - Gemini: 1,048,576 (1M) or 2,097,152 (2M)
 * - Claude: 200,000 (200k)
 * - DeepSeek / GPT-4o / MiniMax: 131,072 (128k)
 * - Default floor: 131,072 (128k)
 */
export function resolveModelContextLimit(modelId?: string, explicitLimit?: number): number {
  const clean = modelId ? cleanModelName(modelId) : '';
  let modelDefault = 131_072;
  if (clean.includes('gemini')) {
    if (
      clean.includes('1.5-pro') ||
      clean.includes('2.5-pro') ||
      clean.includes('2.0-pro') ||
      clean.includes('3-pro') ||
      clean.includes('3.8-pro')
    ) {
      modelDefault = 2_097_152;
    } else {
      modelDefault = 1_048_576;
    }
  } else if (clean.includes('claude')) {
    modelDefault = 200_000;
  } else if (
    clean.includes('deepseek') ||
    clean.includes('gpt-4') ||
    clean.includes('o1') ||
    clean.includes('o3') ||
    clean.includes('minimax') ||
    clean.includes('abab')
  ) {
    modelDefault = 131_072;
  }

  if (typeof explicitLimit === 'number' && Number.isFinite(explicitLimit) && explicitLimit > 0) {
    return Math.max(explicitLimit, modelDefault);
  }
  return modelDefault;
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
  // Family-based fallback
  if (clean.includes('gemini')) {
    if (clean.includes('pro')) {
      return { entry: table.models['gemini-3-pro'] ?? table.models['gemini-1.5-pro'], matchedKey: 'gemini-pro' };
    }
    return {
      entry:
        table.models['gemini-3.8-flash-high'] ??
        table.models['gemini-3-flash'] ??
        table.models['gemini-2.5-flash'],
      matchedKey: 'gemini-flash',
    };
  }
  if (clean.includes('claude')) {
    if (clean.includes('haiku')) return { entry: table.models['claude-3-5-haiku'], matchedKey: 'claude-haiku' };
    if (clean.includes('opus')) return { entry: table.models['claude-3-opus'], matchedKey: 'claude-opus' };
    return {
      entry: table.models['claude-3-7-sonnet'] ?? table.models['claude-3-5-sonnet'],
      matchedKey: 'claude-sonnet',
    };
  }
  if (clean.includes('deepseek')) {
    if (clean.includes('r1') || clean.includes('reasoner')) {
      return { entry: table.models['deepseek-r1'], matchedKey: 'deepseek-r1' };
    }
    return { entry: table.models['deepseek-v3'] ?? table.models['deepseek-chat'], matchedKey: 'deepseek-v3' };
  }
  if (clean.includes('gpt-4o-mini')) return { entry: table.models['gpt-4o-mini'], matchedKey: 'gpt-4o-mini' };
  if (clean.includes('gpt-4o') || clean.includes('gpt-4')) return { entry: table.models['gpt-4o'], matchedKey: 'gpt-4o' };
  if (clean.includes('o1')) return { entry: table.models['o1'], matchedKey: 'o1' };
  if (clean.includes('o3')) return { entry: table.models['o3-mini'], matchedKey: 'o3-mini' };
  if (clean.includes('minimax') || clean.includes('abab')) {
    return { entry: table.models['minimax-text-01'], matchedKey: 'minimax-text-01' };
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
  lastWindowLimit = 131_072;
  model = 'deepseek-chat';

  setModel(model: string): void {
    if (model) {
      this.model = model;
      this.lastWindowLimit = resolveModelContextLimit(model, this.lastWindowLimit);
    }
  }

  syncUsedTokens(used: number, limit?: number): void {
    if (used > 0) {
      this.lastUsedTokens = used;
    }
    if (limit && limit > 0) {
      this.lastWindowLimit = resolveModelContextLimit(this.model, limit);
    }
  }

  syncFromSessionUsage(usage: {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    turns?: number;
    model?: string;
  }): void {
    if (usage.model) this.setModel(usage.model);
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
      this.setModel(options.model);
    }
    if (options.contextWindow && options.contextWindow > 0) {
      this.lastWindowLimit = resolveModelContextLimit(this.model, options.contextWindow);
    }
    if (options.isEstimated !== undefined) {
      this.isEstimated = options.isEstimated;
    }

    if (options.promptTokens !== undefined && Number.isFinite(options.promptTokens) && options.promptTokens > 0) {
      this.isEstimated = false;
      const hit = options.promptCacheHitTokens ?? 0;
      const miss = options.promptCacheMissTokens ?? Math.max(0, options.promptTokens - hit);
      const completion = options.completionTokens ?? 0;

      this.promptCacheHitTokens += hit;
      this.promptCacheMissTokens += miss;
      this.completionTokens += completion;
      this.lastUsedTokens = options.promptTokens + completion;
    } else {
      // Fallback: estimate from rawChars / 4 with realistic conversational baseline
      this.isEstimated = true;
      const rawChars = options.rawChars && options.rawChars > 0 ? options.rawChars : 3200;
      const estPrompt = Math.max(800, Math.round(rawChars / 4));
      const estCompletion = Math.max(15, options.completionTokens ?? 0);

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
    const limit = resolveModelContextLimit(targetModel, contextLimit ?? this.lastWindowLimit);
    const used = this.lastUsedTokens;
    const percent = Math.min(100, Math.round((used / limit) * 100));

    const estMark = this.isEstimated ? '~' : '';
    const usedStr = `${estMark}${formatTokenK(used)}`;
    const limitStr = formatTokenK(limit);

    const costRes = this.calculateCost(targetModel);
    const isZh = getRuntimeLocaleLanguage() === 'zh';
    let costStr = isZh ? '未收录定价' : 'no price';
    if (costRes.hasPrice && costRes.totalCny !== undefined) {
      costStr = `${estMark}¥${costRes.totalCny.toFixed(3)}`;
    }

    return `🧠 ${usedStr}/${limitStr} (${percent}%) · 💰 ${costStr} · 🔁 ${this.turnCount}`;
  }

  formatCostBreakdown(modelId?: string): string {
    const targetModel = modelId || this.model;
    const costRes = this.calculateCost(targetModel);
    const hitRatio = (this.getCacheHitRatio() * 100).toFixed(1);
    const isZh = getRuntimeLocaleLanguage() === 'zh';

    if (isZh) {
      const lines = [
        '📊 会话成本与 Token 统计 (人民币):',
        `  • 当前模型: ${targetModel}`,
        `  • 缓存命中输入: ${this.promptCacheHitTokens.toLocaleString()} tokens`,
        `  • 缓存未命中输入: ${this.promptCacheMissTokens.toLocaleString()} tokens`,
        `  • 模型输出: ${this.completionTokens.toLocaleString()} tokens`,
        `  • 缓存命中率: ${hitRatio}%`,
      ];

      if (costRes.hasPrice && costRes.totalCny !== undefined) {
        lines.push(`  • 总消耗成本: ¥${costRes.totalCny.toFixed(4)} CNY`);
      } else {
        lines.push('  • 总消耗成本: 未收录定价 (定价表中未包含该模型)');
      }

      return lines.join('\n');
    }

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

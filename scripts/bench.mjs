#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { encode } from 'gpt-tokenizer';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixtureSrc = path.join(root, 'bench/fixture');
const pricingPath = path.join(root, 'pricing.json');
const baselinePath = path.join(root, 'bench/baseline.json');

const args = process.argv.slice(2);
const saveBaseline = args.includes('--save-baseline');
const compare = args.includes('--compare') || (!saveBaseline && fs.existsSync(baselinePath));
const jsonOutput = args.includes('--json');

function getMessageText(msg) {
  if (!msg) return '';
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content.map((c) => (typeof c === 'string' ? c : c.text || '')).join('\n');
  }
  return '';
}

function serializeMessageForTokens(msg) {
  let text = `role: ${msg.role}\n`;
  if (msg.name) text += `name: ${msg.name}\n`;
  text += `content: ${getMessageText(msg)}\n`;
  if (msg.tool_calls) {
    text += 'tool_calls: ' + JSON.stringify(msg.tool_calls) + '\n';
  }
  return text;
}

function tokenizeRequest(body) {
  let fullText = '';
  if (body.tools && body.tools.length > 0) {
    fullText += `tools:\n${JSON.stringify(body.tools)}\n\n`;
  }
  for (const m of body.messages || []) {
    fullText += serializeMessageForTokens(m) + '\n';
  }
  return encode(fullText);
}

async function runBenchmark() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcode-bench-run-'));
  const dataDir = path.join(tmp, 'data');
  const wsDir = path.join(tmp, 'workspace');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.cpSync(fixtureSrc, wsDir, { recursive: true });

  const pricingDoc = JSON.parse(fs.readFileSync(pricingPath, 'utf8'));
  const modelKey = 'deepseek-chat';
  const pricing = pricingDoc.models[modelKey];

  let lastTokens = [];
  const taskRecords = [];
  let currentTaskRecord = null;

  function recordTurn(body, completionText) {
    const tokens = tokenizeRequest(body);
    const completionTokens = encode(completionText).length;

    let commonPrefix = 0;
    while (
      commonPrefix < lastTokens.length &&
      commonPrefix < tokens.length &&
      lastTokens[commonPrefix] === tokens[commonPrefix]
    ) {
      commonPrefix++;
    }

    const promptTokens = tokens.length;
    const cacheHitTokens = commonPrefix;
    const cacheMissTokens = promptTokens - cacheHitTokens;

    const hitPrice = pricing.prompt_cache_hit_cny_per_1m;
    const missPrice = pricing.prompt_cache_miss_cny_per_1m;
    const completionPrice = pricing.completion_cny_per_1m;

    const costCny =
      (cacheHitTokens * hitPrice +
        cacheMissTokens * missPrice +
        completionTokens * completionPrice) /
      1_000_000;

    lastTokens = tokens;

    return {
      promptTokens,
      completionTokens,
      cacheHitTokens,
      cacheMissTokens,
      cacheHitRatio: promptTokens > 0 ? cacheHitTokens / promptTokens : 0,
      costCny,
    };
  }

  let turnIndex = 0;
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;

    if (req.url === '/v1/models') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: modelKey }] }));
      return;
    }

    const body = JSON.parse(raw);

    if (!body.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'cmpl-init',
          object: 'chat.completion',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'READY' }, finish_reason: 'stop' },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      );
      return;
    }

    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const lastUser = [...body.messages].reverse().find((m) => m.role === 'user');
    const currentPrompt = getMessageText(lastUser);
    const lastMessage = body.messages[body.messages.length - 1];
    const hasToolResult = lastMessage?.role === 'tool';

    let deltaChunks = [];
    let completionText = '';

    if (!hasToolResult) {
      if (currentPrompt.includes('read large-file.ts')) {
        deltaChunks = [
          {
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_read',
                      type: 'function',
                      function: {
                        name: 'read',
                        arguments: JSON.stringify({ path: path.join(wsDir, 'large-file.ts') }),
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
        ];
      } else if (currentPrompt.includes('run failing test')) {
        deltaChunks = [
          {
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_test1',
                      type: 'function',
                      function: {
                        name: 'bash',
                        arguments: JSON.stringify({ command: 'node --test math.test.mjs' }),
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
        ];
      } else if (currentPrompt.includes('fix math.js')) {
        deltaChunks = [
          {
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_edit',
                      type: 'function',
                      function: {
                        name: 'edit',
                        arguments: JSON.stringify({
                          path: path.join(wsDir, 'math.js'),
                          old_string: 'return 5;',
                          new_string: 'return a + b;',
                        }),
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
        ];
      } else if (currentPrompt.includes('rerun test')) {
        deltaChunks = [
          {
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_test2',
                      type: 'function',
                      function: {
                        name: 'bash',
                        arguments: JSON.stringify({ command: 'node --test math.test.mjs' }),
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
        ];
      } else if (currentPrompt.includes('grep repo')) {
        deltaChunks = [
          {
            choices: [
              {
                index: 0,
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_grep',
                      type: 'function',
                      function: {
                        name: 'grep',
                        arguments: JSON.stringify({
                          pattern: 'AUTHENTICATION_SECRET_KEY',
                          path: path.join(wsDir, 'repo'),
                        }),
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
        ];
      }
    } else {
      if (currentPrompt.includes('read large-file.ts')) {
        completionText = 'Analyzed large-file.ts (60 services).';
      } else if (currentPrompt.includes('run failing test')) {
        completionText = 'Test failed with assertion error 5 !== 4.';
      } else if (currentPrompt.includes('fix math.js')) {
        completionText = 'Fixed math.js to return a + b.';
      } else if (currentPrompt.includes('rerun test')) {
        completionText = 'All tests passed successfully!';
      } else if (currentPrompt.includes('grep repo')) {
        completionText = 'Found 3 secret matches in repo.';
      }

      deltaChunks = [
        { choices: [{ index: 0, delta: { role: 'assistant', content: completionText }, finish_reason: null }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
      ];
    }

    const stepMetric = recordTurn(body, completionText);
    if (currentTaskRecord) {
      currentTaskRecord.steps.push(stepMetric);
    }

    for (const c of deltaChunks) {
      res.write(
        `data: ${JSON.stringify({
          id: 'chunk-' + ++turnIndex,
          object: 'chat.completion.chunk',
          model: modelKey,
          ...c,
        })}\n\n`,
      );
    }
    res.end('data: [DONE]\n\n');
  });

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;

  const env = {
    ...process.env,
    MINIMAX_DATA_DIR: dataDir,
    MAVIS_DATA_DIR: dataDir,
    MCODE_PROVIDER_API_KEY: 'bench-dummy-key',
    MCODE_TEST_MANAGED_OFFLINE: '1',
  };

  const cli = path.join(root, 'dist/cli.js');
  const runCli = (cliArgs) =>
    new Promise((resolve, reject) => {
      const p = spawn(process.execPath, [cli, ...cliArgs], { cwd: wsDir, env });
      let stdout = '',
        stderr = '';
      p.stdout.on('data', (d) => (stdout += d));
      p.stderr.on('data', (d) => (stderr += d));
      p.on('close', (code) =>
        code === 0 ? resolve(stdout) : reject(new Error(`Exit ${code}: ${stderr} ${stdout}`)),
      );
    });

  await runCli([
    'provider',
    'add',
    '--name',
    'DeepSeek',
    '--base-url',
    baseUrl,
    '--api-format',
    'openai-completions',
    '--model',
    modelKey,
    '--use',
  ]);

  const tasks = [
    { id: 'task1_read_large_file', name: 'Read Large File (1140 lines)', prompt: 'read large-file.ts and summarize it' },
    { id: 'task2_run_failing_test', name: 'Run Failing Test Suite', prompt: 'run failing test using node --test math.test.mjs' },
    { id: 'task3_fix_code', name: 'Fix Bug in Source File', prompt: 'fix math.js so add returns a + b' },
    { id: 'task4_rerun_test', name: 'Rerun Test Suite (Pass)', prompt: 'rerun test using node --test math.test.mjs' },
    { id: 'task5_grep_repo', name: 'Grep Pattern Across Repo', prompt: 'grep repo for AUTHENTICATION_SECRET_KEY' },
  ];

  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    currentTaskRecord = { id: t.id, name: t.name, steps: [] };
    taskRecords.push(currentTaskRecord);

    const cliArgs = ['exec', '--permission', 'full', ...(i > 0 ? ['--continue'] : []), t.prompt];
    await runCli(cliArgs);
  }

  server.closeAllConnections();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });

  // Compute Task summaries
  const results = {
    timestamp: new Date().toISOString(),
    model: modelKey,
    pricing: {
      currency: 'CNY',
      symbol: '¥',
      cacheHitPer1M: pricing.prompt_cache_hit_cny_per_1m,
      cacheMissPer1M: pricing.prompt_cache_miss_cny_per_1m,
      completionPer1M: pricing.completion_cny_per_1m,
    },
    tasks: taskRecords.map((t) => {
      const promptTokens = t.steps.reduce((acc, s) => acc + s.promptTokens, 0);
      const completionTokens = t.steps.reduce((acc, s) => acc + s.completionTokens, 0);
      const cacheHitTokens = t.steps.reduce((acc, s) => acc + s.cacheHitTokens, 0);
      const cacheMissTokens = t.steps.reduce((acc, s) => acc + s.cacheMissTokens, 0);
      const peakContext = Math.max(...t.steps.map((s) => s.promptTokens), 0);
      const costCny = t.steps.reduce((acc, s) => acc + s.costCny, 0);
      const cacheHitRatio = promptTokens > 0 ? cacheHitTokens / promptTokens : 0;
      return {
        id: t.id,
        name: t.name,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        cacheHitTokens,
        cacheMissTokens,
        cacheHitRatio,
        peakContext,
        costCny,
      };
    }),
  };

  const totals = {
    promptTokens: results.tasks.reduce((acc, t) => acc + t.promptTokens, 0),
    completionTokens: results.tasks.reduce((acc, t) => acc + t.completionTokens, 0),
    totalTokens: results.tasks.reduce((acc, t) => acc + t.totalTokens, 0),
    cacheHitTokens: results.tasks.reduce((acc, t) => acc + t.cacheHitTokens, 0),
    peakContext: Math.max(...results.tasks.map((t) => t.peakContext)),
    costCny: results.tasks.reduce((acc, t) => acc + t.costCny, 0),
  };
  totals.cacheHitRatio = totals.promptTokens > 0 ? totals.cacheHitTokens / totals.promptTokens : 0;
  results.totals = totals;

  if (saveBaseline) {
    fs.mkdirSync(path.dirname(baselinePath), { recursive: true });
    fs.writeFileSync(baselinePath, JSON.stringify(results, null, 2) + '\n');
    console.log(`\n✅ Baseline benchmark saved to ${path.relative(root, baselinePath)}`);
  }

  if (jsonOutput) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Render Table
  console.log('\n============================== BENCHMARK REPORT ==============================');
  console.log(`Model: ${modelKey} | Pricing: Hit ¥${pricing.prompt_cache_hit_cny_per_1m}/M, Miss ¥${pricing.prompt_cache_miss_cny_per_1m}/M, Out ¥${pricing.completion_cny_per_1m}/M`);
  console.log('------------------------------------------------------------------------------');

  let baseline = null;
  if (compare && fs.existsSync(baselinePath)) {
    try {
      baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    } catch {}
  }

  if (baseline && !saveBaseline) {
    console.log(
      String('Task').padEnd(26) +
        String('Prompt Tok (Δ%)').padStart(20) +
        String('Peak Ctx (Δ%)').padStart(18) +
        String('Cost CNY (Δ%)').padStart(16),
    );
    console.log('------------------------------------------------------------------------------');
    for (const task of results.tasks) {
      const baseTask = baseline.tasks.find((b) => b.id === task.id);
      const promptDelta = baseTask
        ? (((task.promptTokens - baseTask.promptTokens) / baseTask.promptTokens) * 100).toFixed(1)
        : '0.0';
      const promptSign = Number(promptDelta) > 0 ? '+' : '';
      const promptStr = `${task.promptTokens} (${promptSign}${promptDelta}%)`;

      const peakDelta = baseTask
        ? (((task.peakContext - baseTask.peakContext) / baseTask.peakContext) * 100).toFixed(1)
        : '0.0';
      const peakSign = Number(peakDelta) > 0 ? '+' : '';
      const peakStr = `${task.peakContext} (${peakSign}${peakDelta}%)`;

      const costDelta = baseTask
        ? (((task.costCny - baseTask.costCny) / baseTask.costCny) * 100).toFixed(1)
        : '0.0';
      const costSign = Number(costDelta) > 0 ? '+' : '';
      const costStr = `¥${task.costCny.toFixed(4)} (${costSign}${costDelta}%)`;

      console.log(
        task.name.slice(0, 25).padEnd(26) +
          promptStr.padStart(20) +
          peakStr.padStart(18) +
          costStr.padStart(16),
      );
    }
    console.log('------------------------------------------------------------------------------');
    const totalPromptDelta = (
      ((totals.promptTokens - baseline.totals.promptTokens) / baseline.totals.promptTokens) *
      100
    ).toFixed(1);
    const totalCostDelta = (
      ((totals.costCny - baseline.totals.costCny) / baseline.totals.costCny) *
      100
    ).toFixed(1);
    const totalPromptStr = `${totals.promptTokens} (${Number(totalPromptDelta) > 0 ? '+' : ''}${totalPromptDelta}%)`;
    const totalPeakStr = `${totals.peakContext}`;
    const totalCostStr = `¥${totals.costCny.toFixed(4)} (${Number(totalCostDelta) > 0 ? '+' : ''}${totalCostDelta}%)`;
    console.log(
      String('TOTAL').padEnd(26) +
        totalPromptStr.padStart(20) +
        totalPeakStr.padStart(18) +
        totalCostStr.padStart(16),
    );
  } else {
    console.log(
      String('Task').padEnd(28) +
        String('Prompt Tok').padStart(12) +
        String('Compl Tok').padStart(11) +
        String('Peak Ctx').padStart(11) +
        String('Cache Hit%').padStart(12) +
        String('Cost (CNY)').padStart(12),
    );
    console.log('------------------------------------------------------------------------------');
    for (const task of results.tasks) {
      console.log(
        task.name.slice(0, 27).padEnd(28) +
          String(task.promptTokens).padStart(12) +
          String(task.completionTokens).padStart(11) +
          String(task.peakContext).padStart(11) +
          String((task.cacheHitRatio * 100).toFixed(1) + '%').padStart(12) +
          String('¥' + task.costCny.toFixed(4)).padStart(12),
      );
    }
    console.log('------------------------------------------------------------------------------');
    console.log(
      String('TOTAL').padEnd(28) +
        String(totals.promptTokens).padStart(12) +
        String(totals.completionTokens).padStart(11) +
        String(totals.peakContext).padStart(11) +
        String((totals.cacheHitRatio * 100).toFixed(1) + '%').padStart(12) +
        String('¥' + totals.costCny.toFixed(4)).padStart(12),
    );
  }
  console.log('==============================================================================\n');
}

runBenchmark().catch((err) => {
  console.error(err);
  process.exit(1);
});

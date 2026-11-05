import { test, expect } from 'vitest';
import { encode } from 'gpt-tokenizer';
import fs from 'node:fs';
import path from 'node:path';

import {
  LEAN_SEVEN_TOOLS,
  LEAN_SYSTEM_PROMPT,
} from '@mavis/agent-tools/desktop';

test('Lean tool suite contains exactly 7 tools with minimal schemas', () => {
  expect(LEAN_SEVEN_TOOLS.length).toBe(7);

  const toolNames = LEAN_SEVEN_TOOLS.map((t) => t.name);
  expect(toolNames).toEqual([
    'bash',
    'read_file',
    'edit_file',
    'write_file',
    'glob',
    'grep',
    'git',
  ]);

  // Check minimal parameters
  const bash = LEAN_SEVEN_TOOLS.find((t) => t.name === 'bash')!;
  expect(Object.keys(bash.parameters.properties)).toEqual(['command']);

  const readFile = LEAN_SEVEN_TOOLS.find((t) => t.name === 'read_file')!;
  expect(Object.keys(readFile.parameters.properties)).toEqual(['path', 'offset', 'limit']);

  const editFile = LEAN_SEVEN_TOOLS.find((t) => t.name === 'edit_file')!;
  expect(Object.keys(editFile.parameters.properties)).toEqual(['path', 'old_hunk', 'new_hunk']);

  const writeFile = LEAN_SEVEN_TOOLS.find((t) => t.name === 'write_file')!;
  expect(Object.keys(writeFile.parameters.properties)).toEqual(['path', 'content']);

  const git = LEAN_SEVEN_TOOLS.find((t) => t.name === 'git')!;
  expect(Object.keys(git.parameters.properties)).toEqual(['args']);
});

test('Lean system prompt contains only non-obvious coding rules and no marketing or fluff', () => {
  const prompt = LEAN_SYSTEM_PROMPT;

  // Non-obvious rules present
  expect(prompt).toContain('grep-before-read');
  expect(prompt).toContain('ranges');
  expect(prompt).toContain('diff-only edits');
  expect(prompt).toContain('Be terse');
  expect(prompt).toContain('Never echo file contents');
  expect(prompt).toContain('Senior Staff Engineer');
  expect(prompt).toContain('Numbered Task Checklist');
  expect(prompt).not.toContain('Chinese Docstrings & Comments');

  // Fluff, cheerleading and marketing removed
  expect(prompt).not.toContain('Ok cool');
  expect(prompt).not.toContain('collaborative and engaging');
  expect(prompt).not.toContain('Spotted a clever caching util');
  expect(prompt).not.toContain('Config’s looking tidy');
});

test('Prompt diet budget: system prompt + 7 tool schemas are strictly under 1,500 tokens', () => {
  const promptTokens = encode(LEAN_SYSTEM_PROMPT).length;
  const toolSchemasJson = JSON.stringify(LEAN_SEVEN_TOOLS);
  const schemaTokens = encode(toolSchemasJson).length;
  const totalTokens = promptTokens + schemaTokens;

  console.log(`\n================== PROMPT DIET BUDGET REPORT ==================`);
  console.log(`System Prompt Tokens : ${promptTokens}`);
  console.log(`7-Tool Schema Tokens : ${schemaTokens}`);
  console.log(`Total Tokens         : ${totalTokens} / 1500 token budget`);
  console.log(`Remaining Headroom   : ${1500 - totalTokens} tokens (${((1 - totalTokens / 1500) * 100).toFixed(1)}%)`);
  console.log(`===============================================================\n`);

  expect(totalTokens).toBeLessThan(1500);
});

test('Base prompt asset is under 500 tokens with zero marketing', () => {
  const promptBasePath = path.resolve('packages/local-runtime-v2/assets/agents/_default/prompt-base-all.md');
  const baseContent = fs.readFileSync(promptBasePath, 'utf8');

  expect(baseContent).toContain('grep-before-read');
  expect(baseContent).toContain('diff-only edits');
  expect(baseContent).not.toContain('Ok cool');
  expect(baseContent).not.toContain('Spotted a clever caching util');

  const baseTokens = encode(baseContent).length;
  expect(baseTokens).toBeLessThan(500);
});

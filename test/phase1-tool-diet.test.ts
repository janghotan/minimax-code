import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  DEFAULT_LEAN_AGENT_SETTINGS,
  getLeanAgentSettings,
} from '@mavis/config';
import {
  spillToolOutput,
  detectAndAugmentTestCommand,
  applyTestBackpressure,
  applyFuzzyHunkEdit,
} from '@mavis/agent-tools/desktop';

test('Lean agent settings have correct Phase 1 defaults', () => {
  const settings = getLeanAgentSettings();
  expect(settings.toolOutput.maxInlineBytes).toBe(8 * 1024);
  expect(settings.toolOutput.maxInlineLines).toBe(200);
  expect(settings.readFile.defaultLimit).toBe(300);
  expect(settings.readFile.dedupeSessionReads).toBe(true);
  expect(settings.search.maxGrepMatches).toBe(100);
  expect(settings.search.maxGlobMatches).toBe(100);
  expect(settings.edit.fuzzyMatchFallback).toBe(true);
});

test('spillToolOutput preserves small outputs and spills large outputs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spill-test-'));
  try {
    // 1. Small output under 8 KB
    const small = 'Small output line 1\nSmall output line 2';
    const smallResult = spillToolOutput(small, tmp, { toolName: 'bash' });
    expect(smallResult.isSpilled).toBe(false);
    expect(smallResult.text).toBe(small);

    // 2. Large output (> 200 lines)
    const lines = Array.from({ length: 300 }, (_, i) => `Output log line #${i + 1}`);
    const large = lines.join('\n');
    const largeResult = spillToolOutput(large, tmp, { toolName: 'bash', exitCode: 0 });
    expect(largeResult.isSpilled).toBe(true);
    expect(largeResult.text).toContain('Tool output capped: 300 lines');
    expect(largeResult.text).toContain('Full output saved to: .mcode/artifacts');
    expect(largeResult.text).toContain('Use read_file with offset/limit or grep on the artifact');
    expect(fs.existsSync(largeResult.artifactPath!)).toBe(true);
    expect(fs.readFileSync(largeResult.artifactPath!, 'utf8')).toBe(large);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('detectAndAugmentTestCommand injects fail-fast flags correctly', () => {
  expect(detectAndAugmentTestCommand('pytest tests/').augmentedCommand).toBe('pytest -x tests/');
  expect(detectAndAugmentTestCommand('pytest -x tests/').augmentedCommand).toBe('pytest -x tests/');
  expect(detectAndAugmentTestCommand('jest').augmentedCommand).toBe('jest --bail');
  expect(detectAndAugmentTestCommand('vitest run').augmentedCommand).toBe('vitest --bail run');
  expect(detectAndAugmentTestCommand('go test ./...').augmentedCommand).toBe('go test -failfast ./...');
  expect(detectAndAugmentTestCommand('node --test test.js').isTestOrLint).toBe(true);
  expect(detectAndAugmentTestCommand('ls -la').isTestOrLint).toBe(false);
});

test('applyTestBackpressure returns 1 line on success and filters noise on failure', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'backpressure-test-'));
  try {
    // Exit 0 success
    const pytestSuccessOutput = '============================= 12 passed in 0.45s ==============================';
    const successRes = applyTestBackpressure(pytestSuccessOutput, 0, 'pytest', tmp);
    expect(successRes.formattedText.startsWith('✓ pytest: 12 passed in 0.45s')).toBe(true);
    expect(successRes.formattedText).toContain('[Full log saved to .mcode/artifacts/');

    // Exit 1 failure with stack trace
    const failureOutput = [
      'FAIL test/math.test.js',
      '  ● add › adds numbers correctly',
      '    AssertionError [ERR_ASSERTION]: Expected 4 but got 5',
      '      at Object.<anonymous> (test/math.test.js:14:12)',
      '      at Promise.then.completed (node:internal/modules/esm/loader:400:15)',
      '      at /app/node_modules/jest-runner/build/runTest.js:350:20',
    ].join('\n');

    const failRes = applyTestBackpressure(failureOutput, 1, 'jest', tmp);
    expect(failRes.formattedText).toContain('❌ jest failed (exit 1)');
    expect(failRes.formattedText).toContain('AssertionError [ERR_ASSERTION]: Expected 4 but got 5');
    expect(failRes.formattedText).toContain('test/math.test.js:14:12');
    // internal frames stripped
    expect(failRes.formattedText).not.toContain('node:internal/modules/esm/loader');
    expect(failRes.formattedText).not.toContain('node_modules/jest-runner');
    expect(failRes.formattedText).toContain('[Full test failure log: .mcode/artifacts/');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('applyFuzzyHunkEdit rejects whole-file rewrites and applies fuzzy indent edits', () => {
  const initialCode = [
    'function processUser(user) {',
    '    if (!user) {',
    '        return null;',
    '    }',
    '    return user.id;',
    '}',
  ].join('\n');

  // 1. Fuzzy indent match (tabs or different spaces)
  const oldHunk = [
    '  if (!user) {',
    '      return null;',
    '  }',
  ].join('\n');
  const newHunk = [
    '  if (!user) {',
    '      throw new Error("No user");',
    '  }',
  ].join('\n');

  const editRes = applyFuzzyHunkEdit(initialCode, oldHunk, newHunk, 'user.js');
  expect(editRes.matched).toBe(true);
  expect(editRes.newContent).toContain('throw new Error("No user");');
  expect(editRes.newContent).toContain('    return user.id;');

  // 2. Mismatch provides closest matching region diagnostic
  const bogusHunk = [
    '  if (!userData) {',
    '      return undefined;',
    '  }',
  ].join('\n');
  const failRes = applyFuzzyHunkEdit(initialCode, bogusHunk, newHunk, 'user.js');
  expect(failRes.matched).toBe(false);
  expect(failRes.failureMessage).toContain('Closest matching region in user.js');
  expect(failRes.failureMessage).toContain('if (!user) {');
});

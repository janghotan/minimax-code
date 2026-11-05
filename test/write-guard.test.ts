import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalWriteTool } from '../packages/agent-tools/src/desktop/local-pi-tools.js';

describe('LocalWriteTool Write Guard (>60 lines on existing files)', () => {
  let tempDir: string;
  let writeTool: LocalWriteTool;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'write-guard-test-'));
    writeTool = new LocalWriteTool(tempDir);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('allows creating a brand new file of any size (>60 lines)', async () => {
    const lines120 = Array.from({ length: 120 }, (_, i) => `line ${i + 1}`).join('\n');
    const result = await writeTool.execute({} as any, {
      path: 'new_large_file.txt',
      content: lines120,
    });

    expect(result.isError).toBeFalsy();
    const written = readFileSync(join(tempDir, 'new_large_file.txt'), 'utf8');
    expect(written.split('\n').length).toBe(120);
  });

  it('allows overwriting an existing small file (<=60 lines) even if new content >60 lines', async () => {
    const filePath = join(tempDir, 'small_existing.txt');
    const lines20 = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
    writeFileSync(filePath, lines20, 'utf8');

    const lines100 = Array.from({ length: 100 }, (_, i) => `new line ${i + 1}`).join('\n');
    const result = await writeTool.execute({} as any, {
      path: 'small_existing.txt',
      content: lines100,
    });

    expect(result.isError).toBeFalsy();
    const written = readFileSync(filePath, 'utf8');
    expect(written.split('\n').length).toBe(100);
  });

  it('rejects overwriting an existing large file (>60 lines)', async () => {
    const filePath = join(tempDir, 'large_existing.txt');
    const lines80 = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join('\n');
    writeFileSync(filePath, lines80, 'utf8');

    const result = await writeTool.execute({} as any, {
      path: 'large_existing.txt',
      content: 'replacement content',
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Refactor/write rejected: 'large_existing.txt' is an existing file with >60 lines (80 lines)");
    expect(result.text).toContain("you MUST use 'edit' (edit_file) with precise hunks");

    // File content should remain untouched
    const unmutated = readFileSync(filePath, 'utf8');
    expect(unmutated).toBe(lines80);
  });

  it('handles non-existent paths cleanly without throwing ENOENT errors', async () => {
    const lines70 = Array.from({ length: 70 }, (_, i) => `line ${i + 1}`).join('\n');
    const result = await writeTool.execute({} as any, {
      path: 'sub/dir/new_file.txt',
      content: lines70,
    });

    expect(result.isError).toBeFalsy();
    const written = readFileSync(join(tempDir, 'sub/dir/new_file.txt'), 'utf8');
    expect(written.split('\n').length).toBe(70);
  });
});

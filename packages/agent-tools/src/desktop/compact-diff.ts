import { structuredPatch } from 'diff';

/**
 * Generates a compact unified diff showing CHANGED HUNKS ONLY with exactly 2 lines of context.
 * Excludes file headers (`diff --git`, `---`, `+++`, etc.) and non-changed regions.
 */
export function formatCompactUnifiedDiff(
  oldText: string,
  newText: string,
  filePath: string = 'file',
  contextLines: number = 2,
): string {
  if (oldText === newText) {
    return '';
  }

  const patch = structuredPatch(filePath, filePath, oldText, newText, undefined, undefined, {
    context: contextLines,
  });

  if (!patch || patch.hunks.length === 0) {
    return '';
  }

  const hunkStrings = patch.hunks.map((hunk) => {
    const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`;
    return [header, ...hunk.lines].join('\n');
  });

  return hunkStrings.join('\n');
}

/**
 * Formats a raw git diff into compact changed hunks only, stripping redundant diff header banners.
 */
export function formatGitCompactDiff(rawDiff: string): string {
  const lines = rawDiff.split('\n');
  const result: string[] = [];
  let inHunk = false;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      inHunk = true;
      result.push(line);
      continue;
    }
    if (inHunk) {
      if (line.startsWith('diff --git') || line.startsWith('index ')) {
        inHunk = false;
        continue;
      }
      result.push(line);
    }
  }

  return result.join('\n').trim();
}

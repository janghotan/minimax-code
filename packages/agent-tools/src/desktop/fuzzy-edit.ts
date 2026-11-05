import { getLeanAgentSettings } from '@mavis/config';

export interface FuzzyMatchResult {
  readonly matched: boolean;
  readonly newContent?: string;
  readonly failureMessage?: string;
  readonly matchedLines?: { start: number; end: number };
}

/**
 * Applies whitespace- and indent-tolerant fuzzy matching for search/replace hunks.
 * If exact match fails, normalizes line endings and leading/trailing indentation.
 * On failure, identifies the closest matching region with mismatch details.
 */
export function applyFuzzyHunkEdit(
  fileContent: string,
  oldString: string,
  newString: string,
  filePath: string,
): FuzzyMatchResult {
  const settings = getLeanAgentSettings().edit;

  // 1. Guard against accidental full-file rewrites
  const fileLines = fileContent.split(/\r?\n/);
  const oldLines = oldString.split(/\r?\n/);
  if (
    fileLines.length > 10 &&
    oldLines.length >= fileLines.length * 0.95 &&
    oldString.trim() === fileContent.trim()
  ) {
    return {
      matched: false,
      failureMessage:
        `Edit rejected: Whole-file rewrite attempted on ${filePath} (${fileLines.length} lines). ` +
        `Please provide a targeted search/replace hunk with 2-3 lines of surrounding context instead.`,
    };
  }

  // 2. Exact match check
  const exactIndex = fileContent.indexOf(oldString);
  if (exactIndex !== -1) {
    // If exact match occurs multiple times without replace_all handled elsewhere
    const secondIndex = fileContent.indexOf(oldString, exactIndex + oldString.length);
    if (secondIndex === -1) {
      const newContent =
        fileContent.slice(0, exactIndex) + newString + fileContent.slice(exactIndex + oldString.length);
      return { matched: true, newContent };
    }
  }

  if (!settings.fuzzyMatchFallback) {
    return {
      matched: false,
      failureMessage: `Edit failed: old_string was not found in ${filePath}.`,
    };
  }

  // 3. Line-based whitespace- and indentation-tolerant matching
  const trimmedOldLines = oldLines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (trimmedOldLines.length === 0) {
    return {
      matched: false,
      failureMessage: `Edit failed: old_string is empty or only whitespace.`,
    };
  }

  const matches: Array<{ startLine: number; endLine: number }> = [];

  for (let i = 0; i <= fileLines.length - trimmedOldLines.length; i++) {
    let match = true;
    let oldIdx = 0;
    let fileIdx = i;

    while (oldIdx < trimmedOldLines.length && fileIdx < fileLines.length) {
      if (fileLines[fileIdx].trim() === trimmedOldLines[oldIdx]) {
        oldIdx++;
        fileIdx++;
      } else if (fileLines[fileIdx].trim() === '') {
        // Skip empty lines in file
        fileIdx++;
      } else {
        match = false;
        break;
      }
    }

    if (match && oldIdx === trimmedOldLines.length) {
      matches.push({ startLine: i, endLine: fileIdx });
    }
  }

  if (matches.length === 1) {
    const { startLine, endLine } = matches[0];
    // Detect base indentation of the matched region
    const targetIndent = fileLines[startLine].match(/^(\s*)/)?.[1] || '';
    const oldSourceIndent = oldLines[0]?.match(/^(\s*)/)?.[1] || '';

    // Adjust newString lines to match target file indentation
    const newLines = newString.split(/\r?\n/).map((line) => {
      if (line.startsWith(oldSourceIndent) && oldSourceIndent.length > 0) {
        return targetIndent + line.slice(oldSourceIndent.length);
      }
      return line;
    });

    const replaced = [
      ...fileLines.slice(0, startLine),
      ...newLines,
      ...fileLines.slice(endLine),
    ].join('\n');

    return {
      matched: true,
      newContent: replaced,
      matchedLines: { start: startLine + 1, end: endLine },
    };
  }

  if (matches.length > 1) {
    return {
      matched: false,
      failureMessage:
        `Edit failed: old_string matched ${matches.length} different locations in ${filePath} due to identical structure. ` +
        `Include more unique surrounding context lines.`,
    };
  }

  // 4. Find the closest matching region to help the model correct in 1 pass
  const closest = findClosestRegion(fileLines, oldLines);
  const regionContent = fileLines.slice(closest.start, closest.end).join('\n');

  return {
    matched: false,
    failureMessage:
      `Edit failed: exact or whitespace-tolerant match for old_string was not found in ${filePath}.\n\n` +
      `Closest matching region in ${filePath} (lines ${closest.start + 1}-${closest.end}):\n` +
      `----------------------------------------\n` +
      `${regionContent}\n` +
      `----------------------------------------\n` +
      `Hint: Review the closest region above and update old_string to match exact lines.`,
  };
}

function findClosestRegion(
  fileLines: readonly string[],
  oldLines: readonly string[],
): { start: number; end: number } {
  if (fileLines.length <= oldLines.length) {
    return { start: 0, end: fileLines.length };
  }

  const targetLineCount = Math.max(1, oldLines.length);
  let bestScore = -1;
  let bestStart = 0;

  for (let i = 0; i <= fileLines.length - targetLineCount; i++) {
    let score = 0;
    for (let j = 0; j < targetLineCount; j++) {
      const fl = fileLines[i + j].trim();
      const ol = oldLines[j]?.trim() || '';
      if (fl === ol && fl.length > 0) {
        score += 3;
      } else if (fl.includes(ol) || ol.includes(fl)) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestStart = i;
    }
  }

  const start = Math.max(0, bestStart - 1);
  const end = Math.min(fileLines.length, bestStart + targetLineCount + 1);
  return { start, end };
}

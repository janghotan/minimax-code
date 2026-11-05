import { sanitizeTerminalText } from '../../rendering/terminal-text.js';
import type { TranscriptCell } from '../model.js';
import type { TuiDiffPreviewBlock } from '../../../types/runtime-models.js';

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[90m';
const RESET = '\x1b[0m';

/**
 * Parses JSON tool content safely, returning an object or empty record.
 */
function parseToolInput(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // If not json, fall through
  }
  return {};
}

function formatDuration(ms?: number): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Formats a tool execution cell as an ultra-compact single line with emojis.
 * additions in green, deletions in red:
 *   ✏️  src/index.ts (+23)(-2)
 *   ✅ $ npm test 4.2s     (❌ on non-zero exit)
 *   📖 src/api.ts 120L
 *   🔍 grep "foo" 14 matches
 */
export function formatUltraCompactToolLine(cell: TranscriptCell, maxWidth?: number): string {
  const title = (cell.title ?? '').toLowerCase();
  const input = parseToolInput(cell.content);
  const isFailed = cell.status === 'failed';

  // 1. Edit / Write tools
  if (
    title === 'edit_file' ||
    title === 'edit' ||
    title === 'write_file' ||
    title === 'write' ||
    title === 'patch' ||
    title === 'apply_patch' ||
    title === 'update_file' ||
    title === 'create_file' ||
    cell.kind === 'diff'
  ) {
    const diffBlock = cell.structuredPreview?.blocks?.find(
      (b): b is TuiDiffPreviewBlock => b.kind === 'diff',
    );
    const rawPath =
      (input.file_path as string) ||
      (input.filePath as string) ||
      (input.path as string) ||
      (input.file as string) ||
      diffBlock?.path ||
      'file';
    const filePath = sanitizeTerminalText(rawPath).trim();

    let added = diffBlock?.addedLines ?? 0;
    let removed = diffBlock?.removedLines ?? 0;

    // Fallback 1: Extract from edit/write tool input arguments
    if (added === 0 && removed === 0) {
      const oldHunk =
        (input.old_hunk as string) ||
        (input.old_str as string) ||
        (input.oldContent as string) ||
        (input.target as string) ||
        (input.Target as string);
      const newHunk =
        (input.new_hunk as string) ||
        (input.new_str as string) ||
        (input.newContent as string) ||
        (input.replacement as string) ||
        (input.Replacement as string);

      if (oldHunk !== undefined || newHunk !== undefined) {
        if (oldHunk) removed = oldHunk.split('\n').length;
        if (newHunk) added = newHunk.split('\n').length;
      } else {
        const fullContent = (input.content as string) || (input.Content as string);
        if (fullContent !== undefined) {
          added = fullContent.split('\n').length;
        }
      }
    }

    // Fallback 2: Parse unified diff lines in cell.detail or cell.content
    if (added === 0 && removed === 0) {
      const diffText = (cell.detail ?? '') + '\n' + (typeof cell.content === 'string' ? cell.content : '');
      let countAdd = 0;
      let countRem = 0;
      for (const line of diffText.split('\n')) {
        if (line.startsWith('+') && !line.startsWith('+++')) countAdd++;
        else if (line.startsWith('-') && !line.startsWith('---')) countRem++;
      }
      if (countAdd > 0 || countRem > 0) {
        added = countAdd;
        removed = countRem;
      }
    }

    // Fallback 3: Guarantee visible diff badge on edits/writes
    if (added === 0 && removed === 0) {
      if (title.includes('write') || title.includes('create')) {
        added = 1;
      } else {
        added = 1;
        removed = 1;
      }
    }

    let deltaStr = '';
    if (added > 0 && removed > 0) {
      deltaStr = ` ${GREEN}(+${added})${RESET}${RED}(-${removed})${RESET}`;
    } else if (added > 0) {
      deltaStr = ` ${GREEN}(+${added})${RESET}`;
    } else if (removed > 0) {
      deltaStr = ` ${RED}(-${removed})${RESET}`;
    }

    return `✏️  ${filePath}${deltaStr}`;
  }

  // 2. Bash / Command execution
  if (title === 'bash' || title === 'exec' || title === 'shell') {
    const icon = isFailed ? '❌' : '✅';
    const rawCommand =
      (input.command as string) ||
      (input.cmd as string) ||
      cell.content.split('\n')[0] ||
      'command';
    const command = sanitizeTerminalText(rawCommand).trim();
    const duration = formatDuration(cell.durationMs);
    const durationSuffix = duration ? ` ${DIM}${duration}${RESET}` : '';

    return `${icon} $ ${command}${durationSuffix}`;
  }

  // 3. Read file
  if (title === 'read_file' || title === 'read') {
    const rawPath =
      (input.file_path as string) ||
      (input.filePath as string) ||
      (input.path as string) ||
      'file';
    const filePath = sanitizeTerminalText(rawPath).trim();

    let lineCount = input.limit ?? input.line_count ?? input.lineCount;
    if (lineCount === undefined && cell.detail) {
      const match = cell.detail.match(/lines \d+-(\d+) of (\d+)/i);
      if (match?.[1]) {
        lineCount = match[1];
      } else {
        lineCount = cell.detail.split('\n').length;
      }
    }
    const linesStr = lineCount !== undefined ? ` ${lineCount}L` : '';

    return `📖 ${filePath}${linesStr}`;
  }

  // 4. Grep / Glob search
  if (title === 'grep' || title === 'glob') {
    const pattern =
      (input.pattern as string) ||
      (input.query as string) ||
      (input.path as string) ||
      '';
    const sanitizedPattern = sanitizeTerminalText(pattern).trim();

    let matchCount = 0;
    if (cell.detail) {
      const matchHeader = cell.detail.match(/(\d+)\s+matches?/i);
      if (matchHeader?.[1]) {
        matchCount = parseInt(matchHeader[1], 10);
      } else {
        matchCount = cell.detail.trim().split('\n').filter(Boolean).length;
      }
    }

    const queryStr = sanitizedPattern ? ` "${sanitizedPattern}"` : '';
    const matchLabel = `${matchCount} match${matchCount === 1 ? '' : 'es'}`;
    return `🔍 ${title}${queryStr} ${matchLabel}`;
  }

  // 5. Git tool
  if (title === 'git') {
    const icon = isFailed ? '❌' : '✅';
    const sub = (input.subcommand as string) || (input.command as string) || '';
    const duration = formatDuration(cell.durationMs);
    const durationSuffix = duration ? ` ${DIM}${duration}${RESET}` : '';
    return `${icon} $ git ${sub}${durationSuffix}`.trim();
  }

  // Default fallback for any other tool
  const icon = isFailed ? '❌' : '⚙️ ';
  const summary = sanitizeTerminalText(cell.content).split('\n')[0] || '';
  return `${icon} ${title}${summary ? ` · ${summary}` : ''}`;
}

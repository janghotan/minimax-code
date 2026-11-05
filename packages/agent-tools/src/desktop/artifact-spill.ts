import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getLeanAgentSettings } from '@mavis/config';

export interface SpillResult {
  readonly isSpilled: boolean;
  readonly text: string;
  readonly artifactPath?: string;
  readonly relativePath?: string;
  readonly totalBytes: number;
  readonly totalLines: number;
}

/**
 * Checks if tool output exceeds inline budget (8 KB or 200 lines by default).
 * If over budget, writes full output to .mcode/artifacts/<id>.txt in workspace
 * and returns bounded head/tail preview with instructions for the model.
 */
export function spillToolOutput(
  rawText: string,
  workspaceRoot: string,
  options: {
    toolName: string;
    exitCode?: number | null;
    customHint?: string;
    maxBytes?: number;
    maxLines?: number;
  },
): SpillResult {
  const settings = getLeanAgentSettings().toolOutput;
  const maxBytes = options.maxBytes ?? settings.maxInlineBytes;
  const maxLines = options.maxLines ?? settings.maxInlineLines;

  const totalBytes = Buffer.byteLength(rawText, 'utf8');
  const lines = rawText.split('\n');
  const totalLines = lines.length;

  if (totalBytes <= maxBytes && totalLines <= maxLines) {
    return {
      isSpilled: false,
      text: rawText,
      totalBytes,
      totalLines,
    };
  }

  // Generate unique artifact filename
  const safeTool = options.toolName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const id = `${safeTool}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const artifactRel = path.join(settings.artifactDir, `${id}.txt`);
  const artifactAbs = path.join(workspaceRoot, artifactRel);

  try {
    mkdirSync(path.dirname(artifactAbs), { recursive: true });
    writeFileSync(artifactAbs, rawText, 'utf8');
  } catch (err) {
    // If writing fails, fall back to standard head/tail truncation
    const head = lines.slice(0, 30).join('\n');
    const tail = lines.slice(-30).join('\n');
    return {
      isSpilled: true,
      text: `${head}\n\n[Output truncated: ${totalLines} lines, ${totalBytes} bytes. Artifact save failed: ${String(err)}]\n\n${tail}`,
      totalBytes,
      totalLines,
    };
  }

  // Extract head and tail lines
  const previewLineBudget = 35;
  const headLines = lines.slice(0, previewLineBudget);
  const tailLines = lines.slice(-previewLineBudget);
  const omittedLines = Math.max(0, totalLines - headLines.length - tailLines.length);

  const headText = headLines.join('\n');
  const tailText = tailLines.join('\n');

  const exitInfo =
    options.exitCode !== undefined && options.exitCode !== null
      ? `Exit code: ${options.exitCode}\n`
      : '';

  const hint =
    options.customHint ??
    `Use read_file with offset/limit or grep on the artifact to inspect specific sections.`;

  const formatted = [
    `[Tool output capped: ${totalLines} lines (${totalBytes} bytes) exceeds limit (${maxLines} lines / ${Math.round(maxBytes / 1024)} KB)]`,
    `Full output saved to: ${artifactRel}`,
    exitInfo ? exitInfo.trim() : '',
    `--- Head (lines 1-${headLines.length}) ---`,
    headText,
    omittedLines > 0 ? `\n... [${omittedLines} lines omitted. Full log: ${artifactRel}] ...\n` : '',
    `--- Tail (lines ${totalLines - tailLines.length + 1}-${totalLines}) ---`,
    tailText,
    `--- End of preview ---`,
    `Hint: ${hint}`,
  ]
    .filter(Boolean)
    .join('\n');

  return {
    isSpilled: true,
    text: formatted,
    artifactPath: artifactAbs,
    relativePath: artifactRel,
    totalBytes,
    totalLines,
  };
}

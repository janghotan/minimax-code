import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { bindTool, type ToolDefinition, type ToolImpl, type ToolResult } from '@mavis/agent-core/tools';
import { LeanGitSchema } from './lean-tool-schemas.js';
import { spillToolOutput } from './artifact-spill.js';
import type { LocalRuntimeToolContext } from './types.js';
import type { Static } from '@sinclair/typebox';

const execFileAsync = promisify(execFile);

export type LocalGitToolInput = Static<typeof LeanGitSchema>;

export const LocalGitToolDef = {
  name: 'git',
  executionMode: 'parallel',
  description: 'Run git commands in the workspace repository.',
  schema: LeanGitSchema,
} as const satisfies ToolDefinition;

@bindTool(LocalGitToolDef)
export class LocalGitTool implements ToolImpl<typeof LeanGitSchema, LocalRuntimeToolContext> {
  readonly def = LocalGitToolDef;

  constructor(private readonly workspaceRoot: string) {}

  async execute(
    _ctx: LocalRuntimeToolContext,
    input: LocalGitToolInput,
    signal?: AbortSignal,
  ): Promise<ToolResult> {
    if (signal?.aborted) {
      throw new Error('Operation aborted');
    }

    const rawArgs = input.args.trim();
    // Default status to compact -sb
    let effectiveArgs = rawArgs;
    if (effectiveArgs === 'status' || effectiveArgs === 'status -s') {
      effectiveArgs = 'status -sb';
    }

    // Split args string into argv safely (respecting simple quotes)
    const argv = parseShellArgs(effectiveArgs);

    // If command is broad git diff, check stat first
    const isDiff = argv[0] === 'diff';
    const isBroadDiff = isDiff && argv.length === 1;

    try {
      if (isBroadDiff) {
        // Run diff --stat and full diff
        const [statRes, fullDiffRes] = await Promise.all([
          execFileAsync('git', ['diff', '--stat'], {
            cwd: this.workspaceRoot,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
            signal,
          }).catch(() => ({ stdout: '', stderr: '' })),
          execFileAsync('git', ['diff'], {
            cwd: this.workspaceRoot,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
            signal,
          }),
        ]);

        const fullDiff = fullDiffRes.stdout;
        const diffLines = fullDiff.split('\n').length;

        if (diffLines > 200) {
          const spilled = spillToolOutput(fullDiff, this.workspaceRoot, {
            toolName: 'git-diff',
            maxLines: 200,
            customHint: `Diff exceeds 200 lines. Request specific files via 'git diff -- <file>'.`,
          });
          const text = [
            statRes.stdout.trim(),
            '',
            `[Large diff (${diffLines} lines). Full diff saved to ${spilled.relativePath ?? 'artifact'}]`,
            `[Hint: Request specific files using 'git diff -- <path>']`,
            '',
            spilled.text,
          ].join('\n');
          return {
            tool_name: 'git',
            text,
            content: [{ type: 'text', text }],
            isError: false,
          };
        }

        const text = fullDiff || statRes.stdout || 'No changes detected.';
        return {
          tool_name: 'git',
          text,
          content: [{ type: 'text', text }],
          isError: false,
        };
      }

      // Normal git command
      const { stdout, stderr } = await execFileAsync('git', argv, {
        cwd: this.workspaceRoot,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        signal,
      });

      const output = (stdout + (stderr ? `\n${stderr}` : '')).trim();
      const spilled = spillToolOutput(output || '(no output)', this.workspaceRoot, {
        toolName: 'git',
        maxLines: 200,
      });

      return {
        tool_name: 'git',
        text: spilled.text,
        content: [{ type: 'text', text: spilled.text }],
        isError: false,
      };
    } catch (err: any) {
      const errorText = err.stderr || err.stdout || err.message || String(err);
      return {
        tool_name: 'git',
        text: errorText.trim(),
        content: [{ type: 'text', text: errorText.trim() }],
        isError: true,
      };
    }
  }
}

function parseShellArgs(cmd: string): string[] {
  const match = cmd.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g);
  if (!match) return [];
  return match.map((arg) => {
    if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
      return arg.slice(1, -1);
    }
    return arg;
  });
}

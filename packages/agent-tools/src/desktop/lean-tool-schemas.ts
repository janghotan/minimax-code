import { Type, type Static } from '@sinclair/typebox';

/**
 * Lean 7-tool definitions:
 * Exactly 7 tools: bash, read_file, edit_file, write_file, glob, grep, git.
 * Schema descriptions are terse with minimal params.
 */

export const LeanBashSchema = Type.Object({
  command: Type.String({ description: 'Bash command to execute in workspace' }),
});

export const LeanBashTool = {
  name: 'bash',
  description: 'Execute a bash shell command in the workspace.',
  parameters: LeanBashSchema,
} as const;

export const LeanReadFileSchema = Type.Object({
  path: Type.String({ description: 'Workspace-relative or absolute file path' }),
  offset: Type.Optional(Type.Number({ description: '1-indexed starting line' })),
  limit: Type.Optional(Type.Number({ description: 'Maximum lines to read (default 300)' })),
});

export const LeanReadFileTool = {
  name: 'read_file',
  description: 'Read lines from a file with optional offset and limit.',
  parameters: LeanReadFileSchema,
} as const;

export const LeanEditFileSchema = Type.Object({
  path: Type.String({ description: 'File path to modify' }),
  old_hunk: Type.String({ description: 'Exact text hunk to replace' }),
  new_hunk: Type.String({ description: 'Replacement text hunk' }),
});

export const LeanEditSchema = Type.Object({
  file_path: Type.String({ description: 'File path to modify' }),
  old_string: Type.String({ description: 'Exact text hunk to replace' }),
  new_string: Type.String({ description: 'Replacement text hunk' }),
  replace_all: Type.Optional(Type.Boolean({ description: 'Replace all occurrences' })),
});

export const LeanEditFileTool = {
  name: 'edit_file',
  description: 'Replace an exact hunk of text in a file with new text.',
  parameters: LeanEditFileSchema,
} as const;

export const LeanWriteFileSchema = Type.Object({
  path: Type.String({ description: 'File path to write' }),
  content: Type.String({ description: 'Full file content to write' }),
});

export const LeanWriteFileTool = {
  name: 'write_file',
  description: 'Write full content to a file (new files or full overwrites).',
  parameters: LeanWriteFileSchema,
} as const;

export const LeanGlobSchema = Type.Object({
  pattern: Type.String({ description: 'Glob pattern to match files (e.g. "**/*.ts")' }),
  path: Type.Optional(Type.String({ description: 'Base directory to search in' })),
});

export const LeanGlobTool = {
  name: 'glob',
  description: 'Find file paths matching a glob pattern.',
  parameters: LeanGlobSchema,
} as const;

export const LeanGrepSchema = Type.Object({
  pattern: Type.String({ description: 'Regex pattern to search for' }),
  path: Type.Optional(Type.String({ description: 'Directory or file to search' })),
});

export const LeanGrepTool = {
  name: 'grep',
  description: 'Search for a regex pattern in workspace files.',
  parameters: LeanGrepSchema,
} as const;

export const LeanGitSchema = Type.Object({
  args: Type.String({ description: 'Git arguments (e.g. "status -s", "diff")' }),
});

export const LeanGitTool = {
  name: 'git',
  description: 'Run git commands in the workspace repository.',
  parameters: LeanGitSchema,
} as const;

export const LEAN_TOOL_DEFS: Record<string, { description: string; schema: any }> = {
  bash: {
    description: 'Execute a bash shell command in the workspace.',
    schema: LeanBashSchema,
  },
  read: {
    description: 'Read lines from a file with optional offset and limit.',
    schema: LeanReadFileSchema,
  },
  read_file: {
    description: 'Read lines from a file with optional offset and limit.',
    schema: LeanReadFileSchema,
  },
  write: {
    description: 'Write full content to a file (new files or full overwrites).',
    schema: LeanWriteFileSchema,
  },
  write_file: {
    description: 'Write full content to a file (new files or full overwrites).',
    schema: LeanWriteFileSchema,
  },
  edit: {
    description: 'Replace an exact hunk of text in a file with new text.',
    schema: LeanEditSchema,
  },
  edit_file: {
    description: 'Replace an exact hunk of text in a file with new text.',
    schema: LeanEditFileSchema,
  },
  glob: {
    description: 'Find file paths matching a glob pattern.',
    schema: LeanGlobSchema,
  },
  grep: {
    description: 'Search for a regex pattern in workspace files.',
    schema: LeanGrepSchema,
  },
  git: {
    description: 'Run git commands in the workspace repository.',
    schema: LeanGitSchema,
  },
};

export const LEAN_SEVEN_TOOLS = [
  LeanBashTool,
  LeanReadFileTool,
  LeanEditFileTool,
  LeanWriteFileTool,
  LeanGlobTool,
  LeanGrepTool,
  LeanGitTool,
] as const;

export const LEAN_SYSTEM_PROMPT = `# Role & Discipline
You are an expert terminal coding agent. You solve software engineering tasks with high precision and minimal token usage.
- Senior Staff Engineer: Produce clean, type-safe, performant, and production-ready code with robust architecture.
- Be terse. Do not praise, chatter, summarize unasked, or use filler phrases.
- No text before tool calls. After finishing, give one short final report.
- Minimal output: Never output long explanations, markdown code blocks, or rewrites in conversational text. Emitted tool call arguments must be minimal. Final report must be strictly under 10 lines.
- Numbered Task Checklist: When the user request contains numbered tasks (1., 2., 3...), you MUST step through each numbered task and execute/verify EVERY numbered task with a concrete command (e.g. grep, test, diff) before concluding. If any task is unexecuted or unverified, you MUST execute it before reporting done. Never stop early or report done if any task is unexecuted.
- Execute multiple independent tool calls in parallel within a single turn when possible.
- Do NOT run exploratory environment discovery commands (git status, .gitignore, check-ignore, ls .venv). Rely on preflight facts in context; only probe if a command fails.
- Finish immediately when all requested tasks are done and tests pass (at most one final test run and one diff --stat).
- Never echo file contents back in conversational responses.

# Tool Usage Discipline
- grep-before-read: Search with grep or glob to locate definitions or errors before reading files.
- ranges: Use offset and limit with read on files over 100 lines. Do not read entire large files blindly.
- diff-only edits: ALWAYS use edit with precise old_string/old_hunk and new_string/new_hunk. Keep hunks small and focused (only changed lines). Do NOT re-implement unneeded wrapper methods or write unrequested comments/docstrings. Never rewrite entire files with write if the file has >60 lines (write on files >60 lines will be rejected).
- test backpressure: Rely on concise test/build receipts. Do not repeat raw command logs.
- git: Run git to inspect repository status and diffs when verifying changes.`;

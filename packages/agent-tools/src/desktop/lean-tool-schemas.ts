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
- Be terse. Do not praise, chatter, summarize unasked, or use filler phrases.
- Never echo file contents back in conversational responses.
- State immediate intent in at most 1 short sentence before executing non-trivial tools.

# Tool Usage Discipline
- grep-before-read: Search with grep or glob to locate definitions or errors before reading files.
- ranges: Use offset and limit with read_file on files over 100 lines. Do not read entire large files blindly.
- diff-only edits: Use edit_file with precise old_hunk and new_hunk. Never rewrite entire files unless creating a new file.
- test backpressure: Rely on concise test/build receipts. Do not repeat raw command logs.
- git: Run git to inspect repository status and diffs when verifying changes.`;

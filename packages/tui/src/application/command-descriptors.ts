export interface TuiCommandDescriptor {
  readonly name: string;
  readonly description: string;
}

export const TUI_COMMAND_DESCRIPTORS = {
  help: {
    name: 'help',
    description: 'Show available commands',
  },
  new: {
    name: 'new',
    description: 'Start a fresh session in the current workspace',
  },
  model: {
    name: 'model',
    description: 'Choose a model',
  },
  status: {
    name: 'status',
    description: 'Show account and model status',
  },
  doctor: {
    name: 'doctor',
    description: 'Check the local config file',
  },
  context: {
    name: 'context',
    description: 'Show the Runtime-owned context snapshot',
  },
  skills: {
    name: 'skills',
    description: 'List built-in and user Skills',
  },
  mcp: {
    name: 'mcp',
    description: 'Inspect MCP capabilities and project configuration',
  },
  usage: {
    name: 'usage',
    description: 'Print top 5 most expensive LLM calls, avg input/call, and cache stats',
  },
  compact: {
    name: 'compact',
    description: 'Shorten the active conversation',
  },
  diff: {
    name: 'diff',
    description: 'Show git status and compact unified diff',
  },
  test: {
    name: 'test',
    description: 'Run project tests with output backpressure',
  },
  undo: {
    name: 'undo',
    description: 'Revert the last file edit via checkpoint',
  },
  cost: {
    name: 'cost',
    description: 'Show session token and cost breakdown in CNY',
  },
  price: {
    name: 'price',
    description: 'Configure model pricing (/price set <model> <hit> <miss> <out>)',
  },
  language: {
    name: 'language',
    description: 'Switch TUI language between English and Simplified Chinese (/language en|zh)',
  },
  export: {
    name: 'export',
    description: 'Export the current Session as Markdown',
  },
} as const satisfies Record<string, TuiCommandDescriptor>;

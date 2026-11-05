import { getRuntimeLocaleLanguage } from '@mavis/shared/runtime-i18n';

export const MINIMAX_CODE_WELCOME_PASTE_IMAGE_SHORTCUT = '{paste-image-shortcut}';
const MINIMAX_CODE_WELCOME_CHECKIN_TIP = '/cost shows token usage and CNY cost breakdown.';

export const MINIMAX_CODE_WELCOME_DESIGN = {
  sectionTitles: {
    tips: 'Tips for getting started',
    news: "What's new · /changelog for history",
  },
  tipPool: [
    'Say what you want and how to verify it.',
    `Use @ for files; ${MINIMAX_CODE_WELCOME_PASTE_IMAGE_SHORTCUT} for images.`,
    'Use /diff to view compact uncommitted hunks.',
    'Use /cost to check session CNY cost breakdown.',
    'Use /language to switch between English and Chinese.',
    'Use /test to run tests with backpressure.',
    'Use /undo to revert the last file edit.',
    'Use /plan before a change that needs design or investigation.',
    'Use /context to check the current Session context budget.',
    'Use /sessions to resume earlier work.',
    'Use /history to review and branch from earlier prompts.',
    'Use /goal to keep long-running work focused on a finish line.',
    'Use /permission to choose how MCode handles tool approvals.',
    MINIMAX_CODE_WELCOME_CHECKIN_TIP,
  ],
  wide: {
    tips: [
      'Say what you want and how to verify it.',
      `@ files · ${MINIMAX_CODE_WELCOME_PASTE_IMAGE_SHORTCUT} images · /language switch`,
      'Use /diff for compact hunks · /undo to revert edit',
      MINIMAX_CODE_WELCOME_CHECKIN_TIP,
    ],
    news: [
      'Send follow-ups while MCode works.',
      '/context shows read-only session context.',
      '/feedback previews before upload.',
    ],
  },
  stacked: {
    tips: [
      'Say what you want and how to verify it.',
      `@ files · ${MINIMAX_CODE_WELCOME_PASTE_IMAGE_SHORTCUT} images · /language switch`,
      '/cost breakdown · /diff compact · /undo revert',
    ],
    news: ['Follow-ups wait while MCode works.', '/context budget · /feedback preview'],
  },
  compact: {
    tips: [
      `@ files · ${MINIMAX_CODE_WELCOME_PASTE_IMAGE_SHORTCUT} images · /language switch`,
      '/cost breakdown · /diff compact',
      '/undo revert last edit',
    ],
    news: ['Follow-ups wait', '/context · /feedback'],
  },
  hero: {
    fullMinWidth: 91,
    mediumMinWidth: 44,
    microMinWidth: 11,
    fallbackTitle: 'M',
  },
} as const;

export const MINIMAX_CODE_WELCOME_DESIGN_ZH = {
  sectionTitles: {
    tips: '新手快速上手指南',
    news: '最新功能 · /changelog 查看历史',
  },
  tipPool: [
    '直接描述目标和验证方式，AI 自主编码并验证。',
    `输入 @ 引用文件；${MINIMAX_CODE_WELCOME_PASTE_IMAGE_SHORTCUT} 粘贴图片。`,
    '输入 /diff 查看紧凑未提交代码改动。',
    '输入 /cost 查看会话 Token 消耗及人民币花费。',
    '输入 /language 或 /lang 切换中英文界面。',
    '输入 /test 运行测试并在失败时智能回压诊断。',
    '输入 /undo 撤销上一次文件编辑。',
    '在复杂方案或需深度调研时，使用 /plan 模式。',
    '输入 /context 查看当前会话上下文容量与用量。',
    '输入 /sessions 恢复之前的历史会话。',
    '输入 /history 查看历史提示词并随时创建分支。',
    '输入 /permission 配置工具执行审批权限。',
    '输入 /cost 显示 Token 用量及人民币消耗详情。',
  ],
  wide: {
    tips: [
      '直接描述需求与验证方式，AI 自主执行并自动验证。',
      `@ 引用文件 · ${MINIMAX_CODE_WELCOME_PASTE_IMAGE_SHORTCUT} 粘贴图片 · /language 切换语言`,
      '使用 /diff 紧凑差异 · /cost 成本统计 · /undo 撤销编辑',
      '/cost 随时查看会话 Token 用量与人民币计费。',
    ],
    news: [
      '在 MiniMax 处理任务时仍可并发发送后续指令。',
      '/context 查看只读会话上下文与预算占用。',
      '/feedback 在上传前支持本地预览。',
    ],
  },
  stacked: {
    tips: [
      '直接描述需求与验证方式，AI 自主执行并验证。',
      `@ 引用文件 · ${MINIMAX_CODE_WELCOME_PASTE_IMAGE_SHORTCUT} 图片 · /language 切换语言`,
      '/cost 计费统计 · /diff 紧凑对比 · /undo 撤销编辑',
    ],
    news: ['MiniMax 执行期间可随时追加消息。', '/context 容量预算 · /feedback 预览'],
  },
  compact: {
    tips: [
      `@ 引用文件 · ${MINIMAX_CODE_WELCOME_PASTE_IMAGE_SHORTCUT} 图片 · /language 语言`,
      '/cost 计费统计 · /diff 紧凑差异',
      '/undo 撤销上一次修改',
    ],
    news: ['支持并发追问', '/context · /feedback'],
  },
  hero: {
    fullMinWidth: 91,
    mediumMinWidth: 44,
    microMinWidth: 11,
    fallbackTitle: 'M',
  },
} as const;

export function getWelcomeDesign(locale?: string): typeof MINIMAX_CODE_WELCOME_DESIGN {
  return getRuntimeLocaleLanguage(locale) === 'zh'
    ? (MINIMAX_CODE_WELCOME_DESIGN_ZH as unknown as typeof MINIMAX_CODE_WELCOME_DESIGN)
    : MINIMAX_CODE_WELCOME_DESIGN;
}

export const MINIMAX_CODE_TERMINAL_WORDMARK = [
  '███╗   ███╗██╗███╗   ██╗██╗███╗   ███╗ █████╗ ██╗  ██╗     ██████╗ ██████╗ ██████╗ ███████╗',
  '████╗ ████║██║████╗  ██║██║████╗ ████║██╔══██╗╚██╗██╔╝    ██╔════╝██╔═══██╗██╔══██╗██╔════╝',
  '██╔████╔██║██║██╔██╗ ██║██║██╔████╔██║███████║ ╚███╔╝     ██║     ██║   ██║██║  ██║█████╗',
  '██║╚██╔╝██║██║██║╚██╗██║██║██║╚██╔╝██║██╔══██║ ██╔██╗     ██║     ██║   ██║██║  ██║██╔══╝',
  '██║ ╚═╝ ██║██║██║ ╚████║██║██║ ╚═╝ ██║██║  ██║██╔╝ ██╗    ╚██████╗╚██████╔╝██████╔╝███████╗',
  '╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝     ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝',
] as const;

export const MINIMAX_CODE_TERMINAL_MEDIUM_WORDMARK = [
  '███╗   ███╗ ██████╗ ██████╗ ██████╗ ███████╗',
  '████╗ ████║██╔════╝██╔═══██╗██╔══██╗██╔════╝',
  '██╔████╔██║██║     ██║   ██║██║  ██║█████╗',
  '██║╚██╔╝██║██║     ██║   ██║██║  ██║██╔══╝',
  '██║ ╚═╝ ██║╚██████╗╚██████╔╝██████╔╝███████╗',
  '╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝',
] as const;

export const MINIMAX_CODE_TERMINAL_MICRO_WORDMARK = [
  '███╗   ███╗',
  '████╗ ████║',
  '██╔████╔██║',
  '██║╚██╔╝██║',
  '██║ ╚═╝ ██║',
  '╚═╝     ╚═╝',
] as const;

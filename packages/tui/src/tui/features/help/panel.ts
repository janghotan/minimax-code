import { panelLayout } from '../../widgets/panel-frame.js';
import { decodePrintableKey, matchesKey } from '../../engine/public.js';
import type { Component } from '../../rendering/component.js';
import { truncateToWidth } from '../../rendering/text.js';
import {
  formatTuiCommandUsage,
  isTuiCommandDiscoverable,
  type TuiCommand,
} from '../../commands/catalog.js';
import {
  renderTuiActionHint,
  tuiChalk as chalk,
  tuiColors as colors,
} from '../../theme/runtime.js';
import {
  formatTuiKeybinding,
  getDefaultTuiKeybindingRegistry,
  type TuiKeybindingRegistry,
} from '../../shell/keybindings.js';
import { getRuntimeLocaleLanguage } from '@mavis/shared/runtime-i18n';

const COMMAND_DESCRIPTIONS_ZH: Readonly<Record<string, string>> = {
  help: '显示可用斜杠命令与快捷键帮助',
  new: '在当前工作区开启新会话',
  model: '切换或查看 AI 模型',
  status: '查看账户、模型及运行状态',
  doctor: '诊断本地环境与配置文件',
  context: '查看会话上下文快照与 Token 占用',
  skills: '列出内置与用户定义的技能',
  mcp: '查看 MCP 工具与项目配置',
  usage: '查看当前会话 Token 用量与统计',
  compact: '精简压缩当前会话上下文',
  diff: '查看 Git 状态与紧凑代码差异',
  test: '执行项目测试并附带背压诊断',
  undo: '撤销上一次文件编辑操作',
  cost: '查看会话 Token 消耗及人民币花费统计',
  language: '切换中英文界面 (/language [zh|en])',
  lang: '切换中英文界面 (/lang [zh|en])',
  locale: '切换中英文界面 (/locale [zh|en])',
  export: '将当前会话导出为 Markdown 文件',
  feedback: '提交产品使用反馈',
  changelog: '查看版本更新日志与更新历史',
  permission: '配置工具调用权限模式 (询问/自动/完全访问)',
  sessions: '管理与恢复历史会话',
  history: '查看历史消息并创建分支',
  plan: '切换或退出计划模式',
  tasks: '查看后台任务与 Agent 执行状态',
  settings: '打开设置面板',
};

export interface TuiHelpPanelOptions {
  commands: readonly TuiCommand[];
  queueEnabled?: boolean;
  keybindings?: TuiKeybindingRegistry;
  maxRows?: number | (() => number);
  onCancel: () => void;
}

export class TuiHelpPanel implements Component {
  readonly fullscreenViewport = true;
  readonly handlesViewportKeys = true;
  private readonly commands: readonly TuiCommand[];
  private readonly options: TuiHelpPanelOptions;
  private scrollTop = 0;
  private viewportRows = 9;

  constructor(options: TuiHelpPanelOptions) {
    this.options = options;
    this.commands = dedupeCommands(options.commands)
      .filter(isTuiCommandDiscoverable)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  handleInput(data: string): void {
    const printable = decodePrintableKey(data) ?? data;
    if (
      matchesKey(data, 'escape') ||
      matchesKey(data, 'enter') ||
      matchesKey(data, 'ctrl+c') ||
      printable === 'q' ||
      printable === 'Q'
    ) {
      this.options.onCancel();
      return;
    }
    if (matchesKey(data, 'up')) {
      this.scrollTop = Math.max(0, this.scrollTop - 1);
      return;
    }
    if (matchesKey(data, 'down')) {
      this.scrollTop += 1;
      return;
    }
    if (matchesKey(data, 'pageUp')) {
      this.scrollTop = Math.max(0, this.scrollTop - this.pageStep());
      return;
    }
    if (matchesKey(data, 'pageDown')) {
      this.scrollTop += this.pageStep();
    }
  }

  invalidate(): void {}

  render(width: number): string[] {
    return this.renderViewport(width, this.currentMaxRows() ?? Infinity);
  }

  renderViewport(width: number, height: number): string[] {
    const initial = panelLayout(width, height, this.renderFooter());
    const content = this.renderContent(initial.contentWidth);
    const footer = this.renderFooter({
      first: content.length,
      last: content.length,
      total: content.length,
    });
    const layout = panelLayout(width, height, footer);
    const visibleRows = Math.max(1, layout.bodyHeight);
    this.viewportRows = Number.isFinite(visibleRows) ? visibleRows : content.length;
    this.scrollTop = Math.max(
      0,
      Math.min(this.scrollTop, Math.max(0, content.length - visibleRows)),
    );
    const visible = content.slice(this.scrollTop, this.scrollTop + visibleRows);
    const position =
      content.length > visibleRows
        ? {
            first: this.scrollTop + 1,
            last: this.scrollTop + visible.length,
            total: content.length,
          }
        : undefined;
    const isZh = getRuntimeLocaleLanguage() === 'zh';
    return panelLayout(width, height, this.renderFooter(position)).render({
      title: isZh ? '帮助' : 'Help',
      body: visible,
    });
  }

  private renderContent(width: number): string[] {
    const isZh = getRuntimeLocaleLanguage() === 'zh';
    const queueEnabled = this.options.queueEnabled ?? true;
    const keybindings = this.options.keybindings ?? getDefaultTuiKeybindingRegistry();
    const shortcuts = [
      ...keybindings.helpRows(queueEnabled).map((row) => ({
        keys: row.keys,
        description: row.description,
      })),
      {
        keys: 'Enter',
        description: isZh
          ? queueEnabled
            ? '发送；MiniMax 执行时排队下一条'
            : '空闲时发送'
          : queueEnabled
            ? 'Send; while MCode works it sends next'
            : 'Send while idle',
      },
    ];
    const commandLabelWidth = columnWidth(this.commands.map(formatTuiCommandUsage), width, 12);
    const shortcutLabelWidth = columnWidth(
      shortcuts.map((shortcut) => shortcut.keys),
      width,
      8,
    );

    return [
      `  ${chalk.bold.hex(colors.text)(isZh ? '快捷键' : 'Keyboard shortcuts')}`,
      ...shortcuts.map((shortcut) =>
        formatHelpRow(shortcut.keys, shortcut.description, shortcutLabelWidth, width, (value) =>
          chalk.hex(colors.signal)(value),
        ),
      ),
      '',
      `  ${chalk.bold.hex(colors.text)(isZh ? '斜杠命令' : 'Slash commands')}`,
      ...this.commands.map((command) => {
        const usage = formatTuiCommandUsage(command);
        const description =
          (isZh && COMMAND_DESCRIPTIONS_ZH[command.name.toLowerCase()]) || command.description;
        return formatHelpRow(usage, description, commandLabelWidth, width, (value) =>
          chalk.hex(colors.signal)(value),
        );
      }),
    ];
  }

  private renderFooter(position?: { first: number; last: number; total: number }): string {
    const isZh = getRuntimeLocaleLanguage() === 'zh';
    const keybindings = this.options.keybindings ?? getDefaultTuiKeybindingRegistry();
    const closeKey = formatTuiKeybinding('app.interrupt', keybindings);
    const close = isZh
      ? closeKey === 'Esc'
        ? 'Esc 关闭'
        : `Esc 关闭 · ${closeKey} 关闭`
      : closeKey === 'Esc'
        ? 'Esc close'
        : `Esc close · ${closeKey} to close`;
    const range = position
      ? isZh
        ? `显示 ${String(position.first)}-${String(position.last)} / 共 ${String(position.total)}`
        : `showing ${String(position.first)}-${String(position.last)} of ${String(position.total)}`
      : '';
    const scroll = isZh
      ? `↑↓ / ${formatTuiKeybinding('interaction.scroll-up', keybindings)} / ${formatTuiKeybinding('interaction.scroll-down', keybindings)} 滚动`
      : `↑↓ / ${formatTuiKeybinding('interaction.scroll-up', keybindings)} / ${formatTuiKeybinding('interaction.scroll-down', keybindings)} scroll`;
    return renderTuiActionHint([range, scroll, close].filter(Boolean).join(' · '));
  }

  private pageStep(): number {
    return Math.max(1, this.viewportRows - 1);
  }

  private currentMaxRows(): number | undefined {
    const maxRows =
      typeof this.options.maxRows === 'function' ? this.options.maxRows() : this.options.maxRows;
    return maxRows === undefined ? undefined : Math.max(4, Math.floor(maxRows));
  }
}

function columnWidth(labels: readonly string[], width: number, minimum: number): number {
  const longest = Math.max(minimum, ...labels.map((label) => label.length));
  const available = Math.max(minimum, width - 6);
  return Math.min(longest, Math.max(minimum, Math.floor(available * 0.4)));
}

function formatHelpRow(
  label: string,
  description: string,
  labelWidth: number,
  width: number,
  colorLabel: (value: string) => string,
): string {
  const fittedLabel = truncateToWidth(label, labelWidth, '…');
  const paddedLabel = `${fittedLabel}${' '.repeat(Math.max(0, labelWidth - fittedLabel.length))}`;
  return truncateToWidth(
    `    ${colorLabel(paddedLabel)}  ${chalk.hex(colors.muted)(description)}`,
    width,
  );
}

function dedupeCommands(commands: readonly TuiCommand[]): TuiCommand[] {
  const seen = new Set<string>();
  return commands.filter((command) => {
    if (seen.has(command.name)) return false;
    seen.add(command.name);
    return true;
  });
}

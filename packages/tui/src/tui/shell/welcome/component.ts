import type { Component } from '../../rendering/component.js';
import { tuiChalk as chalk, tuiColors as colors } from '../../theme/runtime.js';
import type { TuiShellState } from '../contracts.js';
import {
  fitLine,
  normalizeWidth,
  renderFrameBottom,
  renderFrameDivider,
  renderFrameHeader,
  renderFrameRow,
} from '../frame.js';
import { resolveTuiLayoutPolicy } from '../layout-policy.js';
import { formatTuiKeybinding, type TuiKeybindingRegistry } from '../keybindings.js';
import {
  getWelcomeDesign,
  MINIMAX_CODE_WELCOME_DESIGN,
  MINIMAX_CODE_WELCOME_PASTE_IMAGE_SHORTCUT,
} from './design.js';
import { getRuntimeLocaleLanguage } from '@mavis/shared/runtime-i18n';
import { getLeanAgentSettings } from '@mavis/config';
import { renderTuiWelcomeHero } from './hero.js';

function shouldShowWelcomeCard(): boolean {
  if (process.env.MINIMAX_SHOW_WELCOME_CARD === 'true') return true;
  if (process.env.MINIMAX_SHOW_WELCOME_CARD === 'false') return false;
  if (process.env.NODE_ENV === 'test' && !process.env.MINIMAX_LEAN_TUI) {
    return true;
  }
  return getLeanAgentSettings().tui.showWelcomeCard ?? false;
}

export interface TuiWelcomeContent {
  readonly tips?: readonly string[];
  readonly changelogEntries?: readonly string[];
}

export class TuiWelcome implements Component {
  constructor(
    private state: TuiShellState,
    private readonly keybindings?: TuiKeybindingRegistry,
    private readonly content: TuiWelcomeContent = {},
  ) {}

  setState(state: TuiShellState): void {
    this.state = state;
  }

  invalidate(): void {}

  render(width: number): string[] {
    return this.renderViewport(width, Number.POSITIVE_INFINITY);
  }

  renderViewport(width: number, height: number): string[] {
    return this.renderFrame(width, height, false);
  }

  /**
   * Static banner above a conversation. In regular mode it becomes native
   * scrollback, so it omits live account and runtime status; the conversation
   * footer shows those through renderPreludeNotice().
   */
  renderPrelude(width: number): string[] {
    return this.renderFrame(width, Number.POSITIVE_INFINITY, true);
  }

  /** Live account notice for the conversation footer; empty when nothing needs action. */
  renderPreludeNotice(width: number): string[] {
    const safeWidth = normalizeWidth(width);
    const message = resolveWelcomeAccountNotice(this.state);
    if (!message || safeWidth === 0) return [];
    return [fitLine(`  ${renderWelcomeAccountNotice(message)}`, safeWidth)];
  }

  private renderFrame(width: number, height: number, staticBanner: boolean): string[] {
    const safeWidth = normalizeWidth(width);
    if (safeWidth === 0) return [];
    if (safeWidth < 4) return [fitLine('M', safeWidth)];

    if (!shouldShowWelcomeCard()) {
      const hero = renderTuiWelcomeHero(safeWidth);
      const notice = resolveWelcomeAccountNotice(this.state);
      const noticeRows = notice && !staticBanner ? renderWelcomeAccountNoticeRows(this.state, safeWidth) : [];
      const lines = ['', ...hero, '', ...noticeRows];
      return fitWelcomeHeight(lines, height);
    }

    const policy = resolveTuiLayoutPolicy(safeWidth);
    const options = { keybindings: this.keybindings, content: this.content, staticBanner };
    let frame =
      policy.welcome === 'compact'
        ? renderCompactWelcome(this.state, safeWidth, options)
        : policy.welcome === 'stacked'
          ? renderStackedWelcome(this.state, safeWidth, options)
          : renderWideWelcome(this.state, safeWidth, options);
    if (frame.length + 2 > height && policy.welcome !== 'compact') {
      frame = renderCompactWelcome(this.state, safeWidth, options);
    }
    return fitWelcomeHeight(['', ...frame, ''], height);
  }
}

interface WelcomeRenderOptions {
  readonly keybindings: TuiKeybindingRegistry | undefined;
  readonly content?: TuiWelcomeContent;
  readonly staticBanner: boolean;
}

function fitWelcomeHeight(lines: string[], height: number): string[] {
  if (!Number.isFinite(height)) return lines;
  const maxRows = Math.max(1, Math.floor(height));
  const fitted = [...lines];
  while (fitted.length > maxRows) {
    const blankIndex = fitted.findIndex((line) => line.length === 0);
    if (blankIndex < 0) break;
    fitted.splice(blankIndex, 1);
  }
  return fitted.slice(0, maxRows);
}

function renderWideWelcome(
  state: TuiShellState,
  width: number,
  { keybindings, content, staticBanner }: WelcomeRenderOptions,
): string[] {
  const design = getWelcomeDesign();
  const tips = resolveWelcomeItems(content?.tips, design.wide.tips, 3);
  const news = resolveWelcomeItems(
    content?.changelogEntries,
    design.wide.news,
    3,
  );
  return [
    ...renderTuiWelcomeHero(width),
    '',
    renderWelcomeHeader(state, width, staticBanner),
    ...(staticBanner ? [] : renderWelcomeAccountNoticeRows(state, width)),
    renderFrameRow(renderSectionTitle(design.sectionTitles.tips), width),
    ...tips.map((text) =>
      renderFrameRow(renderWelcomeBullet(resolveWelcomeCopy(text, keybindings)), width),
    ),
    renderFrameDivider(width),
    renderFrameRow(renderSectionTitle(design.sectionTitles.news), width),
    ...news.map((text) =>
      renderFrameRow(renderWelcomeBullet(resolveWelcomeCopy(text, keybindings)), width),
    ),
    renderFrameBottom(width),
  ];
}

function renderStackedWelcome(
  state: TuiShellState,
  width: number,
  { keybindings, content, staticBanner }: WelcomeRenderOptions,
): string[] {
  const design = getWelcomeDesign();
  const tips = resolveWelcomeItems(content?.tips, design.stacked.tips, 2);
  const news = resolveWelcomeItems(
    content?.changelogEntries,
    design.stacked.news,
    3,
  );
  return [
    ...renderTuiWelcomeHero(width),
    '',
    renderWelcomeHeader(state, width, staticBanner),
    ...(staticBanner ? [] : renderWelcomeAccountNoticeRows(state, width)),
    renderFrameDivider(width),
    renderFrameRow(renderSectionTitle(design.sectionTitles.tips), width),
    ...tips.map((text) =>
      renderFrameRow(renderWelcomeBullet(resolveWelcomeCopy(text, keybindings)), width),
    ),
    renderFrameRow('', width),
    renderFrameRow(renderSectionTitle(design.sectionTitles.news), width),
    ...news.map((text) =>
      renderFrameRow(renderWelcomeBullet(resolveWelcomeCopy(text, keybindings)), width),
    ),
    renderFrameRow('', width),
    renderFrameBottom(width),
  ];
}

function renderCompactWelcome(
  state: TuiShellState,
  width: number,
  { keybindings, content, staticBanner }: WelcomeRenderOptions,
): string[] {
  const design = getWelcomeDesign();
  const isZh = getRuntimeLocaleLanguage() === 'zh';
  const tips = resolveWelcomeItems(content?.tips, design.compact.tips, 2);
  const news = resolveWelcomeItems(
    content?.changelogEntries,
    design.compact.news,
    3,
  );
  return [
    ...renderTuiWelcomeHero(width),
    '',
    renderFrameHeader(
      `${chalk.bold.hex(colors.brand)('MiniMax')} ${chalk.hex(colors.muted)(`v${state.version}`)}`,
      staticBanner ? '' : renderActivity(state),
      width,
    ),
    ...(staticBanner ? [] : renderWelcomeAccountNoticeRows(state, width)),
    renderFrameRow(renderSectionTitle(isZh ? '新手提示' : 'Tips'), width),
    ...tips.map((text) =>
      renderFrameRow(chalk.hex(colors.muted)(resolveWelcomeCopy(text, keybindings)), width),
    ),
    renderFrameRow(renderSectionTitle(design.sectionTitles.news), width),
    ...news.map((text) => renderFrameRow(chalk.hex(colors.muted)(text), width)),
    renderFrameBottom(width),
  ];
}

function renderWelcomeHeader(state: TuiShellState, width: number, staticBanner: boolean): string {
  return renderFrameHeader(
    chalk.hex(colors.muted)(`v${state.version}`),
    staticBanner ? '' : renderActivity(state),
    width,
  );
}

function resolveWelcomeItems(
  selected: readonly string[] | undefined,
  fallback: readonly string[],
  count: number,
): readonly string[] {
  return selected?.length ? selected.slice(0, count) : fallback;
}

function renderSectionTitle(title: string): string {
  return chalk.bold.hex(colors.brand)(title);
}

function renderWelcomeBullet(text: string): string {
  return `${chalk.bold.hex(colors.orbit)('›')} ${chalk.hex(colors.text)(text)}`;
}

function resolveWelcomeCopy(value: string, keybindings: TuiKeybindingRegistry | undefined): string {
  return value.replaceAll(
    MINIMAX_CODE_WELCOME_PASTE_IMAGE_SHORTCUT,
    formatTuiKeybinding('composer.paste-image', keybindings),
  );
}

function resolveWelcomeAccountNotice(state: TuiShellState): string | undefined {
  const isZh = getRuntimeLocaleLanguage() === 'zh';
  return state.accountStatus === 'Sign in with /login'
    ? (isZh ? '请使用 /login 登录' : state.accountStatus)
    : state.accountStatus === 'Connected with warnings'
      ? (isZh ? '查看 /provider 或 /status 获取详细信息。' : 'Check /provider or /status for details.')
      : state.accountStatus === 'Account unavailable'
        ? (isZh ? '查看 /status 获取详细信息。' : 'Check /status for details.')
        : undefined;
}

function renderWelcomeAccountNotice(message: string): string {
  return `${chalk.bold.hex(colors.warning)('○')} ${chalk.bold.hex(colors.warning)(message)}`;
}

function renderWelcomeAccountNoticeRows(state: TuiShellState, width: number): string[] {
  const message = resolveWelcomeAccountNotice(state);
  if (!message) return [];
  return [renderFrameRow(renderWelcomeAccountNotice(message), width)];
}

function renderActivity(state: TuiShellState): string {
  const isZh = getRuntimeLocaleLanguage() === 'zh';
  if (state.accountStatus === 'Sign in with /login') {
    return chalk.bold.hex(colors.warning)(isZh ? '○ 需要登录 (/login)' : '○ Login required');
  }
  if (state.runtimeStatus === 'error') {
    return chalk.bold.hex(colors.error)(isZh ? '× 运行异常' : '× Error');
  }
  if (state.accountStatus === 'Checking account') {
    return chalk.bold.hex(colors.signal)(isZh ? '◌ 检查账户中' : '◌ Checking account');
  }
  if (state.accountStatus === 'Connected with warnings') {
    return chalk.bold.hex(colors.warning)(isZh ? '○ 配置警告' : '○ Setup warning');
  }
  if (state.accountStatus === 'Account unavailable') {
    return chalk.bold.hex(colors.warning)(isZh ? '○ 账户不可用' : '○ Account unavailable');
  }
  if (state.runtimeStatus === 'ready') {
    return chalk.bold.hex(colors.orbit)(isZh ? '● 就绪' : '● Ready');
  }
  if (state.runtimeStatus === 'starting') {
    return chalk.bold.hex(colors.signal)(isZh ? '◌ 启动中' : '◌ Starting');
  }
  if (state.runtimeStatus === 'offline') {
    return chalk.bold.hex(colors.warning)(isZh ? '○ 离线' : '○ Offline');
  }
  return chalk.bold.hex(colors.error)(isZh ? '× 运行异常' : '× Error');
}

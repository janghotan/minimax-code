import { getLeanAgentSettings } from '@mavis/config';
import { visibleWidth } from '../rendering/text.js';
import { centerToWidth } from './frame.js';

const PINK_RGB: readonly [number, number, number] = [255, 0, 122];
const ORANGE_RGB: readonly [number, number, number] = [255, 122, 0];

const WAVEFORM_ART = [
  '   ╭╮    ╭╮   ',
  '╭╮ ││ ╭╮ ││ ╭╮',
  '││╭╯│ ││╭╯│ ││',
  '│││ │ │││ │ ││',
  '││╰╮│ ││╰╮│ ││',
  '╰╯ ││ ╰╯ ││ ╰╯',
  '   ╰╯    ╰╯   ',
] as const;

const COMPACT_WAVEFORM_ART = [
  ' ╭╮  ╭╮ ',
  '╭╯╰╮╭╯╰╮',
  '╰──╯╰──╯',
] as const;

/**
 * Checks if the terminal environment supports color output.
 */
function supportsColors(): boolean {
  if (process.env.NO_COLOR && process.env.NO_COLOR !== '0') return false;
  if (process.env.FORCE_COLOR === '0') return false;
  if (process.env.FORCE_COLOR) return true;
  return Boolean(process.stdout?.isTTY);
}

/**
 * Applies a 24-bit RGB truecolor escape code to text.
 */
function rgbAnsi(r: number, g: number, b: number): string {
  return `\x1b[38;2;${Math.round(r)};${Math.round(g)};${Math.round(b)}m`;
}

const RESET_ANSI = '\x1b[0m';
const BOLD_ANSI = '\x1b[1m';

/**
 * Interpolates between two RGB colors and formats the text with ANSI escape codes.
 * If colors are unsupported, returns uncolored plain text.
 */
export function applyPinkToOrangeGradient(text: string, isColored: boolean = supportsColors()): string {
  if (!isColored || text.length === 0) return text;

  const chars = Array.from(text);
  const total = chars.length;
  if (total <= 1) {
    return `${rgbAnsi(...PINK_RGB)}${text}${RESET_ANSI}`;
  }

  let result = '';
  for (let i = 0; i < total; i++) {
    const factor = i / (total - 1);
    const r = PINK_RGB[0] + factor * (ORANGE_RGB[0] - PINK_RGB[0]);
    const g = PINK_RGB[1] + factor * (ORANGE_RGB[1] - PINK_RGB[1]);
    const b = PINK_RGB[2] + factor * (ORANGE_RGB[2] - PINK_RGB[2]);
    result += `${rgbAnsi(r, g, b)}${chars[i]}`;
  }
  return `${result}${RESET_ANSI}`;
}

/**
 * Renders an original waveform header with a pink-to-orange ANSI gradient.
 * The project name is read from leanAgentConfig (default: "yourname") or passed explicitly.
 * Falls back to plain text when colors are unsupported.
 */
export function renderWaveformHeader(width: number, customProjectName?: string): string[] {
  const isColored = supportsColors();
  const projectName =
    customProjectName ??
    process.env.MCODE_PROJECT_NAME ??
    getLeanAgentSettings().tui.projectName ??
    'yourname';

  if (width < 20) {
    const label = `${projectName}`;
    return [isColored ? applyPinkToOrangeGradient(label, isColored) : label];
  }

  const art = width >= 36 ? WAVEFORM_ART : COMPACT_WAVEFORM_ART;
  const nameRow = Math.floor(art.length / 2);

  const formattedLines: string[] = [];
  for (let i = 0; i < art.length; i++) {
    const rawLine = art[i];
    const coloredLine = applyPinkToOrangeGradient(rawLine, isColored);

    if (i === nameRow) {
      const styledName = isColored
        ? `${BOLD_ANSI}${rgbAnsi(...ORANGE_RGB)}${projectName}${RESET_ANSI}`
        : projectName;
      formattedLines.push(centerToWidth(`${coloredLine}   ${styledName}`, width));
    } else {
      formattedLines.push(centerToWidth(coloredLine, width));
    }
  }

  return formattedLines;
}

import { centerToWidth } from './frame.js';

const PINK_RGB: readonly [number, number, number] = [255, 0, 122];
const ORANGE_RGB: readonly [number, number, number] = [255, 122, 0];

/**
 * Official MiniMax audio waveform logo in high-fidelity Unicode block art:
 * 9 vertical pillars with equal 2-column width and 2-space pitch:
 * Left hook (top cap, bottom loop), 1st wave, tall 2nd wave, split center pillar,
 * deepest bottom loop, tall 4th wave, 5th wave, right hook (bottom cap).
 */
export const MINIMAX_LOGO_ART = [
  '            ▄█▀▀█▄  ▄█▀▀█▄        ',
  '            ██  ██  ██  ██        ',
  '    ▄█▀▀█▄  ██  ██  ██  ██  ▄█▀▀█▄',
  '    ██  ██  ██  ██  ██  ██  ██  ██',
  '▄▄  ██  ██  ██  ██  ██  ██  ██  ██',
  '██  ██  ██  ██  ██  ██  ██  ██  ██',
  '▀█▄▄█▀  ██  ██  ▀▀  ██  ██  ██  ▀▀',
  '        ██  ██  ▄▄  ██  ▀█▄▄█▀    ',
  '        ▀█▄▄█▀  ██  ██            ',
  '                ▀█▄▄█▀            ',
] as const;

export const COMPACT_MINIMAX_LOGO_ART = [
  '      ▄▀▄ ▄▀▄    ',
  '  ▄▀▄ █ █ █ █ ▄▀▄',
  '▄ █ █ █ █ █ █ █ █',
  '▀▄▀ █ █ ▀ █ █ █ ▀',
  '    █ █ ▄ █ ▀▄▀  ',
  '    ▀▄▀ █ █      ',
  '        ▀▄▀      ',
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
 * Interpolates between Pink (#FF007A) and Orange (#FF7A00) across characters.
 * If colors are unsupported, returns uncolored plain text.
 */
export function applyPinkToOrangeGradient(text: string, isColored: boolean = supportsColors()): string {
  if (!isColored || text.length === 0) return text;

  const chars = Array.from(text);
  const total = chars.length;
  if (total <= 1) {
    return `${BOLD_ANSI}${rgbAnsi(...PINK_RGB)}${text}${RESET_ANSI}`;
  }

  let result = '';
  for (let i = 0; i < total; i++) {
    const char = chars[i];
    if (char === ' ') {
      result += ' ';
      continue;
    }
    const factor = total > 1 ? i / (total - 1) : 0;
    const r = PINK_RGB[0] + factor * (ORANGE_RGB[0] - PINK_RGB[0]);
    const g = PINK_RGB[1] + factor * (ORANGE_RGB[1] - PINK_RGB[1]);
    const b = PINK_RGB[2] + factor * (ORANGE_RGB[2] - PINK_RGB[2]);
    result += `${BOLD_ANSI}${rgbAnsi(r, g, b)}${char}${RESET_ANSI}`;
  }
  return result;
}

/**
 * Renders the official MiniMax waveform logo centered with a pink-to-orange ANSI gradient.
 * Completely removes any placeholder text.
 * Falls back to uncolored plain text when colors are unsupported.
 */
export function renderWaveformHeader(width: number): string[] {
  const isColored = supportsColors();
  const art = width >= 36 ? MINIMAX_LOGO_ART : COMPACT_MINIMAX_LOGO_ART;

  const formattedLines: string[] = [];
  for (const rawLine of art) {
    const coloredLine = applyPinkToOrangeGradient(rawLine, isColored);
    formattedLines.push(centerToWidth(coloredLine, width));
  }

  return formattedLines;
}

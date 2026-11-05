import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { getLeanAgentSettings } from '@mavis/config';

export interface TestRunnerDetection {
  readonly isTestOrLint: boolean;
  readonly runnerName?: string;
  readonly augmentedCommand?: string;
}

/**
 * Detects if a shell command is a test, build, or lint runner.
 * Optionally injects fail-fast flags if configured.
 */
export function detectAndAugmentTestCommand(command: string): TestRunnerDetection {
  const settings = getLeanAgentSettings().testRunner;
  if (!settings.enabled) {
    return { isTestOrLint: false };
  }

  const trimmed = command.trim();

  // Pytest
  if (/(?:^|\s|\/|")pytest(?:"|\s|$)/.test(trimmed)) {
    let augmented = command;
    if (settings.injectFailFast && !/\s(-x|--exitfirst|--maxfail)\b/.test(trimmed)) {
      augmented = command.replace(/(^|\s|\/|")pytest\b/, '$1pytest -x');
    }
    return { isTestOrLint: true, runnerName: 'pytest', augmentedCommand: augmented };
  }

  // Python unittest
  if (/\bpython\d* -m unittest\b/.test(trimmed)) {
    let augmented = command;
    if (settings.injectFailFast && !/\s(-f|--failfast)\b/.test(trimmed)) {
      augmented = command.replace(/\b(python\d* -m unittest)\b/, '$1 -f');
    }
    return { isTestOrLint: true, runnerName: 'python unittest', augmentedCommand: augmented };
  }

  // Jest / Vitest
  if (/\b(jest|vitest)\b/.test(trimmed)) {
    const runner = trimmed.includes('vitest') ? 'vitest' : 'jest';
    let augmented = command;
    if (settings.injectFailFast && !/\s(--bail|-b)\b/.test(trimmed)) {
      augmented = command.replace(new RegExp(`\\b${runner}\\b`), `${runner} --bail`);
    }
    return { isTestOrLint: true, runnerName: runner, augmentedCommand: augmented };
  }

  // Node --test
  if (/\bnode\s+--test\b/.test(trimmed)) {
    return { isTestOrLint: true, runnerName: 'node --test', augmentedCommand: command };
  }

  // npm/pnpm/yarn/bun test
  if (/\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b/.test(trimmed)) {
    const pkgManager = trimmed.match(/\b(npm|pnpm|yarn|bun)\b/)?.[1] || 'npm';
    return { isTestOrLint: true, runnerName: `${pkgManager} test`, augmentedCommand: command };
  }

  // Go test
  if (/\bgo\s+test\b/.test(trimmed)) {
    let augmented = command;
    if (settings.injectFailFast && !/\s-failfast\b/.test(trimmed)) {
      augmented = command.replace(/\bgo\s+test\b/, 'go test -failfast');
    }
    return { isTestOrLint: true, runnerName: 'go test', augmentedCommand: augmented };
  }

  // Cargo test
  if (/\bcargo\s+test\b/.test(trimmed)) {
    return { isTestOrLint: true, runnerName: 'cargo test', augmentedCommand: command };
  }

  // Typecheck / Lint (tsc, eslint, ruff)
  if (/\b(tsc|eslint|ruff|pylint)\b/.test(trimmed)) {
    const linter = trimmed.match(/\b(tsc|eslint|ruff|pylint)\b/)?.[1] || 'linter';
    return { isTestOrLint: true, runnerName: linter, augmentedCommand: command };
  }

  return { isTestOrLint: false };
}

/**
 * Applies backpressure to test/build/lint runner outputs.
 * - On success (exit 0): summarizes into a concise 1-line report.
 * - On failure: strips stack trace noise, isolates the error/assertion, and points to the full artifact.
 */
export function applyTestBackpressure(
  output: string,
  exitCode: number | null | undefined,
  runnerName: string,
  workspaceRoot: string,
): { formattedText: string; artifactRel?: string } {
  const settings = getLeanAgentSettings().testRunner;
  const artifactDir = getLeanAgentSettings().toolOutput.artifactDir;

  const id = `test-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const artifactRel = path.join(artifactDir, `${id}.txt`);
  const artifactAbs = path.join(workspaceRoot, artifactRel);

  try {
    mkdirSync(path.dirname(artifactAbs), { recursive: true });
    writeFileSync(artifactAbs, output, 'utf8');
  } catch {
    // Artifact persistence best-effort
  }

  if (exitCode === 0) {
    const summary = extractSuccessSummary(output, runnerName);
    return {
      formattedText: `${summary}\n[Full log saved to ${artifactRel}]`,
      artifactRel,
    };
  }

  // On Failure: isolate failure blocks and strip internal stack noise
  const filteredFailure = settings.filterStackNoise
    ? filterTestFailureNoise(output, runnerName)
    : output;

  const formatted = [
    `❌ ${runnerName} failed (exit ${exitCode ?? 1})`,
    filteredFailure.trim(),
    `[Full test failure log: ${artifactRel}]`,
  ].join('\n\n');

  return {
    formattedText: formatted,
    artifactRel,
  };
}

function extractSuccessSummary(output: string, runnerName: string): string {
  // Pytest: "12 passed in 0.5s"
  const pytestMatch = output.match(/(\d+\s+passed[^\n]*)/i);
  if (pytestMatch?.[1]) return `✓ pytest: ${pytestMatch[1].trim()}`;

  // Jest/Vitest: "Tests:       8 passed, 8 total"
  const jestMatch = output.match(/Tests:\s*([\d\w\s,]+)/i);
  if (jestMatch?.[1]) return `✓ ${runnerName}: ${jestMatch[1].trim()}`;

  // Node --test: "pass 12" or "tests 12\npass 12"
  const nodeTestMatch = output.match(/pass\s+(\d+)/i);
  if (nodeTestMatch?.[1]) return `✓ node --test: ${nodeTestMatch[1]} passed`;

  // Go test: "PASS"
  if (/\bPASS\b/.test(output)) return `✓ go test: PASS`;

  // Cargo test: "test result: ok. 15 passed"
  const cargoMatch = output.match(/test result:\s*ok\.\s*(\d+\s+passed[^\n]*)/i);
  if (cargoMatch?.[1]) return `✓ cargo test: ${cargoMatch[1].trim()}`;

  // Linters / tsc
  if (runnerName === 'tsc') return `✓ tsc: 0 errors`;
  if (/eslint|ruff/.test(runnerName)) return `✓ ${runnerName}: 0 issues found`;

  return `✓ ${runnerName}: completed successfully`;
}

/**
 * Strips noisy runtime frames (node:internal, node_modules, timing headers)
 * leaving only test failure assertion lines and relevant source frames.
 */
function filterTestFailureNoise(output: string, runnerName: string): string {
  const lines = output.split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    // Strip node internal and node_modules frames
    if (/^\s+at\s+.*\(?(node:internal\/|.*\/node_modules\/)/.test(line)) {
      continue;
    }
    // Strip vitest/jest timing or worker noise
    if (/^\s*Duration\s+[\d.]+s/.test(line)) {
      continue;
    }
    // Strip passing test indicators to reduce noise
    if (/^\s*[✔ℹ]\s+.*\(.+ms\)/.test(line) && !line.includes('✖')) {
      continue;
    }
    kept.push(line);
  }

  // Limit failure output to 60 lines max
  if (kept.length > 60) {
    const head = kept.slice(0, 45);
    const tail = kept.slice(-15);
    return `${head.join('\n')}\n... [${kept.length - 60} stack lines stripped] ...\n${tail.join('\n')}`;
  }

  return kept.join('\n');
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

export interface ProjectPreflightInfo {
  language: string;
  python?: string;
  test: string;
  pm: string;
  git: string;
}

/**
 * Detects once per project directory and caches facts to .mcode/project.json
 */
export function getOrDetectProjectPreflight(workspaceRoot: string): ProjectPreflightInfo {
  const cachePath = resolve(workspaceRoot, '.mcode', 'project.json');
  if (existsSync(cachePath)) {
    try {
      const cached = JSON.parse(readFileSync(cachePath, 'utf8'));
      if (cached && typeof cached === 'object' && cached.language && cached.test) {
        return cached as ProjectPreflightInfo;
      }
    } catch {
      // Re-detect on corrupt cache
    }
  }

  const detected = detectProjectFacts(workspaceRoot);
  try {
    const dir = dirname(cachePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(cachePath, JSON.stringify(detected, null, 2) + '\n', 'utf8');
  } catch {
    // Best-effort write
  }

  return detected;
}

function detectProjectFacts(workspaceRoot: string): ProjectPreflightInfo {
  // Detect language & package manager
  let language = 'unknown';
  let pm = 'unknown';
  let test = '';
  let python: string | undefined;

  const hasFile = (rel: string) => existsSync(resolve(workspaceRoot, rel));

  if (hasFile('package.json')) {
    language = hasFile('tsconfig.json') ? 'typescript' : 'javascript';
    if (hasFile('pnpm-lock.yaml')) pm = 'pnpm';
    else if (hasFile('yarn.lock')) pm = 'yarn';
    else if (hasFile('bun.lockb') || hasFile('bun.lock')) pm = 'bun';
    else pm = 'npm';
    test = `${pm} test`;
  } else if (hasFile('pyproject.toml') || hasFile('requirements.txt') || hasFile('setup.py')) {
    language = 'python';
    if (hasFile('poetry.lock')) pm = 'poetry';
    else if (hasFile('uv.lock')) pm = 'uv';
    else if (hasFile('Pipfile')) pm = 'pipenv';
    else pm = 'pip';
  } else if (hasFile('Cargo.toml')) {
    language = 'rust';
    pm = 'cargo';
    test = 'cargo test -q';
  } else if (hasFile('go.mod')) {
    language = 'go';
    pm = 'go';
    test = 'go test ./...';
  }

  // Detect python binary if python project or venv exists
  const venvCandidates = [
    '.venv/bin/python',
    'venv/bin/python',
    'env/bin/python',
    '.env/bin/python',
  ];
  for (const cand of venvCandidates) {
    if (hasFile(cand)) {
      python = cand;
      break;
    }
  }
  if (!python && language === 'python') {
    python = 'python3';
  }

  if (language === 'python' && !test) {
    if (python && (hasFile(`${dirname(python)}/pytest`) || hasFile('tests') || hasFile('test'))) {
      test = `${python} -m pytest -q`;
    } else {
      test = `${python ?? 'python3'} -m unittest discover`;
    }
  }

  // Detect git state
  let git = 'unavailable';
  try {
    const status = execFileSync('git', ['status', '-s'], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      timeout: 3000,
    }).trim();
    git = status.length === 0 ? 'clean' : `${status.split('\n').length} files modified/untracked`;
  } catch {
    git = 'not a git repo';
  }

  return {
    language,
    ...(python ? { python } : {}),
    test: test || 'none detected',
    pm,
    git,
  };
}

/**
 * Formats preflight facts as exactly ONE concise line to inject into prompt/context:
 * "python=.venv/bin/python; test=pytest -q; pm=pip; git=clean"
 */
export function formatProjectPreflightLine(preflight: ProjectPreflightInfo): string {
  const parts: string[] = [];
  if (preflight.python) parts.push(`python=${preflight.python}`);
  if (preflight.test) parts.push(`test=${preflight.test}`);
  if (preflight.pm && preflight.pm !== 'unknown') parts.push(`pm=${preflight.pm}`);
  if (preflight.git) parts.push(`git=${preflight.git}`);
  return parts.join('; ');
}

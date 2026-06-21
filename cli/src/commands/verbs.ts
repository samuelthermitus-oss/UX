import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import chalk from 'chalk';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The verb dispatcher lives in src/ui-ux-pro-max/scripts/verbs.py at dev time
 * and in cli/assets/scripts/verbs.py at install time. Resolve whichever exists.
 */
function resolveDispatcher(): string {
  const candidates = [
    join(__dirname, '..', '..', 'assets', 'scripts', 'verbs.py'),
    join(__dirname, '..', '..', '..', 'src', 'ui-ux-pro-max', 'scripts', 'verbs.py'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0]; // fall through — error surfaces on spawn
}

function resolvePython(): string {
  return process.platform === 'win32' ? 'python' : 'python3';
}

export interface VerbOptions {
  subject?: string;
  prompt?: string;
  output?: string;
  severity?: 'Low' | 'Medium' | 'High' | 'Critical';
  json?: boolean;
}

/**
 * Run a verb by shelling to the Python dispatcher. Streams stdout/stderr.
 */
export async function runVerb(verb: string, opts: VerbOptions = {}): Promise<number> {
  const script = resolveDispatcher();
  const python = resolvePython();

  const args: string[] = [script, verb];
  if (opts.subject) args.push(opts.subject);
  if (opts.prompt) args.push('--prompt', opts.prompt);
  if (opts.output) args.push('--output', opts.output);
  if (opts.severity) args.push('--severity', opts.severity);
  if (opts.json) args.push('--json');

  return new Promise((resolve) => {
    const proc = spawn(python, args, { stdio: 'inherit' });
    proc.on('error', (err) => {
      console.error(chalk.red(`Failed to run ${python}: ${err.message}`));
      console.error(chalk.yellow('Install Python 3: https://www.python.org/downloads/'));
      resolve(1);
    });
    proc.on('exit', (code) => resolve(code ?? 0));
  });
}

/** Verb metadata — drives `uipro` subcommand registration in index.ts */
export const VERB_REGISTRY = {
  audit: {
    summary: 'UX/quality audit — accessibility, performance, interactions',
    takesSubject: true,
    takesSeverity: true,
  },
  polish: {
    summary: 'Final-pass polish — spacing, hierarchy, focus states, typography',
    takesSubject: true,
    takesSeverity: false,
  },
  critique: {
    summary: 'Design critique — visual hierarchy, emotional tone, structural clarity',
    takesSubject: true,
    takesSeverity: false,
  },
  redesign: {
    summary: 'Full redesign — propose new style + palette + type system',
    takesSubject: true,
    takesSeverity: false,
  },
  harden: {
    summary: 'Production hardening — error/empty/loading states, i18n, edge cases',
    takesSubject: true,
    takesSeverity: false,
  },
  lint: {
    summary: 'Deterministic anti-pattern scanner (regex-based, no LLM)',
    takesSubject: true,
    takesSeverity: true,
  },
} as const;

export type VerbName = keyof typeof VERB_REGISTRY;

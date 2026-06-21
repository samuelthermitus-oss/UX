#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initCommand } from './commands/init.js';
import { versionsCommand } from './commands/versions.js';
import { updateCommand } from './commands/update.js';
import { uninstallCommand } from './commands/uninstall.js';
import { runVerb, VERB_REGISTRY, type VerbName } from './commands/verbs.js';
import type { AIType } from './types/index.js';
import { AI_TYPES } from './types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

const program = new Command();

program
  .name('uipro')
  .description('CLI to install UI/UX Pro Max skill for AI coding assistants')
  .version(pkg.version);

program
  .command('init')
  .description('Install UI/UX Pro Max skill to current project')
  .option('-a, --ai <type>', `AI assistant type (${AI_TYPES.join(', ')})`)
  .option('-f, --force', 'Overwrite existing files')
  .option('-o, --offline', 'Skip GitHub download, use bundled assets only')
  .option('-g, --global', 'Install globally to home directory (~/) instead of current project')
  .action(async (options) => {
    if (options.ai && !AI_TYPES.includes(options.ai)) {
      console.error(`Invalid AI type: ${options.ai}`);
      console.error(`Valid types: ${AI_TYPES.join(', ')}`);
      process.exit(1);
    }
    await initCommand({
      ai: options.ai as AIType | undefined,
      force: options.force,
      offline: options.offline,
      global: options.global,
    });
  });

program
  .command('versions')
  .description('List available versions')
  .action(versionsCommand);

program
  .command('update')
  .description('Update UI/UX Pro Max to latest version')
  .option('-a, --ai <type>', `AI assistant type (${AI_TYPES.join(', ')})`)
  .action(async (options) => {
    if (options.ai && !AI_TYPES.includes(options.ai)) {
      console.error(`Invalid AI type: ${options.ai}`);
      console.error(`Valid types: ${AI_TYPES.join(', ')}`);
      process.exit(1);
    }
    await updateCommand({
      ai: options.ai as AIType | undefined,
    });
  });

program
  .command('uninstall')
  .description('Remove UI/UX Pro Max skill from current project or globally')
  .option('-a, --ai <type>', `AI assistant type (${AI_TYPES.join(', ')})`)
  .option('-g, --global', 'Uninstall from home directory (~/) instead of current project')
  .action(async (options) => {
    if (options.ai && !AI_TYPES.includes(options.ai)) {
      console.error(`Invalid AI type: ${options.ai}`);
      console.error(`Valid types: ${AI_TYPES.join(', ')}`);
      process.exit(1);
    }
    await uninstallCommand({
      ai: options.ai as AIType | undefined,
      global: options.global,
    });
  });

// ============ Verb commands ============
// Each verb is a top-level uipro subcommand that shells to the Python
// dispatcher. Verbs turn the CSV/BM25 engine into ergonomics:
//   uipro audit <path>     — UX/quality audit
//   uipro polish <path>    — final-pass polish
//   uipro critique <topic> — design review
//   uipro redesign <topic> — full redesign pass
//   uipro harden <path>    — production hardening
//   uipro lint <path>      — deterministic anti-pattern scan
//   uipro generate <mode>  — Higgsfield-backed image gen (hero/mobile/...)
//   uipro brandkit         — 3-image brand kit pack via Higgsfield

for (const [name, spec] of Object.entries(VERB_REGISTRY)) {
  const cmd = program.command(`${name} [subject]`).description(spec.summary);
  if (spec.takesSeverity) {
    cmd.option(
      '-s, --severity <level>',
      'Minimum severity: Low | Medium | High | Critical',
      'Medium'
    );
  }
  cmd.option('--json', 'Emit JSON output (where supported)');
  cmd.action(async (subject: string | undefined, options: { severity?: string; json?: boolean }) => {
    const code = await runVerb(name as VerbName, {
      subject,
      severity: options.severity as 'Low' | 'Medium' | 'High' | 'Critical' | undefined,
      json: options.json,
    });
    if (code !== 0) process.exit(code);
  });
}

program
  .command('generate <mode>')
  .description('Higgsfield-backed image gen: hero | mobile | lifestyle | hand')
  .requiredOption('-p, --prompt <text>', 'Prompt for the asset')
  .option('-o, --output <path>', 'Output path (default: public/assets/generated/<mode>.png)')
  .action(async (mode: string, options: { prompt: string; output?: string }) => {
    const code = await runVerb('generate', {
      subject: mode,
      prompt: options.prompt,
      output: options.output,
    });
    if (code !== 0) process.exit(code);
  });

program
  .command('brandkit')
  .description('Generate a 3-image brand kit (logo concept + palette + type specimen) via Higgsfield')
  .requiredOption('-p, --prompt <text>', 'Brand description prompt')
  .option('-o, --output <dir>', 'Output directory (default: public/assets/generated/brandkit)')
  .action(async (options: { prompt: string; output?: string }) => {
    const code = await runVerb('brandkit', {
      prompt: options.prompt,
      output: options.output,
    });
    if (code !== 0) process.exit(code);
  });

program.parse();

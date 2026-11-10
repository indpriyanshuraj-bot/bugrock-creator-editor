#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import { Command } from 'commander';
import {
  applyFixes,
  countBySeverity,
  CORE_VERSION,
  detectProject,
  diagnoseProject,
  isFixable,
  packFileName,
  packProject,
  type Diagnostic,
  type Project,
} from '@bugrock/core';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodeHost } from './node-host';

const EXIT_OK = 0;
const EXIT_PROBLEMS = 1;
const EXIT_FAILURE = 2;

interface CommonOptions {
  readonly json?: boolean;
}

function severityBadge(diagnostic: Diagnostic): string {
  switch (diagnostic.severity) {
    case 'error':
      return 'error';
    case 'warning':
      return 'warn ';
    default:
      return 'info ';
  }
}

function printDiagnostics(diagnostics: readonly Diagnostic[]): void {
  if (diagnostics.length === 0) {
    console.log('no problems found');
    return;
  }
  for (const diagnostic of diagnostics) {
    const where = diagnostic.pointer ? `${diagnostic.path}#${diagnostic.pointer}` : diagnostic.path;
    const fix = isFixable(diagnostic) ? `  (fix: ${diagnostic.fix?.summary})` : '';
    console.log(`${severityBadge(diagnostic)} ${diagnostic.code}  ${where}`);
    console.log(`        ${diagnostic.message}${fix}`);
  }
  const counts = countBySeverity(diagnostics);
  console.log(
    `\n${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info, ${diagnostics.filter(isFixable).length} fixable`,
  );
}

async function load(root: string): Promise<{ host: NodeHost; project: Project }> {
  const host = new NodeHost(root);
  const project = await detectProject(host, '.');
  return { host, project };
}

const program = new Command();

program
  .name('bugrock')
  .description('Inspect, diagnose, fix and pack Minecraft Bedrock add-ons')
  .version(CORE_VERSION);

program
  .command('inspect')
  .argument('<path>', 'project directory')
  .option('--json', 'machine readable output')
  .description('list the packs found in a project')
  .action(async (path: string, options: CommonOptions) => {
    try {
      const { project } = await load(resolve(path));
      const summary = project.packs.map((pack) => ({
        root: pack.root,
        kind: pack.kind,
        name: pack.manifest.header?.name ?? null,
        uuid: pack.manifest.header?.uuid ?? null,
        parseError: pack.parseError ?? null,
      }));
      if (options.json) {
        console.log(JSON.stringify({ root: project.root, packs: summary }, null, 2));
      } else if (summary.length === 0) {
        console.log('no packs found (looked for manifest.json up to 4 levels deep)');
      } else {
        for (const pack of summary) {
          const name = pack.name ?? '(unnamed)';
          console.log(`${pack.kind.padEnd(14)} ${pack.root.padEnd(28)} ${name}`);
        }
      }
      process.exitCode = summary.length > 0 ? EXIT_OK : EXIT_PROBLEMS;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = EXIT_FAILURE;
    }
  });

program
  .command('diagnose')
  .argument('<path>', 'project directory')
  .option('--json', 'machine readable output')
  .description('report problems in a project')
  .action(async (path: string, options: CommonOptions) => {
    try {
      const { host, project } = await load(resolve(path));
      const diagnostics = await diagnoseProject(host, project);
      if (options.json) {
        console.log(JSON.stringify({ diagnostics }, null, 2));
      } else {
        printDiagnostics(diagnostics);
      }
      process.exitCode = diagnostics.some((d) => d.severity === 'error') ? EXIT_PROBLEMS : EXIT_OK;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = EXIT_FAILURE;
    }
  });

program
  .command('fix')
  .argument('<path>', 'project directory')
  .option('--json', 'machine readable output')
  .option('--dry-run', 'report what would change without writing')
  .description('apply the deterministic fixes attached to diagnostics')
  .action(async (path: string, options: CommonOptions & { dryRun?: boolean }) => {
    try {
      const { host, project } = await load(resolve(path));
      const diagnostics = await diagnoseProject(host, project);
      const fixable = diagnostics.filter(isFixable);
      if (options.dryRun) {
        const plan = fixable.map((d) => ({
          code: d.code,
          path: d.path,
          pointer: d.pointer,
          fix: d.fix,
        }));
        if (options.json) console.log(JSON.stringify({ dryRun: true, plan }, null, 2));
        else if (plan.length === 0) console.log('nothing to fix');
        else
          for (const item of plan)
            console.log(`would fix ${item.code} ${item.path}#${item.pointer}`);
        process.exitCode = EXIT_OK;
        return;
      }
      const result = await applyFixes(host, diagnostics);
      if (options.json) {
        console.log(JSON.stringify({ applied: result.applied, files: result.files }, null, 2));
      } else if (result.applied === 0) {
        console.log('nothing to fix');
      } else {
        console.log(`applied ${result.applied} fix(es) to ${result.files.length} file(s)`);
        for (const file of result.files) console.log(`  ${file}`);
      }
      process.exitCode = EXIT_OK;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = EXIT_FAILURE;
    }
  });

program
  .command('pack')
  .argument('<path>', 'project directory')
  .option('-o, --out <file>', 'output file (defaults to <pack>.mcaddon)')
  .option('--json', 'machine readable output')
  .description('bundle the packs into a .mcaddon archive')
  .action(async (path: string, options: CommonOptions & { out?: string }) => {
    try {
      const { host, project } = await load(resolve(path));
      if (project.packs.length === 0) {
        console.error('no packs found; nothing to pack');
        process.exitCode = EXIT_PROBLEMS;
        return;
      }
      const bytes = await packProject(host, project);
      const target = resolve(options.out ?? packFileName(project));
      await writeFile(target, bytes);
      if (options.json) {
        console.log(JSON.stringify({ out: target, bytes: bytes.byteLength }, null, 2));
      } else {
        console.log(`wrote ${target} (${bytes.byteLength} bytes, ${project.packs.length} pack(s))`);
      }
      process.exitCode = EXIT_OK;
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = EXIT_FAILURE;
    }
  });

await program.parseAsync(process.argv);

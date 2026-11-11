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
  formatFileDiff,
  isFixable,
  listJournals,
  packFileName,
  packProject,
  undoJournal,
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
    const location = diagnostic.position
      ? `${diagnostic.path}:${diagnostic.position.line}:${diagnostic.position.column}`
      : diagnostic.path;
    const where = diagnostic.pointer ? `${location}  (${diagnostic.pointer})` : location;
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

function fail(error: unknown): void {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = EXIT_FAILURE;
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
      fail(error);
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
      fail(error);
    }
  });

program
  .command('fix')
  .argument('<path>', 'project directory')
  .option('--diff', 'show what would change, write nothing')
  .option('--no-journal', 'do not record an undo journal')
  .option('--json', 'machine readable output')
  .description('apply the deterministic fixes attached to diagnostics')
  .action(async (path: string, options: CommonOptions & { diff?: boolean; journal?: boolean }) => {
    try {
      const { host, project } = await load(resolve(path));
      const diagnostics = await diagnoseProject(host, project);
      const fixable = diagnostics.filter(isFixable);

      if (options.diff) {
        const result = await applyFixes(host, fixable, { dryRun: true });
        if (options.json) {
          console.log(
            JSON.stringify({ dryRun: true, applied: result.applied, diffs: result.diffs }, null, 2),
          );
        } else if (result.diffs.length === 0) {
          console.log('nothing to fix');
        } else {
          for (const diff of result.diffs) console.log(formatFileDiff(diff));
          const added = result.diffs.reduce((sum, d) => sum + d.added, 0);
          const removed = result.diffs.reduce((sum, d) => sum + d.removed, 0);
          console.log(
            `\n${result.applied} fix(es) would change ${added} line(s), remove ${removed}`,
          );
        }
        process.exitCode = EXIT_OK;
        return;
      }

      const commented = project.packs.filter((pack) => pack.hasComments).map((p) => p.manifestPath);
      if (commented.length > 0 && !options.json) {
        console.warn(
          `note: fixing rewrites ${commented.join(', ')} as plain JSON and drops its comments. ` +
            'Use --diff to see the result first.',
        );
      }

      const result = await applyFixes(host, fixable, { journal: options.journal !== false });
      if (options.json) {
        console.log(
          JSON.stringify(
            { applied: result.applied, files: result.files, journalId: result.journalId ?? null },
            null,
            2,
          ),
        );
      } else if (result.applied === 0) {
        console.log('nothing to fix');
      } else {
        console.log(`applied ${result.applied} fix(es) to ${result.files.length} file(s)`);
        for (const file of result.files) console.log(`  ${file}`);
        if (result.journalId) console.log(`undo with: bugrock undo ${path}`);
      }
      process.exitCode = EXIT_OK;
    } catch (error) {
      fail(error);
    }
  });

program
  .command('journal')
  .argument('<path>', 'project directory')
  .option('--json', 'machine readable output')
  .description('list recorded fix journals, newest first')
  .action(async (path: string, options: CommonOptions) => {
    try {
      const host = new NodeHost(resolve(path));
      const journals = await listJournals(host);
      if (options.json) {
        console.log(JSON.stringify({ journals }, null, 2));
      } else if (journals.length === 0) {
        console.log('no journals recorded');
      } else {
        for (const journal of journals) {
          console.log(`${journal.id}  ${journal.createdAt}  ${journal.files} file(s)`);
          if (journal.summary) console.log(`  ${journal.summary}`);
        }
      }
      process.exitCode = EXIT_OK;
    } catch (error) {
      fail(error);
    }
  });

program
  .command('undo')
  .argument('<path>', 'project directory')
  .option('--id <id>', 'journal id (defaults to the newest)')
  .option('--json', 'machine readable output')
  .description('revert the most recent fix')
  .action(async (path: string, options: CommonOptions & { id?: string }) => {
    try {
      const host = new NodeHost(resolve(path));
      const result = await undoJournal(host, options.id);
      if (!result) {
        if (options.json) console.log(JSON.stringify({ undone: null }, null, 2));
        else console.log('no journal to undo');
        process.exitCode = EXIT_PROBLEMS;
        return;
      }
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`reverted ${result.id}`);
        for (const file of result.restored) console.log(`  restored ${file}`);
        for (const file of result.removed) console.log(`  removed ${file}`);
      }
      process.exitCode = EXIT_OK;
    } catch (error) {
      fail(error);
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
      fail(error);
    }
  });

await program.parseAsync(process.argv);

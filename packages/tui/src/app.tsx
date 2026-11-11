// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import {
  applyFixes,
  countBySeverity,
  detectProject,
  diagnoseProject,
  formatFileDiff,
  isFixable,
  packFileName,
  packProject,
  undoJournal,
  type Diagnostic,
  type FileDiff,
  type Project,
} from '@bugrock/core';
import { Box, Text, useApp, useInput } from 'ink';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { useCallback, useEffect, useState } from 'react';
import { NodeHost } from './node-host';

interface Loaded {
  readonly project: Project;
  readonly diagnostics: readonly Diagnostic[];
}

const MAX_ROWS = 14;
const MAX_DIFF_LINES = 14;

export function App({ root }: { readonly root: string }): React.ReactElement {
  const { exit } = useApp();
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<readonly number[]>([]);
  const [diff, setDiff] = useState<readonly FileDiff[] | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const host = new NodeHost(root);
      const project = await detectProject(host, '.');
      const diagnostics = await diagnoseProject(host, project);
      setData({ project, diagnostics });
      setSelected(diagnostics.map((d, i) => (isFixable(d) ? i : -1)).filter((i) => i >= 0));
      setCursor(0);
      setDiff(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [root]);

  useEffect(() => {
    void load();
  }, [load]);

  const diagnostics = data?.diagnostics ?? [];
  const current = diagnostics[cursor];

  const toggle = useCallback((index: number) => {
    setSelected((previous) =>
      previous.includes(index)
        ? previous.filter((i) => i !== index)
        : [...previous, index].sort((a, b) => a - b),
    );
  }, []);

  const applySelected = useCallback(async () => {
    if (!data) return;
    const chosen = selected
      .map((index) => data.diagnostics[index])
      .filter((diagnostic): diagnostic is Diagnostic => diagnostic !== undefined);
    if (chosen.length === 0) {
      setNotice('nothing selected');
      return;
    }
    try {
      const host = new NodeHost(root);
      const result = await applyFixes(host, chosen);
      setNotice(
        result.applied === 0
          ? 'nothing to fix'
          : `applied ${result.applied} fix(es) to ${result.files.length} file(s)${result.journalId ? ' · u to undo' : ''}`,
      );
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }, [data, load, root, selected]);

  const preview = useCallback(async () => {
    if (!data) return;
    if (diff) {
      setDiff(null);
      return;
    }
    const chosen = selected
      .map((index) => data.diagnostics[index])
      .filter((diagnostic): diagnostic is Diagnostic => diagnostic !== undefined);
    try {
      const host = new NodeHost(root);
      const result = await applyFixes(host, chosen, { dryRun: true });
      setDiff(result.diffs);
      setNotice(
        result.diffs.length === 0
          ? 'nothing to change'
          : `${result.diffs.length} file(s) would change`,
      );
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }, [data, diff, root, selected]);

  const undo = useCallback(async () => {
    try {
      const host = new NodeHost(root);
      const result = await undoJournal(host);
      setNotice(result ? `reverted ${result.id}` : 'no journal to undo');
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }, [load, root]);

  const pack = useCallback(async () => {
    if (!data) return;
    try {
      const host = new NodeHost(root);
      const bytes = await packProject(host, data.project);
      const out = resolve(root, '..', packFileName(data.project));
      await writeFile(out, bytes);
      setNotice(`packed ${bytes.byteLength} bytes to ${out}`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    }
  }, [data, root]);

  useInput((input, key) => {
    if (input === 'q') {
      exit();
      return;
    }
    if (input === 'r') {
      void load();
      return;
    }
    if (input === 'f') {
      void applySelected();
      return;
    }
    if (input === 'd') {
      void preview();
      return;
    }
    if (input === 'u') {
      void undo();
      return;
    }
    if (input === 'p') {
      void pack();
      return;
    }
    if (input === ' ') {
      if (current && isFixable(current)) toggle(cursor);
      return;
    }
    if (input === 'a') {
      setSelected(diagnostics.map((d, i) => (isFixable(d) ? i : -1)).filter((i) => i >= 0));
      return;
    }
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(Math.max(0, diagnostics.length - 1), c + 1));
  });

  if (error) {
    return (
      <Box paddingX={1} flexDirection="column">
        <Text color="red">could not open {root}</Text>
        <Text dimColor>{error}</Text>
        <Text dimColor>q quit · r retry</Text>
      </Box>
    );
  }

  if (!data) {
    return (
      <Box paddingX={1}>
        <Text dimColor>scanning {root}…</Text>
      </Box>
    );
  }

  const counts = countBySeverity(diagnostics);
  const fixable = diagnostics.filter(isFixable).length;
  const visible = diagnostics.slice(0, MAX_ROWS);
  const diffLines = (diff ?? []).flatMap((file) => formatFileDiff(file).split('\n'));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>bugrock</Text>
      <Text dimColor>
        {root} · {data.project.packs.length} pack(s)
      </Text>

      <Box marginTop={1} flexDirection="column">
        {data.project.packs.map((packEntry) => (
          <Text key={packEntry.root}>
            <Text color="cyan">{packEntry.kind.padEnd(10)}</Text>
            {packEntry.root.padEnd(24)}
            <Text dimColor>{packEntry.manifest.header?.name ?? '(unnamed)'}</Text>
          </Text>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>
          {counts.error} error · {counts.warning} warning · {counts.info} info · {fixable} fixable ·{' '}
          {selected.length} selected
        </Text>
        {visible.length === 0 ? (
          <Text color="green">no problems found</Text>
        ) : (
          visible.map((diagnostic, index) => {
            const isCursor = index === cursor;
            const isChosen = selected.includes(index);
            const colour =
              diagnostic.severity === 'error'
                ? 'red'
                : diagnostic.severity === 'warning'
                  ? 'yellow'
                  : 'gray';
            return (
              <Text key={`${diagnostic.code}-${diagnostic.path}-${index}`}>
                <Text color={isCursor ? 'white' : undefined}>{isCursor ? '>' : ' '} </Text>
                <Text dimColor>
                  {isFixable(diagnostic) ? (isChosen ? '[x]' : '[ ]') : '   '}
                </Text>{' '}
                <Text color={colour}>{diagnostic.code}</Text> {diagnostic.path}
                <Text dimColor>
                  {diagnostic.position
                    ? `:${diagnostic.position.line}:${diagnostic.position.column}`
                    : ''}
                  {diagnostic.pointer ? ` ${diagnostic.pointer}` : ''}
                </Text>
              </Text>
            );
          })
        )}
        {diagnostics.length > visible.length ? (
          <Text dimColor>… {diagnostics.length - visible.length} more</Text>
        ) : null}
      </Box>

      {diff ? (
        <Box marginTop={1} flexDirection="column">
          <Text bold>diff</Text>
          {diffLines.slice(0, MAX_DIFF_LINES).map((line, index) => (
            <Text
              key={`${index}-${line}`}
              color={line.startsWith('+') ? 'green' : line.startsWith('-') ? 'red' : undefined}
              dimColor={line.startsWith(' ') || line.startsWith('@@')}
            >
              {line}
            </Text>
          ))}
          {diffLines.length > MAX_DIFF_LINES ? (
            <Text dimColor>… {diffLines.length - MAX_DIFF_LINES} more line(s)</Text>
          ) : null}
        </Box>
      ) : null}

      {notice ? (
        <Box marginTop={1}>
          <Text color="green">{notice}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>
          q quit · r rescan · space select · a all · d diff · f fix · u undo · p pack · ↑↓ move
        </Text>
      </Box>
    </Box>
  );
}

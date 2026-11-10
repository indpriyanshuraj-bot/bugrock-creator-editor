// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import {
  applyFixes,
  countBySeverity,
  detectProject,
  diagnoseProject,
  isFixable,
  packFileName,
  packProject,
  type Diagnostic,
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

type Status =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly data: Loaded }
  | { readonly kind: 'error'; readonly message: string }
  | { readonly kind: 'notice'; readonly message: string; readonly data: Loaded };

export function App({ root }: { readonly root: string }): React.ReactElement {
  const { exit } = useApp();
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [cursor, setCursor] = useState(0);

  const load = useCallback(async () => {
    setStatus({ kind: 'loading' });
    try {
      const host = new NodeHost(root);
      const project = await detectProject(host, '.');
      const diagnostics = await diagnoseProject(host, project);
      setStatus({ kind: 'ready', data: { project, diagnostics } });
      setCursor(0);
    } catch (error) {
      setStatus({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, [root]);

  useEffect(() => {
    void load();
  }, [load]);

  const data = status.kind === 'ready' || status.kind === 'notice' ? status.data : undefined;
  const diagnostics = data?.diagnostics ?? [];

  const fixAll = useCallback(async () => {
    if (!data) return;
    const host = new NodeHost(root);
    const result = await applyFixes(host, data.diagnostics);
    const project = await detectProject(host, '.');
    const after = await diagnoseProject(host, project);
    setStatus({
      kind: 'notice',
      message: `applied ${result.applied} fix(es) across ${result.files.length} file(s)`,
      data: { project, diagnostics: after },
    });
  }, [data, root]);

  const pack = useCallback(async () => {
    if (!data) return;
    const host = new NodeHost(root);
    const bytes = await packProject(host, data.project);
    const out = resolve(root, '..', packFileName(data.project));
    await writeFile(out, bytes);
    setStatus({
      kind: 'notice',
      message: `packed ${bytes.byteLength} bytes to ${out}`,
      data,
    });
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
      void fixAll();
      return;
    }
    if (input === 'p') {
      void pack();
      return;
    }
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(Math.max(0, diagnostics.length - 1), c + 1));
  });

  if (status.kind === 'loading') {
    return (
      <Box paddingX={1}>
        <Text dimColor>scanning {root}…</Text>
      </Box>
    );
  }

  if (status.kind === 'error') {
    return (
      <Box paddingX={1} flexDirection="column">
        <Text color="red">could not open {root}</Text>
        <Text dimColor>{status.message}</Text>
        <Text dimColor>q quit · r retry</Text>
      </Box>
    );
  }

  const counts = countBySeverity(diagnostics);
  const fixable = diagnostics.filter(isFixable).length;
  const visible = diagnostics.slice(0, 20);

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>bugrock</Text>
      <Text dimColor>
        {root} · {data?.project.packs.length ?? 0} pack(s)
      </Text>

      <Box marginTop={1} flexDirection="column">
        {(data?.project.packs ?? []).map((packEntry) => (
          <Text key={packEntry.root}>
            <Text color="cyan">{packEntry.kind.padEnd(10)}</Text>
            {packEntry.root.padEnd(24)}
            <Text dimColor>{packEntry.manifest.header?.name ?? '(unnamed)'}</Text>
          </Text>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>
          {counts.error} error · {counts.warning} warning · {counts.info} info · {fixable} fixable
        </Text>
        {visible.length === 0 ? (
          <Text color="green">no problems found</Text>
        ) : (
          visible.map((diagnostic, index) => {
            const selected = index === cursor;
            const colour =
              diagnostic.severity === 'error'
                ? 'red'
                : diagnostic.severity === 'warning'
                  ? 'yellow'
                  : 'gray';
            return (
              <Text key={`${diagnostic.code}-${diagnostic.path}-${index}`}>
                <Text color={selected ? 'white' : undefined}>{selected ? '>' : ' '} </Text>
                <Text color={colour}>{diagnostic.code}</Text> {diagnostic.path}
                <Text dimColor>{diagnostic.pointer ?? ''}</Text>
              </Text>
            );
          })
        )}
        {diagnostics.length > visible.length ? (
          <Text dimColor>… {diagnostics.length - visible.length} more</Text>
        ) : null}
      </Box>

      {status.kind === 'notice' ? (
        <Box marginTop={1}>
          <Text color="green">{status.message}</Text>
        </Box>
      ) : null}

      <Box marginTop={1}>
        <Text dimColor>q quit · r rescan · f fix all · p pack · ↑↓ move</Text>
      </Box>
    </Box>
  );
}

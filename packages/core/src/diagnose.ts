// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import type { Diagnostic } from './diagnostic';
import type { Host } from './host';
import { isUuid, isVersionTuple, SUPPORTED_FORMAT_VERSIONS, type Manifest } from './manifest';
import { basename, joinPath } from './path';
import type { Pack, Project } from './project';

export interface DiagnoseOptions {
  /** Injectable for deterministic tests. */
  readonly newUuid?: () => string;
}

const PACK_ICON = 'pack_icon.png';

function headerNameFromRoot(pack: Pack): string {
  return basename(pack.root) || 'untitled';
}

interface UuidUse {
  readonly path: string;
  readonly pointer: string;
  readonly pack: Pack;
}

function collectUuids(packs: readonly Pack[]): Map<string, UuidUse[]> {
  const index = new Map<string, UuidUse[]>();
  for (const pack of packs) {
    const uuid = pack.manifest.header?.uuid;
    if (isUuid(uuid)) {
      const uses = index.get(uuid) ?? [];
      uses.push({ path: pack.manifestPath, pointer: '/header/uuid', pack });
      index.set(uuid, uses);
    }
  }
  return index;
}

/**
 * Rule-based diagnosis. Pure with respect to content: it reads through the host but never writes.
 * Every diagnostic that can be fixed carries its own fix, so CLI/TUI/web share one fixer.
 */
export async function diagnoseProject(
  host: Host,
  project: Project,
  options: DiagnoseOptions = {},
): Promise<readonly Diagnostic[]> {
  const newUuid = options.newUuid ?? (() => globalThis.crypto.randomUUID());
  const diagnostics: Diagnostic[] = [];
  const uuidIndex = collectUuids(project.packs);
  const duplicated = new Set<string>();

  for (const pack of project.packs) {
    const path = pack.manifestPath;

    if (pack.parseError) {
      diagnostics.push({
        code: 'BRK001',
        severity: 'error',
        message: `manifest is not valid JSON: ${pack.parseError}`,
        path,
      });
      continue;
    }

    const manifest: Manifest = pack.manifest;

    if (typeof manifest.format_version !== 'number') {
      diagnostics.push({
        code: 'BRK002',
        severity: 'error',
        message: 'manifest has no numeric format_version',
        path,
        pointer: '/format_version',
        fix: {
          summary: 'Set format_version to 2',
          ops: [{ kind: 'set', pointer: '/format_version', value: 2 }],
        },
      });
    } else if (!SUPPORTED_FORMAT_VERSIONS.includes(manifest.format_version)) {
      diagnostics.push({
        code: 'BRK003',
        severity: 'warning',
        message: `format_version ${manifest.format_version} is newer than this tool understands (${SUPPORTED_FORMAT_VERSIONS.join(', ')})`,
        path,
        pointer: '/format_version',
      });
    }

    const header = manifest.header;
    if (!header) {
      diagnostics.push({
        code: 'BRK004',
        severity: 'error',
        message: 'manifest has no header object',
        path,
        pointer: '/header',
        fix: {
          summary: 'Create a minimal header',
          ops: [
            {
              kind: 'set',
              pointer: '/header',
              value: { name: headerNameFromRoot(pack), uuid: newUuid(), version: [1, 0, 0] },
            },
          ],
        },
      });
    } else {
      if (!isUuid(header.uuid)) {
        diagnostics.push({
          code: 'BRK005',
          severity: 'error',
          message: 'header.uuid is missing or not a UUID',
          path,
          pointer: '/header/uuid',
          fix: {
            summary: 'Generate a v4 UUID',
            ops: [{ kind: 'set', pointer: '/header/uuid', value: newUuid() }],
          },
        });
      } else {
        const uses = uuidIndex.get(header.uuid) ?? [];
        if (uses.length > 1 && !duplicated.has(header.uuid)) {
          duplicated.add(header.uuid);
          const others = uses
            .filter((use) => use.pack.root !== pack.root)
            .map((use) => use.path)
            .join(', ');
          diagnostics.push({
            code: 'BRK006',
            severity: 'error',
            message: `header.uuid ${header.uuid} is also used by ${others}`,
            path,
            pointer: '/header/uuid',
            fix: {
              summary: 'Regenerate this pack UUID',
              ops: [{ kind: 'set', pointer: '/header/uuid', value: newUuid() }],
            },
          });
        }
      }

      if (typeof header.name !== 'string' || header.name.trim().length === 0) {
        diagnostics.push({
          code: 'BRK007',
          severity: 'warning',
          message: 'header.name is missing or empty',
          path,
          pointer: '/header/name',
          fix: {
            summary: `Name the pack after its folder (${headerNameFromRoot(pack)})`,
            ops: [{ kind: 'set', pointer: '/header/name', value: headerNameFromRoot(pack) }],
          },
        });
      }

      if (!isVersionTuple(header.version)) {
        diagnostics.push({
          code: 'BRK009',
          severity: 'warning',
          message: 'header.version is missing or not a version tuple',
          path,
          pointer: '/header/version',
          fix: {
            summary: 'Set header.version to [1, 0, 0]',
            ops: [{ kind: 'set', pointer: '/header/version', value: [1, 0, 0] }],
          },
        });
      }

      if (!isVersionTuple(header.min_engine_version)) {
        diagnostics.push({
          code: 'BRK008',
          severity: 'info',
          message: 'header.min_engine_version is missing; the game will not warn on old versions',
          path,
          pointer: '/header/min_engine_version',
        });
      }
    }

    const modules = manifest.modules;
    if (!Array.isArray(modules) || modules.length === 0) {
      diagnostics.push({
        code: 'BRK010',
        severity: 'error',
        message: 'manifest has no modules, so the pack declares no content type',
        path,
        pointer: '/modules',
      });
    } else {
      modules.forEach((module, index) => {
        if (!isUuid(module.uuid)) {
          diagnostics.push({
            code: 'BRK011',
            severity: 'error',
            message: `modules[${index}].uuid is missing or not a UUID`,
            path,
            pointer: `/modules/${index}/uuid`,
            fix: {
              summary: 'Generate a v4 UUID',
              ops: [{ kind: 'set', pointer: `/modules/${index}/uuid`, value: newUuid() }],
            },
          });
        }
      });
    }

    const iconPath = joinPath(pack.root, PACK_ICON);
    if (!(await host.exists(iconPath))) {
      diagnostics.push({
        code: 'BRK012',
        severity: 'warning',
        message: 'pack_icon.png is missing, so the pack shows a blank tile in game',
        path: pack.root,
      });
    }
  }

  return diagnostics;
}

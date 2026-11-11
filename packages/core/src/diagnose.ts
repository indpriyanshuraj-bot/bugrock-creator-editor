// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import type { Diagnostic, DiagnosticCode, Fix, Severity } from './diagnostic';
import { sortDiagnostics } from './diagnostic';
import { isKnownManifestFormat, isKnownModuleType } from './format-version';
import type { Host } from './host';
import type { SourcePosition } from './jsonc';
import { isUuid, isVersionTuple, type Manifest } from './manifest';
import { basename, joinPath, type VPath } from './path';
import { readPngInfo } from './png';
import type { Pack, Project } from './project';

export interface DiagnoseOptions {
  /** Injectable for deterministic tests. */
  readonly newUuid?: () => string;
}

const PACK_ICON = 'pack_icon.png';
const EXPECTED_ICON_SIZES = new Set([64, 128, 256, 512]);

interface UuidSite {
  readonly pack: Pack;
  readonly pointer: string;
}

/** Walk up the pointer until we find a value we do have a position for. */
export function positionFor(pack: Pack, pointer: string | undefined): SourcePosition | undefined {
  if (pointer === undefined) return undefined;
  let current = pointer;
  for (;;) {
    const found = pack.positions.get(current);
    if (found) return found;
    if (current === '') return undefined;
    const cut = current.lastIndexOf('/');
    current = cut <= 0 ? '' : current.slice(0, cut);
  }
}

function indexUuids(packs: readonly Pack[]): Map<string, UuidSite[]> {
  const index = new Map<string, UuidSite[]>();
  const record = (uuid: string, site: UuidSite): void => {
    const sites = index.get(uuid) ?? [];
    sites.push(site);
    index.set(uuid, sites);
  };
  for (const pack of packs) {
    if (pack.parseError) continue;
    const headerUuid = pack.manifest.header?.uuid;
    if (isUuid(headerUuid)) record(headerUuid, { pack, pointer: '/header/uuid' });
    pack.manifest.modules?.forEach((module, i) => {
      if (isUuid(module.uuid)) record(module.uuid, { pack, pointer: `/modules/${i}/uuid` });
    });
  }
  return index;
}

/**
 * Rule-based diagnosis. Reads through the host but never writes.
 * Every diagnostic that can be fixed carries its own fix, so CLI/TUI/web share one fixer.
 */
export async function diagnoseProject(
  host: Host,
  project: Project,
  options: DiagnoseOptions = {},
): Promise<readonly Diagnostic[]> {
  const newUuid = options.newUuid ?? (() => globalThis.crypto.randomUUID());
  const out: Diagnostic[] = [];
  const uuidIndex = indexUuids(project.packs);
  const allUuids = new Set(uuidIndex.keys());

  const report = (
    pack: Pack,
    code: DiagnosticCode,
    severity: Severity,
    message: string,
    pointer?: string,
    fix?: Fix,
  ): void => {
    out.push({
      code,
      severity,
      message,
      path: pack.manifestPath,
      pointer,
      position: positionFor(pack, pointer),
      fix,
    });
  };

  // 1. Unparseable manifests: nothing else can be said about them.
  for (const pack of project.packs) {
    if (!pack.parseError) continue;
    out.push({
      code: 'BRK001',
      severity: 'error',
      message: `manifest is not valid JSON: ${pack.parseError}`,
      path: pack.manifestPath,
      position: pack.parseIssue
        ? {
            line: pack.parseIssue.line,
            column: pack.parseIssue.column,
            offset: pack.parseIssue.offset,
            length: 1,
          }
        : undefined,
    });
  }

  // 2. Duplicates are reported once, at the first site in path order.
  for (const [uuid, sites] of [...uuidIndex].sort(([a], [b]) => a.localeCompare(b))) {
    if (sites.length < 2) continue;
    const headers = sites.filter((site) => site.pointer === '/header/uuid');
    const modules = sites.filter((site) => site.pointer.startsWith('/modules/'));

    if (headers.length > 1) {
      const first = headers[0];
      if (first) {
        const others = headers
          .slice(1)
          .map((site) => site.pack.manifestPath)
          .join(', ');
        report(
          first.pack,
          'BRK006',
          'error',
          `header.uuid ${uuid} is also used by ${others}`,
          '/header/uuid',
          {
            summary: 'Regenerate this pack UUID',
            ops: [{ kind: 'set', pointer: '/header/uuid', value: newUuid() }],
          },
        );
      }
    }

    if (modules.length > 1) {
      const first = modules[0];
      if (first) {
        const others = modules
          .slice(1)
          .map((site) => `${site.pack.manifestPath}#${site.pointer}`)
          .join(', ');
        report(
          first.pack,
          'BRK017',
          'error',
          `module uuid ${uuid} is also used by ${others}`,
          first.pointer,
          {
            summary: 'Regenerate this module UUID',
            ops: [{ kind: 'set', pointer: first.pointer, value: newUuid() }],
          },
        );
      }
    }
  }

  // 3. Per-pack shape.
  for (const pack of project.packs) {
    if (pack.parseError) continue;
    const manifest: Manifest = pack.manifest;

    if (typeof manifest.format_version !== 'number') {
      report(pack, 'BRK002', 'error', 'manifest has no numeric format_version', '/format_version', {
        summary: 'Set format_version to 2',
        ops: [{ kind: 'set', pointer: '/format_version', value: 2 }],
      });
    } else if (!isKnownManifestFormat(manifest.format_version)) {
      report(
        pack,
        'BRK003',
        'warning',
        `format_version ${manifest.format_version} is newer than this tool understands; it will still read what it can`,
        '/format_version',
      );
    }

    const header = manifest.header;
    if (!header) {
      report(pack, 'BRK004', 'error', 'manifest has no header object', '/header', {
        summary: 'Create a minimal header',
        ops: [
          {
            kind: 'set',
            pointer: '/header',
            value: { name: basename(pack.root) || 'untitled', uuid: newUuid(), version: [1, 0, 0] },
          },
        ],
      });
    } else {
      if (!isUuid(header.uuid)) {
        report(pack, 'BRK005', 'error', 'header.uuid is missing or not a UUID', '/header/uuid', {
          summary: 'Generate a v4 UUID',
          ops: [{ kind: 'set', pointer: '/header/uuid', value: newUuid() }],
        });
      }

      if (typeof header.name !== 'string' || header.name.trim().length === 0) {
        report(pack, 'BRK007', 'warning', 'header.name is missing or empty', '/header/name', {
          summary: `Name the pack after its folder (${basename(pack.root) || 'untitled'})`,
          ops: [{ kind: 'set', pointer: '/header/name', value: basename(pack.root) || 'untitled' }],
        });
      }

      if (!isVersionTuple(header.version)) {
        report(
          pack,
          'BRK009',
          'warning',
          'header.version is missing or not a version tuple',
          '/header/version',
          {
            summary: 'Set header.version to [1, 0, 0]',
            ops: [{ kind: 'set', pointer: '/header/version', value: [1, 0, 0] }],
          },
        );
      }

      if (!isVersionTuple(header.min_engine_version)) {
        report(
          pack,
          'BRK008',
          'info',
          'header.min_engine_version is missing; the game will not warn on old versions',
          '/header/min_engine_version',
        );
      }
    }

    const modules = manifest.modules;
    if (!Array.isArray(modules) || modules.length === 0) {
      report(
        pack,
        'BRK010',
        'error',
        'manifest has no modules, so the pack declares no content type',
        '/modules',
      );
    } else {
      modules.forEach((module, index) => {
        if (!isUuid(module.uuid)) {
          report(
            pack,
            'BRK011',
            'error',
            `modules[${index}].uuid is missing or not a UUID`,
            `/modules/${index}/uuid`,
            {
              summary: 'Generate a v4 UUID',
              ops: [{ kind: 'set', pointer: `/modules/${index}/uuid`, value: newUuid() }],
            },
          );
        }
        const type = module.type;
        if (typeof type !== 'string' || !isKnownModuleType(type)) {
          report(
            pack,
            'BRK018',
            'warning',
            `modules[${index}].type is ${type === undefined ? 'missing' : `"${String(type)}"`}, which this tool does not recognise`,
            `/modules/${index}/type`,
          );
        }
      });
    }

    // Dependencies may legitimately point at packs outside this project, so unresolved is a
    // warning, not an error — but a uuid that matches nothing anywhere is usually a typo.
    manifest.dependencies?.forEach((dependency, index) => {
      const uuid = dependency.uuid;
      if (typeof uuid !== 'string' || uuid.length === 0) return;
      if (allUuids.has(uuid)) return;
      report(
        pack,
        'BRK013',
        'warning',
        `dependencies[${index}].uuid ${uuid} matches no pack or module in this project; that is fine only if the dependency ships separately`,
        `/dependencies/${index}/uuid`,
        {
          summary: 'Remove this dependency entry',
          ops: [{ kind: 'delete', pointer: `/dependencies/${index}` }],
        },
      );
    });

    // 4. The icon, which the game shows and users judge first.
    const iconPath: VPath = joinPath(pack.root, PACK_ICON);
    if (!(await host.exists(iconPath))) {
      out.push({
        code: 'BRK012',
        severity: 'warning',
        message: 'pack_icon.png is missing, so the pack shows a blank tile in game',
        path: pack.root,
      });
    } else {
      try {
        const info = readPngInfo(await host.read(iconPath));
        if (!info) {
          out.push({
            code: 'BRK014',
            severity: 'error',
            message: 'pack_icon.png is not a readable PNG, so the game will show a blank tile',
            path: iconPath,
          });
        } else {
          if (info.width !== info.height) {
            out.push({
              code: 'BRK015',
              severity: 'warning',
              message: `pack_icon.png is ${info.width}x${info.height}; the game draws it in a square`,
              path: iconPath,
            });
          } else if (!EXPECTED_ICON_SIZES.has(info.width)) {
            out.push({
              code: 'BRK016',
              severity: 'info',
              message: `pack_icon.png is ${info.width}x${info.height}; 64, 128, 256 or 512 is conventional`,
              path: iconPath,
            });
          }
        }
      } catch {
        out.push({
          code: 'BRK014',
          severity: 'error',
          message: 'pack_icon.png could not be read',
          path: iconPath,
        });
      }
    }
  }

  return sortDiagnostics(out);
}

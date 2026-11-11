// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

export { CORE_VERSION } from './version';

export {
  basename,
  dirname,
  extname,
  isJunk,
  isWithin,
  joinPath,
  normalizePath,
  type VPath,
} from './path';

export {
  decodeText,
  encodeText,
  MemoryHost,
  memoryCaps,
  readJson,
  readText,
  type Capabilities,
  type DirEntry,
  type Host,
} from './host';

export {
  escapePointer,
  parseJsonc,
  type JsoncIssue,
  type JsoncParseResult,
  type SourcePosition,
} from './jsonc';

export {
  isKnownManifestFormat,
  isKnownModuleType,
  KNOWN_MANIFEST_FORMATS,
  KNOWN_MODULE_TYPES,
  MANIFEST_FORMATS,
  type ManifestFormat,
} from './format-version';

export { readPngInfo, type PngInfo } from './png';

export {
  isUuid,
  isVersionTuple,
  MANIFEST_FILE,
  packKindOf,
  parseManifest,
  SUPPORTED_FORMAT_VERSIONS,
  type Manifest,
  type ManifestDependency,
  type ManifestHeader,
  type ManifestModule,
  type PackKind,
  type ParseResult,
} from './manifest';

export { detectProject, type DetectOptions, type Pack, type Project } from './project';

export {
  countBySeverity,
  DIAGNOSTIC_TITLES,
  isFixable,
  sortDiagnostics,
  type Diagnostic,
  type DiagnosticCode,
  type Fix,
  type FixOp,
  type Severity,
} from './diagnostic';

export { diagnoseProject, positionFor, type DiagnoseOptions } from './diagnose';

export { applyFixes, applyOp, parsePointer, type ApplyResult } from './fix';

export { countPackFiles, packFileName, packProject, type PackOptions } from './pack';

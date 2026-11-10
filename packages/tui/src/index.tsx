#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Priyanshu Raj and contributors

import { render } from 'ink';
import { resolve } from 'node:path';
import { App } from './app';

const target = process.argv[2];

if (!target) {
  console.error('usage: bugrock-tui <path-to-project>');
  process.exit(2);
}

render(<App root={resolve(target)} />);

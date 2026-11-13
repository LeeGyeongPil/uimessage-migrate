#!/usr/bin/env node
// Thin launcher: all logic lives in the compiled TypeScript under dist/.
import { run } from '../dist/cli/main.js';

process.exitCode = await run(process.argv.slice(2));

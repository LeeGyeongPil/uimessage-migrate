import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const BIN = join(ROOT, 'bin', 'uimessage-migrate.mjs');
export const DUMP = join(ROOT, 'examples', 'v4-dump.jsonl');
export const BROKEN = join(ROOT, 'test', 'fixtures', 'broken.jsonl');

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Run the built CLI in a child process with a clean environment (no inherited LANG etc.). */
export function runCli(args: string[], options: { cwd?: string; env?: Record<string, string>; bin?: string } = {}): CliResult {
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', ...options.env };
  const result = spawnSync(process.execPath, [options.bin ?? BIN, ...args], {
    cwd: options.cwd ?? ROOT,
    env,
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const made: string[] = [];

export function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'uimessage-migrate-'));
  made.push(dir);
  return dir;
}

export function cleanupTempDirs(): void {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
}

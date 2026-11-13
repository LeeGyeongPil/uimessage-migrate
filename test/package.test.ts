import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/version.js';
import { ROOT, runCli } from './cli-helpers.js';

const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');
const pkg = JSON.parse(read('package.json')) as Record<string, any>;

describe('package metadata', () => {
  it('has no runtime dependencies and an optional peer on ai', () => {
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies).toEqual({ ai: '>=5 <8' });
    expect(pkg.peerDependenciesMeta?.ai?.optional).toBe(true);
  });

  it('declares license, engines, bin, exports and files', () => {
    expect(pkg.license).toBe('MIT');
    expect(pkg.engines.node).toBe('>=22');
    expect(pkg.bin['uimessage-migrate']).toBe('bin/uimessage-migrate.mjs');
    expect(existsSync(join(ROOT, pkg.bin['uimessage-migrate']))).toBe(true);
    for (const target of [pkg.exports['.'], pkg.exports['./check']]) {
      expect(existsSync(join(ROOT, target.default))).toBe(true);
      expect(existsSync(join(ROOT, target.types))).toBe(true);
    }
    for (const entry of ['dist', 'bin', 'README.md', 'README.ko.md', 'LICENSE']) expect(pkg.files).toContain(entry);
    expect(pkg.files).not.toContain('test');
  });
});

describe('one version everywhere', () => {
  it('package.json, package-lock.json, the CLI constant and --version agree', () => {
    expect(pkg.version).toBe(VERSION);
    const lock = JSON.parse(read('package-lock.json')) as Record<string, any>;
    expect(lock.version).toBe(VERSION);
    expect(lock.packages[''].version).toBe(VERSION);
    expect(runCli(['--version']).stdout.trim()).toBe('uimessage-migrate ' + VERSION);
  });

  it('CHANGELOG has an entry for the current version', () => {
    expect(read('CHANGELOG.md')).toContain('## [' + VERSION + ']');
  });

  it('README files never mention a different uimessage-migrate version', () => {
    for (const file of ['README.md', 'README.ko.md']) {
      if (!existsSync(join(ROOT, file))) continue;
      for (const match of read(file).matchAll(/uimessage-migrate@(\d+\.\d+\.\d+)/g)) expect(match[1], file).toBe(VERSION);
    }
  });
});

describe('pure entry point', () => {
  const pureFiles = readdirSync(join(ROOT, 'dist'))
    .filter((f) => f.endsWith('.js') && f !== 'check.js')
    .map((f) => join('dist', f));

  it('dist/index.js does not import ai', () => {
    const index = read('dist/index.js');
    expect(index).not.toMatch(/from\s+['"]ai['"]/);
    expect(index).not.toMatch(/import\(\s*['"]ai['"]\s*\)/);
    expect(index).not.toContain('./check.js');
  });

  it('no pure module imports ai or a node: builtin (edge friendly)', () => {
    expect(pureFiles.length).toBeGreaterThan(5);
    for (const file of pureFiles) {
      const text = read(file);
      expect(text, file).not.toMatch(/from\s+['"]ai['"]/);
      expect(text, file).not.toMatch(/from\s+['"]node:/);
    }
  });
});

describe('npm pack', () => {
  it('ships dist, bin and LICENSE but not tests', () => {
    const result = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8' });
    expect(result.status).toBe(0);
    const files = (JSON.parse(result.stdout) as { files: { path: string }[] }[])[0]?.files.map((f) => f.path) ?? [];
    for (const wanted of ['dist/index.js', 'dist/check.js', 'dist/cli/main.js', 'bin/uimessage-migrate.mjs', 'LICENSE', 'package.json', 'CHANGELOG.md']) {
      expect(files).toContain(wanted);
    }
    expect(files.some((f) => f.startsWith('test/'))).toBe(false);
    expect(files.some((f) => f.startsWith('node_modules/'))).toBe(false);
    // README files are packaged automatically once they exist.
    for (const readme of ['README.md', 'README.ko.md']) if (existsSync(join(ROOT, readme))) expect(files).toContain(readme);
  });
});

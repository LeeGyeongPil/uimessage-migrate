import { cpSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { resolveAi } from '../src/check.js';
import { DUMP, ROOT, cleanupTempDirs, makeTempDir, runCli } from './cli-helpers.js';

afterAll(cleanupTempDirs);

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { devDependencies: Record<string, string> };
const pinned = (name: string) => pkg.devDependencies[name]?.split('@').pop();

/** A project folder whose node_modules/ai points at one of the installed aliases. */
function projectWith(alias: string): string {
  const dir = makeTempDir();
  mkdirSync(join(dir, 'node_modules'));
  symlinkSync(join(ROOT, 'node_modules', alias), join(dir, 'node_modules', 'ai'), 'dir');
  return dir;
}

describe('resolveAi', () => {
  it.each([
    ['ai-v5', '5.0.289'],
    ['ai-v6', '6.0.331'],
  ])('uses the ai installed in the project (%s)', async (alias, version) => {
    expect(pinned(alias)).toBe(version);
    const resolved = await resolveAi(projectWith(alias));
    expect(resolved.version).toBe(version);
    expect(resolved.source).toBe('project');
    expect(typeof resolved.module.safeValidateUIMessages).toBe('function');
  });

  it('falls back to the copy installed next to the package', async () => {
    const resolved = await resolveAi(makeTempDir());
    expect(resolved.source).toBe('bundled');
    expect(resolved.version).toBe(pinned('ai'));
  });

  it('throws AiNotFoundError when there is no ai anywhere', async () => {
    const isolated = makeTempDir();
    cpSync(join(ROOT, 'dist'), join(isolated, 'dist'), { recursive: true });
    cpSync(join(ROOT, 'package.json'), join(isolated, 'package.json'));
    const copy = (await import(pathToFileURL(join(isolated, 'dist', 'check.js')).href)) as typeof import('../src/check.js');
    await expect(copy.resolveAi(isolated)).rejects.toMatchObject({ name: 'AiNotFoundError', code: 'not_found' });
  });
});

describe('cli validator location', () => {
  it('prints the project ai version first', () => {
    const result = runCli([DUMP, '--dry-run', '--lang', 'en'], { cwd: projectWith('ai-v5') });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('validator: ai@5.0.289 (project)');
  });

  it('prints bundled when the project has no ai', () => {
    const result = runCli([DUMP, '--dry-run', '--lang', 'en'], { cwd: makeTempDir() });
    expect(result.stdout).toContain('validator: ai@' + pinned('ai') + ' (bundled)');
  });

  it('works with ai 6 as well', () => {
    const result = runCli([DUMP, '--dry-run', '--lang', 'en'], { cwd: projectWith('ai-v6') });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('validator: ai@6.0.331 (project)');
  });
});

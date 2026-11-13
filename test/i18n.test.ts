import { cpSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createT, MESSAGES, resolveLang } from '../src/cli/i18n.js';
import { BROKEN, DUMP, ROOT, cleanupTempDirs, makeTempDir, runCli } from './cli-helpers.js';

afterAll(cleanupTempDirs);

describe('message tables', () => {
  const en = Object.keys(MESSAGES.en).sort();
  const ko = Object.keys(MESSAGES.ko).sort();

  it('have identical key sets and no empty values', () => {
    expect(ko).toEqual(en);
    for (const lang of ['en', 'ko'] as const) {
      for (const [key, value] of Object.entries(MESSAGES[lang])) expect(value.trim(), `${lang}:${key}`).not.toBe('');
    }
  });

  it('use the same placeholders in both languages', () => {
    const names = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of en as (keyof typeof MESSAGES.en)[]) expect(names(MESSAGES.ko[key]), key).toEqual(names(MESSAGES.en[key]));
  });

  it('createT fills placeholders and leaves unknown ones visible', () => {
    expect(createT('en')('err.inputMissing', { file: 'a.jsonl' })).toContain('a.jsonl');
    expect(createT('ko')('err.inputMissing')).toContain('{file}');
  });

  const cliDir = join(ROOT, 'src', 'cli');
  const sources = readdirSync(cliDir)
    .filter((f) => f.endsWith('.ts') && !f.startsWith('messages.'))
    .map((f) => [f, readFileSync(join(cliDir, f), 'utf8')] as const);

  it('CLI sources contain no hard-coded user text outside t()', () => {
    for (const [file, text] of sources) {
      expect(text, file).not.toMatch(/console\.(log|error|warn|info)\(\s*['"`]/);
      expect(text, file).not.toMatch(/process\.(stdout|stderr)\.write\(\s*['"`]/);
    }
  });

  it('every message key is used by the CLI sources', () => {
    const all = sources.map(([, text]) => text).join('\n');
    for (const key of en) expect(all, key).toContain(`'${key}'`);
  });
});

describe('language selection', () => {
  it('resolves flag > UIMESSAGE_MIGRATE_LANG > LC_ALL > LC_MESSAGES > LANG', () => {
    expect(resolveLang('ko', { LANG: 'en_US.UTF-8' })).toBe('ko');
    expect(resolveLang('en', { UIMESSAGE_MIGRATE_LANG: 'ko' })).toBe('en');
    expect(resolveLang(undefined, { UIMESSAGE_MIGRATE_LANG: 'ko', LC_ALL: 'en_US' })).toBe('ko');
    expect(resolveLang(undefined, { LC_ALL: 'ko_KR.UTF-8', LANG: 'en_US' })).toBe('ko');
    expect(resolveLang(undefined, { LC_MESSAGES: 'ko_KR', LANG: 'en_US' })).toBe('ko');
    expect(resolveLang(undefined, { LANG: 'ko_KR.UTF-8' })).toBe('ko');
    expect(resolveLang(undefined, { LANG: 'fr_FR.UTF-8' })).toBe('en');
    expect(resolveLang(undefined, {})).toBe('en');
  });

  it('--help and the summary are Korean with --lang ko and English with --lang en', () => {
    const koHelp = runCli(['--lang', 'ko', '--help']);
    const enHelp = runCli(['--lang', 'en', '--help']);
    expect(koHelp.stdout).toContain('사용법');
    expect(enHelp.stdout).toContain('Usage');
    expect(enHelp.stdout).not.toContain('사용법');
    const koRun = runCli([DUMP, '--dry-run', '--lang', 'ko']);
    const enRun = runCli([DUMP, '--dry-run', '--lang', 'en']);
    expect(koRun.stdout).toContain('옮김');
    expect(koRun.stdout).not.toContain('migrated');
    expect(enRun.stdout).toContain('migrated');
    expect(enRun.stdout).not.toContain('옮김');
  });

  it('UIMESSAGE_MIGRATE_LANG=ko and LANG=ko_KR.UTF-8 select Korean, and --lang wins', () => {
    expect(runCli([DUMP, '--dry-run'], { env: { UIMESSAGE_MIGRATE_LANG: 'ko' } }).stdout).toContain('옮김');
    expect(runCli([DUMP, '--dry-run'], { env: { LANG: 'ko_KR.UTF-8' } }).stdout).toContain('옮김');
    expect(runCli([DUMP, '--dry-run', '--lang', 'en'], { env: { UIMESSAGE_MIGRATE_LANG: 'ko' } }).stdout).toContain('migrated');
    expect(runCli([DUMP, '--dry-run'], { env: {} }).stdout).toContain('migrated');
  });

  it('failed-row and fail-on messages are localized', () => {
    expect(runCli([BROKEN, '--dry-run', '--lang', 'ko']).stdout).toContain('실패한 행: 2건');
    expect(runCli([DUMP, '--dry-run', '--fail-on', 'lost', '--lang', 'ko']).stdout).toContain('--fail-on lost: 해당 단계 이상의 손실');
    expect(runCli([DUMP, '--dry-run', '--lang', 'en']).stdout).toContain('unpaired tool calls: 1');
    expect(runCli([DUMP, '--dry-run', '--lang', 'ko']).stdout).toContain('짝 없는 도구 호출: 1건');
  });
});

describe('error paths are localized and exit with the documented code', () => {
  const dir = makeTempDir();
  const badJson = join(dir, 'bad.json');
  writeFileSync(badJson, '{ not json');
  // A copy of the build in a folder with no node_modules anywhere above it: no "ai" can be found.
  const isolated = makeTempDir();
  cpSync(join(ROOT, 'dist'), join(isolated, 'dist'), { recursive: true });
  cpSync(join(ROOT, 'bin'), join(isolated, 'bin'), { recursive: true });
  cpSync(join(ROOT, 'package.json'), join(isolated, 'package.json'));
  const isolatedRun = { cwd: isolated, bin: join(isolated, 'bin', 'uimessage-migrate.mjs') };

  const cases: { name: string; args: string[]; code: number; en: string; ko: string; run?: { cwd: string; bin: string } }[] = [
    { name: 'unknown option', args: [DUMP, '--bogus'], code: 2, en: 'Unknown option --bogus', ko: '알 수 없는 옵션입니다: --bogus' },
    { name: 'missing option value', args: [DUMP, '--out'], code: 2, en: 'Option --out needs a value', ko: '--out 옵션에는 값이 필요합니다' },
    { name: 'invalid enum value', args: [DUMP, '--fail-on', 'nope'], code: 2, en: 'Invalid value "nope" for --fail-on', ko: '--fail-on 의 값 "nope" 가 올바르지 않습니다' },
    { name: 'no input', args: ['--dry-run'], code: 2, en: 'No input file given', ko: '입력 파일이 없습니다' },
    { name: 'missing input file', args: [join(dir, 'missing.jsonl'), '--dry-run'], code: 2, en: 'Input file not found', ko: '입력 파일을 찾을 수 없습니다' },
    { name: 'input is a folder', args: [dir, '--dry-run'], code: 2, en: 'Input is not a file', ko: '입력이 파일이 아닙니다' },
    { name: 'nothing to write', args: [DUMP], code: 2, en: 'Nothing to write', ko: '쓸 곳이 없습니다' },
    { name: 'invalid JSON file', args: [badJson, '--dry-run'], code: 2, en: 'Could not parse', ko: 'JSON 으로 읽을 수 없습니다' },
    { name: 'unwritable output', args: [DUMP, '--out', join(dir, 'no-such-folder', 'out.jsonl')], code: 2, en: 'Could not write', ko: '쓸 수 없습니다' },
    { name: 'ai not installed', args: [DUMP, '--dry-run'], code: 3, en: 'Could not find the "ai" package', ko: '"ai" 패키지를 찾을 수 없습니다', run: isolatedRun },
  ];

  it.each(cases)('$name (exit $code)', ({ args, code, en, ko, run }) => {
    const english = runCli([...args, '--lang', 'en'], run);
    expect(english.status).toBe(code);
    expect(english.stderr).toContain(en);
    expect(english.stdout).toBe('');
    const korean = runCli([...args, '--lang', 'ko'], run);
    expect(korean.status).toBe(code);
    expect(korean.stderr).toContain(ko);
    expect(korean.stderr).not.toContain(en);
  });

  it('the ai-not-found error is skipped with --no-validate', () => {
    expect(runCli([DUMP, '--dry-run', '--no-validate'], isolatedRun).status).toBe(0);
  });

  it('an invalid --lang value is reported in English and exits 2', () => {
    const result = runCli([DUMP, '--dry-run', '--lang', 'fr'], { env: { UIMESSAGE_MIGRATE_LANG: 'ko' } });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Invalid value "fr" for --lang');
  });

  it('usage errors in Korean point to --help in Korean', () => {
    expect(runCli(['--bogus', '--lang', 'ko']).stderr).toContain('사용법은 uimessage-migrate --help');
  });
});

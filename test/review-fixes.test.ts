import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createT } from '../src/cli/i18n.js';
import { migrateMessage } from '../src/index.js';
import { AI_VERSIONS } from './helpers.js';
import { DUMP, cleanupTempDirs, makeTempDir, runCli } from './cli-helpers.js';

afterAll(cleanupTempDirs);

const EN = { UIMESSAGE_MIGRATE_LANG: 'en' };
const KO = { UIMESSAGE_MIGRATE_LANG: 'ko' };
const ROW = '{"id":"m1","role":"user","content":"hi"}';

describe('Q-1: outputs never overwrite inputs', () => {
  for (const [name, env, key] of [['en', EN, 'Refusing to write'], ['ko', KO, '쓸 수 없습니다']] as const) {
    it(`--out equal to the input exits 2 and keeps the input bytes (${name})`, () => {
      const dir = makeTempDir();
      const input = join(dir, 'same.jsonl');
      writeFileSync(input, `${ROW}\n`);
      const result = runCli([input, '--out', input, '--no-validate'], { env });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(key);
      expect(readFileSync(input, 'utf8')).toBe(`${ROW}\n`);
    });
  }

  it('--failed and --report equal to the input are refused too', () => {
    const dir = makeTempDir();
    const input = join(dir, 'in.jsonl');
    writeFileSync(input, `${ROW}\n`);
    expect(runCli([input, '--failed', input, '--no-validate'], { env: EN }).status).toBe(2);
    expect(runCli([input, '--report', input, '--no-validate'], { env: EN }).status).toBe(2);
    expect(readFileSync(input, 'utf8')).toBe(`${ROW}\n`);
  });

  it('the same path spelled differently and two outputs with one path are refused', () => {
    const dir = makeTempDir();
    const input = join(dir, 'in.jsonl');
    writeFileSync(input, `${ROW}\n`);
    expect(runCli([input, '--out', join(dir, '.', 'in.jsonl'), '--no-validate'], { env: EN }).status).toBe(2);
    const shared = join(dir, 'shared.out');
    expect(runCli([input, '--out', shared, '--report', shared, '--no-validate'], { env: EN }).status).toBe(2);
  });

  it('--dry-run with the input as --out writes nothing and still succeeds', () => {
    const dir = makeTempDir();
    const input = join(dir, 'in.jsonl');
    writeFileSync(input, `${ROW}\n`);
    expect(runCli([input, '--out', input, '--dry-run', '--no-validate'], { env: EN }).status).toBe(0);
    expect(readFileSync(input, 'utf8')).toBe(`${ROW}\n`);
  });
});

describe('Q-2: unknown top-level fields are kept and reported', () => {
  const row = { id: 'm1', chat_id: 'c1', user_id: 42, role: 'user', content: 'hi', created_at: '2025-01-01' };

  it('moves them into metadata with a moved loss per field', () => {
    const { message, losses } = migrateMessage(row);
    expect(message?.metadata).toEqual({ chat_id: 'c1', user_id: 42, created_at: '2025-01-01' });
    expect(losses.map((l) => [l.code, l.severity, l.path])).toEqual([
      ['metadata.moved', 'moved', 'chat_id'],
      ['metadata.moved', 'moved', 'user_id'],
      ['metadata.moved', 'moved', 'created_at'],
    ]);
  });

  it('metadataFields "drop" reports them as lost', () => {
    const { message, losses } = migrateMessage(row, { metadataFields: 'drop' });
    expect(message).not.toHaveProperty('metadata');
    expect(losses.every((l) => l.code === 'metadata.dropped' && l.severity === 'lost')).toBe(true);
    expect(losses).toHaveLength(3);
  });

  it.each(AI_VERSIONS)('the result validates on %s', async (_name, ai) => {
    const { message } = migrateMessage(row);
    expect((await ai.safeValidateUIMessages({ messages: [message] })).success).toBe(true);
  });

  it('the CLI report shows the extra fields', () => {
    const dir = makeTempDir();
    const input = join(dir, 'in.jsonl');
    const report = join(dir, 'r.json');
    const out = join(dir, 'o.jsonl');
    writeFileSync(input, `${JSON.stringify(row)}\n`);
    expect(runCli([input, '--out', out, '--report', report, '--no-validate'], { env: EN }).status).toBe(0);
    expect(JSON.parse(readFileSync(out, 'utf8')).metadata.chat_id).toBe('c1');
    expect(JSON.parse(readFileSync(report, 'utf8')).losses.bySeverity.moved).toBe(3);
  });
});

describe('Q-6: UTF-8 byte order mark', () => {
  it('JSONL with a BOM migrates', () => {
    const dir = makeTempDir();
    const input = join(dir, 'bom.jsonl');
    writeFileSync(input, `﻿${ROW}\n${ROW.replace('m1', 'm2')}\n`);
    const result = runCli([input, '--dry-run', '--no-validate'], { env: EN });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('migrated 2/2');
  });

  it('a .json file with a BOM migrates', () => {
    const dir = makeTempDir();
    const input = join(dir, 'bom.json');
    writeFileSync(input, `﻿[${ROW}]`);
    const result = runCli([input, '--dry-run', '--no-validate'], { env: EN });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('migrated 1/1');
  });
});

describe('Q-7: empty input warns', () => {
  for (const [name, env, text] of [['en', EN, 'no records found'], ['ko', KO, '레코드를 찾지 못했습니다']] as const) {
    it(`an empty file prints a warning (${name}) and still exits 0`, () => {
      const dir = makeTempDir();
      const input = join(dir, 'empty.jsonl');
      writeFileSync(input, '');
      const result = runCli([input, '--dry-run', '--no-validate'], { env });
      expect(result.status).toBe(0);
      expect(result.stderr).toContain(text);
      expect(result.stderr).toContain('empty.jsonl');
    });
  }

  it('a normal run prints no such warning', () => {
    const result = runCli([DUMP, '--dry-run', '--no-validate'], { env: EN });
    expect(result.stderr).toBe('');
  });

  it('the message exists in both languages', () => {
    expect(createT('en')('warn.noRecords', { files: 'x' })).toContain('x');
    expect(createT('ko')('err.outputIsInput', { file: 'y' })).toContain('y');
  });
});

describe('Q-8: v4.2 part extras', () => {
  const msg = (parts: unknown[]) => ({ id: 'p1', role: 'assistant', content: '', parts });

  it('keeps providerMetadata on text, source and file parts', () => {
    const pm = { anthropic: { cacheControl: { type: 'ephemeral' } } };
    const { message, losses } = migrateMessage(
      msg([
        { type: 'text', text: 'hi', providerMetadata: pm },
        { type: 'source', source: { sourceType: 'url', id: 's', url: 'https://example.com' }, providerMetadata: pm },
        { type: 'file', mimeType: 'image/png', url: 'https://example.com/a.png', providerMetadata: pm },
      ]),
    );
    expect(message?.parts.map((p) => p.providerMetadata)).toEqual([pm, pm, pm]);
    expect(losses).toEqual([]);
  });

  it('reports other unknown part fields as lost', () => {
    const { message, losses } = migrateMessage(msg([{ type: 'text', text: 'hi', citations: [1], index: 3 }]));
    expect(message?.parts).toEqual([{ type: 'text', text: 'hi' }]);
    expect(losses.map((l) => [l.code, l.severity, l.path])).toEqual([
      ['part.field-dropped', 'lost', 'parts[0].citations'],
      ['part.field-dropped', 'lost', 'parts[0].index'],
    ]);
  });

  it.each(AI_VERSIONS)('parts with providerMetadata validate on %s', async (_name, ai) => {
    const pm = { anthropic: { a: 1 } };
    const { message } = migrateMessage(msg([{ type: 'text', text: 'hi', providerMetadata: pm }]));
    expect((await ai.safeValidateUIMessages({ messages: [message] })).success).toBe(true);
  });
});

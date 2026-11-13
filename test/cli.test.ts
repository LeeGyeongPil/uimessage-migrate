import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { BROKEN, DUMP, cleanupTempDirs, makeTempDir, runCli } from './cli-helpers.js';

afterAll(cleanupTempDirs);

const lines = (file: string) => readFileSync(file, 'utf8').split('\n').filter(Boolean);
const json = (line: string) => JSON.parse(line) as Record<string, any>;
const EN = { UIMESSAGE_MIGRATE_LANG: 'en' };

describe('cli: full run on the sample dump', () => {
  const dir = makeTempDir();
  const out = join(dir, 'out.jsonl');
  const failed = join(dir, 'failed.jsonl');
  const report = join(dir, 'report.json');
  const result = runCli([DUMP, '--out', out, '--failed', failed, '--report', report], { env: EN });

  it('exits 0 and writes 5 output lines', () => {
    expect(result.status).toBe(0);
    expect(lines(out)).toHaveLength(5);
    expect(lines(failed)).toHaveLength(0);
    expect(result.stdout).toContain('migrated 5/5');
  });

  it('writes a report with totals and one unpaired tool call', () => {
    const data = JSON.parse(readFileSync(report, 'utf8')) as Record<string, any>;
    expect(data.tool).toBe('uimessage-migrate');
    expect(data.totals).toEqual({ records: 5, migrated: 5, passthrough: 1, failed: 0, dropped: 0 });
    expect(data.unpairedToolCalls).toEqual([{ file: 'v4-dump.jsonl', line: 3, messageId: 'a2', toolCallId: 'call_2' }]);
    expect(data.losses.bySeverity).toEqual({ lost: 3, estimated: 1, moved: 4 });
    expect(data.losses.items[0]).toMatchObject({ file: 'v4-dump.jsonl', line: 1, code: 'attachment.media-type-guessed' });
    expect(data.modelConversion).toEqual({ ok: 5, error: 0, skipped: 0 });
  });

  it('output messages use parts and no longer have content', () => {
    for (const line of lines(out)) {
      const message = json(line);
      expect(Array.isArray(message.parts)).toBe(true);
      expect(message).not.toHaveProperty('content');
    }
  });

  it('report paths contain file names only', () => {
    const text = readFileSync(report, 'utf8');
    expect(text).not.toContain(dir);
  });
});

describe('cli: broken input', () => {
  it('keeps failing rows in the failed file with line numbers and codes, and exits 1', () => {
    const dir = makeTempDir();
    const out = join(dir, 'out.jsonl');
    const failed = join(dir, 'failed.jsonl');
    const result = runCli([BROKEN, '--out', out, '--failed', failed], { env: EN });
    expect(result.status).toBe(1);
    expect(lines(out)).toHaveLength(2);
    const rows = lines(failed).map(json);
    expect(rows.map((r) => [r.line, r.error])).toEqual([
      [2, 'invalid_json'],
      [3, 'missing_role'],
    ]);
    expect(rows[1]?.record).toEqual({ id: 'norole', content: 'no role here' });
    expect(typeof rows[0]?.record).toBe('string');
  });

  it('a row that fails validation is reported as validation_failed', () => {
    const dir = makeTempDir();
    const input = join(dir, 'bad-part.jsonl');
    writeFileSync(input, `${JSON.stringify({ id: 'x', role: 'assistant', parts: [{ type: 'text' }] })}\n`);
    const failed = join(dir, 'failed.jsonl');
    const result = runCli([input, '--failed', failed], { env: EN });
    expect(result.status).toBe(1);
    expect(json(lines(failed)[0] ?? '{}')).toMatchObject({ line: 1, error: 'validation_failed' });
  });

  it('without --failed the summary says how to see the failed rows', () => {
    const result = runCli([BROKEN, '--dry-run'], { env: EN });
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('failed rows: 2');
  });
});

describe('cli: flags', () => {
  it('--fail-on lost exits 1 when something was lost, none and estimated behave as documented', () => {
    expect(runCli([DUMP, '--dry-run', '--fail-on', 'lost'], { env: EN }).status).toBe(1);
    expect(runCli([DUMP, '--dry-run', '--fail-on', 'none'], { env: EN }).status).toBe(0);
    const dir = makeTempDir();
    const input = join(dir, 'no-id.jsonl');
    writeFileSync(input, `${JSON.stringify({ role: 'user', content: 'hi' })}\n`);
    expect(runCli([input, '--dry-run', '--fail-on', 'lost'], { env: EN }).status).toBe(0);
    expect(runCli([input, '--dry-run', '--fail-on', 'estimated'], { env: EN }).status).toBe(1);
  });

  it('--dry-run writes no files', () => {
    const dir = makeTempDir();
    const out = join(dir, 'out.jsonl');
    const failed = join(dir, 'failed.jsonl');
    const report = join(dir, 'report.json');
    const result = runCli([DUMP, '--dry-run', '--out', out, '--failed', failed, '--report', report], { env: EN });
    expect(result.status).toBe(0);
    expect(existsSync(out) || existsSync(failed) || existsSync(report)).toBe(false);
    expect(result.stdout).toContain('no files were written');
  });

  it('--no-validate skips the validator and the model conversion', () => {
    const dir = makeTempDir();
    const report = join(dir, 'report.json');
    const result = runCli([DUMP, '--no-validate', '--report', report], { env: EN });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('validator: skipped');
    const data = JSON.parse(readFileSync(report, 'utf8')) as Record<string, any>;
    expect(data.aiVersion).toBeNull();
    expect(data.modelConversion).toEqual({ ok: 0, error: 0, skipped: 5 });
  });

  it('--incomplete-tool error leaves no unpaired tool calls', () => {
    const dir = makeTempDir();
    const report = join(dir, 'report.json');
    expect(runCli([DUMP, '--incomplete-tool', 'error', '--report', report], { env: EN }).status).toBe(0);
    expect((JSON.parse(readFileSync(report, 'utf8')) as Record<string, any>).unpairedToolCalls).toEqual([]);
  });

  it('--data-role drop drops the data message and counts it', () => {
    const dir = makeTempDir();
    const out = join(dir, 'out.jsonl');
    const report = join(dir, 'report.json');
    expect(runCli([DUMP, '--data-role', 'drop', '--out', out, '--report', report], { env: EN }).status).toBe(0);
    expect(lines(out)).toHaveLength(4);
    expect((JSON.parse(readFileSync(report, 'utf8')) as Record<string, any>).totals).toMatchObject({ dropped: 1, migrated: 4, records: 5 });
  });

  it('--signature-provider keeps the reasoning signature', () => {
    const dir = makeTempDir();
    const out = join(dir, 'out.jsonl');
    runCli([DUMP, '--signature-provider', 'anthropic', '--out', out], { env: EN });
    expect(readFileSync(out, 'utf8')).toContain('"signature":"sig-example"');
  });

  it('--version and --help exit 0', () => {
    expect(runCli(['--version'], { env: EN }).stdout).toMatch(/^uimessage-migrate \d+\.\d+\.\d+/);
    expect(runCli(['--help'], { env: EN }).status).toBe(0);
  });
});

describe('cli: input shapes', () => {
  it('migrates conversation rows with a messages array and keeps their other fields', () => {
    const dir = makeTempDir();
    const input = join(dir, 'chats.jsonl');
    const chat = { id: 'chat_1', title: 'Trip', messages: [{ role: 'user', content: 'hi' }, { id: 'a', role: 'assistant', content: 'hello' }] };
    writeFileSync(input, `${JSON.stringify(chat)}\n\n${JSON.stringify({ ...chat, id: 'chat_2' })}\r\n`);
    const out = join(dir, 'out.jsonl');
    expect(runCli([input, '--out', out], { env: EN }).status).toBe(0);
    const rows = lines(out).map(json);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: 'chat_1', title: 'Trip' });
    expect(rows[0]?.messages).toHaveLength(2);
    expect(rows[0]?.messages[0].id).toMatch(/^msg_/);
    expect(rows[0]?.messages[0].id).not.toBe(rows[1]?.messages[0].id);
  });

  it('supports --messages-key', () => {
    const dir = makeTempDir();
    const input = join(dir, 'chats.jsonl');
    writeFileSync(input, `${JSON.stringify({ id: 'c', history: [{ id: 'u', role: 'user', content: 'hi' }] })}\n`);
    const out = join(dir, 'out.jsonl');
    expect(runCli([input, '--out', out, '--messages-key', 'history'], { env: EN }).status).toBe(0);
    expect(json(lines(out)[0] ?? '{}').history[0].parts).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('reads a JSON array file and several files in one run', () => {
    const dir = makeTempDir();
    const array = join(dir, 'messages.json');
    writeFileSync(array, JSON.stringify([{ id: 'u', role: 'user', content: 'hi' }, { id: 'a', role: 'assistant', content: 'yo' }]));
    const out = join(dir, 'out.jsonl');
    const result = runCli([array, DUMP, '--out', out], { env: EN });
    expect(result.status).toBe(0);
    expect(lines(out)).toHaveLength(7);
    expect(result.stdout).toContain('migrated 7/7');
  });

  it('streams a large dump without trouble', () => {
    const dir = makeTempDir();
    const input = join(dir, 'big.jsonl');
    const row = JSON.stringify({ id: 'u', role: 'user', content: 'hello' });
    writeFileSync(input, `${Array.from({ length: 5000 }, () => row).join('\n')}\n`);
    const result = runCli([input, '--dry-run'], { env: EN });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('migrated 5000/5000');
  });
});

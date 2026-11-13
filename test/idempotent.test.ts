import { describe, expect, it } from 'vitest';
import { detectFormat, migrateMessage, migrateMessages } from '../src/index.js';
import { fixture } from './helpers.js';

describe('idempotence and passthrough', () => {
  it('migrating twice gives the same messages and no new losses', () => {
    const first = migrateMessages(fixture('v4-mixed.json'));
    const second = migrateMessages(first.messages);
    expect(second.messages).toEqual(first.messages);
    expect(second.losses).toEqual([]);
  });

  it('v5 fixtures pass through untouched', () => {
    for (const msg of fixture<unknown[]>('v5-passthrough.json')) {
      const result = migrateMessage(msg);
      expect(result.detected).toBe('v5');
      expect(result.message).toBe(msg);
      expect(result.losses).toEqual([]);
    }
  });

  it('v6 output-error moves rawInput to input and reports it', () => {
    const [msg] = fixture<unknown[]>('v6-raw-input.json');
    const result = migrateMessage(msg);
    expect(result.detected).toBe('v5');
    expect(result.message?.parts[0]).toEqual({
      type: 'tool-weather',
      toolCallId: 'call_1',
      state: 'output-error',
      input: { city: 'Seoul' },
      errorText: 'upstream timeout',
    });
    expect(result.losses.map((l) => [l.code, l.severity])).toEqual([['tool.raw-input', 'moved']]);
    expect(migrateMessage(result.message).losses).toEqual([]);
  });

  it('generated ids are deterministic and depend on position and salt', () => {
    const msg = { role: 'user', content: 'hello' };
    const at0 = migrateMessage(msg).message?.id;
    expect(at0).toBe('msg_06efe2be7bf97010');
    expect(migrateMessage(msg).message?.id).toBe(at0);
    expect(migrateMessage(msg, { index: 1 }).message?.id).toBe('msg_940f3c4127a37785');
    expect(migrateMessage(msg, { idSalt: 'chat-1' }).message?.id).toBe('msg_615576500d07f444');
    const batch = migrateMessages([msg, msg]).messages;
    expect(batch[0]?.id).not.toBe(batch[1]?.id);
  });

  it('reports the generated id as an estimated loss', () => {
    const { losses, message } = migrateMessage({ role: 'user', content: 'hello' });
    expect(losses[0]).toMatchObject({ code: 'id.generated', severity: 'estimated', messageId: message?.id });
  });

  it('detectFormat tells v4 from v5 and rejects everything else', () => {
    expect(detectFormat({ role: 'user', content: 'x' })).toBe('v4');
    expect(detectFormat({ role: 'assistant', content: 'x', parts: [{ type: 'text', text: 'x' }] })).toBe('v4');
    expect(detectFormat({ role: 'data', content: '' })).toBe('v4');
    expect(detectFormat({ id: 'a', role: 'user', parts: [{ type: 'text', text: 'x' }] })).toBe('v5');
    expect(detectFormat({ role: 'user' })).toBe('unknown');
    expect(detectFormat(null)).toBe('unknown');
    expect(detectFormat('text')).toBe('unknown');
  });

  it('throws InvalidMessageError with a code for unusable input', () => {
    expect(() => migrateMessage('nope')).toThrowError(expect.objectContaining({ name: 'InvalidMessageError', code: 'not_object' }));
    expect(() => migrateMessage({ content: 'x' })).toThrowError(expect.objectContaining({ code: 'missing_role' }));
    expect(() => migrateMessage({ role: 'user' })).toThrowError(expect.objectContaining({ code: 'unknown_format' }));
    expect(() => migrateMessages('x' as unknown as unknown[])).toThrowError(expect.objectContaining({ code: 'not_object' }));
  });
});

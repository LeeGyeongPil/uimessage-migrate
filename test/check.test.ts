import { describe, expect, it } from 'vitest';
import { checkMessages, findUnpairedToolCalls } from '../src/check.js';
import { migrateMessages } from '../src/index.js';
import { AI_VERSIONS, fixture } from './helpers.js';

const withUnpaired = () => fixture('v4-mixed.json');

describe.each(AI_VERSIONS)('checkMessages on %s', (_name, ai) => {
  it('reports unpaired tool call even when validation passes', async () => {
    const { messages } = migrateMessages(withUnpaired());
    const result = await checkMessages(messages, { ai });
    expect(result.valid).toBe(true);
    expect(result.modelConversion).toBe('ok');
    expect(result.unpairedToolCalls).toEqual(['call_2']);
  });

  it('error option resolves unpaired calls', async () => {
    const { messages } = migrateMessages(withUnpaired(), { incompleteToolCall: 'error' });
    const result = await checkMessages(messages, { ai });
    expect(result.valid).toBe(true);
    expect(result.modelConversion).toBe('ok');
    expect(result.unpairedToolCalls).toEqual([]);
  });

  it('invalid messages are reported with an error text and no model conversion', async () => {
    const result = await checkMessages(fixture('v4-mixed.json'), { ai });
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.modelConversion).toBe('skipped');
  });

  it('counts system messages', async () => {
    const { messages } = migrateMessages([{ id: 's', role: 'system', content: 'be brief' }, { id: 'u', role: 'user', content: 'hi' }]);
    expect((await checkMessages(messages, { ai })).systemMessages).toBe(1);
  });
});

describe('findUnpairedToolCalls', () => {
  it('returns message and call ids and ignores non-message values', () => {
    const { messages } = migrateMessages(fixture('v4-mixed.json'));
    expect(findUnpairedToolCalls([...messages, null, 'x'])).toEqual([{ messageId: 'a2', toolCallId: 'call_2' }]);
  });
});

describe('checkMessages without an explicit ai', () => {
  it('resolves the installed ai and reports its version', async () => {
    const { messages } = migrateMessages(fixture('v4-mixed.json'));
    const result = await checkMessages(messages);
    expect(result.valid).toBe(true);
    expect(result.aiVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
});

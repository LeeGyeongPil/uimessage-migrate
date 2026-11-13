import { describe, expect, it } from 'vitest';
import { migrateMessages } from '../src/index.js';
import { AI_VERSIONS, fixture } from './helpers.js';

describe.each(AI_VERSIONS)('%s', (_name, ai) => {
  it('migrated v4 fixtures validate on ai 5, 6 and 7', async () => {
    const { messages } = migrateMessages(fixture('v4-mixed.json'));
    const result = await ai.safeValidateUIMessages({ messages });
    expect(result.success).toBe(true);
  });

  it('raw v4 messages fail validation', async () => {
    const result = await ai.safeValidateUIMessages({ messages: fixture('v4-mixed.json') });
    expect(result.success).toBe(false);
  });

  it('a half-converted tool part (state "result", args/result kept) fails validation', async () => {
    const naive = [{ id: 'n1', role: 'assistant', parts: [{ type: 'tool-weather', toolCallId: 'x', state: 'result', args: { c: 1 }, result: 1 }] }];
    expect((await ai.safeValidateUIMessages({ messages: naive })).success).toBe(false);
  });

  it('v5 and v6 fixtures pass through and validate', async () => {
    const { messages } = migrateMessages([...fixture<unknown[]>('v5-passthrough.json'), ...fixture<unknown[]>('v6-raw-input.json')]);
    expect((await ai.safeValidateUIMessages({ messages })).success).toBe(true);
  });
});

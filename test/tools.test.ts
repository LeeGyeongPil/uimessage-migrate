import { describe, expect, it } from 'vitest';
import { migrateMessage, migrateMessages } from '../src/index.js';

const invocation = (extra: Record<string, unknown>) => ({
  state: 'result',
  step: 0,
  toolCallId: 'c1',
  toolName: 'weather',
  args: { city: 'Seoul' },
  result: { temp: 21 },
  ...extra,
});
const topLevel = (inv: Record<string, unknown>) => ({ id: 'm', role: 'assistant', content: '', toolInvocations: [inv] });
const nested = (inv: Record<string, unknown>) => ({ id: 'm', role: 'assistant', content: '', parts: [{ type: 'tool-invocation', toolInvocation: inv }] });

function toolPart(msg: unknown, options = {}) {
  return migrateMessage(msg, options).message?.parts.find((p) => String(p.type).startsWith('tool-') || p.type === 'dynamic-tool');
}

function assertClean(msg: unknown, options = {}) {
  const json = JSON.stringify(migrateMessage(msg, options).message);
  expect(json).not.toContain('"tool-undefined"');
  expect(json).not.toContain('"args"');
  expect(json).not.toContain('"state":"result"');
}

describe.each([
  ['top-level toolInvocations', topLevel],
  ['nested tool-invocation part', nested],
])('%s', (_label, build) => {
  it.each([
    ['partial-call', 'input-streaming'],
    ['call', 'input-available'],
  ])('maps state %s to %s and args to input', (from, to) => {
    const part = toolPart(build(invocation({ state: from, result: undefined })));
    expect(part).toMatchObject({ type: 'tool-weather', state: to, input: { city: 'Seoul' }, toolCallId: 'c1' });
    expect(part).not.toHaveProperty('args');
  });

  it('maps result to output-available with input and output', () => {
    const part = toolPart(build(invocation({})));
    expect(part).toEqual({ type: 'tool-weather', toolCallId: 'c1', state: 'output-available', input: { city: 'Seoul' }, output: { temp: 21 } });
    assertClean(build(invocation({})));
  });

  it('reports an unknown state instead of pretending it is output-available', () => {
    const { message, losses } = migrateMessage(build(invocation({ state: 'weird' })));
    const part = message?.parts[0];
    expect(part?.state).toBe('input-available');
    expect(part).not.toHaveProperty('output');
    expect(losses.map((l) => [l.code, l.severity])).toEqual([['tool.state-unknown', 'lost']]);
  });

  it('uses a dynamic-tool part when toolName is missing', () => {
    const msg = build(invocation({ toolName: undefined }));
    const { message, losses } = migrateMessage(msg);
    expect(message?.parts[0]).toMatchObject({ type: 'dynamic-tool', toolName: 'unknown', state: 'output-available' });
    expect(losses.map((l) => l.code)).toEqual(['tool.name-missing']);
    assertClean(msg);
  });

  it('uses the configured fallback name when toolName is missing', () => {
    expect(toolPart(build(invocation({ toolName: '' })), { missingToolName: 'legacy' })?.type).toBe('tool-legacy');
  });

  it('generates a deterministic toolCallId when it is missing', () => {
    const a = migrateMessage(build(invocation({ toolCallId: undefined })));
    const b = migrateMessage(build(invocation({ toolCallId: undefined })));
    expect(a.message?.parts[0]?.toolCallId).toMatch(/^call_[0-9a-f]{16}$/);
    expect(a.message).toEqual(b.message);
    expect(a.losses.map((l) => l.code)).toEqual(['tool.call-id-missing']);
  });
});

describe('incompleteToolCall', () => {
  const incomplete = nested(invocation({ state: 'call', result: undefined }));

  it('keep leaves an input-available part and reports tool.incomplete', () => {
    const { message, losses } = migrateMessage(incomplete);
    expect(message?.parts[0]).toMatchObject({ state: 'input-available' });
    expect(losses.map((l) => [l.code, l.severity])).toEqual([['tool.incomplete', 'lost']]);
  });

  it('error turns the call into output-error with an error text', () => {
    const { message, losses } = migrateMessage(incomplete, { incompleteToolCall: 'error' });
    expect(message?.parts[0]).toMatchObject({ state: 'output-error', input: { city: 'Seoul' } });
    expect(typeof message?.parts[0]?.errorText).toBe('string');
    expect(losses.map((l) => l.code)).toEqual(['tool.incomplete']);
  });

  it('drop removes the part (and keeps the message valid with an empty text part)', () => {
    const { message, losses } = migrateMessage(incomplete, { incompleteToolCall: 'drop' });
    expect(message?.parts).toEqual([{ type: 'text', text: '' }]);
    expect(losses.map((l) => l.code)).toEqual(['tool.incomplete', 'message.empty']);
  });

  it('migrateMessages reports the same losses for a batch', () => {
    expect(migrateMessages([incomplete]).losses).toHaveLength(1);
  });
});

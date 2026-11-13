import { describe, expect, it } from 'vitest';
import { migrateMessages, summarizeLosses } from '../src/index.js';
import { fixture } from './helpers.js';

const summarize = (losses: { messageId: string; code: string; severity: string }[]) =>
  losses.map((l) => [l.messageId, l.code, l.severity]);

describe('losses', () => {
  it('reports exact losses for v4-mixed', () => {
    const { losses } = migrateMessages(fixture('v4-mixed.json'));
    expect(summarize(losses)).toEqual([
      ['u1', 'attachment.media-type-guessed', 'estimated'],
      ['u1', 'metadata.moved', 'moved'],
      ['a1', 'metadata.moved', 'moved'],
      ['a2', 'reasoning.signature', 'lost'],
      ['a2', 'reasoning.redacted', 'lost'],
      ['a2', 'tool.incomplete', 'lost'],
      ['a2', 'file.data-url', 'moved'],
      ['d1', 'role.data', 'moved'],
    ]);
  });

  it('signatureProvider keeps signature', () => {
    const { messages, losses } = migrateMessages(fixture('v4-mixed.json'), { signatureProvider: 'anthropic' });
    const signature = losses.find((l) => l.code === 'reasoning.signature');
    expect(signature?.severity).toBe('moved');
    const a2 = messages.find((m) => m.id === 'a2');
    const reasoning = a2?.parts.find((p) => p.type === 'reasoning');
    expect(reasoning?.providerMetadata).toEqual({ anthropic: { signature: 'sig123' } });
  });

  it('a second signature cannot be kept and is reported as lost', () => {
    const msg = {
      id: 'x',
      role: 'assistant',
      content: '',
      parts: [{ type: 'reasoning', reasoning: 'r', details: [{ type: 'text', text: 'a', signature: 's1' }, { type: 'text', text: 'b', signature: 's2' }] }],
    };
    const { losses } = migrateMessages([msg], { signatureProvider: 'anthropic' });
    expect(losses.map((l) => l.severity)).toEqual(['moved', 'lost']);
  });

  it('data role can be dropped, which is a lost loss', () => {
    const { messages, losses, dropped } = migrateMessages(fixture('v4-mixed.json'), { dataRole: 'drop' });
    expect(dropped).toBe(1);
    expect(messages.map((m) => m.id)).toEqual(['u1', 'a1', 'a2']);
    expect(losses.at(-1)).toMatchObject({ code: 'role.data', severity: 'lost' });
  });

  it('metadataFields "drop" reports dropped metadata instead of moving it', () => {
    const { messages, losses } = migrateMessages(fixture('v4-mixed.json'), { metadataFields: 'drop' });
    expect(losses.filter((l) => l.code === 'metadata.dropped')).toHaveLength(2);
    expect(messages[0]).not.toHaveProperty('metadata');
  });

  it('system messages are reported as estimated', () => {
    const { losses } = migrateMessages([{ id: 's', role: 'system', content: 'be brief' }]);
    expect(losses).toEqual([expect.objectContaining({ code: 'role.system', severity: 'estimated' })]);
  });

  it('unknown parts are reported as lost', () => {
    const msg = { id: 'p', role: 'assistant', content: 'x', parts: [{ type: 'text', text: 'x' }, { type: 'mystery' }, { type: 'source', source: {} }] };
    const { losses } = migrateMessages([msg]);
    expect(losses.map((l) => l.code)).toEqual(['part.unknown', 'part.unknown']);
  });

  it('empty messages get an empty text part and an estimated loss', () => {
    const { messages, losses } = migrateMessages([{ id: 'e', role: 'user', content: '' }]);
    expect(messages[0]?.parts).toEqual([{ type: 'text', text: '' }]);
    expect(losses[0]).toMatchObject({ code: 'message.empty', severity: 'estimated' });
  });

  it('attachments: media type comes from data URLs, extensions, or falls back', () => {
    const msg = {
      id: 'att',
      role: 'user',
      content: 'files',
      experimental_attachments: [
        { url: 'data:image/jpeg;base64,AAAA' },
        { name: 'report.pdf', url: 'https://example.com/download' },
        { url: 'https://example.com/blob' },
      ],
    };
    const { messages, losses } = migrateMessages([msg]);
    expect(messages[0]?.parts.slice(0, 3).map((p) => p.mediaType)).toEqual(['image/jpeg', 'application/pdf', 'application/octet-stream']);
    expect(losses.map((l) => l.code)).toEqual(['attachment.media-type-guessed', 'attachment.media-type-guessed']);
  });

  it('summarizeLosses counts per code', () => {
    const { losses } = migrateMessages(fixture('v4-mixed.json'));
    expect(summarizeLosses(losses)).toMatchObject({ 'metadata.moved': 2, 'role.data': 1 });
  });
});

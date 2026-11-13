// Validate migrated messages with the installed ai package.
// Run after `npm run build`: node examples/check.mjs
import { migrateMessages } from 'uimessage-migrate';
import { checkMessages } from 'uimessage-migrate/check';

const stored = [
  { id: 'u1', role: 'user', content: 'Weather in Seoul?' },
  { id: 'a1', role: 'assistant', content: '', toolInvocations: [{ state: 'call', toolCallId: 'call_1', toolName: 'weather', args: { city: 'Seoul' } }] },
];

const { messages, losses } = migrateMessages(stored, { incompleteToolCall: 'keep' });
const result = await checkMessages(messages);
console.log('valid:', result.valid, '| ai:', result.aiVersion);
console.log('unpaired tool calls:', result.unpairedToolCalls);
console.log('losses:', losses.map((l) => l.code + ' (' + l.severity + ')').join(', '));

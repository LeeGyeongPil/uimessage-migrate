// Read-time migration: convert rows read from your database right before handing them to useChat.
// Run after `npm run build`: node examples/read-time.mjs
import { migrateMessages } from 'uimessage-migrate';

// Rows as an AI SDK 4.x app stored them (content string + toolInvocations).
const stored = [
  { id: 'u1', role: 'user', content: 'What is the weather in Seoul?', createdAt: '2025-03-01T10:00:00.000Z' },
  {
    id: 'a1',
    role: 'assistant',
    content: 'It is sunny.',
    toolInvocations: [
      { state: 'result', step: 0, toolCallId: 'call_1', toolName: 'weather', args: { city: 'Seoul' }, result: { temp: 21 } },
    ],
  },
];

const { messages, losses } = migrateMessages(stored);

console.log(JSON.stringify(messages[1], null, 2));
console.log('losses: ' + losses.length);
for (const loss of losses) console.log('- ' + loss.messageId + ' ' + loss.code + ' (' + loss.severity + ')');

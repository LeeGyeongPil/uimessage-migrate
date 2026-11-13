import { detectFormat, isRecord } from './detect.js';
import { InvalidMessageError } from './errors.js';
import { generateId } from './ids.js';
import { LossCollector } from './losses.js';
import { convertAttachment, convertReasoning, convertV4Part } from './parts.js';
import { convertToolInvocation, isToolPart, normalizeV5ToolPart, type ToolContext } from './tools.js';
import type { MigrateManyResult, MigrateOptions, MigrateResult, Rec, UIMessageLike } from './types.js';

function describe(msg: unknown): string {
  if (msg === null) return 'null';
  return Array.isArray(msg) ? 'array' : typeof msg;
}

function assertMessage(msg: unknown): Rec {
  if (!isRecord(msg)) {
    throw new InvalidMessageError('not_object', `Expected a message object but got ${describe(msg)}. Check that each stored row is one JSON object.`);
  }
  if (msg.role === undefined || msg.role === null || msg.role === '') {
    throw new InvalidMessageError('missing_role', 'The message has no "role". Expected "user", "assistant", "system" or (v4 only) "data".');
  }
  if (detectFormat(msg) === 'unknown') {
    throw new InvalidMessageError(
      'unknown_format',
      'The message is neither an AI SDK 4.x message (needs "content" or "toolInvocations") nor a v5+ message (needs a "parts" array), or its role is not recognised.',
    );
  }
  return msg;
}

function messageId(msg: Rec, options: MigrateOptions, losses: LossCollector): string {
  if (typeof msg.id === 'string' && msg.id.length > 0) return msg.id;
  const id = generateId('msg', options.idSalt ?? '', options.index ?? 0, String(msg.role), msg);
  losses.messageId = id;
  losses.add('id.generated', 'estimated', 'id', 'message had no id; generated a deterministic one from its position and content');
  return id;
}

function migrateV5(msg: Rec, id: string, losses: LossCollector): Rec {
  let changed = false;
  const parts = (msg.parts as unknown[]).map((part, i) => {
    if (!isToolPart(part)) return part;
    const next = normalizeV5ToolPart(part, losses, `parts[${i}]`);
    if (next !== part) changed = true;
    return next;
  });
  const idChanged = msg.id !== id;
  if (!changed && !idChanged) return msg;
  return { ...msg, id, parts };
}

function toDateString(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value;
}

function migrateV4(msg: Rec, id: string, options: MigrateOptions, losses: LossCollector): Rec | null {
  const role = String(msg.role);
  const ctx: ToolContext = { losses, options, messageId: id };

  if (role === 'data') {
    if (options.dataRole === 'drop') {
      losses.add('role.data', 'lost', 'role', 'v4 "data" role message was dropped');
      return null;
    }
    losses.add('role.data', 'moved', 'role', 'v4 "data" role message moved into an assistant data part');
    const name = options.dataPartName ?? 'custom';
    return { id, role: 'assistant', parts: [{ type: `data-${name}`, data: msg.data !== undefined ? msg.data : msg.content }] };
  }
  if (role === 'system') {
    losses.add('role.system', 'estimated', 'role', 'system messages inside stored history are rejected by default in ai@7 model calls; review before sending');
  }

  const parts: Rec[] = [];
  const push = (part: Rec | null): void => {
    if (part) parts.push(part);
  };

  const attachments: Rec[] = [];
  if (Array.isArray(msg.experimental_attachments)) {
    msg.experimental_attachments.forEach((att, i) => {
      if (isRecord(att)) push2(attachments, convertAttachment(att, losses, `experimental_attachments[${i}]`));
    });
  }

  const v4Parts = Array.isArray(msg.parts) && msg.parts.length > 0 ? msg.parts : undefined;
  if (v4Parts) {
    v4Parts.forEach((part, i) => push(convertV4Part(part, ctx, `parts[${i}]`, i)));
  } else {
    if (typeof msg.reasoning === 'string') push(convertReasoning(msg.reasoning, undefined, ctx, 'reasoning'));
    if (Array.isArray(msg.toolInvocations)) {
      msg.toolInvocations.forEach((inv, i) => {
        if (isRecord(inv)) push(convertToolInvocation(inv, ctx, `toolInvocations[${i}]`, i));
        else losses.add('part.unknown', 'lost', `toolInvocations[${i}]`, 'tool invocation is not an object and was dropped');
      });
    }
    if (typeof msg.content === 'string' && msg.content.length > 0) parts.push({ type: 'text', text: msg.content });
  }
  parts.unshift(...attachments);

  if (parts.length === 0) {
    losses.add('message.empty', 'estimated', 'parts', 'message had no content; an empty text part was added because ai requires at least one part');
    parts.push({ type: 'text', text: '' });
  }

  const metadata: Rec = {};
  const fields: [string, unknown][] = [
    ['createdAt', toDateString(msg.createdAt)],
    ['annotations', msg.annotations],
    ['data', msg.data],
  ];
  for (const [key, value] of fields) {
    if (value === undefined || value === null) continue;
    if (options.metadataFields === 'drop') {
      losses.add('metadata.dropped', 'lost', key, `${key} was dropped (metadataFields: "drop")`);
    } else {
      metadata[key] = value;
      losses.add('metadata.moved', 'moved', key, `${key} moved to metadata.${key}`);
    }
  }
  // Unknown top-level fields (database columns such as chat_id) are kept in metadata, never silently dropped.
  for (const [key, value] of Object.entries(msg)) {
    if (KNOWN_V4_KEYS.has(key) || value === undefined) continue;
    if (options.metadataFields === 'drop') {
      losses.add('metadata.dropped', 'lost', key, `${key} was dropped (metadataFields: "drop")`);
    } else {
      metadata[key] = value;
      losses.add('metadata.moved', 'moved', key, `unknown field ${key} moved to metadata.${key}`);
    }
  }
  return { id, role, ...(Object.keys(metadata).length > 0 ? { metadata } : {}), parts };
}

const KNOWN_V4_KEYS = new Set([
  'id', 'role', 'content', 'reasoning', 'toolInvocations', 'experimental_attachments',
  'annotations', 'createdAt', 'data', 'parts',
]);

function push2(target: Rec[], part: Rec | null): void {
  if (part) target.push(part);
}

/**
 * Migrate one stored message to the current UIMessage shape.
 * Messages that are already v5+ are returned unchanged (same object) except for small normalisations,
 * so the function is idempotent and safe to apply on every read.
 *
 * @throws {InvalidMessageError} when the value cannot be treated as a message.
 */
export function migrateMessage(msg: unknown, options: MigrateOptions = {}): MigrateResult {
  const record = assertMessage(msg);
  const detected = detectFormat(record) as 'v4' | 'v5';
  const losses = new LossCollector();
  losses.messageId = typeof record.id === 'string' ? record.id : '';
  const id = messageId(record, options, losses);
  const message =
    detected === 'v5' ? migrateV5(record, id, losses) : migrateV4(record, id, options, losses);
  return { message: message as UIMessageLike | null, losses: losses.items, detected };
}

/** Migrate a list of messages. Positions are used for generated ids; dropped messages are counted. */
export function migrateMessages(msgs: unknown[], options: MigrateOptions = {}): MigrateManyResult {
  if (!Array.isArray(msgs)) {
    throw new InvalidMessageError('not_object', 'migrateMessages expects an array of messages.');
  }
  const messages: UIMessageLike[] = [];
  const losses: MigrateManyResult['losses'] = [];
  let dropped = 0;
  msgs.forEach((msg, index) => {
    const result = migrateMessage(msg, { ...options, index });
    losses.push(...result.losses);
    if (result.message) messages.push(result.message);
    else dropped += 1;
  });
  return { messages, losses, dropped };
}



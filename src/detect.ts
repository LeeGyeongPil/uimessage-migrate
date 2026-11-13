import type { Rec, StoredFormat } from './types.js';

export function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ROLES = new Set(['system', 'user', 'assistant', 'data']);

export function isKnownRole(role: unknown): role is string {
  return typeof role === 'string' && ROLES.has(role);
}

/** Part shapes that only exist in AI SDK 4.x stored messages. */
function isV4Part(part: unknown): boolean {
  if (!isRecord(part)) return false;
  switch (part.type) {
    case 'tool-invocation':
    case 'source':
      return true;
    case 'reasoning':
      return typeof part.reasoning === 'string' && typeof part.text !== 'string';
    case 'file':
      return 'mimeType' in part || ('data' in part && !('url' in part));
    default:
      return false;
  }
}

/**
 * Tell AI SDK 4.x messages (`content` string, `toolInvocations`, ...) from v5+ messages (`parts` only).
 * Never throws; returns `unknown` for anything that cannot be a message.
 */
export function detectFormat(msg: unknown): StoredFormat {
  if (!isRecord(msg) || !isKnownRole(msg.role)) return 'unknown';
  if (msg.role === 'data') return 'v4';
  const hasV4Fields =
    typeof msg.content === 'string' ||
    Array.isArray(msg.toolInvocations) ||
    Array.isArray(msg.experimental_attachments) ||
    typeof msg.reasoning === 'string';
  if (Array.isArray(msg.parts)) {
    if (hasV4Fields || msg.parts.some(isV4Part)) return 'v4';
    return 'v5';
  }
  return hasV4Fields ? 'v4' : 'unknown';
}

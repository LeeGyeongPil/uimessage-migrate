import { isRecord } from './detect.js';
import type { LossSink } from './losses.js';
import { FALLBACK_MEDIA_TYPE, guessMediaType, mediaTypeFromDataUrl } from './media-type.js';
import { convertToolInvocation, isToolPart, normalizeV5ToolPart, type ToolContext } from './tools.js';
import type { Rec } from './types.js';

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** v4 `reasoning` (string + optional `details`) -> one v5 reasoning part. */
export function convertReasoning(
  text: string,
  details: unknown,
  ctx: ToolContext,
  path: string,
): Rec | null {
  const part: Rec = { type: 'reasoning', text };
  const provider = ctx.options.signatureProvider;
  let kept = false;
  if (Array.isArray(details)) {
    details.forEach((detail, i) => {
      if (!isRecord(detail)) return;
      const where = `${path}.details[${i}]`;
      if (detail.type === 'redacted') {
        ctx.losses.add('reasoning.redacted', 'lost', where, 'redacted reasoning has no UI part and was dropped');
      }
      const signature = str(detail.signature);
      if (signature === undefined) return;
      if (provider && !kept) {
        part.providerMetadata = { [provider]: { signature } };
        kept = true;
        ctx.losses.add('reasoning.signature', 'moved', where, `signature kept in providerMetadata.${provider}.signature`);
      } else {
        const why = provider ? 'only the first signature can be kept' : 'no signatureProvider option was given';
        ctx.losses.add('reasoning.signature', 'lost', where, `signature dropped: ${why}`);
      }
    });
  }
  if (text.length === 0 && !part.providerMetadata) return null;
  return part;
}

/** v4 `experimental_attachments[]` item -> `file` part. */
export function convertAttachment(att: Rec, losses: LossSink, path: string): Rec | null {
  const url = str(att.url);
  if (!url) {
    losses.add('part.unknown', 'lost', path, 'attachment has no url and was dropped');
    return null;
  }
  const name = str(att.name);
  let mediaType = str(att.contentType);
  if (!mediaType) {
    mediaType = mediaTypeFromDataUrl(url);
    if (!mediaType) {
      const guess = guessMediaType(name, url);
      mediaType = guess ?? FALLBACK_MEDIA_TYPE;
      losses.add(
        'attachment.media-type-guessed',
        'estimated',
        `${path}.contentType`,
        guess ? `contentType missing; guessed ${guess} from the file extension` : `contentType missing; used ${FALLBACK_MEDIA_TYPE}`,
      );
    }
  }
  return { type: 'file', mediaType, url, ...(name ? { filename: name } : {}) };
}

/** Convert one entry of a v4.2 `parts` array. Returns `null` when the part is dropped. */
export function convertV4Part(part: unknown, ctx: ToolContext, path: string, ordinal: number): Rec | null {
  if (!isRecord(part) || typeof part.type !== 'string') {
    ctx.losses.add('part.unknown', 'lost', path, 'part is not an object with a string type');
    return null;
  }
  switch (part.type) {
    case 'text':
      if (typeof part.text !== 'string') return unknownPart(part, ctx, path);
      reportDroppedFields(part, ['type', 'text', 'providerMetadata'], ctx, path);
      return { type: 'text', text: part.text, ...withMetadata(part) };
    case 'step-start':
      reportDroppedFields(part, ['type'], ctx, path);
      return { type: 'step-start' };
    case 'reasoning': {
      const text = str(part.reasoning) ?? str(part.text);
      if (text === undefined) return unknownPart(part, ctx, path);
      reportDroppedFields(part, ['type', 'reasoning', 'text', 'details', 'providerMetadata'], ctx, path);
      const converted = convertReasoning(text, part.details, ctx, path);
      if (converted && isRecord(part.providerMetadata) && !converted.providerMetadata) {
        converted.providerMetadata = part.providerMetadata;
      }
      return converted;
    }
    case 'tool-invocation': {
      if (!isRecord(part.toolInvocation)) return unknownPart(part, ctx, path);
      return convertToolInvocation(part.toolInvocation, ctx, `${path}.toolInvocation`, ordinal);
    }
    case 'source': {
      const source = isRecord(part.source) ? part.source : undefined;
      const url = str(source?.url);
      if (!source || !url) return unknownPart(part, ctx, path);
      const sourceId = str(source.id) ?? url;
      reportDroppedFields(part, ['type', 'source', 'providerMetadata'], ctx, path);
      reportDroppedFields(source, ['id', 'url', 'title', 'sourceType'], ctx, `${path}.source`);
      return { type: 'source-url', sourceId, url, ...(str(source.title) ? { title: str(source.title) } : {}), ...withMetadata(part) };
    }
    case 'file': {
      const mediaType = str(part.mimeType) ?? str(part.mediaType);
      reportDroppedFields(part, ['type', 'mimeType', 'mediaType', 'data', 'url', 'filename', 'providerMetadata'], ctx, path);
      if (str(part.url) && mediaType) {
        return { type: 'file', mediaType, url: str(part.url), ...(str(part.filename) ? { filename: str(part.filename) } : {}), ...withMetadata(part) };
      }
      const data = str(part.data);
      if (!data || !mediaType) return unknownPart(part, ctx, path);
      if (data.startsWith('data:') || /^https?:\/\//.test(data)) return { type: 'file', mediaType, url: data, ...withMetadata(part) };
      ctx.losses.add('file.data-url', 'moved', path, 'raw base64 data rewritten as a data: URL');
      return { type: 'file', mediaType, url: `data:${mediaType};base64,${data}`, ...withMetadata(part) };
    }
    default: {
      // v5+ shaped parts can appear inside a v4.2 message; keep them.
      const tool = isToolPart(part);
      const type: string = part.type;
      if (tool) return normalizeV5ToolPart(part, ctx.losses, path);
      if (type === 'source-url' || type === 'source-document' || type.startsWith('data-')) return part;
      return unknownPart(part, ctx, path);
    }
  }
}

/** `providerMetadata` is valid on v5 parts too, so it is carried over unchanged. */
function withMetadata(part: Rec): Rec {
  return isRecord(part.providerMetadata) ? { providerMetadata: part.providerMetadata } : {};
}

/** Report every field of a v4.2 part that has no place in the converted part. */
function reportDroppedFields(part: Rec, allowed: readonly string[], ctx: ToolContext, path: string): void {
  for (const key of Object.keys(part)) {
    if (allowed.includes(key) || part[key] === undefined) continue;
    ctx.losses.add('part.field-dropped', 'lost', `${path}.${key}`, `field ${key} has no equivalent on the converted part and was dropped`);
  }
}

function unknownPart(part: Rec, ctx: ToolContext, path: string): null {
  ctx.losses.add('part.unknown', 'lost', path, `unsupported part ${JSON.stringify(part.type)} was dropped`);
  return null;
}

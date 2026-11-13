import { isRecord } from './detect.js';
import { generateId } from './ids.js';
import type { LossSink } from './losses.js';
import type { MigrateOptions, Rec } from './types.js';

const STATE_MAP: Record<string, string> = {
  'partial-call': 'input-streaming',
  call: 'input-available',
  result: 'output-available',
};

export const INCOMPLETE_ERROR_TEXT = 'Tool call did not complete before the conversation was stored.';

export interface ToolContext {
  losses: LossSink;
  options: MigrateOptions;
  messageId: string;
}

function toolPartBase(name: unknown, ctx: ToolContext, path: string): Rec {
  if (typeof name === 'string' && name.length > 0) return { type: `tool-${name}` };
  const fallback = ctx.options.missingToolName ?? 'dynamic';
  if (fallback === 'dynamic') {
    ctx.losses.add('tool.name-missing', 'estimated', path, 'toolName was missing; stored as a dynamic-tool part named "unknown"');
    return { type: 'dynamic-tool', toolName: 'unknown' };
  }
  ctx.losses.add('tool.name-missing', 'estimated', path, `toolName was missing; used "${fallback}"`);
  return { type: `tool-${fallback}` };
}

/**
 * Convert one v4 tool invocation (`{ state, toolCallId, toolName, args, result }`) to a v5+ tool part.
 * Returns `null` when the part is removed (`incompleteToolCall: 'drop'`).
 */
export function convertToolInvocation(inv: Rec, ctx: ToolContext, path: string, ordinal: number): Rec | null {
  const part = toolPartBase(inv.toolName, ctx, path);
  let toolCallId = inv.toolCallId;
  if (typeof toolCallId !== 'string' || toolCallId.length === 0) {
    toolCallId = generateId('call', ctx.messageId, ordinal, 'tool', inv);
    ctx.losses.add('tool.call-id-missing', 'estimated', path, 'toolCallId was missing; generated a deterministic one');
  }
  part.toolCallId = toolCallId;

  const state = typeof inv.state === 'string' ? STATE_MAP[inv.state] : undefined;
  const hasArgs = inv.args !== undefined;

  if (state === 'output-available') {
    part.state = 'output-available';
    part.input = hasArgs ? inv.args : {};
    part.output = inv.result;
    return part;
  }

  // Everything below has no recorded result.
  if (state === undefined) {
    ctx.losses.add('tool.state-unknown', 'lost', `${path}.state`, `unknown tool state ${JSON.stringify(inv.state)}; treated as an incomplete call`);
  } else {
    ctx.losses.add('tool.incomplete', 'lost', path, `tool call ${String(toolCallId)} has no result in the stored history`);
  }

  const mode = ctx.options.incompleteToolCall ?? 'keep';
  if (mode === 'drop') return null;
  if (mode === 'error') {
    part.state = 'output-error';
    part.input = hasArgs ? inv.args : {};
    part.errorText = INCOMPLETE_ERROR_TEXT;
    return part;
  }
  part.state = state === 'input-streaming' ? 'input-streaming' : 'input-available';
  if (hasArgs || part.state === 'input-available') part.input = hasArgs ? inv.args : {};
  return part;
}

/** v5/v6 parts: `output-error` used `rawInput`; v7 wants `input`. Returns the same object when nothing changes. */
export function normalizeV5ToolPart(part: Rec, losses: LossSink, path: string): Rec {
  if (part.state === 'output-error' && !('input' in part) && 'rawInput' in part) {
    const { rawInput, ...rest } = part;
    losses.add('tool.raw-input', 'moved', path, 'output-error rawInput moved to input');
    return { ...rest, input: rawInput };
  }
  return part;
}

export function isToolPart(part: unknown): part is Rec {
  return isRecord(part) && typeof part.type === 'string' && (part.type.startsWith('tool-') || part.type === 'dynamic-tool');
}

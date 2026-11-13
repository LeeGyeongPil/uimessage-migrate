import type { Loss, LossCode, Severity } from './types.js';

export interface LossSink {
  readonly messageId: string;
  add(code: LossCode, severity: Severity, path: string, detail: string): void;
}

/** Collects losses for one message. The id can be set late (generated ids). */
export class LossCollector implements LossSink {
  messageId = '';
  readonly items: Loss[] = [];

  add(code: LossCode, severity: Severity, path: string, detail: string): void {
    this.items.push({ code, severity, messageId: this.messageId, path, detail });
  }
}

/** Count losses per code. */
export function summarizeLosses(losses: readonly Loss[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const loss of losses) counts[loss.code] = (counts[loss.code] ?? 0) + 1;
  return counts;
}

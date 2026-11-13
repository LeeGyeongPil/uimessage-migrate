import type { Loss, Severity } from '../types.js';
import type { Translate } from './i18n.js';

export const MAX_REPORT_ITEMS = 10_000;

export interface ReportLoss extends Loss {
  file: string;
  line: number;
}

export interface UnpairedEntry {
  file: string;
  line: number;
  messageId: string;
  toolCallId: string;
}

/** Running totals for one CLI run. */
export class Stats {
  records = 0;
  migrated = 0;
  passthrough = 0;
  failed = 0;
  dropped = 0;
  systemMessages = 0;
  readonly byCode: Record<string, number> = {};
  readonly codeSeverities: Record<string, Set<Severity>> = {};
  readonly bySeverity: Record<Severity, number> = { lost: 0, estimated: 0, moved: 0 };
  readonly items: ReportLoss[] = [];
  itemsTruncated = false;
  readonly unpaired: UnpairedEntry[] = [];
  readonly modelConversion = { ok: 0, error: 0, skipped: 0 };

  addLoss(loss: Loss, file: string, line: number): void {
    this.byCode[loss.code] = (this.byCode[loss.code] ?? 0) + 1;
    (this.codeSeverities[loss.code] ??= new Set()).add(loss.severity);
    this.bySeverity[loss.severity] += 1;
    if (this.items.length < MAX_REPORT_ITEMS) this.items.push({ ...loss, file, line });
    else this.itemsTruncated = true;
  }

  get totalLosses(): number {
    return this.bySeverity.lost + this.bySeverity.estimated + this.bySeverity.moved;
  }
}

export interface ReportContext {
  version: string;
  aiVersion: string | null;
  aiSource: string | null;
  inputs: string[];
}

/** The JSON report. Keys are English and stable: it is meant for scripts, not for people. */
export function buildReport(stats: Stats, context: ReportContext): Record<string, unknown> {
  return {
    tool: 'uimessage-migrate',
    version: context.version,
    aiVersion: context.aiVersion,
    aiSource: context.aiSource,
    input: context.inputs,
    totals: {
      records: stats.records,
      migrated: stats.migrated,
      passthrough: stats.passthrough,
      failed: stats.failed,
      dropped: stats.dropped,
    },
    losses: {
      byCode: stats.byCode,
      bySeverity: stats.bySeverity,
      items: stats.items,
      itemsTruncated: stats.itemsTruncated,
    },
    unpairedToolCalls: stats.unpaired,
    systemMessages: stats.systemMessages,
    modelConversion: stats.modelConversion,
  };
}

/** Human readable summary lines in the selected language. */
export function summaryLines(stats: Stats, context: ReportContext, t: Translate): string[] {
  const lines = [t('summary.title', { version: context.version })];
  lines.push(
    context.aiVersion === null
      ? t('summary.validatorSkipped')
      : t('summary.validator', { version: context.aiVersion, source: context.aiSource ?? '' }),
  );
  lines.push(
    t('summary.migrated', {
      migrated: stats.migrated,
      records: stats.records,
      passthrough: stats.passthrough,
      failed: stats.failed,
      dropped: stats.dropped,
    }),
  );
  lines.push(
    t('summary.losses', {
      total: stats.totalLosses,
      lost: stats.bySeverity.lost,
      estimated: stats.bySeverity.estimated,
      moved: stats.bySeverity.moved,
    }),
  );
  for (const [code, count] of Object.entries(stats.byCode).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(t('summary.lossRow', { count, code, severity: [...(stats.codeSeverities[code] ?? [])].join('/') }));
  }
  lines.push(t('summary.unpaired', { count: stats.unpaired.length }));
  if (stats.unpaired.length > 0) lines.push(t('summary.unpairedHint'));
  lines.push(t('summary.modelConversion', stats.modelConversion));
  return lines;
}

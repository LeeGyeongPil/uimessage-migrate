import { realpath, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { checkMessages, findUnpairedToolCalls, resolveAi, type ResolvedAi } from '../check.js';
import { isRecord } from '../detect.js';
import { AiNotFoundError, InvalidMessageError } from '../errors.js';
import { migrateMessage } from '../migrate.js';
import type { Loss, MigrateOptions, UIMessageLike } from '../types.js';
import { VERSION } from '../version.js';
import { createT, isLang, resolveLang, type Lang, type MessageKey, type Translate } from './i18n.js';
import { JsonFileError, LineWriter, readRecords, type InputRecord } from './io.js';
import { buildReport, Stats, summaryLines } from './report.js';

const OPTIONS = {
  out: { type: 'string' },
  failed: { type: 'string' },
  report: { type: 'string' },
  'dry-run': { type: 'boolean' },
  'no-validate': { type: 'boolean' },
  'fail-on': { type: 'string' },
  'incomplete-tool': { type: 'string' },
  'data-role': { type: 'string' },
  'signature-provider': { type: 'string' },
  'messages-key': { type: 'string' },
  lang: { type: 'string' },
  help: { type: 'boolean' },
  version: { type: 'boolean' },
} as const;

const ENUMS = {
  'fail-on': ['none', 'lost', 'estimated'],
  'incomplete-tool': ['keep', 'error', 'drop'],
  'data-role': ['part', 'drop'],
  lang: ['en', 'ko'],
} as const;

/** Exit codes, documented in the README. */
export const EXIT = { ok: 0, failed: 1, usage: 2, noAi: 3 } as const;

class UsageError extends Error {
  constructor(
    readonly key: MessageKey,
    readonly vars: Record<string, string | number> = {},
    readonly exitCode: number = EXIT.usage,
    readonly showHint = true,
  ) {
    super(key);
  }
}

/** Find `--lang` before the full parse so that even usage errors are shown in the right language. */
function langFlagFromArgv(argv: readonly string[]): string | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? '';
    if (arg === '--lang') return argv[i + 1];
    if (arg.startsWith('--lang=')) return arg.slice('--lang='.length);
  }
  return undefined;
}

function parseCli(argv: readonly string[]) {
  try {
    return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (error as { code?: string }).code;
    const option = /'(-[^']+)'/.exec(message)?.[1] ?? '';
    if (code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') throw new UsageError('err.unknownOption', { option });
    if (code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') {
      throw new UsageError('err.missingValue', { option: option.split(',')[0] ?? option });
    }
    throw new UsageError('err.unexpected', { reason: message });
  }
}

function enumValue<K extends keyof typeof ENUMS>(
  name: K,
  value: string | undefined,
  fallback: (typeof ENUMS)[K][number],
): (typeof ENUMS)[K][number] {
  if (value === undefined) return fallback;
  const allowed: readonly string[] = ENUMS[name];
  if (!allowed.includes(value)) {
    throw new UsageError('err.badValue', { option: `--${name}`, value, allowed: allowed.join(', ') });
  }
  return value as (typeof ENUMS)[K][number];
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function ensureInputs(files: readonly string[]): Promise<void> {
  if (files.length === 0) throw new UsageError('err.noInput');
  for (const file of files) {
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new UsageError('err.inputNotFile', { file });
    } catch (error) {
      if (error instanceof UsageError) throw error;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new UsageError('err.inputMissing', { file });
      throw new UsageError('err.readFailed', { file, reason: reason(error) });
    }
  }
}

/** Resolve a path through symlinks even when the file does not exist yet (the folder is resolved instead). */
async function canonical(file: string): Promise<string> {
  const full = resolve(file);
  try {
    return await realpath(full);
  } catch {
    try {
      return join(await realpath(dirname(full)), basename(full));
    } catch {
      return full;
    }
  }
}

/** Refuse outputs that would overwrite an input or each other, before any file is opened. */
async function ensureOutputsDistinct(inputs: readonly string[], outputs: readonly string[]): Promise<void> {
  const seen = new Set<string>();
  for (const input of inputs) seen.add(await canonical(input));
  for (const output of outputs) {
    const path = await canonical(output);
    if (seen.has(path)) throw new UsageError('err.outputIsInput', { file: output });
    seen.add(path);
  }
}

interface Outcome {
  output?: unknown;
  messages: UIMessageLike[];
  losses: Loss[];
  dropped: number;
  allV5: boolean;
}

/** Migrate one input record: either a single message or a conversation with a messages array. */
function migrateRecord(value: unknown, line: number, messagesKey: string, options: MigrateOptions): Outcome {
  if (isRecord(value) && Array.isArray(value[messagesKey])) {
    const rows = value[messagesKey] as unknown[];
    const messages: UIMessageLike[] = [];
    const losses: Loss[] = [];
    let dropped = 0;
    let allV5 = rows.length > 0;
    const salt = typeof value.id === 'string' ? value.id : `line-${line}`;
    rows.forEach((row, index) => {
      try {
        const result = migrateMessage(row, { ...options, idSalt: salt, index });
        losses.push(...result.losses);
        if (result.detected !== 'v5') allV5 = false;
        if (result.message) messages.push(result.message);
        else dropped += 1;
      } catch (error) {
        if (error instanceof InvalidMessageError) {
          throw new InvalidMessageError(error.code, `${messagesKey}[${index}]: ${error.message}`);
        }
        throw error;
      }
    });
    return { output: { ...value, [messagesKey]: messages }, messages, losses, dropped, allV5 };
  }
  const result = migrateMessage(value, { ...options, idSalt: `line-${line}`, index: 0 });
  return {
    output: result.message ?? undefined,
    messages: result.message ? [result.message] : [],
    losses: result.losses,
    dropped: result.message ? 0 : 1,
    allV5: result.detected === 'v5',
  };
}

interface Failure {
  code: string;
  detail: string;
}

/** Run the CLI and return the exit code. All output goes through the message tables. */
export async function run(argv: readonly string[], env: NodeJS.ProcessEnv = process.env): Promise<number> {
  const flag = langFlagFromArgv(argv);
  let t: Translate = createT(resolveLang(flag, env));
  try {
    if (flag !== undefined && !isLang(flag)) {
      // An invalid --lang value is always reported in English.
      t = createT('en');
      throw new UsageError('err.badValue', { option: '--lang', value: flag, allowed: ENUMS.lang.join(', ') });
    }
    return await execute(argv, t);
  } catch (error) {
    return reportError(error, t);
  }
}

function reportError(error: unknown, t: Translate): number {
  if (error instanceof UsageError) {
    console.error(t(error.key, error.vars));
    if (error.showHint) console.error(t('usage.hint'));
    return error.exitCode;
  }
  console.error(t('err.unexpected', { reason: reason(error) }));
  return EXIT.usage;
}

async function execute(argv: readonly string[], t: Translate): Promise<number> {
  const { values, positionals } = parseCli(argv);
  if (values.help) {
    console.log(t('help.text'));
    return EXIT.ok;
  }
  if (values.version) {
    console.log(t('version.line', { version: VERSION }));
    return EXIT.ok;
  }

  const failOn = enumValue('fail-on', values['fail-on'], 'none');
  const incompleteToolCall = enumValue('incomplete-tool', values['incomplete-tool'], 'keep');
  const dataRole = enumValue('data-role', values['data-role'], 'part');
  const dryRun = values['dry-run'] === true;
  const validate = values['no-validate'] !== true;
  const messagesKey = values['messages-key'] ?? 'messages';
  const options: MigrateOptions = {
    dataRole,
    incompleteToolCall,
    ...(values['signature-provider'] ? { signatureProvider: values['signature-provider'] } : {}),
  };

  await ensureInputs(positionals);
  if (!dryRun && !values.out && !values.report && !values.failed) throw new UsageError('err.noOutput');

  if (!dryRun) {
    await ensureOutputsDistinct(positionals, [values.out, values.failed, values.report].filter((f): f is string => Boolean(f)));
  }

  let ai: ResolvedAi | undefined;
  if (validate) {
    try {
      ai = await resolveAi(process.cwd());
    } catch (error) {
      if (!(error instanceof AiNotFoundError)) throw error;
      const key = error.code === 'unusable' ? 'err.aiUnusable' : 'err.aiNotFound';
      throw new UsageError(key, {}, EXIT.noAi, false);
    }
    const major = Number.parseInt(ai.version.split('.')[0] ?? '', 10);
    if (!(major >= 5 && major < 8)) console.error(t('warn.aiRange', { version: ai.version }));
  }

  const open = async (file: string | undefined): Promise<LineWriter | undefined> => {
    if (dryRun || !file) return undefined;
    try {
      return await LineWriter.open(file);
    } catch (error) {
      throw new UsageError('err.writeFailed', { file, reason: reason(error) }, EXIT.usage, false);
    }
  };
  const outWriter = await open(values.out);
  const failedWriter = await open(values.failed);

  const stats = new Stats();

  async function processRecord(record: InputRecord, file: string): Promise<void> {
    stats.records += 1;
    const fail = async (failure: Failure): Promise<void> => {
      stats.failed += 1;
      await failedWriter?.writeLine({
        line: record.line,
        file,
        error: failure.code,
        detail: failure.detail,
        record: record.parseError === undefined ? record.value : record.raw,
      });
    };
    if (record.parseError !== undefined) return fail({ code: 'invalid_json', detail: record.parseError });

    let outcome: Outcome;
    try {
      outcome = migrateRecord(record.value, record.line, messagesKey, options);
    } catch (error) {
      if (error instanceof InvalidMessageError) return fail({ code: error.code, detail: error.message });
      throw error;
    }

    let conversion: 'ok' | 'error' | 'skipped' = 'skipped';
    if (ai && outcome.messages.length > 0) {
      const checked = await checkMessages(outcome.messages, { ai: ai.module, aiVersion: ai.version });
      if (!checked.valid) return fail({ code: 'validation_failed', detail: (checked.error ?? '').slice(0, 500) });
      conversion = checked.modelConversion;
      if (conversion === 'error') {
        return fail({ code: 'model_conversion_failed', detail: (checked.modelConversionError ?? '').slice(0, 500) });
      }
    }

    stats.modelConversion[conversion] += 1;
    stats.dropped += outcome.dropped;
    stats.systemMessages += outcome.messages.filter((m) => m.role === 'system').length;
    for (const loss of outcome.losses) stats.addLoss(loss, file, record.line);
    for (const u of findUnpairedToolCalls(outcome.messages)) stats.unpaired.push({ file, line: record.line, ...u });
    if (outcome.output === undefined) return;
    stats.migrated += 1;
    if (outcome.allV5) stats.passthrough += 1;
    await outWriter?.writeLine(outcome.output);
  }

  try {
    for (const file of positionals) {
      try {
        for await (const record of readRecords(file)) await processRecord(record, basename(file));
      } catch (error) {
        if (error instanceof JsonFileError) {
          throw new UsageError('err.invalidJsonFile', { file, reason: error.message }, EXIT.usage, false);
        }
        throw error;
      }
    }
  } finally {
    await outWriter?.close();
    await failedWriter?.close();
  }

  const context = {
    version: VERSION,
    aiVersion: ai?.version ?? null,
    aiSource: ai?.source ?? null,
    inputs: positionals.map((file) => basename(file)),
  };
  if (stats.records === 0) console.error(t('warn.noRecords', { files: context.inputs.join(', ') }));
  const written: string[] = [];
  if (!dryRun && values.report) {
    try {
      await writeFile(values.report, `${JSON.stringify(buildReport(stats, context), null, 2)}\n`);
    } catch (error) {
      throw new UsageError('err.writeFailed', { file: values.report, reason: reason(error) }, EXIT.usage, false);
    }
  }
  if (!dryRun) for (const file of [values.out, values.failed, values.report]) if (file) written.push(file);

  for (const line of summaryLines(stats, context, t)) console.log(line);
  if (dryRun) console.log(t('summary.dryRun'));
  for (const file of written) console.log(t('summary.wrote', { file }));

  let exit: number = EXIT.ok;
  if (stats.failed > 0) {
    exit = EXIT.failed;
    if (!values.failed) console.log(t('summary.failedRows', { count: stats.failed }));
  }
  if (failOn !== 'none') {
    const count = failOn === 'lost' ? stats.bySeverity.lost : stats.bySeverity.lost + stats.bySeverity.estimated;
    if (count > 0) {
      exit = EXIT.failed;
      console.log(t('summary.failOn', { level: failOn, count }));
    }
  }
  return exit;
}

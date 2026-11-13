// Validation entry point. It never imports `ai` statically: the module is located at run time
// so the validator of the version installed in the user's project is the one that runs.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isRecord } from './detect.js';
import { AiNotFoundError } from './errors.js';
import { isToolPart } from './tools.js';

/** The parts of the `ai` module this package uses. Satisfied by ai 5, 6 and 7. */
export interface AiModule {
  safeValidateUIMessages(args: {
    messages: unknown;
    tools?: unknown;
    dataSchemas?: unknown;
    metadataSchema?: unknown;
  }): Promise<{ success: boolean; error?: unknown }>;
  convertToModelMessages(messages: never, options?: unknown): unknown;
}

export interface CheckOptions {
  /** An already loaded `ai` module. When omitted, `resolveAi()` is used. */
  ai?: AiModule;
  /** Version label reported in the result when `ai` is passed in. */
  aiVersion?: string;
  tools?: unknown;
  dataSchemas?: unknown;
  metadataSchema?: unknown;
}

export interface CheckResult {
  valid: boolean;
  error?: string;
  /** `skipped` when validation failed (conversion is not attempted). */
  modelConversion: 'ok' | 'error' | 'skipped';
  modelConversionError?: string;
  /** Tool call ids that have no result; validators accept them but providers may reject them. */
  unpairedToolCalls: string[];
  systemMessages: number;
  aiVersion: string;
}

export interface ResolvedAi {
  module: AiModule;
  version: string;
  source: 'project' | 'bundled';
}

export interface UnpairedToolCall {
  messageId: string;
  toolCallId: string;
}

/** Static scan: tool parts that wait for a result which was never stored. */
export function findUnpairedToolCalls(messages: readonly unknown[]): UnpairedToolCall[] {
  const found: UnpairedToolCall[] = [];
  for (const message of messages) {
    if (!isRecord(message) || !Array.isArray(message.parts)) continue;
    for (const part of message.parts) {
      if (isToolPart(part) && part.state === 'input-available' && typeof part.toolCallId === 'string') {
        found.push({ messageId: typeof message.id === 'string' ? message.id : '', toolCallId: part.toolCallId });
      }
    }
  }
  return found;
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Validate messages with the official validator and try the model-message conversion. */
export async function checkMessages(messages: readonly unknown[], options: CheckOptions = {}): Promise<CheckResult> {
  let ai = options.ai;
  let aiVersion = options.aiVersion ?? 'unknown';
  if (!ai) {
    const resolved = await resolveAi();
    ai = resolved.module;
    aiVersion = resolved.version;
  }
  const unpairedToolCalls = findUnpairedToolCalls(messages).map((u) => u.toolCallId);
  const systemMessages = messages.filter((m) => isRecord(m) && m.role === 'system').length;
  const base = { unpairedToolCalls, systemMessages, aiVersion };

  const validation = await ai.safeValidateUIMessages({
    messages,
    ...(options.tools !== undefined ? { tools: options.tools } : {}),
    ...(options.dataSchemas !== undefined ? { dataSchemas: options.dataSchemas } : {}),
    ...(options.metadataSchema !== undefined ? { metadataSchema: options.metadataSchema } : {}),
  });
  if (!validation.success) {
    return { valid: false, error: errorText(validation.error), modelConversion: 'skipped', ...base };
  }
  try {
    // ai 5 returns the array directly, ai 6 and later return a promise; await handles both.
    await ai.convertToModelMessages(messages as never);
    return { valid: true, modelConversion: 'ok', ...base };
  } catch (error) {
    return { valid: true, modelConversion: 'error', modelConversionError: errorText(error), ...base };
  }
}

function pickEntry(pkg: Record<string, unknown>): string | undefined {
  const dot = isRecord(pkg.exports) ? pkg.exports['.'] : pkg.exports;
  const fromExports = (node: unknown): string | undefined => {
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(fromExports).find(Boolean);
    if (isRecord(node)) {
      for (const key of ['import', 'node', 'default', 'require']) {
        const hit = fromExports(node[key]);
        if (hit) return hit;
      }
    }
    return undefined;
  };
  return fromExports(dot) ?? (typeof pkg.module === 'string' ? pkg.module : undefined) ?? (typeof pkg.main === 'string' ? pkg.main : undefined);
}

/** Walk up from `start` looking for node_modules/ai. */
function findAiPackageDir(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, 'node_modules', 'ai');
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

async function loadFrom(packageDir: string): Promise<{ module: AiModule; version: string }> {
  const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as Record<string, unknown>;
  const entry = pickEntry(pkg);
  if (!entry) throw new AiNotFoundError('unusable', `The ai package in ${packageDir} has no usable entry point.`);
  const module = (await import(pathToFileURL(join(packageDir, entry)).href)) as AiModule;
  if (typeof module.safeValidateUIMessages !== 'function' || typeof module.convertToModelMessages !== 'function') {
    throw new AiNotFoundError(
      'unusable',
      `The ai package in ${packageDir} (version ${String(pkg.version)}) has no safeValidateUIMessages/convertToModelMessages. Use ai 5 or later.`,
    );
  }
  return { module, version: String(pkg.version) };
}

/**
 * Locate the `ai` package: the project at `fromDir` first, then the copy installed next to this package.
 * @throws {AiNotFoundError} when neither exists.
 */
export async function resolveAi(fromDir: string = process.cwd()): Promise<ResolvedAi> {
  const projectDir = findAiPackageDir(fromDir);
  if (projectDir) return { ...(await loadFrom(projectDir)), source: 'project' };
  const bundledDir = findAiPackageDir(dirname(fileURLToPath(import.meta.url)));
  if (bundledDir) return { ...(await loadFrom(bundledDir)), source: 'bundled' };
  throw new AiNotFoundError('not_found', 'Could not find the "ai" package. Install it in your project (npm install ai) or run with --no-validate.');
}

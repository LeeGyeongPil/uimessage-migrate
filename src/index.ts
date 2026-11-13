// Pure entry point: no dependency on the `ai` package, safe for edge runtimes.
export { detectFormat } from './detect.js';
export { migrateMessage, migrateMessages } from './migrate.js';
export { summarizeLosses } from './losses.js';
export { InvalidMessageError, AiNotFoundError } from './errors.js';
export type { AiNotFoundCode, InvalidMessageCode } from './errors.js';
export type {
  Loss,
  LossCode,
  MigrateManyResult,
  MigrateOptions,
  MigrateResult,
  Severity,
  StoredFormat,
  UIMessageLike,
  V4Message,
  V4ToolInvocation,
} from './types.js';
export { VERSION } from './version.js';

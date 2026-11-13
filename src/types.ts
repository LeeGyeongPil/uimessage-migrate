/** A plain JSON-like object. Stored messages are untrusted, so we start from `unknown`. */
export type Rec = Record<string, unknown>;

export type Severity = 'moved' | 'estimated' | 'lost';

export type LossCode =
  | 'id.generated'
  | 'metadata.moved'
  | 'metadata.dropped'
  | 'tool.state-unknown'
  | 'tool.incomplete'
  | 'tool.name-missing'
  | 'tool.call-id-missing'
  | 'tool.raw-input'
  | 'reasoning.signature'
  | 'reasoning.redacted'
  | 'attachment.media-type-guessed'
  | 'file.data-url'
  | 'role.data'
  | 'role.system'
  | 'part.unknown'
  | 'part.field-dropped'
  | 'message.empty';

/** One thing that was moved, guessed or dropped while migrating a message. */
export interface Loss {
  code: LossCode;
  severity: Severity;
  /** Id of the migrated message (the generated id when the input had none). */
  messageId: string;
  /** Where in the input the affected value lives, e.g. `parts[2].toolInvocation`. */
  path: string;
  detail: string;
}

export type StoredFormat = 'v4' | 'v5' | 'unknown';

export interface MigrateOptions {
  /** `part` (default): `role: 'data'` becomes an assistant message with a `data-<dataPartName>` part. */
  dataRole?: 'part' | 'drop';
  /** Name used for the data part created from `role: 'data'` messages. Default `custom`. */
  dataPartName?: string;
  /** What to do with tool calls that have no result. Default `keep`. */
  incompleteToolCall?: 'keep' | 'error' | 'drop';
  /** `dynamic` (default) creates a `dynamic-tool` part; a string uses `tool-<string>`. */
  missingToolName?: 'dynamic' | (string & {});
  /** Provider key (for example `anthropic`) under which reasoning signatures are preserved. */
  signatureProvider?: string;
  /** `metadata` (default) moves createdAt/annotations/data and unknown top-level fields into `metadata`; `drop` discards them. */
  metadataFields?: 'metadata' | 'drop';
  /** Mixed into generated ids, for example a conversation id. */
  idSalt?: string;
  /** Position of the message in its conversation; used for generated ids. */
  index?: number;
}

export interface MigrateResult {
  /** `null` when the message was intentionally dropped (`dataRole: 'drop'`). */
  message: UIMessageLike | null;
  losses: Loss[];
  detected: 'v4' | 'v5';
}

export interface MigrateManyResult {
  messages: UIMessageLike[];
  losses: Loss[];
  dropped: number;
}

/** Structural UIMessage shape; deliberately independent of the `ai` package types. */
export interface UIMessageLike {
  id: string;
  role: 'system' | 'user' | 'assistant';
  metadata?: unknown;
  parts: Rec[];
}

/** Shape of a stored AI SDK 4.x message (documentation only; inputs are checked at runtime). */
export interface V4Message {
  id?: string;
  role: 'system' | 'user' | 'assistant' | 'data';
  content?: string;
  createdAt?: string | Date;
  reasoning?: string;
  experimental_attachments?: { name?: string; contentType?: string; url: string }[];
  data?: unknown;
  annotations?: unknown[];
  toolInvocations?: V4ToolInvocation[];
  parts?: Rec[];
}

export interface V4ToolInvocation {
  state: 'partial-call' | 'call' | 'result';
  step?: number;
  toolCallId: string;
  toolName: string;
  args?: unknown;
  result?: unknown;
}

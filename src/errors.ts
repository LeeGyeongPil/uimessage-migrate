export type InvalidMessageCode = 'not_object' | 'missing_role' | 'unknown_format';

/** Thrown when a stored value cannot be treated as a chat message at all. */
export class InvalidMessageError extends Error {
  readonly code: InvalidMessageCode;

  constructor(code: InvalidMessageCode, message: string) {
    super(message);
    this.name = 'InvalidMessageError';
    this.code = code;
  }
}

export type AiNotFoundCode = 'not_found' | 'unusable';

/** Thrown by `resolveAi` when no usable `ai` package (version 5 or later) can be found. */
export class AiNotFoundError extends Error {
  readonly code: AiNotFoundCode;

  constructor(code: AiNotFoundCode, message: string) {
    super(message);
    this.name = 'AiNotFoundError';
    this.code = code;
  }
}

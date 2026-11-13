// Deterministic ids without node:crypto so the pure entry point also runs on edge runtimes.
// 64-bit FNV-1a, rendered as 16 hex characters.
const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

export function fnv1a64(input: string): string {
  let hash = OFFSET;
  const bytes = new TextEncoder().encode(input);
  for (const byte of bytes) {
    hash ^= BigInt(byte);
    hash = (hash * PRIME) & MASK;
  }
  return hash.toString(16).padStart(16, '0');
}

/** Same input always gives the same id; a different position or salt gives a different one. */
export function generateId(prefix: string, salt: string, index: number, role: string, payload: unknown): string {
  const body = JSON.stringify(payload) ?? '';
  return `${prefix}_${fnv1a64(`${salt}\u0000${index}\u0000${role}\u0000${body}`)}`;
}

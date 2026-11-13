import { createReadStream } from 'node:fs';
import { open, readFile, type FileHandle } from 'node:fs/promises';
import { extname } from 'node:path';
import { createInterface } from 'node:readline';

export interface InputRecord {
  /** 1-based line number (JSONL) or element number (JSON array). */
  line: number;
  value?: unknown;
  /** Raw text of a line that is not valid JSON. */
  raw?: string;
  parseError?: string;
}

export class JsonFileError extends Error {}

/** Windows tools often write a UTF-8 byte order mark that JSON.parse rejects. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function isJsonlFile(file: string): boolean {
  return extname(file).toLowerCase() !== '.json';
}

/** Read records one at a time. JSONL files are streamed line by line; .json files are parsed whole. */
export async function* readRecords(file: string): AsyncGenerator<InputRecord> {
  if (!isJsonlFile(file)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripBom(await readFile(file, 'utf8')));
    } catch (error) {
      throw new JsonFileError(error instanceof Error ? error.message : String(error));
    }
    const items = Array.isArray(parsed) ? parsed : [parsed];
    for (let i = 0; i < items.length; i += 1) yield { line: i + 1, value: items[i] };
    return;
  }
  const lines = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity });
  let number = 0;
  try {
    for await (const raw of lines) {
      number += 1;
      const text = number === 1 ? stripBom(raw) : raw;
      if (text.trim() === '') continue;
      try {
        yield { line: number, value: JSON.parse(text) };
      } catch (error) {
        yield { line: number, raw: text, parseError: error instanceof Error ? error.message : String(error) };
      }
    }
  } finally {
    lines.close();
  }
}

const FLUSH_AT = 64 * 1024;

/** Buffered line writer. The file is opened up front so a bad path fails before any work is done. */
export class LineWriter {
  private buffer = '';

  private constructor(private readonly handle: FileHandle) {}

  static async open(path: string): Promise<LineWriter> {
    return new LineWriter(await open(path, 'w'));
  }

  async writeLine(value: unknown): Promise<void> {
    this.buffer += `${JSON.stringify(value)}\n`;
    if (this.buffer.length >= FLUSH_AT) await this.flush();
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const text = this.buffer;
    this.buffer = '';
    await this.handle.write(text);
  }

  async close(): Promise<void> {
    try {
      await this.flush();
    } finally {
      await this.handle.close();
    }
  }
}

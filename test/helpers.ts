import * as ai7 from 'ai';
import * as ai5 from 'ai-v5';
import * as ai6 from 'ai-v6';
import { readFileSync } from 'node:fs';
import type { AiModule } from '../src/check.js';

/** The three `ai` majors the package is tested against (versions pinned in package.json). */
export const AI_VERSIONS: [string, AiModule][] = [
  ['ai@5', ai5 as unknown as AiModule],
  ['ai@6', ai6 as unknown as AiModule],
  ['ai@7', ai7 as unknown as AiModule],
];

export function fixture<T = unknown[]>(name: string): T {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as T;
}

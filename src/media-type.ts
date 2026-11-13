const TABLE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  webm: 'video/webm',
  zip: 'application/zip',
};

export const FALLBACK_MEDIA_TYPE = 'application/octet-stream';

function extensionOf(value: string): string | undefined {
  let path = value;
  try {
    path = new URL(value).pathname;
  } catch {
    // not an absolute URL: treat the value as a file name
  }
  const last = path.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : undefined;
}

/** Guess a media type from a file name or URL. Returns `undefined` when nothing matches. */
export function guessMediaType(name: string | undefined, url: string): string | undefined {
  for (const candidate of [name, url]) {
    if (!candidate) continue;
    const ext = extensionOf(candidate);
    const hit = ext ? TABLE[ext] : undefined;
    if (hit) return hit;
  }
  return undefined;
}

/** `data:image/png;base64,...` -> `image/png` */
export function mediaTypeFromDataUrl(url: string): string | undefined {
  const match = /^data:([^;,]+)[;,]/.exec(url);
  return match?.[1];
}

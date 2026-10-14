import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

/** Refuse links in every component. This is not an OS-level race-proof sandbox. */
export async function readQualityFile(root: string, name: string, maxBytes = 1024 * 1024): Promise<string> {
  if (!name || isAbsolute(name) || name.includes('\\') || /[\x00-\x1f\x7f]/.test(name) || name.split('/').some(p => !p || p === '.' || p === '..')) throw new Error('Expected a literal repository-relative path');
  const base = await realpath(root);
  let path = base;
  for (const part of name.split('/')) {
    path = join(path, part);
    if ((await lstat(path)).isSymbolicLink()) throw new Error('Quality inputs must not be symbolic links');
  }
  const stat = await lstat(path);
  if (!stat.isFile() || stat.size > maxBytes) throw new Error('Quality input is not a bounded regular file');
  const resolved = relative(base, await realpath(path));
  if (isAbsolute(resolved) || resolved.startsWith('..')) throw new Error('Quality input escapes repository');
  const value = await readFile(path, 'utf8');
  if (Buffer.byteLength(value) > maxBytes) throw new Error('Quality input exceeded size limit');
  return value;
}

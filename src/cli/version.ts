/**
 * Get CLI version from package.json
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

let cachedVersion: string | null = null;

export async function getVersion(): Promise<string> {
  if (cachedVersion) return cachedVersion;
  
  try {
    const packagePath = join(process.cwd(), 'package.json');
    const content = await readFile(packagePath, 'utf-8');
    const pkg = JSON.parse(content);
    cachedVersion = pkg.version || '0.0.0';
  } catch {
    cachedVersion = '0.0.0';
  }
  
  return cachedVersion || '0.0.0';
}

/**
 * Config Editor
 */

import { spawn } from 'child_process';
import { getConfigPath } from './index';

export async function editConfig(): Promise<void> {
  const configPath = await getConfigPath();
  const editor = process.env.EDITOR || 'nano';
  
  const child = spawn(editor, [configPath], {
    stdio: 'inherit',
  });
  
  return new Promise((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Editor exited with code ${code}`));
      }
    });
  });
}

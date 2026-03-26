import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

const PRESET_FILES = [
  'REPLY_CASH_BRAND.md',
  'REPLY_CASH_BRAND_VOICE.md',
] as const;

function resolvePresetSourcePath(fileName: string): string | null {
  const candidates = [
    resolve(process.cwd(), 'src', 'workspace', 'presets', fileName),
    resolve(process.cwd(), 'dist', 'workspace', 'presets', fileName),
    resolve(__dirname, 'presets', fileName),
    resolve(__dirname, '..', '..', 'src', 'workspace', 'presets', fileName),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function buildPresetIndex(): string {
  return `# Workspace Presets

This folder contains reusable brand presets available to all agents.

## Available Presets
- REPLY_CASH_BRAND.md
- REPLY_CASH_BRAND_VOICE.md

## Usage
- Treat these files as source-of-truth brand references when users ask for Reply Cash content.
- You may remix tone/format per channel while preserving core brand constraints.
`;
}

export function seedWorkspacePresets(homeDir: string): { copied: number; targetDir: string } {
  const targetDir = join(homeDir, 'workspace', 'presets');
  mkdirSync(targetDir, { recursive: true });

  let copied = 0;

  for (const fileName of PRESET_FILES) {
    const sourcePath = resolvePresetSourcePath(fileName);
    if (!sourcePath) continue;

    const targetPath = join(targetDir, fileName);
    if (existsSync(targetPath)) continue;

    const content = readFileSync(sourcePath, 'utf-8');
    writeFileSync(targetPath, content, 'utf-8');
    copied += 1;
  }

  const indexPath = join(targetDir, 'PRESETS.md');
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, buildPresetIndex(), 'utf-8');
  }

  return { copied, targetDir };
}


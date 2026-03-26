#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const srcHtml = path.join(projectRoot, 'src', 'web', 'setup', 'setup-page.html');
const distDir = path.join(projectRoot, 'dist', 'daemon');
const distHtml = path.join(distDir, 'setup-page.html');
const srcSkillsDir = path.join(projectRoot, 'skills');
const distSkillsDir = path.join(projectRoot, 'dist', 'skills');
const srcWorkspacePresetsDir = path.join(projectRoot, 'src', 'workspace', 'presets');
const distWorkspacePresetsDir = path.join(projectRoot, 'dist', 'workspace', 'presets');
const uiDistDir = path.join(projectRoot, 'dist', 'daemon', 'ui');

if (!fs.existsSync(srcHtml)) {
  console.error(`[copy-static] Missing source file: ${srcHtml}`);
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(srcHtml, distHtml);

console.log(`[copy-static] Copied setup page to ${distHtml}`);

// Check for UI build
if (fs.existsSync(uiDistDir)) {
  console.log(`[copy-static] UI build found at ${uiDistDir}`);
} else {
  console.log(`[copy-static] UI build not found. Run 'pnpm build:ui' to build the UI.`);
}

if (fs.existsSync(srcSkillsDir)) {
  fs.rmSync(distSkillsDir, { recursive: true, force: true });
  fs.cpSync(srcSkillsDir, distSkillsDir, { recursive: true, force: true });
  console.log(`[copy-static] Copied skills to ${distSkillsDir}`);
}

if (fs.existsSync(srcWorkspacePresetsDir)) {
  fs.rmSync(distWorkspacePresetsDir, { recursive: true, force: true });
  fs.cpSync(srcWorkspacePresetsDir, distWorkspacePresetsDir, { recursive: true, force: true });
  console.log(`[copy-static] Copied workspace presets to ${distWorkspacePresetsDir}`);
}

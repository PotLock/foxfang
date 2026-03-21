#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const srcHtml = path.join(projectRoot, 'src', 'web', 'setup', 'setup-page.html');
const distDir = path.join(projectRoot, 'dist', 'daemon');
const distHtml = path.join(distDir, 'setup-page.html');
const srcSkillsDir = path.join(projectRoot, 'skills');
const distSkillsDir = path.join(projectRoot, 'dist', 'skills');

if (!fs.existsSync(srcHtml)) {
  console.error(`[copy-static] Missing source file: ${srcHtml}`);
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(srcHtml, distHtml);

console.log(`[copy-static] Copied setup page to ${distHtml}`);

if (fs.existsSync(srcSkillsDir)) {
  fs.rmSync(distSkillsDir, { recursive: true, force: true });
  fs.cpSync(srcSkillsDir, distSkillsDir, { recursive: true, force: true });
  console.log(`[copy-static] Copied skills to ${distSkillsDir}`);
}

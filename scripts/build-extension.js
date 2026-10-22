// @ts-check
/**
 * OmniAntigravity Remote Chat — VS Code / Antigravity Extension Builder & Installer
 * Automates synchronization, packaging into .vsix, and installation into Antigravity IDE.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const extDir = path.join(rootDir, 'vscode-extension');
const serverTargetDir = path.join(extDir, 'server');

// Read version from vscode-extension/package.json
const extPkg = JSON.parse(fs.readFileSync(path.join(extDir, 'package.json'), 'utf8'));
const version = extPkg.version || '1.7.0';

console.log(`📦 Starting OmniAntigravity Extension Build Process (v${version})...`);

// 1. Copy Server Files into vscode-extension/server
console.log('▸ Synchronizing server files to vscode-extension/server...');
if (fs.existsSync(serverTargetDir)) {
  fs.rmSync(serverTargetDir, { recursive: true, force: true });
}
fs.mkdirSync(serverTargetDir, { recursive: true });

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'coverage') continue;
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDirRecursive(path.join(rootDir, 'src'), path.join(serverTargetDir, 'src'));
copyDirRecursive(path.join(rootDir, 'public'), path.join(serverTargetDir, 'public'));
copyDirRecursive(path.join(rootDir, 'scripts'), path.join(serverTargetDir, 'scripts'));
fs.copyFileSync(path.join(rootDir, 'package.json'), path.join(serverTargetDir, 'package.json'));
if (fs.existsSync(path.join(rootDir, '.env.example'))) {
  fs.copyFileSync(path.join(rootDir, '.env.example'), path.join(serverTargetDir, '.env.example'));
}

console.log('✓ Server files copied successfully.');

// 2. Install production dependencies in extension
console.log('▸ Installing production dependencies in vscode-extension...');
execSync('npm install --omit=dev', {
  cwd: extDir,
  stdio: 'inherit'
});

// 3. Package extension into .vsix
console.log(`▸ Packaging extension v${version} with vsce...`);
const vsixPath = path.join(extDir, `omni-antigravity-remote-${version}.vsix`);
if (fs.existsSync(vsixPath)) {
  fs.unlinkSync(vsixPath);
}

execSync(`npx @vscode/vsce package --out "${vsixPath}" --allow-missing-repository --allow-package-all-secrets`, {
  cwd: extDir,
  stdio: 'inherit'
});

console.log(`✓ Generated VSIX package: ${vsixPath}`);

import { resolveAntigravityBinary } from '../src/utils/process.js';

// 4. Install into Antigravity IDE
const antigravityCmd = resolveAntigravityBinary({ preferCliWrapper: true });
if (antigravityCmd) {
  console.log('▸ Installing extension into Antigravity IDE...');
  execSync(`"${antigravityCmd}" --install-extension "${vsixPath}" --force`, {
    stdio: 'inherit'
  });

  console.log('✓ Successfully installed extension into Antigravity IDE!');

  // 5. Verify list
  console.log('▸ Verifying installed extensions in Antigravity IDE:');
  const listResult = execSync(`"${antigravityCmd}" --list-extensions --show-versions`, {
    encoding: 'utf8'
  });
  const matched = listResult.split(/\r?\n/).filter((l) => l.includes('omni-antigravity-remote'));
  console.log(matched.join('\n'));
} else {
  console.log(`ℹ Antigravity IDE CLI not found in default paths. VSIX is ready at ${vsixPath}.`);
}

console.log('🎉 Done! Reload Antigravity IDE (Ctrl+R / Developer: Reload Window) to test the extension!');

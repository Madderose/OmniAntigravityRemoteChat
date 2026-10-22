// @ts-check
/**
 * Process management — port cleanup, availability checks, Antigravity launcher.
 *
 * @module utils/process
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { execSync, execFileSync, spawn } from 'child_process';
import { PORTS } from '../config.js';

/**
 * Portably resolve the Antigravity binary across platforms.
 *
 * @param {Object} [options]
 * @param {string} [options.platform]
 * @param {Record<string, string>} [options.env]
 * @param {string} [options.homedir]
 * @param {(p: string) => boolean} [options.existsSync]
 * @param {boolean} [options.preferCliWrapper=false]
 * @returns {string}
 */
export function resolveAntigravityBinary(options = {}) {
    const platform = options.platform || process.platform;
    const env = options.env || process.env;
    const home = options.homedir || os.homedir() || env.USERPROFILE || env.HOME || '';
    const existsSync = options.existsSync || fs.existsSync;
    const preferCli = !!options.preferCliWrapper;

    const candidates = [];

    if (platform === 'win32') {
        const localAppData = env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : '');
        if (preferCli) {
            if (localAppData) {
                candidates.push(
                    path.join(localAppData, 'Programs', 'Antigravity IDE', 'bin', 'antigravity-ide.cmd'),
                    path.join(localAppData, 'Programs', 'Antigravity', 'bin', 'antigravity.cmd')
                );
            }
            candidates.push('antigravity-ide.cmd', 'antigravity.cmd', 'antigravity.bat', 'antigravity.exe');
        } else {
            // For launching GUI window directly, prefer native PE .exe to avoid cmd.exe wrapper
            if (localAppData) {
                candidates.push(
                    path.join(localAppData, 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe'),
                    path.join(localAppData, 'Programs', 'Antigravity', 'Antigravity.exe'),
                    path.join(localAppData, 'Programs', 'Antigravity IDE', 'bin', 'antigravity-ide.cmd'),
                    path.join(localAppData, 'Programs', 'Antigravity', 'bin', 'antigravity.cmd')
                );
            }
            candidates.push('antigravity.exe', 'antigravity-ide.exe', 'antigravity-ide.cmd', 'antigravity.cmd');
        }
        candidates.push('antigravity');
    } else if (platform === 'darwin') {
        candidates.push(
            '/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide',
            '/Applications/Antigravity.app/Contents/Resources/app/bin/antigravity',
            path.join(home, 'Applications', 'Antigravity IDE.app', 'Contents', 'Resources', 'app', 'bin', 'antigravity-ide'),
            path.join(home, 'Applications', 'Antigravity.app', 'Contents', 'Resources', 'app', 'bin', 'antigravity'),
            '/opt/homebrew/bin/antigravity',
            '/usr/local/bin/antigravity',
            'antigravity-ide',
            'antigravity'
        );
    } else {
        candidates.push(
            '/usr/bin/antigravity-ide',
            '/usr/local/bin/antigravity-ide',
            path.join(home, '.local', 'bin', 'antigravity-ide'),
            '/usr/bin/antigravity',
            '/usr/local/bin/antigravity',
            path.join(home, '.local', 'bin', 'antigravity'),
            '/snap/bin/antigravity-ide',
            'antigravity-ide',
            'antigravity'
        );
    }

    for (const candidate of candidates) {
        if (!candidate) continue;
        if (candidate.includes('/') || candidate.includes('\\')) {
            if (existsSync(candidate)) return candidate;
        } else {
            return candidate;
        }
    }

    return platform === 'linux' ? 'antigravity-ide' : 'antigravity';
}

/**
 * Kill any existing process listening on the given port (prevents EADDRINUSE).
 * Hardened to prevent killing client connections (browser / IDE).
 *
 * @param {number} port
 * @returns {Promise<void>}
 */
export function killPortProcess(port) {
    const safePort = Number.parseInt(String(port), 10);
    if (!Number.isFinite(safePort) || safePort <= 0) {
        return Promise.resolve();
    }

    try {
        if (process.platform === 'win32') {
            const result = execFileSync('netstat', ['-ano', '-p', 'tcp'], {
                encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
            });
            const lines = result.trim().split('\n');
            const pids = new Set();
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                // TCP local_address foreign_address state PID
                if (parts.length >= 5 && parts[0].toUpperCase() === 'TCP') {
                    const localAddress = parts[1];
                    const state = parts[3];
                    const pid = parts[4];
                    if (state && state.toUpperCase() === 'LISTENING' && localAddress.endsWith(`:${safePort}`)) {
                        if (pid && pid !== '0' && pid !== '4' && Number(pid) !== process.pid) {
                            pids.add(pid);
                        }
                    }
                }
            }
            for (const pid of pids) {
                try {
                    execFileSync('taskkill', ['/PID', String(pid), '/F'], { stdio: 'pipe' });
                    console.log(`⚠️  Killed existing process on port ${safePort} (PID: ${pid})`);
                } catch (_) { /* Process may have already exited */ }
            }
        } else {
            let killed = false;
            // 1. Try lsof strictly with LISTEN state (prevents killing browser/IDE client sockets)
            try {
                const result = execSync(`lsof -nP -tiTCP:${safePort} -sTCP:LISTEN`, {
                    encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
                });
                for (const pidStr of result.trim().split('\n').filter(Boolean)) {
                    const pid = Number.parseInt(pidStr, 10);
                    if (Number.isFinite(pid) && pid !== process.pid) {
                        try {
                            process.kill(pid, 'SIGKILL');
                            killed = true;
                            console.log(`⚠️  Killed existing process on port ${safePort} (PID: ${pid})`);
                        } catch (_) {}
                    }
                }
            } catch (_) {}

            // 2. Fallback to ss if lsof didn't kill anything
            if (!killed && process.platform !== 'darwin') {
                try {
                    const result = execSync(`ss -ltnp "sport = :${safePort}"`, {
                        encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
                    });
                    const matches = result.matchAll(/pid=(\d+)/g);
                    for (const match of matches) {
                        const pid = Number.parseInt(match[1], 10);
                        if (Number.isFinite(pid) && pid !== process.pid) {
                            try {
                                process.kill(pid, 'SIGKILL');
                                killed = true;
                                console.log(`⚠️  Killed existing process on port ${safePort} (PID: ${pid}) via ss`);
                            } catch (_) {}
                        }
                    }
                } catch (_) {}
            }

            // 3. Fallback to fuser on minimal Linux / Alpine
            if (!killed && process.platform !== 'darwin') {
                try {
                    execSync(`fuser -k -n tcp ${safePort} 2>/dev/null`, { stdio: 'pipe' });
                } catch (_) {}
            }
        }
        return new Promise(resolve => setTimeout(resolve, 500));
    } catch (_) {
        // No process found or cleanup non-fatal
        return Promise.resolve();
    }
}

/**
 * Check if a specific port is free.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export function isPortFree(port) {
    return new Promise((resolve) => {
        const server = http.createServer();
        server.once('error', (err) => {
            resolve(/** @type {any} */(err).code !== 'EADDRINUSE');
        });
        server.once('listening', () => {
            server.close();
            resolve(true);
        });
        server.listen(port);
    });
}

/**
 * Launch a new Antigravity instance on the next available port.
 *
 * @returns {Promise<number>} The port the instance was launched on
 * @throws {Error} If no free port found between 7800-7850
 */
export async function launchAntigravity() {
    console.log('🚀 Attempting to launch a new Antigravity window...');

    let targetPort = null;
    for (let port = 7800; port <= 7850; port++) {
        if (await isPortFree(port)) {
            targetPort = port;
            break;
        }
    }

    if (!targetPort) {
        throw new Error('Could not find a free port between 7800-7850 to launch Antigravity');
    }

    if (!PORTS.includes(targetPort)) {
        PORTS.push(targetPort);
    }

    const binary = resolveAntigravityBinary({ preferCliWrapper: false });
    console.log(`Starting antigravity (${binary}) on port ${targetPort}...`);

    let subprocess;
    const isWindowsBatch = process.platform === 'win32' && /\.(cmd|bat)$/i.test(binary);
    if (isWindowsBatch) {
        // Safe invocation of Windows batch file without vulnerability to CVE-2024-27980
        const comspec = process.env.ComSpec || 'cmd.exe';
        subprocess = spawn(comspec, ['/d', '/s', '/c', `""${binary}" "--remote-debugging-port=${targetPort}""`], {
            detached: true,
            stdio: 'ignore',
            windowsVerbatimArguments: true,
            windowsHide: true
        });
    } else {
        subprocess = spawn(binary, [`--remote-debugging-port=${targetPort}`], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
    }
    subprocess.unref();

    await new Promise(r => setTimeout(r, 2500));
    return targetPort;
}

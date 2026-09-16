// @ts-check
/**
 * Workspace helpers for remote file browsing, terminal execution, Git actions,
 * and quick-command persistence.
 *
 * @module utils/workspace
 */

import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import { EventEmitter } from 'events';
import { execFile, spawn } from 'child_process';
import { basename, dirname, extname, join, relative, resolve, sep } from 'path';
import { hashString } from './hash.js';
import { PROJECT_ROOT } from '../config.js';

const WORKSPACE_ROOT = resolve(process.env.WORKSPACE_ROOT || PROJECT_ROOT);
const DATA_DIR = join(PROJECT_ROOT, 'data');
const QUICK_COMMANDS_PATH = join(DATA_DIR, 'quick-commands.json');
const UPLOADS_DIR = join(DATA_DIR, 'uploads');
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TERMINAL_LOGS = 500;

const DEFAULT_QUICK_COMMANDS = [
    {
        id: 'continue',
        label: 'Continue',
        icon: '▶',
        prompt: 'Continue'
    },
    {
        id: 'commit',
        label: 'Commit This',
        icon: '◆',
        prompt: 'Please review the current changes and create a safe commit plan.'
    },
    {
        id: 'check-files',
        label: 'Check Files',
        icon: '📁',
        prompt: 'Please inspect the changed files and summarize the main risks before editing.'
    },
    {
        id: 'lint',
        label: 'Run Lint',
        icon: '◌',
        prompt: 'Please run the appropriate lint checks for this project and fix any issues you find.'
    }
];

/**
 * Ensure a path stays inside the configured workspace.
 *
 * @param {string} inputPath
 * @returns {{absolute: string, relativePath: string}}
 */
export function resolveWorkspacePath(inputPath = '.') {
    const normalized = inputPath || '.';
    const absolute = resolve(WORKSPACE_ROOT, normalized);
    const rootWithSep = WORKSPACE_ROOT.endsWith(sep) ? WORKSPACE_ROOT : `${WORKSPACE_ROOT}${sep}`;

    if (absolute !== WORKSPACE_ROOT && !absolute.startsWith(rootWithSep)) {
        throw new Error('Requested path escapes the configured workspace root');
    }

    let realRoot = WORKSPACE_ROOT;
    try {
        realRoot = fs.realpathSync(WORKSPACE_ROOT);
    } catch {
        realRoot = WORKSPACE_ROOT;
    }
    const realRootWithSep = realRoot.endsWith(sep) ? realRoot : `${realRoot}${sep}`;

    if (fs.existsSync(absolute)) {
        try {
            const realAbsolute = fs.realpathSync(absolute);
            if (realAbsolute !== realRoot && !realAbsolute.startsWith(realRootWithSep)) {
                throw new Error('Requested path escapes the configured workspace root');
            }
        } catch (err) {
            if (err.message === 'Requested path escapes the configured workspace root') {
                throw err;
            }
        }
    } else {
        let ancestor = dirname(absolute);
        while (ancestor && ancestor !== dirname(ancestor)) {
            if (fs.existsSync(ancestor)) {
                try {
                    const realAncestor = fs.realpathSync(ancestor);
                    if (realAncestor !== realRoot && !realAncestor.startsWith(realRootWithSep)) {
                        throw new Error('Requested path escapes the configured workspace root');
                    }
                } catch (err) {
                    if (err.message === 'Requested path escapes the configured workspace root') {
                        throw err;
                    }
                }
                break;
            }
            ancestor = dirname(ancestor);
        }
    }

    const relativePath = absolute === WORKSPACE_ROOT ? '.' : relative(WORKSPACE_ROOT, absolute) || '.';
    return { absolute, relativePath };
}

/**
 * @returns {Promise<void>}
 */
export async function ensureWorkspaceData() {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.mkdir(UPLOADS_DIR, { recursive: true });

    if (!fs.existsSync(QUICK_COMMANDS_PATH)) {
        await fsp.writeFile(QUICK_COMMANDS_PATH, `${JSON.stringify(DEFAULT_QUICK_COMMANDS, null, 2)}\n`, 'utf8');
    }
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function guessLanguage(filePath) {
    const ext = extname(filePath).toLowerCase();
    const map = {
        '.js': 'javascript',
        '.mjs': 'javascript',
        '.cjs': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'tsx',
        '.jsx': 'jsx',
        '.json': 'json',
        '.html': 'markup',
        '.xml': 'markup',
        '.svg': 'markup',
        '.css': 'css',
        '.md': 'markdown',
        '.sh': 'bash',
        '.bash': 'bash',
        '.yml': 'yaml',
        '.yaml': 'yaml',
        '.toml': 'toml',
        '.py': 'python',
        '.rb': 'ruby',
        '.go': 'go',
        '.java': 'java',
        '.rs': 'rust',
        '.sql': 'sql',
        '.env': 'bash'
    };

    return map[ext] || 'clike';
}

/**
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function looksBinary(buffer) {
    const sample = buffer.subarray(0, 256);
    for (const byte of sample) {
        if (byte === 0) return true;
    }
    return false;
}

/**
 * List files and directories inside the workspace.
 *
 * @param {string} pathLike
 * @returns {Promise<{root: string, path: string, parent: string | null, entries: Array<{name: string, path: string, type: string, size: number, modified: string, extension: string}>}>}
 */
export async function listWorkspace(pathLike = '.') {
    await ensureWorkspaceData();
    const { absolute, relativePath } = resolveWorkspacePath(pathLike);
    const entries = await fsp.readdir(absolute, { withFileTypes: true });

    const mapped = await Promise.all(entries.map(async (entry) => {
        const absoluteEntry = join(absolute, entry.name);
        const stat = await fsp.lstat(absoluteEntry);
        const rel = relative(WORKSPACE_ROOT, absoluteEntry) || '.';
        const type = entry.isDirectory() ? 'directory' : entry.isSymbolicLink() ? 'symlink' : 'file';

        return {
            name: entry.name,
            path: rel,
            type,
            size: stat.size,
            modified: stat.mtime.toISOString(),
            extension: extname(entry.name).replace(/^\./, '')
        };
    }));

    mapped.sort((a, b) => {
        if (a.type !== b.type) {
            if (a.type === 'directory') return -1;
            if (b.type === 'directory') return 1;
        }
        return a.name.localeCompare(b.name);
    });

    return {
        root: WORKSPACE_ROOT,
        path: relativePath,
        parent: relativePath === '.' ? null : dirname(relativePath),
        entries: mapped
    };
}

/**
 * Read a text file from the workspace.
 *
 * @param {string} pathLike
 * @returns {Promise<{root: string, path: string, size: number, truncated: boolean, language: string, content: string}>}
 */
export async function readWorkspaceFile(pathLike) {
    const { absolute, relativePath } = resolveWorkspacePath(pathLike);
    const stat = await fsp.stat(absolute);

    if (stat.isDirectory()) {
        throw new Error('Requested path is a directory');
    }

    const readLength = Math.min(stat.size, MAX_FILE_BYTES);
    const handle = await fsp.open(absolute, 'r');
    try {
        const buffer = Buffer.alloc(readLength);
        await handle.read(buffer, 0, readLength, 0);

        if (looksBinary(buffer)) {
            throw new Error('Binary files are not supported in the mobile reader');
        }

        return {
            root: WORKSPACE_ROOT,
            path: relativePath,
            size: stat.size,
            truncated: stat.size > MAX_FILE_BYTES,
            language: guessLanguage(absolute),
            content: buffer.toString('utf8')
        };
    } finally {
        await handle.close();
    }
}

/**
 * Execute a Git command in the workspace.
 *
 * @param {string[]} args
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function execGit(args) {
    return new Promise((resolvePromise, rejectPromise) => {
        execFile('git', args, {
            cwd: WORKSPACE_ROOT,
            maxBuffer: 8 * 1024 * 1024
        }, (error, stdout, stderr) => {
            if (error) {
                const message = stderr?.trim() || stdout?.trim() || error.message;
                rejectPromise(new Error(message));
                return;
            }

            resolvePromise({
                stdout: stdout.toString(),
                stderr: stderr.toString()
            });
        });
    });
}

/**
 * @param {string} line
 * @returns {{path: string, status: string}}
 */
function parseGitStatusLine(line) {
    const status = line.slice(0, 2).trim() || '??';
    const path = line.slice(3).trim();
    return { path, status };
}

/**
 * Get a compact Git summary for the mobile panel.
 *
 * @returns {Promise<{branch: string, ahead: number, behind: number, clean: boolean, files: Array<{path: string, status: string}>, diffStat: string, stagedStat: string, lastCommit: string}>}
 */
export async function getGitSummary() {
    const [{ stdout: statusOut }, { stdout: diffStat }, { stdout: stagedStat }, { stdout: lastCommit }] = await Promise.all([
        execGit(['status', '--porcelain=v1', '-b']),
        execGit(['diff', '--stat']),
        execGit(['diff', '--cached', '--stat']),
        execGit(['log', '-1', '--oneline'])
    ]);

    const lines = statusOut.trim().split('\n').filter(Boolean);
    const branchLine = lines.shift() || '## detached';
    const branchMatch = branchLine.match(/^##\s+([^\.\s]+)(?:\.\.\.[^\s]+)?(?:\s+\[ahead\s+(\d+)\])?(?:,\s+behind\s+(\d+))?/);
    const branch = branchMatch?.[1] || branchLine.replace(/^##\s*/, '');
    const ahead = Number(branchMatch?.[2] || 0);
    const behind = Number(branchMatch?.[3] || 0);
    const files = lines.map(parseGitStatusLine);

    return {
        branch,
        ahead,
        behind,
        clean: files.length === 0,
        files,
        diffStat: diffStat.trim(),
        stagedStat: stagedStat.trim(),
        lastCommit: lastCommit.trim()
    };
}

/**
 * @param {string[]} [paths]
 * @returns {Promise<{success: boolean}>}
 */
export async function gitAdd(paths = []) {
    const args = paths.length ? ['add', '--', ...paths] : ['add', '-A'];
    await execGit(args);
    return { success: true };
}

/**
 * @param {string} message
 * @returns {Promise<{success: boolean}>}
 */
export async function gitCommit(message) {
    if (!message?.trim()) {
        throw new Error('Commit message is required');
    }

    await execGit(['commit', '-m', message.trim()]);
    return { success: true };
}

/**
 * @returns {Promise<{success: boolean}>}
 */
export async function gitPush() {
    await execGit(['push']);
    return { success: true };
}

/**
 * @returns {Promise<Array<{id: string, label: string, icon: string, prompt: string}>>}
 */
export async function loadQuickCommands() {
    await ensureWorkspaceData();
    const raw = await fsp.readFile(QUICK_COMMANDS_PATH, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
        throw new Error('quick-commands.json must contain an array');
    }

    return parsed.map((item, index) => ({
        id: String(item.id || `command-${index + 1}`),
        label: String(item.label || `Command ${index + 1}`),
        icon: String(item.icon || '•'),
        prompt: String(item.prompt || '')
    }));
}

/**
 * @param {Array<{id?: string, label?: string, icon?: string, prompt?: string}>} commands
 * @returns {Promise<Array<{id: string, label: string, icon: string, prompt: string}>>}
 */
export async function saveQuickCommands(commands) {
    await ensureWorkspaceData();

    if (!Array.isArray(commands) || commands.length === 0) {
        throw new Error('At least one quick command is required');
    }

    const normalized = commands.map((command, index) => ({
        id: String(command.id || command.label || `command-${index + 1}`)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-_]+/g, '-')
            .replace(/^-+|-+$/g, '') || `command-${index + 1}`,
        label: String(command.label || `Command ${index + 1}`).trim(),
        icon: String(command.icon || '•').trim().slice(0, 2) || '•',
        prompt: String(command.prompt || '').trim()
    })).filter(command => command.prompt);

    await fsp.writeFile(QUICK_COMMANDS_PATH, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
    return normalized;
}

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB limit
const ALLOWED_IMAGE_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/svg+xml'
]);

/**
 * Persist a base64 image upload to the data directory.
 *
 * @param {{name?: string, mimeType?: string, data: string}} input
 * @returns {Promise<{fileName: string, absolutePath: string, publicPath: string, dataUrl: string}>}
 */
export async function saveUploadedImage(input) {
    await ensureWorkspaceData();

    const mimeType = String(input.mimeType || 'image/png').toLowerCase().trim();
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
        throw new Error(`Unsupported image MIME type: ${input.mimeType}`);
    }

    const buffer = Buffer.from(input.data, 'base64');
    if (buffer.length === 0) {
        throw new Error('Image payload is empty');
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
        throw new Error(`Image file size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds 15 MB limit`);
    }

    const safeBaseName = String(input.name || 'mobile-upload')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'mobile-upload';

    const extension = mimeType.includes('jpeg') ? '.jpg' :
        mimeType.includes('gif') ? '.gif' :
            mimeType.includes('webp') ? '.webp' : '.png';

    const fileName = `${Date.now()}-${safeBaseName}${safeBaseName.endsWith(extension) ? '' : extension}`;
    const absolutePath = join(UPLOADS_DIR, fileName);
    await fsp.writeFile(absolutePath, buffer);

    pruneUploadsDirectory().catch(() => {});

    return {
        fileName,
        absolutePath,
        publicPath: `/uploads/${fileName}`,
        dataUrl: `data:${mimeType};base64,${input.data}`
    };
}

const ALLOWED_AUDIO_MIME_TYPES = new Set([
    'audio/webm',
    'audio/webm;codecs=opus',
    'audio/ogg',
    'audio/ogg;codecs=opus',
    'audio/mp4',
    'audio/m4a',
    'audio/aac',
    'audio/wav',
    'audio/x-wav',
    'audio/mpeg',
    'audio/mp3',
    'video/webm'
]);

const MAX_AUDIO_BYTES = 15 * 1024 * 1024; // 15 MB limit (matches Antigravity desktop voice memo)

/**
 * Persist a base64 audio recording (voice memo) to the data directory.
 *
 * @param {{name?: string, mimeType?: string, data: string, durationSeconds?: number}} input
 * @returns {Promise<{fileName: string, absolutePath: string, publicPath: string, mimeType: string, durationSeconds: number, dataUrl: string, buffer: Buffer}>}
 */
export async function saveUploadedAudio(input) {
    await ensureWorkspaceData();

    const rawMime = String(input.mimeType || 'audio/webm').toLowerCase().trim();
    const baseMime = rawMime.split(';')[0].trim();

    const isAllowed = ALLOWED_AUDIO_MIME_TYPES.has(rawMime) || ALLOWED_AUDIO_MIME_TYPES.has(baseMime) || baseMime.startsWith('audio/');
    if (!isAllowed) {
        throw new Error(`Unsupported audio MIME type: ${input.mimeType}`);
    }

    const buffer = Buffer.from(input.data, 'base64');
    if (buffer.length === 0) {
        throw new Error('Audio payload is empty');
    }
    if (buffer.length > MAX_AUDIO_BYTES) {
        throw new Error(`Audio file size (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) exceeds 15 MB limit`);
    }

    const safeBaseName = String(input.name || 'voice-memo')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'voice-memo';

    const extension = baseMime.includes('ogg') ? '.ogg' :
        baseMime.includes('mp4') || baseMime.includes('m4a') || baseMime.includes('aac') ? '.m4a' :
            baseMime.includes('wav') ? '.wav' :
                baseMime.includes('mpeg') || baseMime.includes('mp3') ? '.mp3' : '.webm';

    const fileName = `${Date.now()}-${safeBaseName}${safeBaseName.endsWith(extension) ? '' : extension}`;
    const absolutePath = join(UPLOADS_DIR, fileName);
    await fsp.writeFile(absolutePath, buffer);

    const durationSeconds = Number(input.durationSeconds) > 0 ? Number(input.durationSeconds) : 0;

    pruneUploadsDirectory().catch(() => {});

    return {
        fileName,
        absolutePath,
        publicPath: `/uploads/${fileName}`,
        mimeType: rawMime,
        durationSeconds,
        dataUrl: `data:${rawMime};base64,${input.data}`,
        buffer
    };
}

/**
 * Prune uploads directory according to max age and total size policies.
 *
 * @param {object} [options]
 * @param {number} [options.maxAgeDays=7]
 * @param {number} [options.maxTotalBytes=500 * 1024 * 1024]
 * @returns {Promise<{deletedCount: number, deletedBytes: number}>}
 */
export async function pruneUploadsDirectory({ maxAgeDays = 7, maxTotalBytes = 500 * 1024 * 1024 } = {}) {
    await ensureWorkspaceData();

    let entries;
    try {
        entries = await fsp.readdir(UPLOADS_DIR, { withFileTypes: true });
    } catch {
        return { deletedCount: 0, deletedBytes: 0 };
    }

    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
    let deletedCount = 0;
    let deletedBytes = 0;

    /** @type {Array<{name: string, path: string, size: number, mtimeMs: number}>} */
    const files = [];

    for (const entry of entries) {
        if (!entry.isFile()) continue;
        const filePath = join(UPLOADS_DIR, entry.name);
        try {
            const stat = await fsp.stat(filePath);
            const ageMs = now - stat.mtimeMs;
            if (ageMs > maxAgeMs) {
                await fsp.unlink(filePath);
                deletedCount++;
                deletedBytes += stat.size;
            } else {
                files.push({
                    name: entry.name,
                    path: filePath,
                    size: stat.size,
                    mtimeMs: stat.mtimeMs
                });
            }
        } catch {
            // Ignore concurrent deletion
        }
    }

    // Sort surviving files oldest first for FIFO pruning if size exceeds limit
    files.sort((a, b) => a.mtimeMs - b.mtimeMs);

    let totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    while (totalBytes > maxTotalBytes && files.length > 0) {
        const oldest = files.shift();
        if (!oldest) break;
        try {
            await fsp.unlink(oldest.path);
            deletedCount++;
            deletedBytes += oldest.size;
            totalBytes -= oldest.size;
        } catch {
            // Ignore concurrent deletion
        }
    }

    return { deletedCount, deletedBytes };
}

/**
 * Lightweight terminal manager that streams stdout/stderr to subscribers.
 */
export class TerminalManager extends EventEmitter {
    constructor() {
        super();
        /** @type {import('child_process').ChildProcessWithoutNullStreams | null} */
        this.process = null;
        /** @type {Array<{id: number, stream: 'stdout' | 'stderr' | 'system', text: string, timestamp: string}>} */
        this.logs = [];
        this.command = '';
        this.startedAt = '';
        this.endedAt = '';
        this.exitCode = null;
        this.nextId = 1;
    }

    /**
     * @private
     * @param {'stdout' | 'stderr' | 'system'} stream
     * @param {string} text
     */
    pushLog(stream, text) {
        const entry = {
            id: this.nextId++,
            stream,
            text,
            timestamp: new Date().toISOString()
        };

        this.logs.push(entry);
        if (this.logs.length > MAX_TERMINAL_LOGS) {
            this.logs.shift();
        }

        this.emit('output', entry);
    }

    /**
     * @param {string} command
     * @returns {{active: boolean, command: string, startedAt: string, endedAt: string, exitCode: number | null, logs: Array<{id: number, stream: 'stdout' | 'stderr' | 'system', text: string, timestamp: string}>}}
     */
    getState(command = this.command) {
        return {
            active: !!this.process,
            command,
            startedAt: this.startedAt,
            endedAt: this.endedAt,
            exitCode: this.exitCode,
            logs: this.logs
        };
    }

    /**
     * @param {string} command
     * @returns {Promise<{active: boolean, command: string, startedAt: string, endedAt: string, exitCode: number | null, logs: Array<{id: number, stream: 'stdout' | 'stderr' | 'system', text: string, timestamp: string}>}>}
     */
    async run(command) {
        if (!command?.trim()) {
            throw new Error('Command is required');
        }

        if (this.process) {
            await this.stop();
        }

        this.logs = [];
        this.command = command.trim();
        this.startedAt = new Date().toISOString();
        this.endedAt = '';
        this.exitCode = null;

        const shell = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : (process.env.SHELL || 'bash');
        const args = process.platform === 'win32' ? ['/d', '/s', '/c', this.command] : ['-lc', this.command];
        this.process = spawn(shell, args, {
            cwd: WORKSPACE_ROOT,
            detached: process.platform !== 'win32',
            env: { ...process.env, FORCE_COLOR: '0' }
        });

        this.pushLog('system', `$ ${this.command}`);

        this.process.stdout.on('data', (chunk) => {
            this.pushLog('stdout', chunk.toString());
        });

        this.process.stderr.on('data', (chunk) => {
            this.pushLog('stderr', chunk.toString());
        });

        this.process.on('close', (code) => {
            this.exitCode = code;
            this.endedAt = new Date().toISOString();
            this.pushLog('system', `Process finished with exit code ${code ?? 0}`);
            this.process = null;
            this.emit('exit', this.getState());
        });

        return this.getState();
    }

    /**
     * @returns {Promise<{success: boolean}>}
     */
    async stop() {
        if (!this.process) {
            return { success: true };
        }

        const pid = this.process.pid;
        const proc = this.process;
        try {
            if (process.platform === 'win32') {
                if (pid) {
                    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => {});
                }
            } else if (pid) {
                try {
                    process.kill(-pid, 'SIGTERM');
                } catch (_) {
                    proc.kill('SIGTERM');
                }
            } else {
                proc.kill('SIGTERM');
            }
        } catch (_) {
            // Process may already be dead
        }

        this.pushLog('system', 'Termination requested by mobile client');
        return { success: true };
    }
}

export const terminalManager = new TerminalManager();
export const workspaceRoot = WORKSPACE_ROOT;
export const uploadsDir = UPLOADS_DIR;

/**
 * Extract title from markdown content (first # heading)
 * @param {string} content
 * @param {string} fallback
 * @returns {string}
 */
export function extractMarkdownTitle(content, fallback = 'Document') {
    if (!content) return fallback;
    const match = content.match(/^#\s+(.+)$/m);
    if (match && match[1]) {
        return match[1].replace(/[\r\n]+/g, ' ').trim();
    }
    return fallback;
}

/**
 * Derives a clean workspace or project name from a file path or title.
 * @param {string} filePath
 * @param {string} [content]
 * @returns {string}
 */
export function deriveWorkspaceNameFromPath(filePath, content = '') {
    if (!filePath) return 'Antigravity Workspace';
    if (filePath.includes('/Projet_Cholet/')) return 'Projet_Cholet';
    if (filePath.includes('/OmniAntigravityRemoteChat/')) return 'OmniAntigravityRemoteChat';
    if (content) {
        const titleMatch = content.match(/TICKET-([A-Z0-9]+)-/i);
        if (titleMatch) return 'OmniAntigravity';
    }
    const parts = filePath.split('/');
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === 'brain' && i > 0 && parts[i+1]) {
            return 'Conversation ' + parts[i+1].slice(0, 8);
        }
    }
    return basename(WORKSPACE_ROOT);
}

/**
 * Discovers the recent implementation plans across brain storage and workspace directories.
 *
 * @param {number} [limit=10]
 * @returns {Promise<Array<{id: string, path: string, title: string, workspaceName: string, updatedAt: number}>>}
 */
export async function findRecentImplementationPlans(limit = 10) {
    const candidates = [];
    const brainRoots = [
        join(os.homedir(), '.gemini', 'antigravity-ide', 'brain'),
        join(os.homedir(), '.gemini', 'antigravity', 'brain')
    ];

    for (const root of brainRoots) {
        try {
            const dirs = await fsp.readdir(root, { withFileTypes: true });
            for (const d of dirs) {
                if (d.isDirectory()) {
                    const planFile = join(root, d.name, 'implementation_plan.md');
                    try {
                        const stat = await fsp.stat(planFile);
                        candidates.push({ path: planFile, mtime: stat.mtimeMs, convId: d.name });
                    } catch (_) {}
                }
            }
        } catch (_) {}
    }

    // Also check workspace root and docs
    const workspacePlan = join(WORKSPACE_ROOT, 'implementation_plan.md');
    try {
        const stat = await fsp.stat(workspacePlan);
        candidates.push({ path: workspacePlan, mtime: stat.mtimeMs, workspace: basename(WORKSPACE_ROOT) });
    } catch (_) {}

    const docsPlan = join(WORKSPACE_ROOT, 'docs', 'implementation_plan.md');
    try {
        const stat = await fsp.stat(docsPlan);
        candidates.push({ path: docsPlan, mtime: stat.mtimeMs, workspace: basename(WORKSPACE_ROOT) });
    } catch (_) {}

    candidates.sort((a, b) => b.mtime - a.mtime);
    const topCandidates = candidates.slice(0, limit);

    const results = [];
    for (const item of topCandidates) {
        try {
            const content = await fsp.readFile(item.path, 'utf-8');
            const title = extractMarkdownTitle(content, 'Implementation Plan');
            const workspaceName = item.workspace || deriveWorkspaceNameFromPath(item.path, content);
            const id = 'plan-' + Math.floor(item.mtime / 1000).toString(36) + '-' + hashString(content.slice(0, 100));
            results.push({
                id,
                path: item.path,
                title,
                workspaceName,
                updatedAt: item.mtime
            });
        } catch (_) {}
    }
    return results;
}

/**
 * Finds the latest implementation plan.
 *
 * @returns {Promise<{path: string, content: string, updatedAt: number, title?: string, workspaceName?: string, id?: string} | null>}
 */
export async function findLatestImplementationPlan() {
    const plans = await findRecentImplementationPlans(1);
    if (plans.length > 0) {
        const top = plans[0];
        const content = await fsp.readFile(top.path, 'utf-8');
        return {
            path: top.path,
            content,
            updatedAt: top.updatedAt,
            title: top.title,
            workspaceName: top.workspaceName,
            id: top.id
        };
    }
    return null;
}

/**
 * Discovers the recent walkthroughs across brain storage and workspace directories.
 *
 * @param {number} [limit=10]
 * @returns {Promise<Array<{id: string, path: string, title: string, workspaceName: string, updatedAt: number}>>}
 */
export async function findRecentWalkthroughs(limit = 10) {
    const candidates = [];
    const brainRoots = [
        join(os.homedir(), '.gemini', 'antigravity-ide', 'brain'),
        join(os.homedir(), '.gemini', 'antigravity', 'brain')
    ];

    for (const root of brainRoots) {
        try {
            const dirs = await fsp.readdir(root, { withFileTypes: true });
            for (const d of dirs) {
                if (d.isDirectory()) {
                    const convDir = join(root, d.name);
                    try {
                        const entries = await fsp.readdir(convDir, { withFileTypes: true });
                        for (const entry of entries) {
                            if (
                                entry.isFile() &&
                                entry.name.endsWith('.md') &&
                                !entry.name.endsWith('.metadata.json') &&
                                entry.name !== 'implementation_plan.md'
                            ) {
                                const fullPath = join(convDir, entry.name);
                                try {
                                    const stat = await fsp.stat(fullPath);
                                    candidates.push({
                                        path: fullPath,
                                        mtime: stat.mtimeMs,
                                        convId: d.name,
                                        filename: entry.name,
                                        isWalkthrough: entry.name === 'walkthrough.md'
                                    });
                                } catch (_) {}
                            }
                        }
                    } catch (_) {}
                }
            }
        } catch (_) {}
    }

    // Also check workspace root and docs
    const workspaceWt = join(WORKSPACE_ROOT, 'walkthrough.md');
    try {
        const stat = await fsp.stat(workspaceWt);
        candidates.push({ path: workspaceWt, mtime: stat.mtimeMs, workspace: basename(WORKSPACE_ROOT), filename: 'walkthrough.md', isWalkthrough: true });
    } catch (_) {}

    const docsDir = join(WORKSPACE_ROOT, 'docs');
    try {
        const docsEntries = await fsp.readdir(docsDir, { withFileTypes: true });
        for (const entry of docsEntries) {
            if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'implementation_plan.md') {
                const docPath = join(docsDir, entry.name);
                try {
                    const stat = await fsp.stat(docPath);
                    candidates.push({
                        path: docPath,
                        mtime: stat.mtimeMs,
                        workspace: basename(WORKSPACE_ROOT),
                        filename: entry.name,
                        isWalkthrough: entry.name === 'walkthrough.md'
                    });
                } catch (_) {}
            }
        }
    } catch (_) {}

    candidates.sort((a, b) => b.mtime - a.mtime);
    const topCandidates = candidates.slice(0, limit);

    const results = [];
    for (const item of topCandidates) {
        try {
            const content = await fsp.readFile(item.path, 'utf-8');
            const defaultTitle = item.isWalkthrough ? 'Walkthrough' : item.filename.replace(/\.md$/, '').replace(/[-_]/g, ' ');
            const title = extractMarkdownTitle(content, defaultTitle);
            const workspaceName = item.workspace || deriveWorkspaceNameFromPath(item.path, content);
            const id = 'wt-' + Math.floor(item.mtime / 1000).toString(36) + '-' + hashString(content.slice(0, 100));
            results.push({
                id,
                path: item.path,
                title,
                workspaceName,
                updatedAt: item.mtime,
                isWalkthrough: item.isWalkthrough
            });
        } catch (_) {}
    }
    return results;
}

/**
 * Finds the latest walkthrough.md file.
 *
 * @returns {Promise<{path: string, content: string, updatedAt: number, title?: string, workspaceName?: string, id?: string} | null>}
 */
export async function findLatestWalkthrough() {
    const list = await findRecentWalkthroughs(15);
    const top = list.find(item => item.isWalkthrough || item.path.endsWith('walkthrough.md')) || list[0];
    if (top) {
        const content = await fsp.readFile(top.path, 'utf-8');
        return {
            path: top.path,
            content,
            updatedAt: top.updatedAt,
            title: top.title,
            workspaceName: top.workspaceName,
            id: top.id,
            isWalkthrough: top.isWalkthrough
        };
    }
    return null;
}


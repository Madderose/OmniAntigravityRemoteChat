// @ts-check
import { describe, expect, it } from 'vitest';
import path from 'path';
import os from 'os';
import {
    toPosix,
    resolveWorkspacePath,
    listWorkspace,
    deriveWorkspaceNameFromPath
} from '../../src/utils/workspace.js';
import {
    parseLanguageServerCommand,
    getCsrfTokenCandidatePaths
} from '../../src/quota-service.js';
import { resolveAntigravityBinary } from '../../src/utils/process.js';

describe('Cross-Platform Resilience & System Parity Suite (Windows, macOS, Linux)', () => {
    describe('1. toPosix() and Path Normalization', () => {
        it('normalizes Windows backslashes into forward slashes', () => {
            expect(toPosix('src\\utils\\workspace.js')).toBe('src/utils/workspace.js');
            expect(toPosix('data\\uploads\\file.png')).toBe('data/uploads/file.png');
        });

        it('normalizes lowercase Windows drive letter to uppercase', () => {
            expect(toPosix('c:/Users/admin/project')).toBe('C:/Users/admin/project');
            expect(toPosix('d:\\projects\\omni')).toBe('D:/projects/omni');
        });

        it('preserves clean POSIX paths and handles falsy input safely', () => {
            expect(toPosix('src/utils/process.js')).toBe('src/utils/process.js');
            expect(toPosix('')).toBe('');
            expect(toPosix(null)).toBe('');
        });
    });

    describe('2. Workspace Confinement & Navigation', () => {
        it('resolveWorkspacePath returns POSIX-normalized relativePath', () => {
            const result = resolveWorkspacePath('src/utils');
            expect(result.relativePath).toBe('src/utils');
            expect(result.relativePath.includes('\\')).toBe(false);
        });

        it('resolveWorkspacePath rejects path traversal escaping workspace root', () => {
            expect(() => resolveWorkspacePath('../../outside')).toThrow(
                /Requested path escapes the configured workspace root/i
            );
        });

        it('listWorkspace returns root, path, and all entry paths with POSIX slashes', async () => {
            const listing = await listWorkspace('.');
            expect(listing.root).not.toMatch(/\\/);
            expect(listing.path).not.toMatch(/\\/);
            if (listing.parent) {
                expect(listing.parent).not.toMatch(/\\/);
            }
            for (const entry of listing.entries) {
                expect(entry.path).not.toMatch(/\\/);
            }
        });

        it('deriveWorkspaceNameFromPath handles both Windows backslashes and POSIX slashes', () => {
            expect(deriveWorkspaceNameFromPath('C:\\Users\\admin\\Projet_Cholet\\plan.md')).toBe('Projet_Cholet');
            expect(deriveWorkspaceNameFromPath('/home/user/Projet_Cholet/plan.md')).toBe('Projet_Cholet');
            expect(deriveWorkspaceNameFromPath('C:\\Projects\\OmniAntigravityRemoteChat\\server.js')).toBe('OmniAntigravityRemoteChat');
            expect(deriveWorkspaceNameFromPath('/var/www/OmniAntigravityRemoteChat/src/config.js')).toBe('OmniAntigravityRemoteChat');

            const winBrain = 'C:\\Users\\dev\\.gemini\\antigravity-ide\\brain\\abcdef12-3456\\logs';
            expect(deriveWorkspaceNameFromPath(winBrain)).toBe('Conversation abcdef12');

            const posixBrain = '/home/dev/.gemini/antigravity-ide/brain/98765432-cdef/logs';
            expect(deriveWorkspaceNameFromPath(posixBrain)).toBe('Conversation 98765432');
        });

        it('simulates resilient FileBrowser goUp() logic across Windows and POSIX path formats', () => {
            function simulateGoUp(currentPath) {
                if (currentPath === '.' || !currentPath) return '.';
                const parts = String(currentPath).split(/[\\/]+/).filter(Boolean);
                parts.pop();
                return parts.length ? parts.join('/') : '.';
            }

            expect(simulateGoUp('src/utils/cdp')).toBe('src/utils');
            expect(simulateGoUp('src\\utils\\cdp')).toBe('src/utils');
            expect(simulateGoUp('src/utils')).toBe('src');
            expect(simulateGoUp('src\\utils')).toBe('src');
            expect(simulateGoUp('src/')).toBe('.');
            expect(simulateGoUp('src\\')).toBe('.');
            expect(simulateGoUp('.')).toBe('.');
        });
    });

    describe('3. Quota Service & CLI Flag Parsing Resilience', () => {
        it('parses flags with space, equal sign (=), and double/single quotes', () => {
            const cmdSpace = '1234 language_server --csrf_token token_space_123 --extension_server_port 7805';
            const parsedSpace = parseLanguageServerCommand(cmdSpace);
            expect(parsedSpace.pid).toBe(1234);
            expect(parsedSpace.csrfToken).toBe('token_space_123');
            expect(parsedSpace.extensionServerPort).toBe(7805);

            const cmdEqual = '5678 language_server --csrf_token=token_equal_456 --extension_server_port=7810';
            const parsedEqual = parseLanguageServerCommand(cmdEqual);
            expect(parsedEqual.pid).toBe(5678);
            expect(parsedEqual.csrfToken).toBe('token_equal_456');
            expect(parsedEqual.extensionServerPort).toBe(7810);

            const cmdQuoted = '9999 language_server --app_data_dir="C:\\Users\\Dev Path\\AppData" --csrf_token=\'token_quoted_789\'';
            const parsedQuoted = parseLanguageServerCommand(cmdQuoted);
            expect(parsedQuoted.pid).toBe(9999);
            expect(parsedQuoted.appDataDir).toBe('C:\\Users\\Dev Path\\AppData');
            expect(parsedQuoted.csrfToken).toBe('token_quoted_789');
        });

        it('includes multi-OS candidate paths for machineid (macOS, Windows, Linux)', () => {
            const candidatePaths = getCsrfTokenCandidatePaths();
            expect(candidatePaths.length).toBeGreaterThanOrEqual(5);

            const hasMacOsPath = candidatePaths.some((p) =>
                p.includes(path.join('Library', 'Application Support', 'Antigravity', 'User', 'machineid'))
            );
            expect(hasMacOsPath).toBe(true);

            const hasMacOsIdePath = candidatePaths.some((p) =>
                p.includes(path.join('Library', 'Application Support', 'Antigravity IDE', 'User', 'machineid'))
            );
            expect(hasMacOsIdePath).toBe(true);

            const hasLinuxOrDotConfig = candidatePaths.some((p) =>
                p.includes(path.join('.config', 'Antigravity', 'User', 'machineid')) ||
                p.includes(path.join('.antigravity', 'data', 'machineid'))
            );
            expect(hasLinuxOrDotConfig).toBe(true);
        });
    });

    describe('4. Universal Antigravity Binary Resolution', () => {
        it('resolves CLI batch wrapper under Windows when preferCliWrapper is true', () => {
            const fakeExists = (p) => p.endsWith('.cmd');
            const binary = resolveAntigravityBinary({
                platform: 'win32',
                env: { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' },
                existsSync: fakeExists,
                preferCliWrapper: true
            });
            expect(binary).toMatch(/\.cmd$/i);
        });

        it('resolves native PE .exe under Windows when preferCliWrapper is false for GUI launching', () => {
            const fakeExists = (p) => p.endsWith('Antigravity IDE.exe');
            const binary = resolveAntigravityBinary({
                platform: 'win32',
                env: { LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local' },
                existsSync: fakeExists,
                preferCliWrapper: false
            });
            expect(binary).toMatch(/Antigravity IDE\.exe$/i);
        });

        it('resolves macOS /Applications bundle binary under darwin', () => {
            const fakeExists = (p) => p.startsWith('/Applications/Antigravity IDE.app');
            const binary = resolveAntigravityBinary({
                platform: 'darwin',
                existsSync: fakeExists
            });
            expect(binary).toBe('/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide');
        });

        it('resolves Linux /usr/bin or ~/.local binary under linux', () => {
            const fakeExists = (p) => p === '/usr/bin/antigravity-ide';
            const binary = resolveAntigravityBinary({
                platform: 'linux',
                existsSync: fakeExists
            });
            expect(binary).toBe('/usr/bin/antigravity-ide');
        });
    });
});

// @ts-check
/**
 * Shared configuration — constants, env vars, and type definitions.
 * Single source of truth for all magic strings and numbers.
 *
 * @module config
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Project root directory (one level up from src/) */
export const PROJECT_ROOT = join(__dirname, '..');

// ─── CDP Ports ──────────────────────────────────────────────────────

/** @type {number[]} CDP debug ports to scan */
export const PORTS = process.env.CDP_PORTS
    ? process.env.CDP_PORTS.split(',').map(Number).filter(Boolean)
    : [7800, 7801, 7802, 7803];

/** @type {readonly string[]} Chat container IDs, in priority order */
export const CONTAINER_IDS = ['cascade', 'conversation', 'chat'];

/** Excluded CDP target titles (internal pages without chat) */
export const EXCLUDED_TARGET_TITLES = ['launchpad', 'settings'];

// ─── Server ─────────────────────────────────────────────────────────

export const SERVER_PORT = process.env.PORT || 4747;
export const POLL_INTERVAL = 1000;
export const CDP_CALL_TIMEOUT = 30000;
export const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || '15mb';
export const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || PROJECT_ROOT;
export const AUTO_TUNNEL_PROVIDER = (process.env.AUTO_TUNNEL_PROVIDER || '').toLowerCase();

// ─── Auth ───────────────────────────────────────────────────────────

export const APP_PASSWORD = process.env.APP_PASSWORD || 'antigravity';
export const COOKIE_SECRET = process.env.COOKIE_SECRET || 'antigravity_secret_key_1337';
export const AUTH_SALT = process.env.AUTH_SALT || '';
export const AUTH_COOKIE_NAME = 'omni_ag_auth';

/**
 * @param {string} name
 * @param {boolean} [fallback=false]
 * @returns {boolean}
 */
function readBooleanEnv(name, fallback = false) {
    const value = String(process.env[name] ?? '').trim().toLowerCase();
    if (!value) return fallback;
    return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

/**
 * @param {string} name
 * @param {number} fallback
 * @returns {number}
 */
function readPositiveIntEnv(name, fallback) {
    const parsed = Number.parseInt(String(process.env[name] ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// ─── Zero-CDP Transcript & Headless agy CLI ─────────────────────────

export const USER_HOME = os.homedir() || process.env.USERPROFILE || process.env.HOME || '';
export const TRANSCRIPT_BRAIN_DIRS = process.env.TRANSCRIPT_BRAIN_DIR
    ? [process.env.TRANSCRIPT_BRAIN_DIR]
    : [
        join(USER_HOME, '.gemini', 'antigravity-ide', 'brain'),
        join(USER_HOME, '.gemini', 'antigravity-cli', 'brain')
    ];
export const TRANSCRIPT_POLL_MS = readPositiveIntEnv('TRANSCRIPT_POLL_MS', 400);

const defaultLocalAppData = process.env.LOCALAPPDATA || (USER_HOME ? join(USER_HOME, 'AppData', 'Local') : '');
export const AGY_CLI_PATH = process.env.AGY_CLI_PATH || (
    process.platform === 'win32' && defaultLocalAppData
        ? join(defaultLocalAppData, 'agy', 'bin', 'agy.exe')
        : 'agy'
);
export const DEFAULT_AGY_MODEL = process.env.AGY_DEFAULT_MODEL || 'gemini-4-argon-medium';

// ─── Supervisor ────────────────────────────────────────────────────

export function getSupervisorSuggestMode() {
    return readBooleanEnv('SUPERVISOR_SUGGEST_MODE', false);
}

export function getSupervisorMaxQueue() {
    return readPositiveIntEnv('SUPERVISOR_MAX_QUEUE', 10);
}

// ─── Quota Service ─────────────────────────────────────────────────

export function getQuotaEnabled() {
    return readBooleanEnv('QUOTA_ENABLED', false);
}

export function getQuotaPollInterval() {
    return readPositiveIntEnv('QUOTA_POLL_INTERVAL', 300000);
}

// ─── Screenshot Timeline ───────────────────────────────────────────

export function getScreenshotEnabled() {
    return readBooleanEnv('SCREENSHOT_ENABLED', false);
}

export function getScreenshotInterval() {
    return readPositiveIntEnv('SCREENSHOT_INTERVAL', 60000);
}

export function getScreenshotMax() {
    return readPositiveIntEnv('SCREENSHOT_MAX', 100);
}

// ─── Developer Tools & Mocks ────────────────────────────────────────

export function getDevMocksEnabled() {
    return readBooleanEnv('ENABLE_DEV_MOCKS', process.env.NODE_ENV !== 'production');
}

// ─── Antigravity 2.0 Models & Reasoning Effort ─────────────────────

/** @type {readonly ('low' | 'medium' | 'high' | 'max')[]} */
export const REASONING_EFFORTS = ['low', 'medium', 'high', 'max'];

export const DEFAULT_REASONING_EFFORT = 'high';

/**
 * @typedef {object} ModelMetadata
 * @property {string} id
 * @property {string} label
 * @property {string} family
 * @property {'google' | 'anthropic' | 'openai'} provider
 * @property {'low' | 'medium' | 'high' | 'max'} defaultEffort
 * @property {boolean} supportsEffort
 * @property {boolean} supportsThinking
 * @property {boolean} supportsImages
 * @property {number} contextWindow
 */

/** @type {readonly ModelMetadata[]} */
export const ANTIGRAVITY_MODELS = [
    {
        id: 'gemini-4-argon-high',
        label: 'Gemini 4 Argon (High)',
        family: 'gemini-4-argon',
        provider: 'google',
        defaultEffort: 'high',
        supportsEffort: true,
        supportsThinking: true,
        supportsImages: true,
        contextWindow: 2000000
    },
    {
        id: 'gemini-4-argon-medium',
        label: 'Gemini 4 Argon (Medium)',
        family: 'gemini-4-argon',
        provider: 'google',
        defaultEffort: 'medium',
        supportsEffort: true,
        supportsThinking: true,
        supportsImages: true,
        contextWindow: 2000000
    },
    {
        id: 'gemini-3.8-flash-high',
        label: 'Gemini 3.8 Flash (High)',
        family: 'gemini-3.8-flash',
        provider: 'google',
        defaultEffort: 'high',
        supportsEffort: true,
        supportsThinking: true,
        supportsImages: true,
        contextWindow: 1000000
    },
    {
        id: 'claude-opus-5-5-high',
        label: 'Claude Opus 5.5 (High)',
        family: 'claude-5.5',
        provider: 'anthropic',
        defaultEffort: 'high',
        supportsEffort: true,
        supportsThinking: true,
        supportsImages: true,
        contextWindow: 500000
    },
    {
        id: 'claude-sonnet-5-5-high',
        label: 'Claude Sonnet 5.5 (High)',
        family: 'claude-5.5',
        provider: 'anthropic',
        defaultEffort: 'high',
        supportsEffort: true,
        supportsThinking: true,
        supportsImages: true,
        contextWindow: 500000
    },
    {
        id: 'claude-5-5-sonnet',
        label: 'Claude 5.5 Sonnet (Thinking)',
        family: 'claude-5.5',
        provider: 'anthropic',
        defaultEffort: 'high',
        supportsEffort: true,
        supportsThinking: true,
        supportsImages: true,
        contextWindow: 500000
    },
    {
        id: 'claude-5-5-opus',
        label: 'Claude 5.5 Opus (Thinking)',
        family: 'claude-5.5',
        provider: 'anthropic',
        defaultEffort: 'max',
        supportsEffort: true,
        supportsThinking: true,
        supportsImages: true,
        contextWindow: 500000
    },
    {
        id: 'claude-3-7-sonnet-thinking',
        label: 'Claude 3.7 Sonnet (Thinking)',
        family: 'claude-3.7',
        provider: 'anthropic',
        defaultEffort: 'high',
        supportsEffort: true,
        supportsThinking: true,
        supportsImages: true,
        contextWindow: 200000
    },
    {
        id: 'claude-sonnet-4-6-thinking',
        label: 'Claude Sonnet 4.6 (Thinking)',
        family: 'claude-4.6',
        provider: 'anthropic',
        defaultEffort: 'high',
        supportsEffort: true,
        supportsThinking: true,
        supportsImages: true,
        contextWindow: 200000
    },
    {
        id: 'claude-opus-4-6-thinking',
        label: 'Claude Opus 4.6 (Thinking)',
        family: 'claude-4.6',
        provider: 'anthropic',
        defaultEffort: 'high',
        supportsEffort: true,
        supportsThinking: true,
        supportsImages: true,
        contextWindow: 200000
    },
    {
        id: 'gemini-3-1-pro-high',
        label: 'Gemini 3.1 Pro (High)',
        family: 'gemini-3.1',
        provider: 'google',
        defaultEffort: 'high',
        supportsEffort: true,
        supportsThinking: true,
        supportsImages: true,
        contextWindow: 2000000
    },
    {
        id: 'gemini-3-1-pro-low',
        label: 'Gemini 3.1 Pro (Low)',
        family: 'gemini-3.1',
        provider: 'google',
        defaultEffort: 'low',
        supportsEffort: true,
        supportsThinking: false,
        supportsImages: true,
        contextWindow: 2000000
    },
    {
        id: 'gemini-3-flash',
        label: 'Gemini 3 Flash',
        family: 'gemini-3',
        provider: 'google',
        defaultEffort: 'low',
        supportsEffort: false,
        supportsThinking: false,
        supportsImages: true,
        contextWindow: 1000000
    },
    {
        id: 'gpt-oss-120b-medium',
        label: 'GPT-OSS 120B (Medium)',
        family: 'gpt-oss',
        provider: 'openai',
        defaultEffort: 'medium',
        supportsEffort: true,
        supportsThinking: true,
        supportsImages: false,
        contextWindow: 128000
    }
];

/** @type {Record<string, ModelMetadata>} */
export const MODEL_METADATA = Object.fromEntries(
    ANTIGRAVITY_MODELS.map((model) => [model.id, model])
);

/**
 * Look up model metadata by ID or human-readable label.
 * @param {string} idOrLabel
 * @returns {ModelMetadata | null}
 */
export function getModelMetadata(idOrLabel) {
    const key = String(idOrLabel || '').trim().toLowerCase();
    if (!key) return null;
    return (
        ANTIGRAVITY_MODELS.find(
            (m) => m.id.toLowerCase() === key || m.label.toLowerCase() === key
        ) || null
    );
}

/**
 * Validate reasoning effort level.
 * @param {string} effort
 * @returns {effort is 'low' | 'medium' | 'high' | 'max'}
 */
export function isValidReasoningEffort(effort) {
    return REASONING_EFFORTS.includes(/** @type {any} */ (String(effort || '').trim().toLowerCase()));
}

// ─── Version ────────────────────────────────────────────────────────

export const VERSION = '1.7.0';

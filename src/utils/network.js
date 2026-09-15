// @ts-check
/**
 * Network utilities — IP detection, local request checks, HTTP helpers.
 *
 * @module utils/network
 */

import http from 'http';
import os from 'os';

/**
 * Get local IP address for mobile access.
 * Prefers real network IPs (192.168.x.x, 10.x.x.x) over virtual adapters (172.x.x.x from WSL/Docker).
 * @returns {string} Best local IP address or 'localhost'
 */
export function getLocalIP() {
    const interfaces = os.networkInterfaces();
    /** @type {Array<{address: string, name: string, priority: number}>} */
    const candidates = [];

    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name] || []) {
            if (iface.family === 'IPv4' && !iface.internal) {
                candidates.push({
                    address: iface.address,
                    name,
                    priority: iface.address.startsWith('192.168.') ? 1 :
                        iface.address.startsWith('10.') ? 2 :
                            iface.address.startsWith('172.') ? 3 : 4
                });
            }
        }
    }

    candidates.sort((a, b) => a.priority - b.priority);
    return candidates.length > 0 ? candidates[0].address : 'localhost';
}

/**
 * Check if a request originates from the local network (same Wi-Fi).
 * Returns false for requests coming through external proxies/tunnels.
 *
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function isLocalRequest(req) {
    if (process.env.DISABLE_LAN_AUTH === 'true' || process.env.DISABLE_LAN_AUTH === '1') {
        return false;
    }

    // Check for proxy headers (Cloudflare, ngrok, etc.)
    if (req.headers && (req.headers['x-forwarded-for'] || req.headers['x-forwarded-host'] || req.headers['x-real-ip'])) {
        return false;
    }

    let ip = (req.ip || (req.socket && req.socket.remoteAddress) || '').trim();
    if (!ip) {
        return false;
    }

    // IPv6 localhost
    if (ip === '::1') {
        return true;
    }

    // Normalize IPv4-mapped IPv6 (::ffff:192.168.1.1 -> 192.168.1.1)
    if (ip.startsWith('::ffff:')) {
        ip = ip.slice(7);
    }

    // IPv4 localhost
    if (ip === '127.0.0.1') {
        return true;
    }

    // Strictly validate and parse IPv4 octets per RFC 1918
    const match = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (!match) {
        return false;
    }

    const parts = match.slice(1).map(Number);
    if (!parts.every(p => p >= 0 && p <= 255)) {
        return false;
    }

    // 10.0.0.0/8
    if (parts[0] === 10) {
        return true;
    }

    // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
        return true;
    }

    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) {
        return true;
    }

    return false;
}

/**
 * HTTP GET JSON — lightweight helper without external dependencies.
 *
 * @param {string} url - URL to fetch
 * @returns {Promise<any>} Parsed JSON response
 */
export function getJson(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

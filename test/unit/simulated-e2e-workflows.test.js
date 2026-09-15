import { describe, it, expect } from 'vitest';
import { isLocalRequest } from '../../src/utils/network.js';
import { resolveWorkspacePath, terminalManager, pruneUploadsDirectory } from '../../src/utils/workspace.js';
import { withSendLock, safeTimingCompare } from '../../src/server.js';
import { hashString } from '../../src/utils/hash.js';
import { quotaService } from '../../src/quota-service.js';
import { CloudflareTunnelManager } from '../../scripts/cloudflare-tunnel.js';
import { PinggyTunnelManager } from '../../scripts/pinggy-tunnel.js';

describe('Simulated E2E Workflows & System Robustness Suite', () => {

    // ─────────────────────────────────────────────────────────────────
    // 1. Domaine 6 : Sécurité Réseau & Frontières IP (isLocalRequest)
    // ─────────────────────────────────────────────────────────────────
    describe('Domaine 6 — Contrôle d\'Accès Réseau (isLocalRequest)', () => {

        it('identifie correctement localhost (IPv4, IPv6, IPv4-mapped)', () => {
            expect(isLocalRequest({ headers: {}, ip: '127.0.0.1' })).toBe(true);
            expect(isLocalRequest({ headers: {}, ip: '::1' })).toBe(true);
            expect(isLocalRequest({ headers: {}, ip: '::ffff:127.0.0.1' })).toBe(true);
        });

        it('identifie correctement les plages privées 192.168.x.x et 10.x.x.x', () => {
            expect(isLocalRequest({ headers: {}, ip: '192.168.1.42' })).toBe(true);
            expect(isLocalRequest({ headers: {}, ip: '192.168.0.1' })).toBe(true);
            expect(isLocalRequest({ headers: {}, ip: '10.0.0.15' })).toBe(true);
            expect(isLocalRequest({ headers: {}, ip: '::ffff:192.168.1.5' })).toBe(true);
            expect(isLocalRequest({ headers: {}, ip: '::ffff:10.5.0.1' })).toBe(true);
        });

        it('rejette systématiquement toute requête comportant des en-têtes de proxy externe', () => {
            expect(isLocalRequest({ headers: { 'x-forwarded-for': '192.168.1.1' }, ip: '192.168.1.1' })).toBe(false);
            expect(isLocalRequest({ headers: { 'x-real-ip': '127.0.0.1' }, ip: '127.0.0.1' })).toBe(false);
            expect(isLocalRequest({ headers: { 'x-forwarded-host': 'tunnel.pinggy.io' }, ip: '127.0.0.1' })).toBe(false);
        });

        it('rejette les IP publiques Internet évidentes', () => {
            expect(isLocalRequest({ headers: {}, ip: '8.8.8.8' })).toBe(false);
            expect(isLocalRequest({ headers: {}, ip: '1.1.1.1' })).toBe(false);
            expect(isLocalRequest({ headers: {}, ip: '93.184.216.34' })).toBe(false);
        });

        it('confine strictement la plage RFC1918 172.16.0.0/12 et bloque les fuites 172.217/172.32 (Ticket TICKET-DOM06-001)', () => {
            // Plages privées légitimes RFC1918 (172.16.0.0 -> 172.31.255.255)
            expect(isLocalRequest({ headers: {}, ip: '172.16.0.1' })).toBe(true);
            expect(isLocalRequest({ headers: {}, ip: '172.20.10.5' })).toBe(true);
            expect(isLocalRequest({ headers: {}, ip: '172.31.255.254' })).toBe(true);
            
            // Validation de la correction TICKET-DOM06-001 :
            // Bloque 172.217.x.x (IP publique Google) et 172.32.x.x (hors /12)
            expect(isLocalRequest({ headers: {}, ip: '172.217.16.1' })).toBe(false);
            expect(isLocalRequest({ headers: {}, ip: '172.32.0.1' })).toBe(false);
            expect(isLocalRequest({ headers: {}, ip: '172.15.255.255' })).toBe(false);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // 2. Domaine 7 : Confinement du Workspace (resolveWorkspacePath)
    // ─────────────────────────────────────────────────────────────────
    describe('Domaine 7 — Confinement du Workspace (resolveWorkspacePath)', () => {

        it('résout correctement les chemins relatifs légitimes à l\'intérieur du workspace', () => {
            const result = resolveWorkspacePath('src/server.js');
            expect(result.absolute).toContain('src/server.js');
            expect(result.relativePath).toBe('src/server.js');
        });

        it('bloque formellement les tentatives de traversée de répertoire avec ../', () => {
            expect(() => {
                resolveWorkspacePath('../../../../../etc/passwd');
            }).toThrow(/escapes the configured workspace root/);
        });

        it('bloque les tentatives de ciblage de répertoires système absolus', () => {
            expect(() => {
                resolveWorkspacePath('/etc/shadow');
            }).toThrow(/escapes the configured workspace root/);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // 3. Domaine 7 : Cycle de Vie du Terminal (TerminalManager)
    // ─────────────────────────────────────────────────────────────────
    describe('Domaine 7 — Exécution et Cycle de Vie Terminal', () => {

        it('rejette les commandes vides ou composées uniquement d\'espaces', async () => {
            await expect(terminalManager.run('')).rejects.toThrow('Command is required');
            await expect(terminalManager.run('   ')).rejects.toThrow('Command is required');
        });

        it('exécute une commande shell simple et capture les flux de sortie', async () => {
            const state = await terminalManager.run('echo "omni-audit-test"');
            expect(state.command).toBe('echo "omni-audit-test"');
            expect(state.startedAt).toBeTruthy();

            // Attendre la fermeture du processus
            await new Promise((resolve) => {
                if (!terminalManager.getState().active) return resolve(true);
                terminalManager.once('exit', () => resolve(true));
            });

            const finalState = terminalManager.getState();
            expect(finalState.active).toBe(false);
            expect(finalState.exitCode).toBe(0);
            expect(finalState.logs.some(l => l.text.includes('omni-audit-test'))).toBe(true);
        });

        it('interrompt proprement une commande active via stop()', async () => {
            // Lancer une commande longue
            const runPromise = terminalManager.run('sleep 30');
            expect(terminalManager.getState().active).toBe(true);

            // Arrêter le terminal
            const stopResult = await terminalManager.stop();
            expect(stopResult.success).toBe(true);

            // Vérifier que le statut n'est plus actif après arrêt
            await new Promise((resolve) => setTimeout(resolve, 100));
            expect(terminalManager.getState().active).toBe(false);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // 4. Domaine 2 : Concurrence et Sérialisation Send-Lock
    // ─────────────────────────────────────────────────────────────────
    describe('Domaine 2 — Concurrence Send-Lock & Ordonnancement', () => {

        it('sérialise rigoureusement plusieurs opérations asynchrones simultanées', async () => {
            const executionOrder = [];

            const op1 = withSendLock(async () => {
                await new Promise(r => setTimeout(r, 50));
                executionOrder.push('op1');
                return 1;
            });

            const op2 = withSendLock(async () => {
                await new Promise(r => setTimeout(r, 20));
                executionOrder.push('op2');
                return 2;
            });

            const op3 = withSendLock(async () => {
                executionOrder.push('op3');
                return 3;
            });

            const results = await Promise.all([op1, op2, op3]);

            expect(results).toEqual([1, 2, 3]);
            // op1 doit impérativement avoir fini avant que op2 ne s'exécute, malgré le timeout plus court de op2
            expect(executionOrder).toEqual(['op1', 'op2', 'op3']);
        });

        it('ne bloque pas la chaîne d\'exécution en cas d\'échec d\'une opération intermédiaire', async () => {
            const executionLog = [];

            const failingOp = withSendLock(async () => {
                executionLog.push('fail-start');
                throw new Error('Erreur simulée');
            });

            const succeedingOp = withSendLock(async () => {
                executionLog.push('success');
                return 'ok';
            });

            const failedOutcome = await failingOp;
            expect(failedOutcome.threw).toBeDefined();
            expect(failedOutcome.threw.message).toBe('Erreur simulée');

            const result = await succeedingOp;
            expect(result).toBe('ok');
            expect(executionLog).toEqual(['fail-start', 'success']);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // 5. Domaine 5 : Empreinte de Diffing DOM (hashString)
    // ─────────────────────────────────────────────────────────────────
    describe('Domaine 5 — Détection Différentielle de Snapshot (djb2)', () => {

        it('produit un hash identique pour le même contenu de snapshot', () => {
            const dom1 = '<div class="chat-message"><p>Bonjour Antigravity</p></div>';
            const dom2 = '<div class="chat-message"><p>Bonjour Antigravity</p></div>';
            expect(hashString(dom1)).toBe(hashString(dom2));
        });

        it('détecte instantanément une mutation du DOM', () => {
            const domOriginal = '<div class="chat-message"><p>Étape 1</p></div>';
            const domModified = '<div class="chat-message"><p>Étape 2</p></div>';
            expect(hashString(domOriginal)).not.toBe(hashString(domModified));
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // 6. Domaine 9 : Dégradation Gracieuse Quota Service
    // ─────────────────────────────────────────────────────────────────
    describe('Domaine 9 — Résilience Hors-Ligne Quota Service', () => {

        it('renvoie un état par défaut sans lever d\'exception non interceptée si le service est injoignable', () => {
            const quota = quotaService.getSummary();
            expect(quota).toBeDefined();
            expect(typeof quota.available).toBe('boolean');
            expect(quota.models).toBeDefined();
            expect(Array.isArray(quota.models)).toBe(true);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // 7. Domaine 6 : Comparaison Constante en Temps (safeTimingCompare)
    // ─────────────────────────────────────────────────────────────────
    describe('Domaine 6 — Protection contre les Attaques Temporelles (safeTimingCompare)', () => {

        it('valide des chaînes strictement identiques et rejette les disparités', () => {
            expect(safeTimingCompare('MonMotDePasseSecret123', 'MonMotDePasseSecret123')).toBe(true);
            expect(safeTimingCompare('MonMotDePasseSecret123', 'MonMotDePasseSecret124')).toBe(false);
            expect(safeTimingCompare('court', 'tresTresLongMotDePasse')).toBe(false);
        });

        it('gère gracieusement les types invalides ou manquants sans planter', () => {
            expect(safeTimingCompare(null, 'secret')).toBe(false);
            expect(safeTimingCompare(undefined, undefined)).toBe(false);
            expect(safeTimingCompare(12345, 12345)).toBe(false);
            expect(safeTimingCompare({}, 'secret')).toBe(false);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // 8. Domaine 8 : Politique de Rétention des Fichiers Téléversés
    // ─────────────────────────────────────────────────────────────────
    describe('Domaine 8 — Auto-purge & Rétention des Uploads (pruneUploadsDirectory)', () => {

        it('exécute l\'analyse et la purge sans lever d\'erreur', async () => {
            const result = await pruneUploadsDirectory({ maxAgeDays: 30, maxTotalBytes: 1024 * 1024 * 500 });
            expect(result).toBeDefined();
            expect(typeof result.deletedCount).toBe('number');
            expect(typeof result.deletedBytes).toBe('number');
            expect(result.deletedCount).toBeGreaterThanOrEqual(0);
        });
    });

    // ─────────────────────────────────────────────────────────────────
    // 9. Domaine 13 : Nettoyage Préalable des Processus Tunnels Orphelins
    // ─────────────────────────────────────────────────────────────────
    describe('Domaine 13 — Résilience des Tunnels & Processus Orphelins', () => {

        it('CloudflareTunnelManager et PinggyTunnelManager exposent cleanupOrphans() sans planter', async () => {
            expect(typeof CloudflareTunnelManager.cleanupOrphans).toBe('function');
            expect(typeof PinggyTunnelManager.cleanupOrphans).toBe('function');
            await expect(CloudflareTunnelManager.cleanupOrphans()).resolves.toBeUndefined();
            await expect(PinggyTunnelManager.cleanupOrphans()).resolves.toBeUndefined();
        });
    });
});


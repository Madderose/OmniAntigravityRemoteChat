# TICKET-DOM06-001: Contournement d'Authentification LAN sur Plages IP Publiques 172.x

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM06-001` |
| **Domaine** | Domaine 6 — Authentification, Contrôle d'Accès & Sécurité Réseau |
| **Package ID** | `PKG-06` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `OPEN` |
| **Sévérité** | `P0 (Bloquant / Sécurité Critique)` |
| **Catégorie** | `SECURITY` |
| **Fichier(s) Concerné(s)** | `src/utils/network.js:59-63`, `src/server.js:3428` |
| **Suite(s) de Tests Liée(s)** | `test/unit/network.test.js`, `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/utils/network.js`, la fonction `isLocalRequest(req)` est utilisée par le middleware d'authentification de `src/server.js` pour dispenser les appareils connectés sur le Wi-Fi local de renseigner le mot de passe (`APP_PASSWORD`).

Cependant, l'implémentation actuelle vérifie l'adresse IP via des préfixes de chaînes incomplets :
```javascript
ip.startsWith('172.16.') || ip.startsWith('172.17.') ||
ip.startsWith('172.18.') || ip.startsWith('172.19.') ||
ip.startsWith('172.2') || ip.startsWith('172.3')
```
- `ip.startsWith('172.2')` correspond à `172.20.0.0` à `172.29.255.255`, mais autorise également **`172.200.x.x`**, **`172.217.x.x`** (plage publique appartenant notamment à Google) ou tout sous-réseau public démarrant par `172.2`.
- `ip.startsWith('172.3')` autorise `172.30.x.x` et `172.31.x.x`, mais valide aussi par erreur **`172.32.0.0`** à **`172.39.255.255`** qui sont des adresses routables sur l'Internet public.
- De surcroît, les notations IPv4-mapped IPv6 pour `172.` (`::ffff:172.16.x.x`) sont complètement absentes du filtre.

- **Comportement Attendu** : Seules les plages strictement privées au sens de la RFC 1918 (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`) et localhost (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`) doivent être exemptées si l'auto-auth LAN est active.
- **Comportement Actuel** : Des clients distants provenant d'adresses IP publiques spécifiques peuvent bypasser l'authentification et obtenir un accès total à la console de commande et au terminal distant !
- **Impact Applicatif / Utilisateur** : Compromission critique de sécurité à distance (Remote Code Execution indirect via le terminal ou envoi de commandes CDP sans mot de passe).

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/utils/network.js:52-64
const ip = req.ip || req.socket.remoteAddress || '';

return ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') || ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') || ip.startsWith('172.19.') ||
    ip.startsWith('172.2') || ip.startsWith('172.3') ||
    ip.startsWith('::ffff:192.168.') ||
    ip.startsWith('::ffff:10.');
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Faible (nécessite uniquement un parseur d'IP rigoureux).
- **Effets de Bord Possibles** : Aucun sur les utilisateurs légitimes du réseau local.
- **Sécurité & Données** : Critique (P0). Exposition immédiate du terminal si le port 4747 est exposé sur Internet.

---

## 4. Recommandation / Plan de Correction Prescrit

1. **Normaliser l'adresse IP** : Retirer le préfixe `::ffff:` s'il est présent pour convertir toute adresse IPv4 mappée en IPv4 canonique.
2. **Parser rigoureusement les octets de l'IP** :
   - Extraire les octets : `const parts = cleanIp.split('.').map(Number);`
   - Pour `172.16.0.0/12` : vérifier `parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31`.
   - Pour `10.0.0.0/8` : `parts[0] === 10`.
   - Pour `192.168.0.0/16` : `parts[0] === 192 && parts[1] === 168`.
3. **Fournir un flag d'environnement** permettant de désactiver complètement le bypass LAN (`DISABLE_LAN_AUTH=true`) pour les environnements de production ou serveurs cloud.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire (Vitest)** :
  - Ajouter dans `test/unit/network.test.js` des assertions rejetant `172.217.16.1`, `172.32.0.1`, `172.200.1.1`.
  - Valider l'acceptation de `172.20.0.1`, `172.31.255.254` et `::ffff:172.16.0.5`.
- **Scénario E2E Simulé** :
  - `SIM-DOM06-01` : Envoyer une requête HTTP GET `/api/terminal/history` avec une IP cliente simulée `172.217.0.1` sans cookie d'authentification et vérifier la réponse `401 Unauthorized`.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Détection de la vulnérabilité et rédaction du ticket | `OPEN` |

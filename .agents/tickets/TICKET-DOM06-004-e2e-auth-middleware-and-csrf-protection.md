# TICKET-DOM06-004: Couverture E2E Automatisée de la Protection Auth des 60+ Routes

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM06-004` |
| **Domaine** | Domaine 6 — Authentification, Contrôle d'Accès & Sécurité Réseau |
| **Package ID** | `PKG-06` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P2 (Normal / Sécurité & Audit)` |
| **Catégorie** | `E2E_GAP` |
| **Fichier(s) Concerné(s)** | `src/server.js:3580-3605` |
| **Suite(s) de Tests Liée(s)** | `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/server.js`, le middleware d'authentification intercepte les requêtes pour exiger un cookie `omni_ag_auth` signé ou une clé `?key=...`.
Auparavant, les requêtes API vers `/api/*` ne comportant pas l'en-tête `Accept: application/json` étaient redirigées vers `/login.html` au lieu de renvoyer un code `401 Unauthorized` JSON formel.
De plus, aucune suite de tests ne validait la protection systématique de l'arbre des routes.

- **Comportement Attendu** : Toute requête API sans session valide doit renvoyer formellement un `401 Unauthorized` avec corps JSON `{ error: 'Unauthorized' }`.
- **Comportement Actuel** : Incohérence possible entre redirection HTML et statut JSON selon les en-têtes HTTP de la requête cliente.
- **Impact Applicatif / Utilisateur** : Échec silencieux ou parsing HTML inopiné sur les clients API et automatisations mobiles.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/server.js:3588-3595
if (req.xhr || req.headers.accept?.includes('json') || req.path.startsWith('/api/') || req.path.startsWith('/snapshot') || req.path.startsWith('/send') || req.path.startsWith('/remote-') || req.path.startsWith('/select-') || req.path.startsWith('/new-chat') || req.path.startsWith('/chat-') || req.path.startsWith('/app-state') || req.path.startsWith('/cdp-')) {
    return res.status(401).json({ error: 'Unauthorized' });
} else {
    return res.redirect('/login.html');
}
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Sécurité & Données** : Renforce la cohérence du protocole HTTP et évite le contournement des réponses d'erreur API.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Étendre la condition du middleware à tous les préfixes `/api/`, `/cdp-`, `/remote-`, `/select-`, `/new-chat`, `/chat-`, `/app-state`.

---

## 5. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Signalement du comportement divergent et création du ticket | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Extension de la garde JSON à toutes les routes d'API et validation des réponses d'erreur | `RESOLVED` |

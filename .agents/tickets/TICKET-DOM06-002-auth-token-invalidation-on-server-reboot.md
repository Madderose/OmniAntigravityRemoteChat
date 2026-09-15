# TICKET-DOM06-002: Déconnexion Brutale des Clients Mobiles par Régénération de AUTH_TOKEN au Reboot

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM06-002` |
| **Domaine** | Domaine 6 — Authentification, Contrôle d'Accès & Sécurité Réseau |
| **Package ID** | `PKG-06` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `OPEN` |
| **Sévérité** | `P1 (Majeur / Ergonomie & Persistance Session)` |
| **Catégorie** | `BUG` |
| **Fichier(s) Concerné(s)` | `src/server.js:3389` |
| **Suite(s) de Tests Liée(s)` | `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/server.js`, lors du démarrage du serveur, le jeton d'authentification valide `AUTH_TOKEN` est initialisé de la façon suivante :
```javascript
AUTH_TOKEN = hashString(APP_PASSWORD + AUTH_SALT + Date.now().toString());
```
Ce jeton est ensuite déposé sous forme de cookie HTTP signed (`omni_ag_auth`) sur le navigateur mobile du client avec une durée de validité déclarée de 30 jours (`maxAge: 30 * 24 * 60 * 60 * 1000`).

Cependant, comme `Date.now().toString()` est incorporé dans le hash, **chaque redémarrage du serveur Node.js** (reboot système, crash temporaire, mise à jour, ou redémarrage de dev) recalcule une nouvelle valeur d'AUTH_TOKEN.
Conséquence immédiate : tous les cookies préalablement distribués aux téléphones portables et tablettes des utilisateurs deviennent instantanément invalides. L'utilisateur mobile distant qui avait configuré sa PWA ou son onglet de commande se retrouve rejeté vers la page de login à chaque redémarrage du serveur hôte !

- **Comportement Attendu** : La persistance de session doit être déterministe basée sur `APP_PASSWORD` et un secret persistant (ex: `AUTH_SALT` ou un fichier de session locale), pour survivre aux redémarrages serveur sans compromettre la sécurité.
- **Comportement Actuel** : Invalidations inopinées des sessions mobiles à chaque redémarrage.
- **Impact Applicatif / Utilisateur** : Dégradation sévère de l'expérience utilisateur mobile (rupture de la persistance PWA).

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/server.js:3389
// Régénération non persistante à chaque initialisation
AUTH_TOKEN = hashString(APP_PASSWORD + AUTH_SALT + Date.now().toString());
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Faible.
- **Sécurité & Données** : Un sel persistant stocké dans `data/session.secret` ou dérivé de façon cryptographique préserve l'étanchéité tout en assurant la persistance.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Si `AUTH_SALT` est explicitement fourni dans `.env`, générer `AUTH_TOKEN = hashString(APP_PASSWORD + AUTH_SALT)`.
2. Si `AUTH_SALT` n'est pas fourni, persister un sel aléatoire généré une seule fois dans un fichier `data/.auth_salt` (protégé par des permissions 0600).
3. Ne plus inclure `Date.now()` dans la dérivation du jeton de session principal.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire & E2E Simulé** :
  - Simuler un premier démarrage, calculer le token émis.
  - Simuler un redémarrage avec la même configuration d'environnement.
  - Vérifier que le cookie précédemment émis reste valide et accepté par le middleware auth.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Identification du problème de persistance de session et ouverture du ticket | `OPEN` |

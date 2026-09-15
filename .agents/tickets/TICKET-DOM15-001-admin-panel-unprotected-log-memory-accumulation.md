# TICKET-DOM15-001: Croissance Non Bornée des Logs Serveur en Mémoire dans serverLogs

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM15-001` |
| **Domaine** | Domaine 15 — Panneau d'Administration, Métriques & Observabilité |
| **Package ID** | `PKG-15` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `OPEN` |
| **Sévérité** | `P2 (Normal / Performance & Empreinte Mémoire)` |
| **Catégorie** | `PERF` |
| **Fichier(s) Concerné(s)` | `src/server.js:4600-4640`, `src/state.js` |
| **Suite(s) de Tests Liée(s)` | `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/server.js`, les événements serveur, requêtes HTTP et avertissements CDP sont poussés dans un tableau en mémoire `serverLogs = []` accessible via l'endpoint `GET /api/admin/logs`.
Bien qu'une limite de troncature existe à 1000 entrées, chaque objet log contient un message brut, des traces de stack d'erreur ou des objets JSON volumineux.
Sur une session prolongée de plusieurs jours avec des reconnexions fréquentes, ce tableau accumule plusieurs mégaoctets de données non compactées dans le heap Node.js.

- **Comportement Attendu** : Compactage régulier des entrées de log et limitation stricte de la taille maximale en octets ou limitation à 200 lignes récentes.
- **Comportement Actuel** : Tampon mémoire non borné en volume binaire.
- **Impact Applicatif / Utilisateur** : Gonflement progressif de la mémoire du processus serveur.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/server.js:4600-4615
function logServerEvent(level, message, meta) {
    serverLogs.push({ timestamp: new Date().toISOString(), level, message, meta });
    if (serverLogs.length > 1000) serverLogs.shift();
}
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Performance** : Stabilisation de la mémoire résidente (RSS).

---

## 4. Recommandation / Plan de Correction Prescrit

1. Abaisser la limite par défaut à 300 entrées maximum.
2. Tronquer les messages et les métadonnées dépassant 1 Ko.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire & E2E Simulé** :
  - Injecter 500 messages de log consécutifs.
  - Vérifier que `serverLogs.length` ne dépasse pas la limite et que les objets sont correctement élagués.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Audit de l'observabilité et rédaction du ticket | `OPEN` |

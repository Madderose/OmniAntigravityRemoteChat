# TICKET-DOM10-001: Risque de Concurrence d'Écritures sur manifest.json dans Screenshot Timeline

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM10-001` |
| **Domaine** | Domaine 10 — Timeline de Captures d'Écran & Archivage sur Disque |
| **Package ID** | `PKG-10` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P1 (Majeur / Concurrence & Intégrité Données)` |
| **Catégorie** | `CONCURRENCY` |
| **Fichier(s) Concerné(s)` | `src/screenshot-timeline.js:145-180` |
| **Suite(s) de Tests Liée(s)` | `test/unit/screenshot-timeline.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/screenshot-timeline.js`, chaque capture d'écran met à jour la liste des métadonnées et persiste le tableau complet dans `data/screenshots/manifest.json` via `fsp.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2))`.
Si deux captures interviennent de manière rapprochée (par exemple déclenchement manuel via `/api/timeline/capture` pendant qu'une capture automatique de diff DOM est en cours de traitement), les deux opérations concurrentes lisent le manifeste, y ajoutent leur entrée respective et écrivent en parallèle sur le même fichier.
La dernière écriture écrase la précédente sans fusion atomique, provoquant la perte de métadonnées d'une des captures ou une corruption partielle du JSON si l'écriture est interrompue.

- **Comportement Attendu** : La mise à jour et l'écriture de `manifest.json` doivent être sérialisées par un verrou de promesse atomique ou une écriture dans un fichier temporaire suivie d'un renommage atomique (`fsp.rename`).
- **Comportement Actuel** : Écritures directes sans verrouillage.
- **Impact Applicatif / Utilisateur** : Risque de corruption de la timeline de captures d'écran.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/screenshot-timeline.js:145-160
// Écriture directe fsp.writeFile sans atomic rename ni mutex
await fsp.writeFile(this.manifestPath, JSON.stringify(this.manifest, null, 2));
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Intégrité des Données** : Élimination des corruptions de fichiers sur disque.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Écrire dans `${this.manifestPath}.tmp` puis exécuter `await fsp.rename(tmpPath, this.manifestPath)`.
2. Sérialiser les captures d'écran via une file de promesse d'écriture unique.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire (Vitest)** :
  - Lancer 5 captures d'écran asynchrones simultanées.
  - Vérifier que `manifest.json` contient exactement 5 entrées valides sans erreur de parsing JSON.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Détection du risque d'écritures concurrentes et création du ticket | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Correction appliquée et validée par les suites de tests unitaires et d'intégration | `RESOLVED` |

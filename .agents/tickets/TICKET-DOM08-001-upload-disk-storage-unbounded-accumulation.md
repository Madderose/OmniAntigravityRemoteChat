# TICKET-DOM08-001: Accumulation Non Bornée des Fichiers Uploadés dans data/uploads

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM08-001` |
| **Domaine** | Domaine 8 — Téléchargement & Traitement Multimédia (Images/Audio) |
| **Package ID** | `PKG-08` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `OPEN` |
| **Sévérité** | `P2 (Normal / Rétention & Saturation Disque)` |
| **Catégorie** | `TECH_DEBT` |
| **Fichier(s) Concerné(s)` | `src/utils/workspace.js:356-445` |
| **Suite(s) de Tests Liée(s)` | `test/unit/upload-media.test.js`, `test/unit/upload-audio.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/utils/workspace.js`, les fonctions `saveUploadedImage` et `saveUploadedAudio` sauvegardent chaque média envoyé depuis le mobile dans le dossier local `data/uploads/` avec un préfixe horodaté : `${Date.now()}-${safeBaseName}`.
L'application ne comporte **aucun mécanisme d'élagage automatique (pruning)**, de limite maximale de taille cumulée du dossier, ni de politique de rétention temporelle (TTL).
Au fil de l'utilisation continue de l'application (mémos vocaux de 15 Mo, captures d'écran, schémas UI), le dossier `data/uploads/` peut accumuler plusieurs gigaoctets de données temporaires et saturer l'espace disque de la machine hôte.

- **Comportement Attendu** : Une politique de rétention (ex: suppression des uploads vieux de plus de 7 jours ou quota global de 500 Mo en FIFO) doit être mise en œuvre.
- **Comportement Actuel** : Accumulation infinie de tous les fichiers créés.
- **Impact Applicatif / Utilisateur** : Risque de saturation disque à long terme.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/utils/workspace.js:374-377
const fileName = `${Date.now()}-${safeBaseName}${safeBaseName.endsWith(extension) ? '' : extension}`;
const buffer = Buffer.from(input.data, 'base64');
const absolutePath = join(UPLOADS_DIR, fileName);
await fsp.writeFile(absolutePath, buffer);
// Absence d'appel à un cleaner ou rotateur de fichiers
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Sécurité & Données** : Saturation de stockage Denial of Service (DoS disque).

---

## 4. Recommandation / Plan de Correction Prescrit

1. Créer une fonction de maintenance périodique `pruneUploadsDirectory({ maxAgeDays = 7, maxTotalBytes = 500 * 1024 * 1024 })`.
2. L'exécuter au démarrage du serveur et après chaque téléversement.

---

## 5. Stratégie de Test E2E & Automatisation

- **Test Unitaire (Vitest)** :
  - Créer des fichiers de test avec horodatages artificiellement anciens.
  - Exécuter la fonction d'élagage et vérifier la suppression sélective des fichiers expirés.

---

## 6. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Analyse de stockage et rédaction du ticket | `OPEN` |

# TICKET-DOM08-002: Validation E2E du Rejet des Fichiers > 15 Mo et Contrôle MIME

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM08-002` |
| **Domaine** | Domaine 8 — Téléchargement & Traitement Multimédia |
| **Package ID** | `PKG-08` |
| **Date Création** | 2026-09-15 |
| **Rapporteur (Agent)** | OmniAuditor |
| **Statut** | `RESOLVED` |
| **Sévérité** | `P2 (Normal / Robustesse Stockage)` |
| **Catégorie** | `E2E_GAP` |
| **Fichier(s) Concerné(s)** | `src/utils/workspace.js:395-440` |
| **Suite(s) de Tests Liée(s)** | `test/unit/simulated-e2e-workflows.test.js` |

---

## 1. Description du Problème / Constat 360°

Dans `src/utils/workspace.js`, la méthode `saveUploadedAudio` disposait d'une borne maximale de 15 Mo (`MAX_AUDIO_BYTES`), mais la méthode `saveUploadedImage` ne bornait pas la taille maximale des images encodées en base64 ni les types MIME non-image, ce qui exposait le serveur à l'épuisement mémoire (`heap out of memory`) sous téléversement malveillant.

- **Comportement Attendu** : Les images et mémos vocaux doivent être limités à 15 Mo et filtrés sur une liste blanche stricte de types MIME (`ALLOWED_IMAGE_MIME_TYPES`, `ALLOWED_AUDIO_MIME_TYPES`).
- **Comportement Actuel** : Images non bornées en taille ni contrôlées sur le MIME.
- **Impact Applicatif / Utilisateur** : Risque de plantage du serveur Node.js lors de l'upload d'images géantes.

---

## 2. Preuve & Emplacement dans le Code (Code Snippet)

```javascript
// Référence : src/utils/workspace.js:392-412
const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB limit
const ALLOWED_IMAGE_MIME_TYPES = new Set([
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif',
    'image/webp',
    'image/svg+xml'
]);
```

---

## 3. Analyse d'Écart & Évaluation des Risques

- **Risque de Régression** : Nul.
- **Sécurité & Données** : Prévention active du déni de service par saturation mémoire.

---

## 4. Recommandation / Plan de Correction Prescrit

1. Instaurer `MAX_IMAGE_BYTES` et `ALLOWED_IMAGE_MIME_TYPES` dans `saveUploadedImage`.
2. Couvrir par des tests unitaires et E2E le rejet franc des payloads invalides ou vides.

---

## 5. Journal de Suivi / Résolution

| Date | Agent / Développeur | Action effectuée | Statut |
|---|---|---|---|
| 2026-09-15 | OmniAuditor | Signalement de l'absence de borne d'image et création du ticket | `OPEN` |
| 2026-09-15 | Orchestrateur Squad | Implémentation du filtrage MIME et de la limite 15 Mo avec tests E2E automatisés | `RESOLVED` |

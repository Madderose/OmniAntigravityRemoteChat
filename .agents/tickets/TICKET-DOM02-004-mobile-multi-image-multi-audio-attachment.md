# TICKET-DOM02-004: Limitation à un seul fichier joint pour les images et audios sur mobile

---

| Champ | Valeur |
|---|---|
| **ID Ticket** | `TICKET-DOM02-004` |
| **Domaine** | Domaine 2 — Gestion des Échanges & Envois (Send Lock, Staging, Uploads) |
| **Package ID** | `PKG-02` |
| **Date Création** | 2026-09-16 |
| **Rapporteur (Agent)** | Antigravity Pair Programmer |
| **Statut** | `OPEN` |
| **Sévérité** | `P2 (Moyen/Évolution Ergonomique)` |
| **Catégorie** | `FEATURE` / `UX` |
| **Fichier(s) Concerné(s)** | `public/index.html:150-185`, `public/js/app.js:2830-2950`, `src/server.js:4200-4350` |
| **Suite(s) de Tests Liée(s)** | `test/unit/upload-image.test.js`, `test/unit/upload-audio.test.js`, `test/unit/native-audio-attachment.test.js` |

---

## 1. Description du Problème / Constat 360°

Sur l'interface mobile, l'utilisateur a constaté qu'il était impossible d'attacher plus d'une image ou plus d'un mémo vocal à la fois lors de la rédaction d'un message :
- Lorsqu'une photo ou capture est déjà sélectionnée dans la zone de staging (`stagedImage`), la sélection d'une seconde image écrase la première sans notification ni possibilité de cumuler les pièces jointes.
- De même, lorsqu'un mémo vocal vient d'être enregistré (`stagedAudio`), relancer un enregistrement audio remplace le mémo précédent.
- L'élément `<input type="file" id="imageInput">` dans `public/index.html` ne comporte pas l'attribut standard HTML `multiple`.
- Dans `public/js/app.js`, la gestion de l'état est scalaire (`let stagedImage = null;` et `let stagedAudio = null;`), au lieu d'un tableau d'éléments en attente (`stagedImages = []` et `stagedAudios = []`).

---

## 2. Emplacement dans le Code (Code Snippet)

Dans [public/index.html:155-165](file:///home/deck/Documents/OmniAntigravityRemoteChat/OmniAntigravityRemoteChat/public/index.html#L155-L165) :
```html
<input type="file" id="imageInput" accept="image/*" style="display: none" />
```

Dans [public/js/app.js](file:///home/deck/Documents/OmniAntigravityRemoteChat/OmniAntigravityRemoteChat/public/js/app.js) :
```javascript
let stagedImage = null;
let stagedAudio = null;
```

Dans [src/server.js](file:///home/deck/Documents/OmniAntigravityRemoteChat/OmniAntigravityRemoteChat/src/server.js) :
Les endpoints `/api/upload-image` et `/api/upload-audio` acceptent des payloads unitaires en base64 sans contrat multi-fichiers natif dans le même appel `/send`.

---

## 3. Analyse d'Écart & Spécifications de Correction

1. **Frontend HTML** :
   - Ajouter l'attribut `multiple` à `<input type="file" id="imageInput" accept="image/*" multiple />`.
   - Faire évoluer `#imagePreviewContainer` et `#audioPreviewContainer` pour afficher un carrousel / une grille de badges ou vignettes miniatures détachables individuellement avec un bouton `✕` pour chacune.
2. **Frontend JS (`public/js/app.js`)** :
   - Migrer de `stagedImage` / `stagedAudio` à `stagedImages: Array<{base64: string, name: string, mime: string}>` et `stagedAudios: Array<{blob: Blob, name: string, duration: number}>`.
   - Limiter le nombre de médias par envoi (ex: max 5 images et max 3 mémos vocaux) pour préserver la bande passante mobile et la mémoire de session.
3. **Backend (`src/server.js`)** :
   - Supporter l'upload batch ou les requêtes séquentielles dans `POST /send` via un tableau de chemins de fichiers transférés à injecter dans le prompt Antigravity IDE.

---

## 4. Plan de Validation & Tests

- **Test Unitaire** : Ajouter des tests dans `test/unit/upload-image.test.js` et `test/unit/upload-audio.test.js` validant le staging multiple et le respect des quotas de pièces jointes.
- **Vérification Manuelle** :
  - Sur mobile, sélectionner 3 photos successives : les 3 vignettes doivent apparaître côte à côte au-dessus de la barre de saisie.
  - Enregistrer 2 notes vocales successives : 2 badges de lecteurs audio doivent s'afficher avec possibilité de supprimer l'une d'entre elles.
  - Envoyer le message : le message Antigravity IDE reçoit les 5 pièces jointes avec leurs chemins absolus respectifs.

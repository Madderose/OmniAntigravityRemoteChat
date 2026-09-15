# Répertoire des Tickets d'Audit — OmniAntigravity Remote Chat

Ce répertoire héberge l'ensemble des tickets d'anomalies, de vulnérabilités, de dettes techniques et de lacunes de couverture de tests (E2E Gaps) identifiés lors des audits 360° du projet.

---

## 📂 Organisation & Conventions

- **Index Central** : [TICKETS_INDEX.md](file:///.agents/tickets/TICKETS_INDEX.md) récapitule l'état en temps réel de tous les tickets.
- **Modèle Obligatoire** : [TICKET_TEMPLATE.md](file:///.agents/tickets/TICKET_TEMPLATE.md) doit être respecté pour toute création.
- **Convention de Nommage** :
  `TICKET-[DOMXX]-[YYY]-[slug-descriptif].md`
  - `DOMXX` : Code du domaine (ex: `DOM01` pour Connexion CDP, `DOM06` pour Authentification/Sécurité).
  - `YYY` : Numéro séquentiel à 3 chiffres (ex: `001`, `002`).
  - `slug-descriptif` : 3 à 6 mots clés en minuscules séparés par des tirets.

---

## 🚦 Cycle de Vie d'un Ticket

1. **`OPEN`** : Ticket nouvellement créé, validé par l'audit mais non encore pris en charge pour correction.
2. **`IN_PROGRESS`** : En cours de résolution par un agent ou un développeur.
3. **`RESOLVED`** : Correctif implémenté, testé unitairement et vérifié via les suites automatisées.
4. **`WONTFIX`** : Classé sans suite (comportement intentionnel documenté ou contrainte externe insurmontable).

---

## 🏷️ Classification des Catégories

- `SECURITY` : Risque de sécurité, contournement d'authentification, fuite de secret, injection.
- `BUG` : Comportement erroné, exception non gérée, perte de données.
- `CONCURRENCY` : Risque de blocage, condition de concurrence, non-atomicité.
- `E2E_GAP` : Parcours utilisateur ou cas limite critique non couvert par les tests automatisés.
- `A11Y` : Défaut d'accessibilité mobile, navigation clavier, focus trap ou contrastes.
- `PERF` : Lenteur, boucle bloquante de CPU, fuite de mémoire ou surcharge réseau.
- `TECH_DEBT` : Redondance de code, typage manquant, obsolescence documentaire.

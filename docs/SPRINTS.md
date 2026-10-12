# Plan de développement

## V0.1 livrée

| Sprint | Périmètre                                             | Validation                                           |
| ------ | ----------------------------------------------------- | ---------------------------------------------------- |
| 1      | Next.js export statique, Tailwind, Dexie, projets     | Build et persistance des données                     |
| 2      | Réunions, observations, événements, timeline          | Observation suivie sur quatre réunions               |
| 3      | Photos originales, GPS, auteur, formulaires terrain   | Enregistrement GPS refusé, photos et historiques     |
| 4      | DOCX/PDF, suggestions validées, plans et repères      | Extraction, visualisation, zoom et coordonnées       |
| 5      | Snapshots, prompt Copilot, archives                   | Bilan figé, copie et remplacement, intégrité ZIP     |
| 6      | Icônes, service worker, GitHub Actions, documentation | Cache complet, sous-chemin Pages, reprise hors ligne |

## V0.2 proposée après essais terrain

- Compression optionnelle des photos et miniatures pré-calculées, sans perte silencieuse de l’original.
- Brouillons de saisie persistants pour résister à la fermeture de l’appareil pendant une note.
- Regroupement des lots et entreprises sous forme de listes propres au chantier.
- Repères déplaçables, changement de version de plan explicite, liens profonds vers les observations.
- Réconciliation de ZIP avec journal de conflits et identifiant d’appareil, uniquement après définition des règles métier.
- Qualification des suggestions Word par section, avec aperçu des tableaux.
- Mode de contraste renforcé et tests d’accessibilité complémentaires.

## V0.3 éventuelle

- OCR local si les PDF scannés sont fréquents ; mesurer poids des modèles et performances sur iPhone.
- Export fractionné / streaming pour grands chantiers.
- Export d’un dossier photographique légendé, sans générer un nouveau Word complet.

Aucun de ces sprints n’implique une base cloud ou une authentification.

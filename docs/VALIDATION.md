# Validation V0.1

## Contrôles automatisés exécutés

- Huit tests métier, tous réussis :
  - un point suivi sur quatre réunions jusqu’à sa clôture ;
  - absence de mutation partielle en cas de clôture sans motif ;
  - réunion clôturée non modifiable, une seule réunion active ;
  - ZIP avec photos, plans et repères, copie avec remappage et remplacement ;
  - rejet d’une archive altérée sans écriture ;
  - contrôle inchangé historisé et point non contrôlé explicite ;
  - extraction locale des candidats ouverts ;
  - séquence de suivi stable et refus d’une saisie périmée.
- TypeScript strict : compilation sans erreur.
- Build Next.js statique avec le chemin GitHub Pages `/moe-terrain/`.
- Essai navigateur Chromium 141 / Playwright 1.56.1 :
  - création projet et réunions ;
  - lecture d’un vrai conteneur DOCX et validation d’une proposition ;
  - sélection d’une vraie image via le champ fichier, stockage et présence dans le ZIP ;
  - position simulée avec précision ;
  - suivi et clôture avec historique ;
  - PDF de deux pages, repère, changement de page et zoom ;
  - export et import dans un deuxième espace de stockage indépendant ;
  - reprise hors ligne avec historique, photo et plan ;
  - affichage à 390 px sans débordement horizontal de la page ;
  - aucune erreur JavaScript non interceptée pendant ce parcours.

Les captures utilisées pour contrôler l’interface restent des fichiers de test ; elles ne contiennent pas de données de chantier réelles et ne sont pas des livrables du projet.

## Ce qui reste à valider sur appareils réels

Ces contrôles n’ont pas été exécutés sur un iPhone ou un Android physique dans cet environnement.

| Appareil                                   | Scénario à effectuer                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| iPhone, Safari puis application installée  | ajout à l’écran d’accueil, retour après verrouillage, appareil photo, export vers Fichiers |
| Android, Chrome puis application installée | permissions caméra/GPS, capture photo, retour hors ligne, téléchargement ZIP               |
| Windows, Edge ou Chrome                    | installation, gros plans PDF, import du ZIP téléphone, presse-papier vers Word             |
| Tous                                       | refus GPS, absence de signal en galerie, manque d’espace, export de sauvegarde             |

Tester d’abord un chantier fictif avant une réunion réelle. Garder le compte-rendu Word et un ZIP de sauvegarde indépendants.

## Limites connues

- Les PDF scannés n’ont pas d’OCR.
- Les suggestions de points ouverts nécessitent une lecture humaine du contexte.
- La conversion de photos HEIC n’est pas intégrée ; l’original est conservé si l’aperçu échoue.
- Les saisies non enregistrées ne sont pas des brouillons persistants.
- Les dates et l’auteur proviennent de l’appareil et de la saisie locale, sans certification.
- La position d’une photo de galerie est celle du lieu où elle est ajoutée.
- Les transferts sont manuels, sans fusion multi-appareil.
- Les tests d’installation physique, de capacité mémoire maximale et l’exécution réelle dans Word Copilot restent à faire.
- La validation visuelle ne constitue pas un audit complet WCAG. Les boutons principaux utilisent un turquoise foncé avec un contraste texte blanc supérieur à 4,5:1 ; certaines métadonnées secondaires restent volontairement discrètes.

## Reproduire les essais

```bash
npm ci
npm test
npm run typecheck
```

```bash
# Bash : build de test GitHub Pages
NEXT_PUBLIC_BASE_PATH=/moe-terrain npm run build
npx playwright install chromium
node scripts/browser-smoke.mjs
```

Le test démarre un serveur de fichiers uniquement pour l’essai. Le GPS est simulé et les fichiers sont fictifs. Sur Windows, définir `NEXT_PUBLIC_BASE_PATH` via PowerShell comme indiqué dans le README.

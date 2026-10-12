# MOE Terrain — V0.1.1

**Mise à jour :** [corrections et installation 0.1.1](docs/MISE_A_JOUR_0.1.1.md). Réouverture des réunions, corbeille et export renforcé.

Une mémoire locale du chantier : réunions, observations durables, photos, GPS, plans PDF et prompt de mise à jour du compte-rendu Word existant.

**Word reste la référence officielle. Aucun nouveau document Word n’est généré.**

## Démarrage rapide

Installer Node.js 24 LTS, puis ouvrir un terminal dans le dossier contenant `package.json` :

```bash
npm ci
npm run dev
```

Ouvrir `http://localhost:3000`. Le serveur de développement sert uniquement à développer : le mode hors ligne complet est préparé lors du build de production.

```bash
npm test
npm run typecheck
npm run build
npm start
```

`npm start` sert les fichiers statiques de `out/`, sans API ni serveur applicatif Next.js. Les données restent dans le navigateur.

## GitHub Pages

Le guide pas à pas est dans [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md).

Le workflow `.github/workflows/pages.yml` construit et publie le site à chaque push sur `main`. Il détecte le nom du dépôt et configure automatiquement le chemin de publication. Activer **Settings → Pages → Source → GitHub Actions**.

Pour un build manuel avec le dépôt `moe-terrain` :

```bash
# Bash
NEXT_PUBLIC_BASE_PATH=/moe-terrain npm run build
```

```powershell
# PowerShell
$env:NEXT_PUBLIC_BASE_PATH="/moe-terrain"
npm run build
```

Un domaine personnalisé utilise un chemin vide : adapter le workflow en conséquence. Ne pas mélanger les builds `/moe-terrain` et `/` sur une même installation.

## Fonctionnement

1. Créer un projet et renseigner l’auteur local dans les préférences.
2. Créer une réunion. Les points ouverts sont repris dans « À contrôler ».
3. Importer éventuellement un DOCX ou PDF textuel ; vérifier les propositions et les rattacher aux observations.
4. Ajouter les constats, photos et suivis. Le GPS est demandé à l’enregistrement, sans empêcher la saisie si indisponible.
5. Importer les plans PDF et placer les repères d’observations.
6. Clôturer la réunion et renseigner le marqueur exact placé dans le Word existant.
7. Copier le prompt dans Word Copilot. Fournir les photos à Word séparément.
8. Exporter le ZIP pour sauvegarder ou transférer vers le PC.

## Données locales

- IndexedDB via Dexie, fichiers stockés en Blob.
- Pas de compte, authentification, API, télémétrie applicative ou synchronisation.
- Les ressources de l’application sont servies par GitHub Pages lors de l’installation et des mises à jour ; GitHub peut journaliser ces requêtes techniques. Les données chantier ne sont pas envoyées par l’application.
- Les ZIP peuvent contenir des informations confidentielles. Les transferts externes et l’utilisation de Copilot sont des actions manuelles.
- Exporter après chaque réunion. Une suppression des données du navigateur ou un changement d’adresse peut rendre les données locales indisponibles.
- L’application n’ajoute pas de chiffrement au stockage local ni au ZIP.

## Identité visuelle

- `public/branding/naldeo-white.png` : logo fourni, conservé intact.
- `public/icons/icon.svg` : source vectorielle originale de l’icône MOE Terrain.
- `icon-512.png`, `icon-192.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon.png` : variantes installables.
- `npm run icons` : régénération locale des variantes.
- Palette : bleu `#1D2D44`, turquoise `#38ABAE`, vert `#57CC99`.
- Calibri si disponible, puis Segoe UI et Arial. Aucune police chargée depuis un CDN.

Le logo NALDEO est un actif de marque fourni pour ce projet ; aucun droit supplémentaire n’est attribué par ce dépôt.

## Vérifications

```bash
npm test
npm run typecheck
npm run build
```

Test navigateur Chromium (build au chemin `/moe-terrain`) :

```bash
npx playwright install chromium
node scripts/browser-smoke.mjs
```

Le test démarre son propre serveur statique sur le port 4318. Le guide de validation précise les contrôles restant à effectuer sur appareils réels.

## Limites explicites de la V0.1

- PDF.js est fixé à 5.4.149 pour la compatibilité testée ; worker, polices, CMaps et décodeurs sont embarqués.
- Pas d’OCR pour les PDF scannés.
- Extraction des points ouverts par règles, à valider ; les tableaux DOCX peuvent perdre leur structure.
- Plusieurs réunions peuvent être ouvertes pour corriger une réunion antérieure. La réouverture archive l’ancien bilan avant de permettre une nouvelle clôture.
- Pas de fusion de travaux parallèles : nouvelle importation, copie ou remplacement sauvegardé.
- Photos originales conservées, sans conversion HEIC ni compression automatique. Un format non décodable reste téléchargeable.
- Pas de miniatures pré-calculées : chargement différé des aperçus.
- Position GPS de l’appareil au moment de l’ajout ; pas d’extraction GPS/date EXIF.
- Pas de suivi GPS en arrière-plan ni de certitude de date de prise de vue des fichiers de galerie.
- Photos limitées à 30 Mo, documents/plans à 50 Mo ; ZIP importé à 250 Mo et contenu exporté à 240 Mo. JSZip assemble le projet en mémoire : ces limites ne garantissent pas qu’un téléphone peu doté puisse traiter le volume maximal.
- Pas d’intégration automatique à Microsoft, pas de création/modification de DOCX.
- Les repères sont liés au PDF importé, sans géoréférencement SIG ni rotation interactive.

## Documents du projet

- [Architecture, schéma et composants](docs/ARCHITECTURE.md)
- [Guide GitHub Pages](docs/GITHUB_PAGES.md)
- [Plan de développement](docs/SPRINTS.md)
- [Validation et limites](docs/VALIDATION.md)
- [Wireframes](docs/wireframes.svg)

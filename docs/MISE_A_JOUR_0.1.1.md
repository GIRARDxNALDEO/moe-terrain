# Mise à jour MOE Terrain 0.1.1

## Corrections

- Export ZIP relu dans une transaction cohérente, sans dépendre des index des anciennes installations.
- Migration IndexedDB vers la version 2, sans effacer les projets ni les photos.
- Pour les nouveaux médias et les imports, conservation des octets en plus du Blob, afin de fiabiliser leur lecture à l’export.
- Téléchargement automatique avec lien « Télécharger le ZIP prêt » disponible en secours dans Réunions et Transfert.
- Réouverture des réunions clôturées, édition de la date/type, ajout de suivis, puis nouvelle clôture avec prompt recalculé.
- Ancien bilan archivé à chaque réouverture, consultable depuis « Anciens bilans conservés ».
- Suppression réversible des points et réunions, restauration depuis Transfert → Corbeille.
- Suppression d’une réunion : ses événements sont masqués ; l’état courant des points est recalculé depuis les réunions conservées. Les points créés seulement dans cette réunion sont masqués jusqu’à sa restauration.
- Les autres bilans déjà clôturés restent historiques. Pour en retirer un point supprimé, rouvrir la réunion concernée et la clôturer à nouveau.
- Plusieurs réunions peuvent être ouvertes pour permettre la correction d’une réunion antérieure. Un suivi ajouté depuis une réunion est rattaché à celle sélectionnée.
- Import des anciens ZIP V0.1 accepté. Les nouveaux ZIP utilisent le format 2 : ils doivent être importés avec V0.1.1 ou ultérieure.

## Mise à jour sur GitHub

Cette archive contient uniquement les sources et les actifs nécessaires au dépôt, moins de 100 fichiers. Elle ne contient ni `out`, ni `public/pdf`, ni `.next`, ni `node_modules`.

1. Extraire le ZIP.
2. Ouvrir le dossier `moe-terrain` extrait.
3. Dans le dépôt GitHub existant, à la racine, choisir Add file → Upload files.
4. Glisser le contenu de ce dossier, puis Commit changes sur main. Les chemins existants seront mis à jour. Garder `package.json` à la racine.
5. Le workflow Publier MOE Terrain reconstruira les fichiers techniques et le site.
6. Attendre build et deploy verts.
7. Fermer toutes les fenêtres de l’application et la relancer avec une connexion pour charger la mise à jour. Vérifier V0.1.1 dans Préférences. Si l’ancienne version reste active, la fermer puis l’ouvrir à nouveau.

Garder la même adresse du site. Ne pas effacer les données du navigateur : la migration conserve la base existante.

## Utilisation

### ZIP

Cliquer Sauvegarder le ZIP dans une réunion clôturée ou Exporter le projet ZIP dans Transfert. Si aucun fichier n’apparaît après génération, toucher le lien Télécharger le ZIP prêt. L’archive peut être retéléchargée tant que la page reste ouverte. Un export déjà généré est un instantané : il faut le régénérer après modification.

### Réouverture

Ouvrir la réunion, Rouvrir la réunion, confirmer, modifier les points et éventuellement la date/le type, puis Clôturer la réunion. Le nouveau prompt remplace le prompt courant ; l’ancienne version reste consultable et sauvegardée.

La correction actualise l’état courant du chantier. Les snapshots des autres réunions ne sont pas réécrits automatiquement.

### Suppression et restauration

Ouvrir une fiche puis Supprimer ce point ; ouvrir une réunion puis Supprimer la réunion. Les éléments disparaissent des vues courantes mais restent conservés dans le ZIP. Pour les récupérer : Transfert → Corbeille. Restaurer d’abord la réunion lorsque ses points ont été masqués avec elle.

## Validation

Tests ajoutés pour réouverture/reclôture, corbeille, restauration, export quand la lecture des Blob échoue, import V0.1 et migration d’un schéma V1 dont un index était absent. Essai du parcours interface dans Chromium, avec photos, PDF, ZIP et reprise hors ligne.

L’erreur exacte de votre appareil n’a pas été observée directement : si elle persiste avec cette version, relever le message complet, le navigateur et les médias présents. Aucun média inaccessible n’est omis silencieusement d’un export.

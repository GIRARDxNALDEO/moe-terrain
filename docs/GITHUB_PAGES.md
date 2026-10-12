# Publier MOE Terrain sur GitHub Pages

## 1. Préparer les fichiers

Extraire l’archive. Le dossier `moe-terrain` contient le code. Le dépôt doit contenir directement `package.json`, `src`, `public` et `.github` à sa racine.

L’archive inclut également `out/` : c’est le build statique prêt pour le chemin `/moe-terrain/`. Il n’est pas nécessaire de l’ajouter au dépôt : GitHub Actions le reconstruit. `node_modules` est volontairement absent.

## 2. Créer le dépôt

Sur GitHub, créer un dépôt nommé `moe-terrain`, branche principale `main`. Avec l’offre gratuite, utiliser un dépôt public pour GitHub Pages. Le dépôt contient uniquement le programme et les actifs de marque, pas les projets chantier ni leurs ZIP.

## 3. Déposer le projet

La méthode GitHub Desktop est adaptée à Windows et permet d’inclure correctement `.github/workflows/pages.yml` :

1. Installer GitHub Desktop et se connecter à GitHub.
2. Cloner le dépôt `moe-terrain` sur l’ordinateur.
3. Copier le contenu du dossier livré dans le dépôt cloné, en incluant `.github` et `.gitignore`.
4. Dans GitHub Desktop, créer un commit, puis « Push origin ».

Ou utiliser Git dans un terminal :

```bash
git init
git add .
git commit -m "MOE Terrain V0.1"
git branch -M main
git remote add origin https://github.com/VOTRE_COMPTE/moe-terrain.git
git push -u origin main
```

Remplacer `VOTRE_COMPTE`. Ces commandes supposent un dépôt distant vide.

## 4. Activer Pages

Dans le dépôt : **Settings → Pages → Build and deployment → Source → GitHub Actions**.

Si le premier workflow a échoué avant l’activation de Pages, ouvrir **Actions → Publier MOE Terrain → Run workflow**, ou relancer le workflow échoué.

Le workflow installe les dépendances verrouillées, exécute les tests métier et TypeScript, construit le site puis publie `out/`.

Adresse attendue : `https://VOTRE_COMPTE.github.io/moe-terrain/`.

Le workflow prend aussi en charge un autre nom de dépôt. Pour un dépôt `VOTRE_COMPTE.github.io`, il utilise la racine `/`.

## 5. Installer sur le téléphone

Ouvrir l’adresse avec une connexion. Attendre « Prêt hors ligne » : les modules DOCX/PDF et le worker PDF doivent être téléchargés avant le départ sur chantier.

- iPhone : ouvrir dans Safari, Partager, « Sur l’écran d’accueil ».
- Android : Chrome, menu, « Installer l’application » ou « Ajouter à l’écran d’accueil ».
- Windows : Edge ou Chrome, action d’installation de l’application.

Désactiver ensuite le réseau et vérifier que l’application se rouvre et qu’un projet est accessible. Le GPS peut échouer sans réseau ou dans un bâtiment ; les observations restent enregistrables.

## 6. Transférer un projet vers le bureau

1. Clôturer la réunion sur téléphone.
2. Onglet Transfert → Exporter le projet ZIP.
3. Conserver le fichier dans Fichiers/Téléchargements.
4. Transférer manuellement par SwissTransfer, câble ou un autre moyen choisi.
5. Sur PC, ouvrir la même application et importer le ZIP.
6. Si le projet existe déjà, exporter d’abord sa sauvegarde puis choisir remplacement ou copie indépendante.
7. Ouvrir le CR Word officiel existant, puis coller le prompt dans Copilot.
8. Fournir à Word les photos nécessaires depuis le dossier `photos/` du ZIP.

## 7. Mettre à jour l’application

Pousser le nouveau code sur `main`. Garder la même adresse de publication. Les appareils téléchargeront une nouvelle version lorsqu’ils seront connectés ; fermer complètement l’application puis la rouvrir pour activer une version en attente.

La nouvelle version ne doit jamais supprimer IndexedDB. Exporter les chantiers avant une mise à jour importante. Une simple fermeture ne supprime pas les données.

## Dépannage

- **Page blanche ou ressources 404** : vérifier que le build et l’adresse utilisent le même `NEXT_PUBLIC_BASE_PATH`.
- **Pas de mode hors ligne** : ouvrir la version publiée en HTTPS, attendre la préparation complète, recharger une fois puis réessayer.
- **Ancienne version affichée** : fermer toutes les fenêtres de l’application pour laisser le nouveau service worker s’activer.
- **Données absentes sur PC** : importer le ZIP ; les appareils ne se synchronisent pas.
- **Données absentes après changement d’URL** : ouvrir l’ancienne adresse pour exporter, puis importer sur la nouvelle.
- **Erreur quota** : sauvegarder les chantiers ; le navigateur impose sa propre capacité de stockage.

Ne pas supprimer les données du navigateur pour résoudre un problème sans avoir exporté les projets auparavant.

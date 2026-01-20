# Hey Social (MVP)

Reseau social web ethique avec executable Windows via Electron.

## Démarrage rapide

1. Installer les dépendances :
   - `npm install`
2. Lancer en mode dev (serveur + web) :
   - `npm run dev`
3. Ouvrir `http://localhost:5173`

## Build

- Web + serveur :
  - `npm run build`
- Exécutable Windows :
  - `npm run electron:build`

## Configuration

Variables d'environnement optionnelles :

- `JWT_SECRET` : cle de signature JWT (par defaut: `dev_secret_change_me`)
- `PORT` : port du serveur (par defaut: `4000`)

## Donnees

Les donnees sont stockees localement dans `server/data/data.json`.

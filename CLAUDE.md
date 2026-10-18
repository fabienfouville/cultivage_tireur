# Cultivage — guide pour Claude

Quiz multijoueur temps réel. React 18 + TypeScript + Vite, Firebase (Hosting, Firestore, Auth) sur l'offre gratuite.
Pas de serveur ni de Cloud Functions. Tout le texte visible est en français.

## Commandes

- `npm run typecheck`, `npm test` (unitaires + validation des packs), `npm run build` : à lancer avant chaque commit.
- `npm run test:rules` : tests de `firestore.rules` (émulateur Firestore, Java requis). À lancer si on touche aux règles.
- Local : `npm run emulators` puis `npm run dev:local` (connexion « admin de test » disponible en mode émulateur).

## Publication

- Les propriétaires veulent que les modifications partent **directement sur `main`** (pas de Pull Request) :
  chaque push sur `main` met le site en ligne via GitHub Actions. Ne pousser qu'après typecheck, tests et build verts.
- Après un ajout de packs, rappeler d'aller dans l'admin → 📦 Packs → « Importer tous les nouveaux packs ».

## Organisation

- `src/modules/<jeu>.tsx` : un fichier par jeu, qui exporte un `ModuleDef` (`src/modules/types.ts`) : champs du
  formulaire admin, réglages, `publicPayload` (ce que voient les joueurs), `solution`, `score`, et les vues `Player`
  (téléphone) et `Screen` (écran projeté). Liste des jeux : `src/modules/index.ts`.
- `src/engine/engine.ts` : le moteur (actions admin : lancer un bloc, une question, fermer, valider, révéler, cartes…).
  `src/engine/useHost.ts` : sur chaque appareil admin, ferme la question à la fin du temps et tient « qui a répondu ».
- `src/pages/` : `Home` (liste des sessions), `Player`, `Screen`, `admin/*` (back-office et régie `Control`).
- `firestore.rules` : sécurité. `tests/rules.test.ts` : ses tests.
- `content/packs/*.json` : packs de questions importables depuis l'admin (onglet Packs).

## Modèle de données (Firestore)

- `themes/{id}` `{module, name, mapId?, packId?}` · `questions/{id}` `{module, themeId, text, …champs du module}`
- `config/modules` `{<module>: {timer, …}}` · `grandJeux/{id}` · `admins/{email}` · `sessionSecrets/{sid}` `{password}`
- `sessions/{sid}` : `phase` (lobby | pick | cards | play | blockResults | final), `block` (série de questions en cours),
  `round` (question en cours : `status` answering | validating | revealed, `public`, `solution`, `results`…), `seq`.
  Sous-collections : `participants/{uid}`, `answers/{seq}_{uid}`, `rounds/{id}` (historique des points),
  `cardPlays/{blockCount}_{uid}`, `keys/{uid}` (mot de passe saisi par le joueur).

Règles d'or :
- **Jamais la solution dans `round.public`** : la session est lisible par tous. La solution n'est écrite qu'à la révélation.
- Les transitions de partie passent par des transactions qui vérifient l'état attendu (plusieurs admins possibles).
- Les champs des questions existantes viennent de l'ancienne app : ne pas les renommer (les données en dépendent).

## Ajouter un jeu

1. Créer `src/modules/mon-jeu.tsx` en s'inspirant du module le plus proche (`qcm.tsx` pour un choix, `cash.tsx` pour une
   réponse libre validée à la main, `top.tsx` pour plusieurs tours).
2. Ajouter la clé dans le type `ModuleKey` (`src/types.ts`) et le module dans `MODULES` (`src/modules/index.ts`).
3. Ajouter un pack d'exemple dans `content/packs/` et lancer `npm test`.
4. Tester une partie en local (émulateurs) sur un écran de téléphone.

## Ajouter des questions (packs)

Un fichier `content/packs/<id>.json` :

```json
{ "id": "qcm-cinema-2", "module": "qcm", "theme": "Cinéma 2", "questions": [
  { "text": "…", "answers": ["a", "b", "c", "d"], "correct": 1 } ] }
```

Champs par module (voir `questionFields` de chaque module) :
qcm/gambling `answers[4]` + `correct` · duo-carre-cash `choices[4]` + `correctIndex` (+ `answerHint` variantes) ·
cash/pixel `answerHint` (variantes séparées par `/`) + `imageUrl` pour pixel · vf-survie `correct` (bool), `order` ·
estimation `answer` (nombre), `unit` · theme `answerHint` (exemples) · top `answers[]` du n°1 au dernier ·
geoloc `lat`, `lng`, `answerHint`, `isoNum` (code ISO numérique si la réponse est un pays), `mapId` du pack ·
blindtest `audioUrl`, `answerHintAuthor`, `answerHintTitle`.

Les questions doivent être exactes et ne pas doublonner l'existant : demander à l'utilisateur une sauvegarde JSON
(admin → Packs → « Sauvegarder tout ») pour vérifier. `npm test` valide le format de tous les packs.

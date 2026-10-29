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
- Hébergement (`firebase.json`) : `index.html` et les routes ne sont jamais mis en cache, `/assets/*` (noms hashés) le
  sont pour un an. La réécriture vers `index.html` ne concerne que les chemins **sans point** : une route ne doit pas
  contenir de point, et un ancien fichier JS disparu renvoie bien une 404 (l'app recharge alors la page). Chaque build
  publie `/version.json` : les pages ouvertes proposent de recharger quand une nouvelle version est en ligne.
- Quota gratuit Firestore : 50 000 lectures / 20 000 écritures par jour. Chaque document lu ou reçu en temps réel
  compte : éviter de lire des collections entières pendant une partie. « Toutes les questions » lit la banque du jeu une
  fois par appareil puis la garde 30 min en mémoire (`sampleQuestions` dans le moteur).

## Organisation

- `src/modules/<jeu>.tsx` : un fichier par jeu, qui exporte un `ModuleDef` (`src/modules/types.ts`) : champs du
  formulaire admin, réglages, `publicPayload` (ce que voient les joueurs), `solution`, `score`, et les vues `Player`
  (téléphone) et `Screen` (écran projeté). Liste des jeux : `src/modules/index.ts`.
- `src/engine/engine.ts` : le moteur (actions admin : lancer un bloc, une question, fermer, valider, révéler…). Cartes bonus/malus du
  Grand Jeu désactivées pour l'instant (`CARDS_ON = false` dans `src/engine/cards.ts`).
  `src/engine/useHost.ts` : sur chaque appareil admin, ferme la question à la fin du temps et tient « qui a répondu ».
- `src/pages/` : `Home` (liste des sessions), `Player`, `Screen`, `admin/*` (back-office et régie `Control`).
- `firestore.rules` : sécurité. `tests/rules.test.ts` : ses tests.
- `content/packs/*.json` : packs de questions importables depuis l'admin (onglet Packs).
- `content/grandjeux/*.json` : Grands Jeux prêts à l'emploi (chaque jeu pointe vers un `packId`), créés depuis l'onglet
  Packs (« Créer le Grand Jeu » importe aussi les packs manquants). Images des packs : `public/echelle/`, `public/pixel/`.
- Blind Test : `audioUrl` peut rester vide dans un pack, l'extrait est retrouvé sur iTunes au lancement de la question.

## Modèle de données (Firestore)

- `themes/{id}` `{module, name, mapId?, packId?}` · `questions/{id}` `{module, themeId, text, …champs du module}`
- Thème d'un bloc : `''` = toutes les questions du jeu (défaut), `'?'` = un thème au hasard (`ALL_THEMES`/`RANDOM_THEME`).
- `config/modules` `{<module>: {timer, …}}` · `grandJeux/{id}` · `admins/{email}` · `sessionSecrets/{sid}` `{password}`
- `sessions/{sid}` : `phase` (lobby | pick | intro | cards | play | blockResults | final ; `intro` = annonce du jeu suivant en Grand Jeu), `block` (série de questions en cours),
  `round` (question en cours : `status` answering | validating | revealed, `public`, `solution`, `results`…), `seq`.
  Sous-collections : `participants/{uid}`, `answers/{seq}_{uid}`, `rounds/{id}` (historique des points),
  `cardPlays/{blockCount}_{uid}`, `keys/{uid}` (mot de passe saisi par le joueur).

Règles d'or :
- **Jamais la solution dans `round.public`** : la session est lisible par tous. La solution n'est écrite qu'à la révélation.
- Les transitions de partie passent par des transactions qui vérifient l'état attendu (plusieurs admins possibles).
- Dans le moteur, lire la session avec `getSession` (lecture dans une transaction, donc sur le serveur), jamais avec
  `getDoc` : quand la page écoute déjà la session, `getDoc` (et même `getDocFromServer`) renvoie l'état de l'écoute, où
  une transaction qui vient de réussir n'est pas encore arrivée. L'émulateur local est trop rapide pour le montrer.
  Pour tester en conditions réelles : forcer `experimentalForceLongPolling` et retarder les requêtes `Listen/channel`.
- Les champs des questions existantes viennent de l'ancienne app : ne pas les renommer (les données en dépendent).

## Ajouter un jeu

1. Créer `src/modules/mon-jeu.tsx` en s'inspirant du module le plus proche (`qcm.tsx` pour un choix, `cash.tsx` pour une
   réponse libre validée à la main, `top.tsx` pour plusieurs tours, `logique.tsx` pour une difficulté croissante).
   Une **variante** d'un jeu (mêmes questions, autres règles) déclare `variantOf` + `variantName` : elle n'a pas de
   banque à elle et apparaît dans le sélecteur « Règles » (ex. `gambling.tsx` et `duo-carre-cash.tsx`, variantes du QCM).
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
qcm `answers[4]` + `correct` (+ `answerHint` variantes pour le Cash du Duo/Carré ; les anciens `choices`/`correctIndex`
sont encore lus) · logique `text` (multiligne), `answer` (variantes `/`), `choices[]` optionnel, `percent` (% qui trouvent),
`explain` · chronologie `events[]` du plus ancien au plus récent + `dates[]` alignées · quisuisje `clues[5]` du plus dur
au plus facile + `answerHint` (variantes `/`) · echelle `refName`, `refHeight` (m), `refEmoji`, `targetName`, `answer` (m), `targetEmoji` (tailles officielles),
`refImage`/`targetImage` (images détourées et recadrées au plus près dans `public/echelle/*.webp`, crédits dans
`public/echelle/CREDITS.txt`), `refLength`/`targetLength` (true si la taille est une longueur, sinon une hauteur) ·
cash/pixel `answerHint` (variantes séparées par `/`) + `imageUrl` pour pixel · vf-survie `correct` (bool), `order` ·
estimation `answer` (nombre), `unit` · theme `answerHint` (exemples) · top `answers[]` du n°1 au dernier ·
geoloc `lat`, `lng`, `answerHint`, `isoNum` (code ISO numérique si la réponse est un pays), `mapId` du pack ·
blindtest `audioUrl`, `answerHintAuthor`, `answerHintTitle`.

Style des questions : s'inspirer de « La Table des Savoirs » (le quiz quotidien d'Émilien, champion des 12 Coups de midi) :
de la vraie culture générale, répartie sur une dizaine de domaines (littérature, histoire, sciences, géographie, arts,
sport, langue française, cinéma et musique, mythologie, divers), une seule bonne réponse vérifiable, formulation courte
et précise, deux niveaux (abordable en QCM, expert en réponse libre). Packs `cultureg-abordable` et `cultureg-expert`.
Ne jamais recopier leurs questions : seulement le style.

Les questions doivent être exactes et ne pas doublonner l'existant : demander à l'utilisateur une sauvegarde JSON
(admin → Packs → « Sauvegarder tout ») pour vérifier. `npm test` valide le format de tous les packs.

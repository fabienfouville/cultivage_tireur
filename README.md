# 🌱 Cultivage — quiz room multijoueur

Quiz entre amis : les joueurs répondent sur leur téléphone, un écran (TV / vidéoprojecteur) affiche les questions,
l'animateur pilote depuis son téléphone ou son ordi.

- **Joueurs** : ouvrent le site, touchent la partie en cours, tapent un pseudo (+ mot de passe si la session en a un).
- **Écran** : `/ecran/<session>` — QR code pour rejoindre, questions, classement. Public, aucun login.
- **Animateur** : `/admin` — connexion Google. Régie d'une session : `/admin/session/<session>` (pensée pour le téléphone).

## Les jeux

| Module | Principe |
|---|---|
| 🔤 QCM | 4 choix, points si bonne réponse |
| ⚔️ VF Survie | Vrai/Faux à élimination, barème croissant |
| 🎯 Estimation | Un nombre, podium des plus proches |
| 💬 Cash | Réponse libre validée par l'animateur |
| 🖼️ Pixel | Image qui se dépixellise, podium des plus rapides |
| 🗂️ Thème | Un maximum de réponses sur un thème, 1 pt par réponse validée |
| 🗺️ Géoloc | Point sur une carte, podium des plus proches (0 km si dans le bon pays) |
| 🎵 Blind Test | Extrait audio, artiste + titre, podium de vitesse |
| 🎲 Gambling | Jetons à miser sur les 4 choix pour toute la manche |
| 👥 Duo/Carré | Duo (2 choix), Carré (4) ou Cash (libre) : plus de risque, plus de points |
| 🏆 Le Top | Classement à deviner en plusieurs tours |

Deux façons de jouer : **roue libre** (l'animateur choisit les jeux au fur et à mesure, avec une roue qui tire au sort)
ou **Grand Jeu** (suite de modules préparée à l'avance, avec des cartes bonus/malus entre deux modules :
🐢 Tortue, 😤 Confiant, ⚔️ Duel, 🛡️ Bouclier).

## Architecture

```
GitHub (ce repo) ──push sur main──▶ GitHub Actions ──▶ Firebase Hosting (le site)
                   └─Pull Request──▶ lien de prévisualisation      + règles Firestore
Navigateurs (joueurs, écran, régie) ◀──temps réel──▶ Firestore (sessions, questions, scores)
```

- **Front** : React + TypeScript + Vite. Un seul site, tout est dans `src/`.
- **Back** : uniquement Firebase, offre gratuite (Spark) : Hosting, Firestore, Authentication.
  Pas de serveur : c'est l'appareil de l'animateur qui fait avancer la partie. N'importe quel appareil admin
  peut reprendre la main (régie + écran connecté en admin, ou deux animateurs) : rien n'est compté deux fois.
- **Sécurité** (`firestore.rules`, testée par `tests/rules.test.ts`) : les questions et réponses ne sont lisibles que
  par les admins ; un joueur ne peut répondre qu'à la question en cours, avant la fin du temps, et ne peut pas toucher
  aux scores ; le mot de passe de session est vérifié côté serveur.
- **Questions** : stockées dans Firestore (modifiables dans l'admin). Les nouveaux packs se préparent en JSON dans
  `content/packs/` (facile avec Claude), puis s'importent depuis l'onglet 📦 Packs de l'admin.

Détails pour développer : voir [CLAUDE.md](CLAUDE.md).

## Mise en route (une seule fois)

Dans la [console Firebase](https://console.firebase.google.com/project/cultivage-90317) :

1. **Authentication → Sign-in method** : activer **Google** et **Anonyme**.
2. **Authentication → Settings → Authorized domains** : vérifier que `cultivage-90317.web.app` y est.
3. **Clé de déploiement pour GitHub** : Paramètres du projet → Comptes de service → « Générer une nouvelle clé privée ».
   Copier tout le contenu du fichier JSON dans GitHub : repo → Settings → Secrets and variables → Actions →
   New repository secret, nom `FIREBASE_SERVICE_ACCOUNT`.
   (Ou plus simple, sur un ordi : `npx firebase-tools init hosting:github`, qui fait tout ça tout seul.)
4. **Admins** : `liloufe@gmail.com` est admin d'office (dans `firestore.rules` et `src/lib/auth.ts`).
   Les autres s'ajoutent dans l'admin → onglet Réglages.

⚠️ Le premier déploiement remplace l'ancienne app et ses règles : l'ancien mot de passe admin ne sert plus,
tout passe par la connexion Google. Les thèmes et questions existants sont conservés tels quels.
Pensez à cliquer « 💾 Sauvegarder tout » (onglet Packs) avant/après pour avoir une copie.

## Modifier l'app (à deux, avec Claude)

1. Demander la modif à Claude (Claude Code sur le web ou en local) sur ce repo.
2. Claude travaille sur une branche et ouvre une **Pull Request** → un lien de prévisualisation est posté sur la PR.
3. On teste sur le lien (téléphone compris), puis on **merge** → le site est mis à jour en ~2 minutes.

## En local

```bash
npm install
npm run emulators        # Firebase local (Java requis), dans un 1er terminal
npm run dev:local        # le site sur http://localhost:5173, branché sur les émulateurs
npm run seed -- sauvegarde.json   # optionnel : charger une sauvegarde dans l'émulateur
npm test                 # tests (packs de questions, cartes)
npm run test:rules       # tests des règles de sécurité
```

En mode émulateur, l'écran de connexion admin propose « Connexion admin de test » (pas besoin de Google).

## Images et sons

- **Pixel** : coller l'URL d'une image (Wikimedia Commons marche bien) ou envoyer un fichier.
- **Blind Test** : chercher le titre dans le formulaire (extraits iTunes de 30 s, gratuits, liens stables) ou coller un lien MP3.
  Les anciens liens Deezer expirent : à remplacer par une recherche.
- L'envoi de fichiers utilise Firebase Storage, qui nécessite désormais l'offre Blaze (payante à l'usage, gratuite sous
  un certain volume). Sans elle, utilisez des URL.

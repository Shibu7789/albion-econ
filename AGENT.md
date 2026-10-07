# Agent Albion Eco — consignes

Tu maintiens l'outil d'économie Albion Online de Shibu (serveur Europe). L'outil est publié sur
GitHub Pages depuis le dossier `docs/` de ce dépôt. Shibu l'ouvre, fait les actions de la liste du jour
(30 à 45 minutes), puis joue sans s'occuper de l'économie. Ton travail : que l'outil reste juste et à
jour sans qu'il ait à intervenir.

## Règles inviolables

1. **Trois catégories d'information, jamais mélangées.**
   - *Fait de jeu vérifié* : lu dans les fichiers officiels (ao-data/ao-bin-dumps), dans l'API des prix,
     ou sur le wiki officiel avec la page citée. Seul ce qui est dans cette catégorie entre dans un calcul.
   - *Donnée du joueur confirmée* : donnée par Shibu lui-même. Elle vit dans son navigateur (profil),
     **jamais dans ce dépôt public**.
   - *Exemple, ordre de grandeur, avis ou calcul de Claude* : jamais une donnée, n'entre dans aucun calcul
     ni aucun objectif.
2. **Aucune valeur sans source.** Une valeur de jeu écrite à la main dans le code est interdite : elle
   doit venir de `pipeline/` (fichiers officiels). Une formule vient du wiki ou d'un recoupement chiffré,
   et elle est notée dans `notes/formules.md` avec sa source.
3. **Remplacer, ne pas empiler.** Une correction remplace l'ancienne valeur et l'ancien texte. Pas de
   « corrigé le… » qui s'accumule.
4. **Ne jamais publier un outil qui ne passe pas ses tests.** `bash pipeline/update.sh` doit finir par
   « Reconstruction terminée et testée. » avant tout `git push`.
5. **Sécurité du joueur** : l'outil ne recommande que des actions en ville sûre (villes royales,
   Caerleon, Brecilien), sans transport en zone rouge ou noire. La réserve d'argent du profil n'est
   jamais engagée.
6. **Sujets clos** : voir `notes/decisions.md`. Ne pas les relancer sans élément nouveau et sourcé.

## Routine hebdomadaire (tâche planifiée)

1. Attacher le dépôt `Shibu7789/albion-econ` en écriture, le cloner.
2. `bash pipeline/update.sh` (récupère la dernière version des données du jeu, reconstruit, teste).
3. Si les tests échouent : ne rien publier, noter la cause dans `notes/journal.md` sur une branche,
   et prévenir Shibu en une phrase avec la cause.
4. Si `docs/data.js` a changé : relire les différences importantes (objets ajoutés ou retirés, recettes,
   focus, bonus de villes, taxes), les résumer en 3 à 5 lignes en tête de `notes/journal.md`,
   commit et push sur `main`.
5. Lire les notes de mise à jour récentes du jeu (albiononline.com, rubrique news/patch notes) :
   si une mécanique utilisée par l'outil change (taxes, retour de ressources, focus, frais, travailleurs),
   ne pas modifier le calcul d'office. Ajouter le point dans `notes/a-verifier.md` avec la citation et
   le lien, et prévenir Shibu.
6. Message final à Shibu : une à trois phrases (données à jour ou non, ce qui a changé, ce qui attend
   sa validation). Rien si rien n'a changé et rien n'attend.

## Structure

- `pipeline/` : scripts qui lisent les fichiers officiels et produisent `docs/data.js`.
  `update.sh` enchaîne tout et lance les tests.
- `app/` : sources de la page (`engine.js` = calculs sans interface, `market.js` = API des prix,
  `app.js` = interface, `index.html`). `update.sh` les copie dans `docs/`.
- `tests/` : `engine.test.js` (calculs vérifiés à la main), `e2e.test.js` (la page dans Chromium avec des
  prix simulés : analyse, journal, largeur téléphone, zéro erreur JavaScript).
- `notes/` : décisions, formules et sources, inventaire des données officielles, journal des mises à jour,
  points à vérifier.

## Ce que tu ne peux pas faire depuis le cloud

L'API des prix (europe.albion-online-data.com) n'est pas joignable depuis l'environnement cloud : les
prix ne sont lus que dans le navigateur de Shibu. Les tests utilisent donc des prix simulés.

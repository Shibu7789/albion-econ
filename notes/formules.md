# Formules et sources

Rapport complet : document « Économie d'Albion Online — fonctionnement complet » (claude.ai, 06/10/2026).

| Mécanique | Règle utilisée | Statut | Source |
| --- | --- | --- | --- |
| Retour de ressources | RRR = B / (1 + B) ; B = 18 % ville (raffinage et craft), +40 % raffinage ou +15 % craft en ville de spécialité, +59 % focus, + bonus du jour | Vérifiée (retrouve les 10 valeurs du wiki) | craftingmodifiers.json, gamedata ActionFocus ; wiki « Resource return rate » |
| Ingrédients non rendus | `maxreturnamount = 0` dans la recette | Officielle | items.json |
| Coût de focus | base × 0,5^(FCE / 10 000) | Officielle (constante 1,00695555 / 100 points) | gamedata ActionFocus ; wiki « Focus » |
| Efficacité de focus (FCE) | Σ niveau × points par niveau de chaque nœud du Destiny Board couvrant l'objet (points = valeur × 100) | Officielle ; recoupée (max = 40 000 → 6,25 % ; arrosage 1 000 → 125) | achievements.json |
| Taxe de vente | 8 % | Officielle | gamedata MarketPlace |
| Taxe Premium | 4 % | Source tierce | albionmarket.gg |
| Frais d'ordre | 2,5 % par ordre posé ; aucun pour une vente directe | Officielle (2,5 %) ; tierce (exemption vente directe) | gamedata MarketPlace ; albionmarket.gg |
| Qualité | chances de base 68,9 / 25 / 5 / 1 / 0,1 % ; profit calculé sur Normale | Officielle | gamedata CraftingQualityChances |
| Frais de station | valeur d'objet × 0,1125 × prix pour 100 de nutrition / 100 | **Hypothèse** | gamedata ItemValueToNutrition |
| Valeur d'objet | matériau : 2^(tier + enchant.) ; objet fabriqué : Σ valeurs des ingrédients / quantité produite | Officielle + formule tierce recoupée | items.json ; albionfreemarket.com |
| Travailleurs | butin = quantité de base × chances officielles d'enchantement | Officielle ; effet du bonheur **inconnu** | items.json (journalitem) |

## Inconnues à mesurer en jeu

Conversion des points de qualité en chances ; argent rendu au recyclage ; frais de station exact ;
frais du Travel Planner ; bonheur → rendement des travailleurs ; prix réel des graines, bébés, carnets
(suit l'or) ; bonus d'activité du jour (saisi chaque jour dans le profil).

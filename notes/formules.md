# Formules et sources

Rapport complet : document « Économie d'Albion Online — fonctionnement complet » (claude.ai, 06/10/2026).

| Mécanique | Règle utilisée | Statut | Source |
| --- | --- | --- | --- |
| Retour de ressources | RRR = B / (1 + B), rendu APRÈS chaque craft : achat = recette complète du 1er craft + consommation nette des suivants ; B = 18 % ville (raffinage et craft), +40 % raffinage ou +15 % craft en ville de spécialité, +59 % focus, + bonus du jour | Vérifiée (retrouve les 10 valeurs du wiki) | craftingmodifiers.json, gamedata ActionFocus ; wiki « Resource return rate » |
| Ingrédients non rendus | `maxreturnamount = 0` dans la recette | Officielle | items.json |
| Coût de focus | base × 0,5^(FCE / 10 000) | Officielle (constante 1,00695555 / 100 points) | gamedata ActionFocus ; wiki « Focus » |
| Efficacité de focus (FCE) | Σ niveau × points par niveau de chaque nœud du Destiny Board couvrant l'objet (points = valeur × 100) | Officielle ; recoupée (max = 40 000 → 6,25 % ; arrosage 1 000 → 125) | achievements.json |
| Taxe de vente | 8 % | Officielle | gamedata MarketPlace |
| Taxe Premium | 4 % | Source tierce | albionmarket.gg |
| Frais d'ordre | 2,5 % par ordre posé ; aucun pour une vente directe | Officielle (2,5 %) ; tierce (exemption vente directe) | gamedata MarketPlace ; albionmarket.gg |
| Qualité | chances de base 68,9 / 25 / 5 / 1 / 0,1 % ; profit calculé sur Normale | Officielle | gamedata CraftingQualityChances |
| Frais de station | valeur d'objet × 0,1125 × prix pour 100 de nutrition / 100 | **Hypothèse** | gamedata ItemValueToNutrition |
| Valeur d'objet | matériau : 2^(tier + enchant.) ; objet fabriqué : Σ valeurs des ingrédients / quantité produite | Officielle + formule tierce recoupée | items.json ; albionfreemarket.com |
| Travel Planner | voyage : gratuit, temps de trajet (donnée du joueur) ; téléportation, par objet : ceil(poids × fasttravelfactor × 150 × multiplicateur serveur) × distance ; distance 1 entre villes royales voisines (anneau TH–FS–LY–BW–MA), 2 sinon | Formule tierce ; poids et facteur officiels ; multiplicateur Europe **inconnu** (défaut 1) | albionfreemarket.com/teleport-calculator ; items.json (weight, fasttravelfactor) |
| Tier craftable | niveau du nœud de base (CRAFT_BASE, CRAFT_OFF, FARM_BASE) → colonne UnlockTier : T5 au niv. 10, T6 à 30, T7 à 60, T8 à 100 (CRAFT_BASE) | Officielle | achievements.json (templates) |
| Renommée de craft | Σ ressources raffinées de la recette × renommée par ressource (T4 22,5 · T5 90 · T6 270 · T7 645 · T8 1 395, ×2 par enchantement) | Source tierce, à recouper en jeu | albiononlinegrind.com « Item Crafting Fame » |
| Journaux d'artisan | un craft remplit le journal de son tier listé dans famefillingmissions ; renommée requise = valeur officielle (T6 : 4 800) ; seule la renommée de base compte (pas le Premium) ; journaux par craft = renommée du craft ÷ renommée requise ; valeur = (prix plein − prix vide) × ce nombre | Officielle (liste, requis) + wiki (Premium) | items.json journalitem ; wiki « Journal » |
| Prix d'achat prudent | max(prix actuel, prix moyen payé sur 7 jours) : l'API ne donne pas la profondeur du carnet | Choix de prudence | API AODP history |
| Travailleurs | butin = quantité de base × chances officielles d'enchantement | Officielle ; effet du bonheur **inconnu** | items.json (journalitem) |

## Inconnues à mesurer en jeu

Conversion des points de qualité en chances ; argent rendu au recyclage ; frais de station exact ;
multiplicateur serveur du Travel Planner ; bonheur → rendement des travailleurs ; prix réel des graines, bébés, carnets
(suit l'or) ; bonus d'activité du jour (saisi chaque jour dans le profil).

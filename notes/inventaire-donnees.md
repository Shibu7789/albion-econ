# Inventaire des données officielles Albion Online

Source : dépôt officiel des données du client (github.com/ao-data/ao-bin-dumps), version du 23/09/2026.
163 fichiers de données examinés (hors cartes de zones et variantes Asie).

Statuts :
- **COUVERT** : extrait par script dans la base (`out/`).
- **À EXTRAIRE** : économiquement utile, pas encore extrait.
- **FORMULE** : le jeu calcule la valeur, la formule doit venir du wiki ou d'une vérification en jeu.
- **HORS SUJET** : sans effet sur l'argent (affichage, son, tutoriel…), avec la raison.

## 1. Économie de production (cœur de ton objectif)

| Fichier / section | Contenu | Statut |
|---|---|---|
| items.json | 6 048 objets + 5 922 variantes enchantées : recettes, focus de base, argent, rendement, valeur d'objet, poids, échangeable, recyclable | COUVERT (`objets.json`, `objets.csv`) |
| items.json (recettes TRANSMUTE) | 191 transmutations avec frais exact | COUVERT |
| items.json (upgraderequirements) | 4 518 améliorations rune/âme/relique | COUVERT |
| items.json (maxreturnamount=0) | ingrédients jamais rendus par le retour de ressources (artefacts, cœurs, sceaux, capes de base…) | COUVERT |
| craftingmodifiers.json | bonus raffinage/craft de chaque ville, île (0 %), zone Outlands/Avalon par biome et qualité | COUVERT (`bonus_lieux.json`) |
| farmingmodifiers.json | bonus de rendement agricole par ville | COUVERT (`bonus_agricoles_lieux.json`) |
| achievements.json (Destiny Board) | 704 nœuds : réduction focus, qualité, rendement de récolte, Item Power par niveau ; coût en renommée par niveau | COUVERT (`destiny_board.json`) |
| gamedata (ActionFocus) | focus : +59 % de retour, +50 qualité, constante de réduction | COUVERT (chiffres), FORMULE (application) |
| gamedata (CraftingQualityChances) | chances de qualité de base | COUVERT (chiffres), FORMULE (effet des points de qualité) |
| gamedata (RerollQualityChances, RerollQuality) | relance de qualité : chances et coût | COUVERT (chiffres) |
| gamedata (Salvage) | recyclage : 20 % des ressources, facteur argent 0,75 | COUVERT (chiffres), FORMULE (argent exact) |
| gamedata (Repair) | coût de réparation | COUVERT (chiffres) |
| gamedata (ItemValueToNutrition, BuildingManagement) | frais de station = valeur d'objet × 0,1125 × prix nutrition fixé par le propriétaire | COUVERT (chiffres), FORMULE |
| buildings.json (craftbuilding) | stations, plat préféré (bonus nutrition), capacité | À EXTRAIRE |
| buildings.json (repairbuilding, meldbuilding) | réparation, fusion d'artefacts | À EXTRAIRE |

## 2. Marché

| Fichier / section | Contenu | Statut |
|---|---|---|
| gamedata (MarketPlace) | taxe 8 %, frais d'ordre 2,5 %, durées d'ordre 12h/24h/7j/30j, contrebandier 1,5 % | COUVERT |
| gamedata (TaxValues, UserTaxValues) | taxes de guilde/zone/ville | COUVERT (chiffres) |
| gamedata (GoldMarket, PremiumPackages) | or ↔ argent, Premium 3 750 or/30 j | COUVERT |
| marketplace_europe.json | demandes PNJ à prix fixe (trésors de ville) et stocks PNJ | COUVERT (`pnj_prix_fixe.json`) |
| items.json (prix via or) | graines, bébés, carnets : prix PNJ indexé sur l'or | COUVERT (prix de référence), FORMULE (conversion) |
| Prix joueurs | non présents dans les fichiers | API AODP — accessible depuis ton navigateur, pas depuis mon environnement |
| gamedata (TravelSettings) + items (fasttravelfactor) | coût du transport par le Travel Planner | COUVERT (chiffres), FORMULE |

## 3. Îles, agriculture, élevage, travailleurs

| Fichier / section | Contenu | Statut |
|---|---|---|
| items.json (farmableitem) + loot.json | 109 graines/animaux : pousse, rendement, retour de graine/bébé, focus de soin, bonus de soin, nutrition, aliment préféré, production (œufs, lait) | COUVERT (`agriculture_elevage.json`) |
| buildings.json (labourer) | 77 travailleurs : prix d'embauche, renommée pour progresser, durée | COUVERT (`travailleurs.json`) |
| items.json (journalitem) | 133 carnets : renommée max, quantité rendue, chances d'enchantement, renommée donnée au travailleur | COUVERT (`carnets.json`) |
| buildings.json (playerbuilding) | maisons : travailleurs max, construction | COUVERT (`maisons.json`) |
| gamedata (LabourerSettings) | bonheur : rendement max ×1,5 | COUVERT (chiffres), FORMULE |
| worldsettings (islands) | îles | À EXTRAIRE |

## 4. Revenus en jouant (hors marché)

| Fichier | Contenu | Statut |
|---|---|---|
| loot.json, lootchests*.json, mobs.json | butin des monstres et coffres | À EXTRAIRE (résumé) |
| harvestables.json, resources.json, rareresourcedistribution | récolte : charges, enchantement des nœuds | À EXTRAIRE |
| personalseasons_europe.json | Défi de l'Aventurier mensuel : multiplicateurs par activité, récompenses | À EXTRAIRE |
| festivities*.json | événements | À EXTRAIRE |
| expeditions, hellgate, helldungeons, corrupteddungeons, mists, randomdungeons, staticdungeons, dragonarea | contenus PvE/PvP | À EXTRAIRE (résumé) |
| factionwarfare*, outpost, factionfortress | points de faction | À EXTRAIRE (résumé) |
| arena*, crystalleague*, gvgseasons*, pvpchallenge* | récompenses PvP | À EXTRAIRE (résumé) |
| standings.json, currencies.json | réputations (Antiquaire, Brecilien…) et monnaies | COUVERT (liste) |
| treasures, treasuredistribution, piledobjects, carriables | trésors, caisses de contrebandier | À EXTRAIRE (résumé) |
| hideouts, territorytypes, castles, powercrystals | contenu de guilde | À EXTRAIRE (résumé) |
| progressiontables.json | paliers de saison | HORS SUJET (récompenses de guilde) |
| gamedata (CombatFameToSilverConversion) | conversion renommée → argent | FORMULE |

## 5. Hors sujet (aucun effet sur l'argent)

audio, assetvfx, vfxprefabdata, animationdata/types, avatars, characters, emotes, killemotes, chatsettings, moderation, playerreports, surveys, hints, tutorial, loginpopups, advertisementpopups, eventbasedpopups, mobilenotifications, hotkeydefaults, guildlogos, guildfinder, namegenerators, lore, minimapgendata, templatemetadata, tilebiomereferences, placeholderspots, sockets, spellanimmappings, visualevents, wardrobe, loadouts, steamachievements, accessrights, cagedobjects, questgiver*, localquests, quests (missions d'histoire), albionjournal (succès à usage unique : récompenses ponctuelles, pas un revenu), armory, itemroles, matchtypes, orbtypes, randomclusterattributes, randomspawnbehaviors, dynamic*, worldextensionutils, tunnelsystem, outlandsteleportationportals, islandmovementperiods, times.

Note : spells.json (sorts de combat) n'a pas d'effet économique direct ; il sert au combat.

"""Modules spécialisés : agriculture/élevage, travailleurs (îles), maisons, demandes PNJ.
Source : ao-bin-dumps (items.json, loot.json, buildings.json, farmingmodifiers.json, marketplace_europe.json).
Usage : python3 -I build_modules.py <dossier_dump> <dossier_sortie>
"""
import json, sys, os

DUMP, OUT = sys.argv[1], sys.argv[2]
def as_list(x): return [] if x is None else (x if isinstance(x, list) else [x])
def load(n): return json.load(open(os.path.join(DUMP, n), encoding='utf-8'))
def f(x): return float(x) if x not in (None, '') else None

items = load('items.json')['items']
loot = {x['@name']: x for x in load('loot.json')['LootDefinition']['Lootlist']}
world = {x['Index']: x['UniqueName'] for x in load('formatted/world.json')}

def loot_items(name):
    lst = loot.get(name)
    if not lst: return None
    out = []
    for it in as_list(lst.get('Item')):
        a = it.get('@amount', '1')
        lo, hi = (a.split('-') + [a])[:2]
        out.append({'id': it['@type'], 'chance': f(it.get('@chance')), 'min': f(lo), 'max': f(hi)})
    return out

# ---------- Agriculture et élevage ----------
farm = []
for it in as_list(items.get('farmableitem')):
    rec = {
        'id': it['@uniquename'], 'tier': int(it.get('@tier', 0)), 'type': it.get('@kind'),
        'prix_pnj_argent_reference': f((it.get('craftingrequirements') or {}).get('@silver')),
        'prix_pnj_via_or': (it.get('craftingrequirements') or {}).get('@swaptransaction') == 'true',
        'focus_soin': f(it.get('@activefarmfocuscost')),
        'bonus_soin': f(it.get('@activefarmbonus')),
        'cycle_soin_s': f(it.get('@activefarmcyclelengthseconds')),
    }
    h = it.get('harvest')
    if h:  # plante
        seed = h.get('seed') or {}
        rec.update({'pousse_s': f(h.get('@growtime')), 'recolte': loot_items(h.get('@lootlist')),
                    'retour_graine_chance': f(seed.get('@chance')), 'retour_graine_qte': f(seed.get('@amount'))})
    g = it.get('grownitem')
    if g:  # bébé animal
        off = g.get('offspring') or {}
        food = ((it.get('consumption') or {}).get('food') or {})
        rec.update({'adulte': g.get('@uniquename'), 'croissance_s': f(g.get('@growtime')),
                    'retour_bebe_chance': f(off.get('@chance')), 'retour_bebe_qte': f(off.get('@amount')),
                    'nutrition_max': f(food.get('@nutritionmax')), 's_par_nutrition': f(food.get('@secondspernutrition')),
                    'aliment_prefere': (food.get('acceptedfood') or {}).get('@favorite'),
                    'categorie_aliment': (food.get('acceptedfood') or {}).get('@foodcategory'),
                    'bonus_aliment_prefere': f((food.get('acceptedfood') or {}).get('@favoritebonus'))})
    p = it.get('products')
    if p:  # adulte qui produit (oeufs, lait...)
        pr = as_list(p.get('product'))[0]
        food = ((it.get('consumption') or {}).get('food') or {})
        rec.update({'production_s': f(pr.get('@productiontime')), 'production': loot_items(pr.get('@lootlist')),
                    'nutrition_max': f(food.get('@nutritionmax')), 's_par_nutrition': f(food.get('@secondspernutrition')),
                    'aliment_prefere': (food.get('acceptedfood') or {}).get('@favorite')})
    farm.append(rec)

fm = load('farmingmodifiers.json')['farmingmodifiers']
farm_bonus = []
for loc in as_list(fm.get('location')):
    cid = loc.get('@clusterid')
    for m in as_list(loc.get('farmingyieldmodifier')):
        farm_bonus.append({'lieu': world.get(cid, cid or f"{loc.get('@continent')} {loc.get('@biome')}"),
                           'objet': m['@farmable'], 'bonus': f(m['@value']), 'bonus_ile': f(m.get('@islandvalue'))})

# ---------- Travailleurs ----------
b = load('buildings.json')['buildings']
labourers = []
for L in as_list(b.get('labourer')):
    labourers.append({
        'id': L['@uniquename'], 'tier': int(L['@tier']), 'metier': L.get('@profession'),
        'contrat': L.get('@contractitem'), 'prix_embauche': f(L.get('@hireprice')),
        'renommee_pour_progresser': f(L.get('@fametoprogress')), 'duree_travail_s': f(L.get('@joblength')),
        'multiplicateur_rendement': f(L.get('@yieldmultiplier')), 'evolue_en': L.get('@upgradeableto'),
        'bonheur_lit_max': f(L.get('@maxbedcontribution')), 'bonheur_table_max': f(L.get('@maxtablecontribution')),
        'bonheur_trophee_max': f(L.get('@maxtrophycontribution')),
    })
journals = []
for j in as_list(items.get('journalitem')):
    ffm = j.get('famefillingmissions') or {}
    kind = next(iter(ffm), None)
    m = ffm.get(kind) or {}
    loots = []
    for l in as_list((j.get('lootlist') or {}).get('loot')):
        loots.append({'id': (l.get('@itemname') + (f"@{l['@itemenchantmentlevel']}" if l.get('@itemenchantmentlevel') else '')) if l.get('@itemname') else None,
                      'qte': f(l.get('@itemamount')), 'argent': f(l.get('@silveramount')),
                      'poids': f(l.get('@weight')), 'renommee_travailleur': f(l.get('@labourerfame'))})
    journals.append({
        'id': j['@uniquename'], 'tier': int(j.get('@tier', 0)),
        'renommee_max': f(j.get('@maxfame')), 'quantite_base': f(j.get('@baselootamount')),
        'prix_pnj_argent_reference': f((j.get('craftingrequirements') or {}).get('@silver')),
        'prix_pnj_via_or': (j.get('craftingrequirements') or {}).get('@swaptransaction') == 'true',
        'mission': kind, 'mission_valeur': f(m.get('@value')), 'mission_tier_min': f(m.get('@mintier')),
        'butin': loots,
    })
houses = [{'id': h['@uniquename'], 'tier': int(h.get('@tier', 0)), 'travailleurs_max': f(h.get('@laborerslimit')),
           'meubles_max': f(h.get('@furniturelimit')),
           'construction': [{'id': r['@uniquename'], 'qte': f(r['@count'])} for r in as_list((h.get('craftingrequirements') or {}).get('craftresource'))]}
          for h in as_list(b.get('playerbuilding'))]

# ---------- Demandes et stocks PNJ à prix fixe ----------
npc = []
for mk in as_list(load('marketplace_europe.json')['marketplaces']['marketplace']):
    cid = mk['@id'].split('@')[-1]
    for key, typ in (('guaranteeddemand', 'achat_pnj'), ('guaranteedstock', 'vente_pnj')):
        for x in as_list(mk.get(key)):
            npc.append({'lieu': world.get(cid, mk['@id']), 'type': typ, 'objet': x['@item'],
                        'prix': f(x['@price']), 'quantite': f(x.get('@amount'))})

for name, data in [('agriculture_elevage', farm), ('bonus_agricoles_lieux', farm_bonus), ('travailleurs', labourers),
                   ('carnets', journals), ('maisons', houses), ('pnj_prix_fixe', npc)]:
    json.dump(data, open(os.path.join(OUT, name + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(name, len(data))

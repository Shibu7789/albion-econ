"""Construit la base économique Albion Online à partir des données officielles (ao-bin-dumps).

Source unique : https://github.com/ao-data/ao-bin-dumps (fichiers du client du jeu).
Aucune valeur n'est saisie à la main dans ce script : tout est lu dans les fichiers.
Les valeurs CALCULÉES (et non stockées par le jeu) sont marquées "calcule": true.

Usage : python3 -I build_base.py <dossier_dump> <dossier_sortie>
"""
import json, sys, os, collections, csv

DUMP, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

def as_list(x):
    if x is None: return []
    return x if isinstance(x, list) else [x]

def load(name):
    with open(os.path.join(DUMP, name), encoding='utf-8') as f:
        return json.load(f)

# ---------- Noms (FR / EN) ----------
names = {}
for t in load('localization.json')['tmx']['body']['tu']:
    tid = t.get('@tuid', '')
    if not tid.startswith('@ITEMS_') or tid.endswith('_DESC'):
        continue
    d = {}
    for v in as_list(t.get('tuv')):
        if v.get('@xml:lang') in ('FR-FR', 'EN-US'):
            d[v['@xml:lang']] = v.get('seg')
    names[tid[len('@ITEMS_'):]] = d

def name_of(uid, enchant=0):
    # Les ressources enchantées ont leur propre clé ; l'équipement enchanté porte le nom de base.
    n = names.get(uid) or names.get(uid.split('@')[0]) or {}
    fr, en = n.get('FR-FR'), n.get('EN-US')
    if enchant and fr and not uid.endswith(f'_LEVEL{enchant}'):
        fr, en = f"{fr} .{enchant}", (f"{en} .{enchant}" if en else None)
    return fr, en

# ---------- Objets ----------
raw = load('items.json')['items']
base_items = {}
for kind, lst in raw.items():
    if not isinstance(lst, list):
        continue
    for it in lst:
        base_items[it['@uniquename']] = (kind, it)

def market_id(uid, ench):
    """Identifiant marché (API AODP / jeu) : X@n pour une variante enchantée."""
    return f"{uid}@{ench}" if ench else uid

def recipe_kind(r, default):
    o = r.get('@craftbuttonlocaoverride', '')
    if 'TRANSMUTE' in o: return 'transmutation'
    if 'REFINE' in o: return 'raffinage'
    return default

def parse_recipe(r, default_kind):
    res = []
    for x in as_list(r.get('craftresource')):
        e = int(x.get('@enchantmentlevel', 0) or 0)
        uid = x['@uniquename']
        res.append({
            'id': market_id(uid, e),
            'qte': float(x['@count']),
            # maxreturnamount=0 : cet ingrédient n'est jamais rendu par le retour de ressources
            'sans_retour': x.get('@maxreturnamount') == '0',
        })
    return {
        'type': recipe_kind(r, default_kind),
        'argent': float(r.get('@silver', 0) or 0),
        'focus_base': float(r.get('@craftingfocus', 0) or 0),
        'quantite_produite': float(r.get('@amountcrafted', 1) or 1),
        'temps': float(r.get('@time', 0) or 0),
        'ingredients': res,
    }

records = {}

def add_record(uid, kind, it, ench, src_variant=None):
    v = src_variant or it
    mid = market_id(uid, ench)
    fr, en = name_of(uid, ench)
    rec = {
        'id': mid,
        'nom_fr': fr, 'nom_en': en,
        'famille_objet': kind,
        'tier': int(it.get('@tier', 0) or 0),
        'enchant': ench,
        'categorie': it.get('@shopcategory'),
        'sous_cat1': it.get('@shopsubcategory1'),
        'sous_cat2': it.get('@shopsubcategory2'),
        'categorie_craft': it.get('@craftingcategory'),
        'poids': float(it.get('@weight', 0) or 0),
        'echangeable': it.get('@tradable') != 'false',
        # Recyclage : 'true' explicite, ou équipement (armes/armures/sacs/capes/montures) sans 'false'.
        # HYPOTHÈSE à confirmer en jeu/wiki pour l'équipement sans attribut (voir rapport).
        'recyclable': it.get('@salvageable') == 'true' or (it.get('@salvageable') is None and kind in ('weapon','equipmentitem','mount','transformationweapon')),
        'recyclable_source': 'explicite' if it.get('@salvageable') == 'true' else ('hypothese_equipement' if it.get('@salvageable') is None and kind in ('weapon','equipmentitem','mount','transformationweapon') else None),
        'valeur_objet': float(v['@itemvalue']) if v.get('@itemvalue') else None,
        'valeur_objet_calculee': False,
        'item_power': int(v['@itempower']) if v.get('@itempower') else None,
        'nutrition': float(it['@nutrition']) if it.get('@nutrition') else None,
        'qualite_max': int(it.get('@maxqualitylevel', 1) or 1),
        'categorie_aliment': it.get('@foodcategory'),
        'recettes': [],
        'amelioration': None,
    }
    default_kind = 'craft'
    for r in as_list(v.get('craftingrequirements')):
        rec['recettes'].append(parse_recipe(r, default_kind))
    up = v.get('upgraderequirements')
    if up:
        u = as_list(up.get('upgraderesource'))
        rec['amelioration'] = {
            'depuis': market_id(uid, ench - 1),
            'ingredients': [{'id': x['@uniquename'], 'qte': float(x['@count'])} for x in u],
        }
    records[mid] = rec

for uid, (kind, it) in base_items.items():
    ench0 = int(it.get('@enchantmentlevel', 0) or 0)
    if uid.endswith(f'_LEVEL{ench0}') and ench0:
        add_record(uid, kind, it, ench0)   # ressource enchantée : objet à part entière (T4_ORE_LEVEL1 -> T4_ORE_LEVEL1@1)
    else:
        add_record(uid, kind, it, 0)
    for e in as_list((it.get('enchantments') or {}).get('enchantment')):
        add_record(uid, kind, it, int(e['@enchantmentlevel']), src_variant=e)

# ---------- Valeur d'objet calculée (équipement) ----------
# Règle officielle : la valeur d'un objet crafté = somme (quantité x valeur) de ses ingrédients.
# Elle est utilisée par le jeu pour la nutrition des stations (frais), le recyclage et la réparation.
def compute_value(mid, seen=()):
    r = records.get(mid)
    if not r: return None
    if r['valeur_objet'] is not None: return r['valeur_objet']
    if mid in seen or not r['recettes']: return None
    rc = next((x for x in r['recettes'] if x['type'] == 'craft'), r['recettes'][0])
    tot = 0.0
    for ing in rc['ingredients']:
        v = compute_value(ing['id'], seen + (mid,))
        if v is None: return None
        tot += v * ing['qte']
    val = tot / rc['quantite_produite']
    r['valeur_objet'] = round(val, 4)
    r['valeur_objet_calculee'] = True
    return val

for mid in list(records):
    compute_value(mid)

# ---------- Stations qui proposent la recette (buildings.json) ----------
# Une recette présente dans items.json n'est réellement faisable que si une station la liste.
# Les autres sont soit des achats PNJ (graines, carnets, cartes d'expédition…), soit des recettes inactives.
import re as _re
stations = collections.defaultdict(set)
for _kind, _lst in load('buildings.json')['buildings'].items():
    for _b in as_list(_lst):
        if not isinstance(_b, dict): continue
        for _c in as_list((_b.get('craftingitemlist') or {}).get('craftitem')):
            stations[_c['@uniquename']].add(_b['@uniquename'])
def _st(mid):
    b = mid.split('@')[0]
    return stations.get(b) or stations.get(_re.sub(r'_LEVEL\d$', '', b)) or set()
for mid, r in records.items():
    st = sorted(_st(mid))
    r['stations'] = st
    pnj = any(rc['argent'] and not rc['ingredients'] for rc in r['recettes'])
    r['obtention'] = ('station' if st else ('achat_pnj' if pnj else ('recette_sans_station' if r['recettes'] else 'non_fabricable')))

# ---------- Usages inverses ----------
used_in = collections.defaultdict(set)
for mid, r in records.items():
    for rc in r['recettes']:
        for ing in rc['ingredients']:
            used_in[ing['id']].add(mid)
    if r['amelioration']:
        for ing in r['amelioration']['ingredients']:
            used_in[ing['id']].add(mid)
        used_in[r['amelioration']['depuis']].add(mid)
for mid, r in records.items():
    r['sert_a_fabriquer'] = sorted(used_in.get(mid, []))

# ---------- Recyclage (réglages officiels, gamedata) ----------
gd = load('gamedata_europe.json')['AO-GameData']
salv = {int(x['@tier']): x for x in as_list(gd['DurabilityData']['Salvage']['Items']['GainFactors']['Item'])}
for mid, r in records.items():
    if not r['recyclable']:
        r['recyclage'] = None
        continue
    g = salv.get(r['tier'])
    rc = next((x for x in r['recettes'] if x['type'] == 'craft'), None)
    r['recyclage'] = {
        'part_ressources': float(g['@resource']) if g else None,
        'facteur_argent': float(g['@silver']) if g else None,
        'ressources_rendues': [
            {'id': i['id'], 'qte': round(i['qte'] * float(g['@resource']), 3)}
            for i in (rc['ingredients'] if rc and g else []) if not i['sans_retour']
        ],
        'note': "Argent rendu = facteur x valeur d'objet x état : formule exacte à confirmer (voir rapport).",
    }

# ---------- Bonus de ville (craftingmodifiers) ----------
world = {x['Index']: x['UniqueName'] for x in load('formatted/world.json')} if os.path.exists(os.path.join(DUMP, 'formatted/world.json')) else {}
cm = load('craftingmodifiers.json')['craftingmodifiers']
locations = []
for loc in as_list(cm['craftinglocation']):
    locations.append({
        'cluster': loc.get('@clusterid'),
        'nom': world.get(loc.get('@clusterid')) if loc.get('@clusterid') else f"{loc.get('@continent')} {loc.get('@biome')} {loc.get('@clusterquality')}",
        'bonus_raffinage': float(loc['refiningbonus']['@value']),
        'bonus_raffinage_ile': float(loc['refiningbonus'].get('@islandvalue', 0) or 0),
        'bonus_craft': float(loc['craftingbonus']['@value']) if loc.get('craftingbonus') else None,
        'bonus_craft_ile': float(loc['craftingbonus'].get('@islandvalue', 0) or 0) if loc.get('craftingbonus') else None,
        'specialites': {m['@name']: float(m['@value']) for m in as_list(loc.get('craftingmodifier'))},
    })

# ---------- Sorties ----------
with open(os.path.join(OUT, 'objets.json'), 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False)
with open(os.path.join(OUT, 'bonus_lieux.json'), 'w', encoding='utf-8') as f:
    json.dump(locations, f, ensure_ascii=False, indent=1)

with open(os.path.join(OUT, 'objets.csv'), 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f, delimiter=';')
    w.writerow(['id', 'nom_fr', 'tier', 'enchant', 'categorie', 'sous_cat1', 'categorie_craft', 'echangeable',
                'recyclable', 'valeur_objet', 'valeur_calculee', 'nb_recettes', 'recette_principale', 'focus_base',
                'argent_recette', 'sert_a_fabriquer_nb'])
    for mid, r in sorted(records.items()):
        rc = r['recettes'][0] if r['recettes'] else None
        w.writerow([mid, r['nom_fr'], r['tier'], r['enchant'], r['categorie'], r['sous_cat1'], r['categorie_craft'],
                    r['echangeable'], r['recyclable'], r['valeur_objet'], r['valeur_objet_calculee'], len(r['recettes']),
                    ' + '.join(f"{i['qte']:g}x {i['id']}" for i in rc['ingredients']) if rc else '',
                    rc['focus_base'] if rc else '', rc['argent'] if rc else '', len(r['sert_a_fabriquer'])])

stats = collections.Counter()
for r in records.values():
    stats['objets'] += 1
    stats['avec_recette'] += bool(r['recettes'])
    stats['echangeables'] += r['echangeable']
    stats['recyclables'] += r['recyclable']
    stats['valeur_connue'] += r['valeur_objet'] is not None
    stats['valeur_calculee'] += r['valeur_objet_calculee']
    stats['nom_fr'] += bool(r['nom_fr'])
    for rc in r['recettes']:
        stats['recettes_' + rc['type']] += 1
    stats['ameliorations'] += bool(r['amelioration'])
print(json.dumps(stats, indent=1, ensure_ascii=False))

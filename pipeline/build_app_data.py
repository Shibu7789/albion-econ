"""Compile les données de l'outil (data.js) à partir de la base out/*.json et du dump officiel.

Tout vient des données officielles ; ce script ne fait que filtrer et compacter.
Usage : python3 -I build_app_data.py <dossier_dump> <dossier_out> <fichier_sortie.js>
"""
import json, sys, os, re, fnmatch, collections

DUMP, OUT, DEST = sys.argv[1], sys.argv[2], sys.argv[3]
J = lambda n: json.load(open(os.path.join(OUT, n), encoding='utf-8'))
objets = J('objets.json')

# Stations présentes dans les villes royales (les autres : magasins de saison, test, faction, brumes…)
REAL = re.compile(r'^T\d_(HUNTERSLODGE|FORGE|MAGICITEMS|TOOLMAKER|COOK|ALCHEMIST|CARPENTERSWORKSHOP|SMELTER|TANNERY|WEAVINGMILL|STABLE|STONEMASONRY|BUTCHER|MILL|MELDBUILDING)$')
EXCL_CAT = {'furniture', 'vanity'}
# graines, bébés et animaux (achetés au PNJ, module Îles) ; les produits de ferme (pain, beurre, alcool, viande) restent
EXCL_SUB = {('other', 'guilds'), ('other', 'labourers'), ('gathering', 'tracking'),
            ('farming', 'farm'), ('farming', 'herbgarden'), ('farming', 'pasture'), ('farming', 'kennel')}

def real_station(r):
    return [s for s in r['stations'] if REAL.match(s)]

targets = {}
for mid, r in objets.items():
    if not r['echangeable'] or r['categorie'] in EXCL_CAT or (r['categorie'], r['sous_cat1']) in EXCL_SUB:
        continue
    st = real_station(r)
    if not st:
        continue
    recs = [rc for rc in r['recettes'] if rc['ingredients']]
    if not recs and not r['amelioration']:
        continue
    targets[mid] = (r, st, recs)

# Objets à inclure : cibles + leurs ingrédients + objets des îles
need = set(targets)
for mid, (r, st, recs) in targets.items():
    for rc in recs:
        for i in rc['ingredients']:
            need.add(i['id'])
    if r['amelioration']:
        need.add(r['amelioration']['depuis'])
        for i in r['amelioration']['ingredients']:
            need.add(i['id'])

# Objets recyclables échangeables ayant une recette : on garde la recette pour calculer ce que rend le recyclage
raw_items = {}
for kind, lst in json.load(open(os.path.join(DUMP, 'items.json'), encoding='utf-8'))['items'].items():
    if isinstance(lst, list):
        for it in lst:
            raw_items[it['@uniquename']] = it
def salvage_factor(base_id):
    it = raw_items.get(base_id) or {}
    rc = it.get('craftingrequirements')
    rc = rc[0] if isinstance(rc, list) else (rc or {})
    return float(rc.get('@salvageitemfactor', 1))
salv = {}
for mid, r in objets.items():
    if not (r['echangeable'] and r['recyclable']): continue
    rc = next((x for x in r['recettes'] if x['type'] == 'craft' and x['ingredients']), None)
    if not rc: continue
    f = salvage_factor(mid.split('@')[0])
    if f <= 0: continue
    salv[mid] = (f, rc)
    need.add(mid)
    for i in rc['ingredients']:
        need.add(i['id'])

farm = J('agriculture_elevage.json')
for a in farm:
    need.add(a['id'])
    for k in ('adulte', 'aliment_prefere'):
        if a.get(k): need.add(a[k])
    for lst in ('recolte', 'production'):
        for x in a.get(lst) or []:
            need.add(x['id'])
for j in J('carnets.json'):
    need.add(j['id'])
    for b in j['butin']:
        if b['id']: need.add(b['id'])
for p in J('pnj_prix_fixe.json'):
    need.add(p['objet'])
# Tous les végétaux et viandes (nourriture des animaux)
for mid, r in objets.items():
    if r.get('categorie_aliment') in ('plants', 'meat'):
        need.add(mid)

ids = sorted(i for i in need if i in objets)
index = {mid: n for n, mid in enumerate(ids)}

STATION_KIND = lambda st: sorted({re.sub(r'^T\d_', '', s) for s in st})

items = []
for mid in ids:
    r = objets[mid]
    nm = r['nom_fr'] or r['nom_en']
    mexp = re.match(r'QUESTITEM_EXP_TOKEN_D(\d+)_T(\d)_EXP_HRD_(\w+)', mid)
    if not nm and mexp:
        nm = f"Carte d'expédition extrême D{mexp.group(1)} (T{mexp.group(2)}, {mexp.group(3).replace('_', ' ').lower()})"
    e = {'id': mid, 'n': nm or mid, 't': r['tier'], 'e': r['enchant'],
         'cat': r['categorie'], 'sc': r['sous_cat1'], 'cc': r['categorie_craft'],
         'v': r['valeur_objet'], 'tr': 1 if r['echangeable'] else 0, 'q': r.get('qualite_max', 1),
         'w': r['poids']}
    ft = (raw_items.get(mid.split('@')[0]) or {}).get('@fasttravelfactor')
    if ft: e['ft'] = float(ft)                     # facteur de coût du Travel Planner (défaut 1)
    if r.get('nutrition'):
        e['nu'] = r['nutrition']; e['fc'] = r.get('categorie_aliment')
    if mid in targets:
        _, st, recs = targets[mid]
        e['st'] = STATION_KIND(st)
        e['r'] = [[rc['argent'], rc['focus_base'], rc['quantite_produite'],
                   {'craft': 0, 'raffinage': 1, 'transmutation': 2}[rc['type']],
                   [[index[i['id']], i['qte'], 1 if i['sans_retour'] else 0] for i in rc['ingredients'] if i['id'] in index]]
                  for rc in recs if all(i['id'] in index for i in rc['ingredients'])]
        if r['amelioration'] and r['amelioration']['depuis'] in index:
            e['up'] = [index[r['amelioration']['depuis']],
                       [[index[i['id']], i['qte']] for i in r['amelioration']['ingredients'] if i['id'] in index]]
    if mid in salv:
        f, rc = salv[mid]
        if all(i['id'] in index for i in rc['ingredients']):
            # recyclage : [facteur, quantité produite, [[ingrédient, quantité, non rendu au RRR], ...]]
            e['sv'] = [f, rc['quantite_produite'], [[index[i['id']], i['qte'], 1 if i['sans_retour'] else 0] for i in rc['ingredients']]]
    items.append(e)

# ---------- Destiny Board : noms FR + bonus par objet (précalculés) ----------
loc = {}
for t in json.load(open(os.path.join(DUMP, 'localization.json'), encoding='utf-8'))['tmx']['body']['tu']:
    tid = t.get('@tuid', '')
    if tid.startswith('@DESTINYBOARD_TITLE_'):
        for v in (t['tuv'] if isinstance(t['tuv'], list) else [t['tuv']]):
            if v.get('@xml:lang') == 'FR-FR':
                loc[tid[len('@DESTINYBOARD_TITLE_'):]] = v.get('seg')

D = J('destiny_board.json')
nodes = [n for n in D['noeuds'] if n['categorie'] in ('crafting', 'farming')
         and any(b['type'] in ('craftingfocuscostreduction', 'farmingfocuscostreduction', 'itemcraftquality') for b in n['bonus'])]
parent = {n['id']: (n['parents'] or [None])[0] for n in D['noeuds']}
def chain(i):
    out = []
    while i and i not in out:
        out.append(i); i = parent.get(i)
    return out[::-1]          # racine -> nœud
def group_of(i):
    # branche = 2e niveau sous CRAFT_TRAINEE / FARM_TRAINEE (ex. raffinage du tissu, bâtons damnés, alchimiste)
    c = chain(i)
    k = next((j for j, x in enumerate(c) if x in ('CRAFT_TRAINEE', 'FARM_TRAINEE')), None)
    return c[min(k + 2, len(c) - 1)] if k is not None else c[-1]
node_list = [{'id': n['id'], 'n': loc.get(n['id']) or n['id'], 'g': n['categorie'], 'm': n['modele'],
              'grp': group_of(n['id']), 'gn': loc.get(group_of(n['id'])) or group_of(n['id'])} for n in nodes]
TYPE = {'craftingfocuscostreduction': 'f', 'farmingfocuscostreduction': 'a', 'itemcraftquality': 'q'}
# bonus[itemIndex] = [[nodeIndex, points_par_niveau, type], ...]  (points = valeur x 100, cf. rapport)
bonus = collections.defaultdict(list)
base_ids = collections.defaultdict(list)
for mid in ids:
    base_ids[mid.split('@')[0]].append(mid)
for ni, n in enumerate(nodes):
    for b in n['bonus']:
        if b['type'] not in TYPE: continue
        pats = b['objets_concernes'] or n['objets']
        tmin = int(b['tier_min'] or 0); tmax = int(b['tier_max'] or 9)
        for base, mids in base_ids.items():
            if any(fnmatch.fnmatchcase(base, p) for p in pats):
                for mid in mids:
                    it = objets[mid]
                    if tmin <= it['tier'] <= tmax:
                        bonus[index[mid]].append([ni, round(b['valeur_par_niveau'] * 100, 4), TYPE[b['type']]])

# ---------- Tier débloqué selon le niveau du nœud de base (colonne UnlockTier des modèles officiels) ----------
unlock = {}
for t in json.load(open(os.path.join(DUMP, 'achievements.json'), encoding='utf-8'))['achievements']['template']:
    bl = t.get('baselevels')
    if not bl: continue
    cols = bl['@structure'].split(';')
    if 'UnlockTier' not in cols: continue
    ui = cols.index('UnlockTier')
    rows = [r.strip().split(';') for r in bl.get('#text', '').strip().splitlines() if r.strip()]
    tab = [[i + 1, int(r[ui])] for i, r in enumerate(rows) if len(r) > ui and r[ui]]
    if tab: unlock[t['@name']] = tab

# ---------- Bonus de lieux (villes royales uniquement) ----------
CITIES = ['Thetford', 'Lymhurst', 'Bridgewatch', 'Martlock', 'Fort Sterling', 'Caerleon', 'Brecilien']
lieux = {l['nom']: l for l in J('bonus_lieux.json') if l['nom'] in CITIES}
farm_bonus = [b for b in J('bonus_agricoles_lieux.json') if b['lieu'] in CITIES]

gd = json.load(open(os.path.join(DUMP, 'gamedata_europe.json'), encoding='utf-8'))['AO-GameData']
mk = gd['MarketPlace']['TaxValues']['TaxFactor']
consts = {
    'focusBonus': float(gd['ActionFocus']['CraftingEfficiency']['@bonus']),
    'setupFee': next(float(x['@value']) for x in mk if x['@name'] == 'setupfee'),
    'salesTax': next(float(x['@value']) for x in mk if x['@name'] == 'transactiontax'),
    'nutritionFactor': float(gd['ItemValueToNutrition']['@factor']),
    'qualityChances': [int(x['@weight']) for x in gd['CraftingQualityChances']['QualityLevel']],
    'salvageResource': 0.2,
    'maxStationFee': float(gd['BuildingManagement']['@maxuseagefee']),
}

def dump_version():
    import subprocess
    try:
        out = subprocess.run(['git', '-C', DUMP, 'log', '-1', '--format=%H %cs'], capture_output=True, text=True).stdout.split()
        return {'commit': out[0], 'date': out[1]}
    except Exception:
        return {'commit': None, 'date': None}

data = {
    'version': dump_version(),
    'unlock': unlock, 'items': items, 'nodes': node_list, 'bonus': {str(k): v for k, v in bonus.items()},
    'cities': {c: {'raff': lieux[c]['bonus_raffinage'], 'craft': lieux[c]['bonus_craft'], 'spe': lieux[c]['specialites']} for c in CITIES if c in lieux},
    'farm': farm, 'farmBonus': farm_bonus, 'laborers': J('travailleurs.json'), 'journals': J('carnets.json'),
    'houses': J('maisons.json'), 'npc': J('pnj_prix_fixe.json'), 'consts': consts,
}
s = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
with open(DEST, 'w', encoding='utf-8') as f:
    f.write('window.ALBION_DATA=' + s + ';\n')
print('objets', len(items), 'cibles', len(targets), 'noeuds', len(node_list), 'taille', round(len(s) / 1e6, 2), 'Mo')

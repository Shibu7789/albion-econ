"""Destiny Board (maîtrises/spécialisations) extrait de achievements.json (données officielles).
Chaque noeud : catégorie, objets couverts, bonus PAR NIVEAU (type, valeur, portée), coût en renommée par niveau.
Usage : python3 -I build_destiny.py <dossier_dump> <dossier_sortie>
"""
import json, sys, os
DUMP, OUT = sys.argv[1], sys.argv[2]
def as_list(x): return [] if x is None else (x if isinstance(x, list) else [x])

a = json.load(open(os.path.join(DUMP, 'achievements.json'), encoding='utf-8'))['achievements']

# Coût par niveau (renommée, LP) par modèle
templates = {}
for t in as_list(a.get('template')):
    name = t.get('@name')
    for part in ('baselevels', 'elitelevels'):
        bl = t.get(part)
        if not bl: continue
        cols = bl['@structure'].split(';')
        rows = [r.strip() for r in bl.get('#text', '').strip().splitlines() if r.strip()]
        lv = []
        for r in rows:
            v = r.split(';')
            lv.append({'renommee': float(v[0]), 'lp': float(v[1]) if len(v) > 1 and v[1] else None})
        templates.setdefault(name, {})[part] = lv

nodes = []
for t in as_list(a.get('templateachievement')) + as_list(a.get('achievement')):
    if not isinstance(t, dict) or not t.get('@id'): continue
    node = {
        'id': t['@id'], 'categorie': t.get('@category'), 'modele': t.get('@usetemplate'),
        'mission': t.get('@missiontype'), 'parents': [p.get('@id') for p in as_list((t.get('parentachievements') or {}).get('achievement'))],
        'objets': [p['@pattern'] for p in as_list((t.get('itemlist') or {}).get('itempattern'))],
        'multiplicateur_renommee': float(t['@famemultiplier']) if t.get('@famemultiplier') else None,
        'bonus': [],
    }
    for part, label in (('baserewards', 'niveaux_1_100'), ('eliterewards', 'niveaux_elite_100_120')):
        for b in as_list((t.get(part) or {}).get('bonus')):
            node['bonus'].append({
                'palier': label, 'type': b.get('@type'), 'attribut': b.get('@attribute'),
                'valeur_par_niveau': float(b['@bonus']) if b.get('@bonus') else None,
                'tier_min': b.get('@mintier'), 'tier_max': b.get('@maxtier'),
                'objets_concernes': [p['@pattern'] for p in as_list(b.get('itempattern'))],
                'cle_description': (b.get('description') or {}).get('@tag'),
            })
    nodes.append(node)

json.dump({'noeuds': nodes, 'couts_par_modele': templates},
          open(os.path.join(OUT, 'destiny_board.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
import collections
print(len(nodes), collections.Counter(n['categorie'] for n in nodes))

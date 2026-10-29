#!/usr/bin/env python3
"""Apply img paths + food-tab refs to data/fukuoka2027.json (one-off, patch in place)."""
import json, os, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(ROOT, 'data', 'fukuoka2027.json')
d = json.load(open(P))

R = lambda k: 'img/' + k + '.jpg'
V = lambda k: 'img/v_' + k + '.jpg'

# (day_idx, time) -> img path
IMG = {
 (0,'11:00'):V('airplane'),(0,'15:00'):V('airport'),(0,'16:00'):V('subway'),(0,'17:00'):V('hotel'),
 (0,'18:00'):V('nakasu'),(0,'19:00'):V('yatai'),(0,'19:30'):R('ichiran'),(0,'20:00'):R('ukokkei'),
 (0,'21:30'):V('nakasu_night'),(0,'22:00'):V('nakasu_night'),(0,'23:00'):R('yamori'),(0,'23:30'):V('street_night'),
 (1,'07:00'):R('maruuma'),(1,'08:30'):V('hakata_sta'),(1,'09:00'):V('yufuin_train'),(1,'11:30'):V('yufuin'),
 (1,'12:00'):V('yufuin_street'),(1,'13:00'):R('yufuya'),(1,'14:00'):V('kinrin'),(1,'15:00'):V('onsen'),
 (1,'15:30'):V('wagashi'),(1,'16:00'):V('yufuin_train'),(1,'18:00'):V('hakata_sta'),(1,'18:30'):V('tenjin_u'),
 (1,'19:00'):V('tenjin'),(1,'19:30'):V('subway'),(1,'20:00'):R('fishman'),(1,'21:30'):V('sumiyoshi'),
 (1,'22:00'):V('haruyoshi'),(1,'23:00'):R('toroichi'),(1,'23:30'):V('street_night'),
 (2,'09:00'):R('nagahamaya'),(2,'09:30'):V('kushida'),(2,'11:30'):R('umakatai'),(2,'13:30'):V('tochoji'),
 (2,'14:00'):V('shofukuji'),(2,'14:30'):V('sofukuji'),(2,'15:30'):V('canalcity'),(2,'17:00'):V('canalcity'),
 (2,'18:00'):V('izakaya_alley'),(2,'19:00'):V('hakata_st'),(2,'20:00'):R('tokunagaya'),(2,'21:30'):V('canalcity'),
 (2,'22:00'):V('nakasu_night'),(2,'23:00'):R('t6o'),(2,'23:30'):V('street_night'),
 (3,'08:00'):R('yariudon'),(3,'09:00'):V('nishitetsu'),(3,'09:30'):V('dazaifu'),(3,'11:30'):V('nishitetsu'),
 (3,'12:30'):R('shinshin'),(3,'14:30'):V('tenjin_u'),(3,'15:30'):V('kego'),(3,'16:30'):V('daimyo'),
 (3,'17:30'):V('cafe'),(3,'19:00'):V('daimyo'),(3,'20:00'):R('yamasyo'),(3,'21:30'):V('tenjin_night'),
 (3,'22:00'):V('tenjin_night'),(3,'23:00'):R('kegomusu'),(3,'23:30'):V('street_night'),
 (4,'09:00'):R('hakataya'),(4,'09:30'):V('subway'),(4,'11:00'):V('teamlab'),(4,'13:00'):R('tanca'),
 (4,'14:00'):V('ohori'),(4,'16:30'):V('tenjin'),(4,'18:00'):V('street_night'),(4,'19:00'):V('nakasu'),
 (4,'20:00'):R('kuroya'),(4,'21:30'):V('pachinko'),(4,'22:30'):V('pachinko'),(4,'23:00'):R('gascon'),(4,'23:30'):V('street_night'),
 (5,'08:00'):R('yariudon'),(5,'08:30'):V('luggage'),(5,'09:00'):V('sumiyoshi'),(5,'10:00'):V('tenjin'),
 (5,'11:00'):V('zenzai'),(5,'12:00'):R('mugen'),(5,'14:00'):V('subway'),(5,'15:00'):V('airport'),
 (5,'20:00'):V('airplane'),(5,'23:00'):V('hk'),
}

# (day_idx, time) -> food tab section idx
REF = {
 (0,'19:30'):0,(0,'20:00'):0,(0,'23:00'):16,
 (1,'07:00'):1,(1,'13:00'):2,(1,'15:00'):15,(1,'20:00'):3,(1,'23:00'):16,
 (2,'09:00'):4,(2,'11:30'):5,(2,'20:00'):6,(2,'23:00'):16,
 (3,'08:00'):7,(3,'12:30'):8,(3,'20:00'):9,(3,'23:00'):16,
 (4,'09:00'):10,(4,'13:00'):11,(4,'20:00'):12,(4,'23:00'):16,
 (5,'08:00'):13,(5,'12:00'):14,
}

food_id = d['tabs'][0]['id']
applied_img = applied_ref = 0
missing = []
for di, day in enumerate(d['days']):
    for e in day['entries']:
        key = (di, e.get('time'))
        if key in IMG:
            e['img'] = IMG[key]; applied_img += 1
        elif not e.get('img'):
            missing.append((di, e.get('time'), e.get('activity','')[:30]))
        if key in REF:
            e['ref'] = {'tab': food_id, 'section': REF[key]}; applied_ref += 1

shutil.copy(P, P + '.bak')
json.dump(d, open(P, 'w'), ensure_ascii=False, indent=1)
print('img applied:', applied_img, '| ref applied:', applied_ref, '| total entries:', sum(len(x['entries']) for x in d['days']))
if missing:
    print('NO IMG for:')
    for m in missing: print('  ', m)

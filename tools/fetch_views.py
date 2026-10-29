#!/usr/bin/env python3
"""Fetch view/landmark images via Openverse API using curl (urllib hangs)."""
import json, os, subprocess, sys, time, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'img')
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'

VIEWS = json.load(open(sys.argv[1])) if len(sys.argv) > 1 else {
    'airplane':     'airliner takeoff sky',
    'airport':      'Fukuoka Airport',
    'subway':       'Fukuoka subway train',
    'hotel':        'hotel room bed',
    'nakasu':       'Nakasu Fukuoka',
    'yatai':        'yatai food stall Fukuoka',
    'nakasu_night': 'Nakasu Fukuoka night',
    'street_night': 'Fukuoka street night',
    'hakata_sta':   'Hakata Station',
    'yufuin_train': 'Yufuin no Mori train',
    'yufuin':       'Yufuin onsen town',
    'yufuin_street':'Yufuin street',
    'kinrin':       'Kinrin Lake Yufuin',
    'onsen':        'onsen outdoor Japan',
    'wagashi':      'wagashi',
    'tenjin_u':     'underground shopping mall Japan',
    'tenjin':       'Tenjin Fukuoka',
    'sumiyoshi':    'Sumiyoshi Shrine Fukuoka',
    'haruyoshi':    'Haruyoshi bridge Fukuoka',
    'kushida':      'Kushida Shrine Fukuoka',
    'tochoji':      'Tochoji Fukuoka',
    'shofukuji':    'Shofukuji Fukuoka',
    'sofukuji':     'temple gate Japan',
    'canalcity':    'Canal City Hakata',
    'izakaya_alley':'izakaya lantern night',
    'hakata_st':    'Hakata traditional street',
    'nishitetsu':   'Nishitetsu train',
    'dazaifu':      'Dazaifu Tenmangu',
    'kego':         'shrine torii lantern',
    'daimyo':       'Daimyo Fukuoka',
    'cafe':         'cafe interior latte',
    'tenjin_night': 'neon signs night street Japan',
    'teamlab':      'teamLab digital art',
    'ohori':        'Ohori Park Fukuoka',
    'pachinko':     'pachinko neon',
    'luggage':      'suitcase travel',
    'zenzai':       'zenzai dessert',
    'hk':           'Hong Kong skyline night',
}

def sh(cmd, timeout=30):
    return subprocess.run(cmd, capture_output=True, timeout=timeout)

def curl_json(url):
    r = sh(['curl', '-s', '-m', '20', '-A', UA, '-H', 'Accept: application/json', url])
    if r.returncode != 0: return None
    try: return json.loads(r.stdout)
    except Exception: return None

def curl_dl(url, path):
    r = sh(['curl', '-sL', '-m', '40', '-A', UA, '-o', path, url], timeout=50)
    return r.returncode == 0 and os.path.exists(path) and os.path.getsize(path) > 5000

out = {}
for key, q in VIEWS.items():
    path = os.path.join(IMG, 'v_' + key + '.jpg')
    if os.path.exists(path) and os.path.getsize(path) > 5000:
        out[key] = 'img/v_' + key + '.jpg'; continue
    try:
        api = 'https://api.openverse.org/v1/images/?q=' + urllib.parse.quote(q) + '&license_type=all&page_size=20&extension=jpg'
        d = curl_json(api)
        results = (d or {}).get('results', [])
        if not results:
            print('NO RESULT', key); continue
        pick = None
        for r in results:
            if 'flickr' in ((r.get('source') or '') + (r.get('url') or '')):
                pick = r; break
        pick = pick or results[0]
        if curl_dl(pick['url'], path):
            out[key] = 'img/v_' + key + '.jpg'
            print('ok', key, pick.get('source'))
        else:
            print('DL FAIL', key)
    except Exception as e:
        print('ERR', key, str(e)[:60])
    time.sleep(0.8)

json.dump(out, open('/tmp/views_map.json', 'w'), indent=1)
print('done:', len(out), '/', len(VIEWS))

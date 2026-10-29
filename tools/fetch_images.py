#!/usr/bin/env python3
"""Fetch images for fukuoka2027 schedule entries.
- Restaurants: Tabelog detail pages (JSON-LD image, tblg.k-img.com)
- Views/landmarks: Openverse API (CC images, prefer Flickr source)
Downloads into img/ and writes img path + ref into data/fukuoka2027.json.
"""
import json, re, time, os, sys, urllib.request, urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, 'img')
os.makedirs(IMG, exist_ok=True)
DATA = os.path.join(ROOT, 'data', 'fukuoka2027.json')
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'}

def curl(url, timeout=25):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

# ---------- restaurants (Tabelog) ----------
# key -> (tw detail url)
RESTAURANTS = {
    'ichiran':    'https://tabelog.com/tw/fukuoka/A4001/A400102/40000130/',
    'ukokkei':    'https://tabelog.com/tw/fukuoka/A4001/A400102/40000182/',
    'maruuma':    'https://tabelog.com/tw/fukuoka/A4001/A400101/40023369/',
    'nagahamaya': 'https://tabelog.com/tw/fukuoka/A4001/A400102/40043172/',
    'umakatai':   'https://tabelog.com/tw/fukuoka/A4001/A400103/40071897/',
    'yariudon':   'https://tabelog.com/tw/fukuoka/A4001/A400103/40000661/',
    'shinshin':   'https://tabelog.com/tw/fukuoka/A4001/A400103/40004980/',
    'tanca':      'https://tabelog.com/tw/fukuoka/A4001/A400103/40021035/',
    'kuroya':     'https://tabelog.com/tw/fukuoka/A4001/A400103/40016688/',
    'mugen':      'https://tabelog.com/tw/fukuoka/A4001/A400102/40066203/',
    'yamori':     'https://tabelog.com/tw/fukuoka/A4001/A400102/40035902/',
    'toroichi':   'https://tabelog.com/tw/fukuoka/A4001/A400103/40072947/',
    't6o':        'https://tabelog.com/tw/fukuoka/A4001/A400102/40042784/',
    'kegomusu':   'https://tabelog.com/tw/fukuoka/A4001/A400104/40044872/',
    'gascon':     'https://tabelog.com/tw/fukuoka/A4001/A400102/40028481/',
    'yufuya':     'https://tabelog.com/tw/oita/A4402/A440201/44013875/',
    'hakataya':   'https://tabelog.com/tw/fukuoka/A4001/A400102/40003251/',
    'fishman':    'https://tabelog.com/tw/fukuoka/A4001/A400104/40006960/',
    'tokunagaya': 'https://tabelog.com/tw/fukuoka/A4001/A400101/40056861/',
    'yamasyo':    'https://tabelog.com/tw/fukuoka/A4001/A400104/40072435/',
}

def fetch_restaurant_images():
    out = {}
    for key, url in RESTAURANTS.items():
        path = os.path.join(IMG, key + '.jpg')
        if os.path.exists(path) and os.path.getsize(path) > 5000:
            out[key] = 'img/' + key + '.jpg'
            continue
        try:
            html = curl(url).decode('utf-8', 'ignore')
            m = re.search(r'"image":"(https://tblg\.k-img\.com/restaurant/images/[^"]+)"', html)
            if not m:
                m = re.search(r'property="og:image" content="(https://tblg\.k-img\.com[^"]+)"', html)
            if not m:
                print('NO IMG', key); continue
            img_url = m.group(1).replace('\\/', '/')
            data = curl(img_url)
            open(path, 'wb').write(data)
            out[key] = 'img/' + key + '.jpg'
            print('ok', key, len(data))
        except Exception as e:
            print('ERR', key, str(e)[:80])
        time.sleep(0.4)
    return out

# ---------- views (Openverse) ----------
VIEWS = {
    'airplane':   'airliner takeoff sky',
    'airport':    'Fukuoka Airport',
    'subway':     'Fukuoka subway train',
    'hotel':      'hotel room bed',
    'nakasu':     'Nakasu Fukuoka night',
    'yatai':      'yatai food stall Fukuoka',
    'nakasu_night': 'Nakasu night view Fukuoka',
    'street_night': 'Fukuoka street night',
    'hakata_sta': 'Hakata Station Fukuoka',
    'yufuin_train': 'Yufuin no Mori train',
    'yufuin':     'Yufuin onsen town',
    'yufuin_street': 'Yufuin street Japan',
    'kinrin':     'Kinrin Lake Yufuin',
    'onsen':      'onsen outdoor bath Japan',
    'wagashi':    'wagashi Japanese sweets',
    'tenjin_u':   'shopping mall Japan underground',
    'tenjin':     'Tenjin Fukuoka',
    'sumiyoshi':  'Sumiyoshi Shrine Fukuoka',
    'haruyoshi':  'Haruyoshi bridge Fukuoka night',
    'kushida':    'Kushida Shrine Fukuoka',
    'tochoji':    'Tochoji temple Fukuoka',
    'shofukuji':  'Shofukuji temple Fukuoka',
    'sofukuji':   'Sofukuji temple Nagasaki',  # Fukuoka one is rare; fallback
    'canalcity':  'Canal City Hakata',
    'izakaya_alley': 'izakaya lantern alley night',
    'hakata_st':  'Hakata old town street',
    'nishitetsu': 'Nishitetsu train Japan',
    'dazaifu':    'Dazaifu Tenmangu shrine',
    'kego':       'shrine torii Fukuoka',
    'daimyo':     'Daimyo Fukuoka street',
    'cafe':       'cafe interior latte',
    'tenjin_night': 'Tenjin Fukuoka night neon',
    'teamlab':    'teamLab digital art',
    'ohori':      'Ohori Park Fukuoka',
    'pachinko':   'pachinko parlor neon',
    'luggage':    'suitcase luggage travel',
    'zenzai':     'zenzai red bean dessert',
    'hk':         'Hong Kong skyline night',
}

def fetch_view_images():
    out = {}
    for key, q in VIEWS.items():
        path = os.path.join(IMG, 'v_' + key + '.jpg')
        if os.path.exists(path) and os.path.getsize(path) > 5000:
            out[key] = 'img/v_' + key + '.jpg'
            continue
        try:
            api = 'https://api.openverse.org/v1/images/?q=' + urllib.parse.quote(q) + '&license_type=all&page_size=20&extension=jpg'
            d = json.loads(curl(api))
            results = d.get('results', [])
            # prefer flickr source, landscape-ish
            pick = None
            for r in results:
                if 'flickr' in (r.get('source') or '') or 'flickr' in (r.get('url') or ''):
                    pick = r; break
            if not pick and results:
                pick = results[0]
            if not pick:
                print('NO RESULT', key); continue
            data = curl(pick['url'], timeout=30)
            open(path, 'wb').write(data)
            out[key] = 'img/v_' + key + '.jpg'
            print('ok', key, pick.get('source'), len(data))
        except Exception as e:
            print('ERR', key, str(e)[:80])
        time.sleep(1.2)
    return out

if __name__ == '__main__':
    rest = fetch_restaurant_images()
    views = fetch_view_images()
    json.dump({'restaurants': rest, 'views': views}, open('/tmp/images_map.json', 'w'), ensure_ascii=False, indent=1)
    print('restaurants:', len(rest), 'views:', len(views))
    print('saved /tmp/images_map.json')

# -*- coding: utf-8 -*-
"""Convert build_fukuoka.py data structures into trip-hub JSON files."""
import json, os

# execute the builder in a namespace to grab its data literals (side effect: regenerates xlsx, harmless)
ns = {}
exec(open("/home/user/workspace/build_fukuoka.py", encoding="utf-8").read(), ns)

d = [ns["d1"], ns["d2"], ns["d3"], ns["d4"], ns["d5"], ns["d6"]]
sections = ns["sections"]          # 餐廳資料: [(title, [row9]), ...]
pac = ns["pac"]                    # 柏青哥: [(主題, 內容, link), ...]
tr = ns["tr"]                      # 交通住宿: [(項目, 內容, link), ...]

def rows_with_url(rows, drop=None):
    out = []
    for r in rows:
        cells = list(r[:drop]) if drop else list(r)
        out.append({"cells": cells, "url": r[drop] if drop else ""})
    return out

# schedule days
labels = ["Day 1 (一)", "Day 2 (二)", "Day 3 (三)", "Day 4 (四)", "Day 5 (五)", "Day 6 (六)"]
dates = ["2027-03-01", "2027-03-02", "2027-03-03", "2027-03-04", "2027-03-05", "2027-03-06"]
days = []
for i, rows in enumerate(d):
    entries = []
    for t, act, rem in rows:
        entries.append({"time": t, "activity": act, "remark": rem})
    days.append({"date": dates[i], "label": labels[i], "entries": entries})

# 餐廳資料 tab: 9-tuple (name, no, type, area, price, rating, url, note) — keep name link
food_sections = []
for title, rows in sections:
    sec_rows = []
    for r in rows:
        name, no, typ, area, price, rating, url, note = r[:8]
        sec_rows.append({"cells": [name, no, typ, area, price, rating, note], "url": url})
    food_sections.append({"title": title, "headers": ["選項", "榜內No.", "類型", "地區/最近站", "價位(每人)", "評分", "備註"], "rows": sec_rows})

def simple_tab(tid, name, headers, rows):
    rr = [{"cells": [c for c in r[:len(headers)]], "url": (r[len(headers)] if len(r) > len(headers) else "")} for r in rows]
    return {"id": tid, "name": name, "type": "sections",
            "sections": [{"title": "", "headers": headers, "rows": rr}]}

trip = {
    "schemaVersion": 1,
    "id": "fukuoka2027",
    "title": "福岡 2027",
    "subtitle": "3人自由行 · 3月1-6日 · 天神/中洲",
    "startDate": "2027-03-01",
    "endDate": "2027-03-06",
    "timezone": "Asia/Tokyo",
    "days": days,
    "tabs": [
        {"id": "food", "name": "餐廳資料", "type": "sections", "sections": food_sections},
        simple_tab("pachinko", "柏青哥指南", ["主題", "內容"], pac),
        simple_tab("transport", "交通住宿", ["項目", "內容"], tr),
    ],
}

index = {
    "schemaVersion": 1,
    "currentTrip": "fukuoka2027",
    "trips": [{
        "id": "fukuoka2027",
        "title": "福岡 2027",
        "subtitle": "3人自由行 · 3月1-6日",
        "file": "fukuoka2027.json",
        "startDate": "2027-03-01",
        "endDate": "2027-03-06",
        "timezone": "Asia/Tokyo",
    }],
}

os.makedirs("/home/user/workspace/trip-hub/data", exist_ok=True)
with open("/home/user/workspace/trip-hub/data/fukuoka2027.json", "w", encoding="utf-8") as f:
    json.dump(trip, f, ensure_ascii=False, indent=1)
with open("/home/user/workspace/trip-hub/data/index.json", "w", encoding="utf-8") as f:
    json.dump(index, f, ensure_ascii=False, indent=1)

n_entries = sum(len(x["entries"]) for x in days)
print(f"OK: {len(days)} days, {n_entries} entries, {len(food_sections)} food sections, tabs={len(trip['tabs'])}")

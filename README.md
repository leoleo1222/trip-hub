# Trip Hub — 旅行行程平台

一個可重用嘅旅行行程平台：每日行程、餐廳資料、指南，全部用 JSON 儲存，host 喺 GitHub Pages。

- 網站: https://leoleo1222.github.io/trip-hub/
- 技術: 純靜態 — HTML + CSS + JavaScript，數據全部喺 `data/*.json`

## 用家旅程

1. 朋友打開網站 → 自動見到「今日行程」（旅程未開始就睇 Day 1 + 倒數）
2. 上面嘅 nav 撳入唔同 tab：餐廳資料、柏青哥指南、交通住宿
3. 想改嘢：右上角 ⚙ 設定 → 輸入密碼 → 4 小時編輯 session
4. 編輯模式可以：加/改/刪行程項目、加資料列、開新 tab、開新旅程

## 編輯 → 發佈流程（重要）

GitHub Pages 係純靜態，冇後端 — 編輯嘅改動先儲存喺**瀏覽器本地**（localStorage），要發佈畀所有人睇到：

1. 設定 → 匯出 → 下載 `fukuoka2027.json`
2. 開 [GitHub 資料檔案編輯頁](https://github.com/leoleo1222/trip-hub/edit/main/data/fukuoka2027.json)（要 GitHub 戶口）
3. 全選刪除 → 貼上匯出嘅 JSON → Commit changes
4. 約 1 分鐘後 Pages 自動重新發佈，朋友重新整理就見到

密碼只係防手滑，唔係真保安；改 data 檔案唔會影響網站程式碼。

## 開新旅程（例如下次去大阪）

1. 設定 → 解鎖 → 「新增旅程」或「複製旅程做範本」（填標題、開始日期、日數）
2. 編輯好之後匯出 JSON
3. 喺 repo 嘅 `data/` 開新檔案 `osaka2028.json`，貼上 JSON
4. `data/index.json` 加一條：

```json
{
  "id": "osaka2028",
  "title": "大阪 2028",
  "file": "osaka2028.json",
  "startDate": "2028-03-10",
  "endDate": "2028-03-14",
  "timezone": "Asia/Tokyo"
}
```

5. Commit — 網站揀旅程下拉會自動出現新旅程

## 資料格式（trip JSON）

```json
{
  "schemaVersion": 1,
  "id": "fukuoka2027",
  "title": "福岡 2027",
  "subtitle": "3人自由行 · 3月1-6日",
  "startDate": "2027-03-01",
  "endDate": "2027-03-06",
  "timezone": "Asia/Tokyo",
  "days": [
    { "date": "2027-03-01", "label": "Day 1 (一)",
      "entries": [ { "time": "11:00", "activity": "…", "remark": "…" } ] }
  ],
  "tabs": [
    { "id": "food", "name": "餐廳資料", "type": "sections",
      "sections": [
        { "title": "Day 1 晚餐", "headers": ["選項", "備註"],
          "rows": [ { "cells": ["…", "…"], "url": "https://…" } ] }
      ] }
  ]
}
```

- 行程項目按 `time` 排序
- tab 係通用資料表：`headers` + `rows`（每 row 有 `cells` 同可選 `url`）
- 「今日」以旅程 `timezone` 計算

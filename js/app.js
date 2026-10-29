'use strict';

/* ================= Trip Hub — config & state ================= */
const EDIT_PASSWORD = '123';
const SESSION_HOURS = 4;
const GITHUB_REPO = 'https://github.com/leoleo1222/trip-hub';
const githubEditUrl = id => `${GITHUB_REPO}/edit/main/data/${id}.json`;

const LS = {
  session: 'th_session',
  draft: id => `th_draft_${id}`,
  localTrips: 'th_local_trips',
  lastTrip: 'th_last_trip',
};

const S = {
  registry: null,     // data/index.json
  trips: {},          // id -> trip data (merged: draft overrides server)
  metas: [],          // trip metas (server + local)
  tripId: null,
  view: null,         // {type:'day', idx} | {type:'tab', id}
  sessionEnd: 0,
};

/* ================= helpers ================= */
const app = () => document.getElementById('app');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&', '<': '<', '>': '>', '"': '"', "'": '&#39;' }[c]));
const linkify = s => esc(s).replace(/(https?:\/\/[^\s;，)]+)/g, m => {
  const trail = /[.,，;、]$/.exec(m); const url = trail ? m.slice(0, -trail[0].length) : m;
  return `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>` + (trail ? trail[0] : '');
});
const uid = () => 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));

function todayInTZ(tz) {
  try { return new Date().toLocaleDateString('en-CA', { timeZone: tz }); }
  catch { return new Date().toLocaleDateString('en-CA'); }
}
function diffDays(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
function addDays(iso, n) { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function fmtCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = String(s % 60).padStart(2, '0');
  return `${h}:${m}:${sec}`;
}

async function fetchJSON(url) {
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

/* ================= session (edit mode) ================= */
function isUnlocked() { return Date.now() < S.sessionEnd; }
function unlock(pw) {
  if (pw !== EDIT_PASSWORD) return false;
  S.sessionEnd = Date.now() + SESSION_HOURS * 3600 * 1000;
  localStorage.setItem(LS.session, String(S.sessionEnd));
  return true;
}
function lock() { S.sessionEnd = 0; localStorage.removeItem(LS.session); render(); }

/* ================= drafts ================= */
function currentTrip() { return S.trips[S.tripId]; }
function hasDraft(id) { return !!localStorage.getItem(LS.draft(id)); }
function saveDraft() {
  const t = currentTrip(), copy = clone(t); delete copy._local;
  localStorage.setItem(LS.draft(t.id), JSON.stringify(copy));
  t._local = true;
}
function clearDraft(id) {
  localStorage.removeItem(LS.draft(id));
  delete S.trips[id]._local;
}
function localTripMetas() {
  try { return JSON.parse(localStorage.getItem(LS.localTrips) || '[]'); } catch { return []; }
}
function saveLocalTripMeta(meta) {
  const list = localTripMetas().filter(m => m.id !== meta.id);
  list.push(meta);
  localStorage.setItem(LS.localTrips, JSON.stringify(list));
}

/* ================= boot ================= */
async function boot() {
  S.sessionEnd = +localStorage.getItem(LS.session) || 0;
  S.registry = await fetchJSON('data/index.json');
  const local = localTripMetas();
  const seen = new Set();
  S.metas = [];
  for (const m of [...S.registry.trips, ...local]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id); S.metas.push(m);
  }
  for (const m of S.metas) {
    let data = null;
    const draft = localStorage.getItem(LS.draft(m.id));
    if (draft) { try { data = JSON.parse(draft); data._local = true; } catch {} }
    if (!data && m.file) {
      try { data = await fetchJSON('data/' + m.file); }
      catch (e) { console.warn('trip load failed', m.id, e); }
    }
    if (data) S.trips[m.id] = data;
  }
  // choose trip: hash > last > currentTrip > first
  const hash = parseHash();
  const avail = S.metas.filter(m => S.trips[m.id]);
  if (hash && S.trips[hash.trip]) S.tripId = hash.trip;
  else S.tripId = localStorage.getItem(LS.lastTrip) || S.registry.currentTrip || (avail[0] && avail[0].id);
  if (!S.trips[S.tripId] && avail[0]) S.tripId = avail[0].id;
  if (!S.trips[S.tripId]) { renderError('搵唔到行程資料'); return; }
  localStorage.setItem(LS.lastTrip, S.tripId);

  // default view: today's day if during trip, else Day 1
  S.view = hash && hash.view ? hash.view : defaultView();
  render();
  setInterval(tickSession, 1000);
}

function defaultView() {
  const st = dayStatus(currentTrip());
  return st.phase === 'during' && st.idx >= 0 ? { type: 'day', idx: st.idx } : { type: 'day', idx: 0 };
}

function parseHash() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  if (!h) return null;
  const parts = h.split('/');
  if (parts[0] === 'd' && parts[1]) return { trip: parts[2] ? parts[2] : undefined, view: { type: 'day', idx: Math.max(0, +parts[1] - 1) } };
  if (parts[0] === 't' && parts[1]) return { trip: parts[2], view: { type: 'tab', id: parts[1] } };
  return null;
}
function setHash(view) {
  const v = view.type === 'day' ? `d/${view.idx + 1}/${S.tripId}` : `t/${view.id}/${S.tripId}`;
  history.replaceState(null, '', '#' + v);
}

function dayStatus(trip) {
  const today = todayInTZ(trip.timezone || 'UTC');
  if (today < trip.startDate) return { phase: 'before', daysLeft: diffDays(today, trip.startDate) };
  if (today > trip.endDate) return { phase: 'after' };
  const idx = trip.days.findIndex(d => d.date === today);
  return { phase: 'during', idx };
}

/* ================= render ================= */
function renderError(msg) {
  app().innerHTML = `<main><p class="empty">${esc(msg)} — 請重新整理，或檢查 data/ 檔案</p></main>`;
}

function render() {
  const t = currentTrip();
  if (!t) { renderError('搵唔到行程'); return; }
  setHash(S.view);
  const st = dayStatus(t);
  const multi = S.metas.filter(m => S.trips[m.id]).length > 1;

  let html = '';
  html += `<header class="site-header">
    <div class="row1">
      <div class="brand">
        <span class="t">${esc(t.title)}</span>
        <span class="s">${esc(t.subtitle || '')}</span>
      </div>
      <div class="header-spacer"></div>
      ${multi ? tripSelectHtml() : ''}
      <button class="gear-btn" data-act="settings" aria-label="設定">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
    </div>
    ${statusChipHtml(st, t)}
    <nav class="nav" id="main-nav">
      <button class="nav-btn ${S.view.type === 'day' ? 'active' : ''}" data-act="view-day">行程</button>
      ${t.tabs.map(tb => `<button class="nav-btn ${S.view.type === 'tab' && S.view.id === tb.id ? 'active' : ''}" data-act="view-tab" data-tab="${esc(tb.id)}">${esc(tb.name)}</button>`).join('')}
      ${isUnlocked() ? `<button class="nav-btn add-tab" data-act="add-tab">+ 新增Tab</button>` : ''}
    </nav>
  </header>`;

  if (isUnlocked()) {
    const draft = hasDraft(t.id);
    html += `<div class="edit-banner" id="edit-banner">
      <span>編輯模式</span>
      <span class="clock" id="session-clock"></span>
      ${draft ? `<span class="badge">本地草稿 · 未發佈</span>` : ''}
      <button data-act="lock">立即鎖定</button>
    </div>`;
  }

  html += `<main id="main">`;
  if (S.view.type === 'day') html += renderDay(t, st);
  else html += renderTab(t);
  html += `</main>`;
  html += modalHost();
  app().innerHTML = html;

  bindEvents();
  tickSession();
}

function tripSelectHtml() {
  const opts = S.metas.filter(m => S.trips[m.id]).map(m =>
    `<option value="${esc(m.id)}" ${m.id === S.tripId ? 'selected' : ''}>${esc(m.title)}</option>`).join('');
  return `<select class="trip-select" data-act="switch-trip" aria-label="選擇旅程">${opts}</select>`;
}

function statusChipHtml(st, t) {
  if (st.phase === 'before') return `<div class="status-chip before"><span class="dot"></span>距離出發還有 ${st.daysLeft} 日 · ${esc(t.startDate)}</div>`;
  if (st.phase === 'during' && st.idx >= 0) return `<div class="status-chip"><span class="dot"></span>今天係 ${esc(t.days[st.idx].label)} · ${esc(t.days[st.idx].date)}</div>`;
  if (st.phase === 'after') return `<div class="status-chip after"><span class="dot"></span>行程已完結 · 歡迎翻睇</div>`;
  return '';
}

function refTarget(t, ref) {
  if (!ref || !ref.tab) return null;
  const tab = t.tabs.find(x => x.id === ref.tab);
  if (!tab) return null;
  const sec = tab.sections && tab.sections[ref.section];
  if (!sec) return null;
  return { tabName: tab.name, title: sec.title || tab.name };
}

/* ---- entry type icons (no web images) ---- */
const ICONS = {
  food:   '<path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M7 3v4M11 3v4" stroke-linecap="round"/><path d="M16 3c-2 1.5-2 4.5 0 6v12" stroke-linecap="round"/>',
  bar:    '<path d="M5 8h14l-7 7-7-7z" stroke-linejoin="round"/><path d="M12 15v6M9 21h6" stroke-linecap="round"/>',
  plane:  '<path d="M2 13l20-6-4 12-4-4-4 2 1-4-9 0z" stroke-linejoin="round"/>',
  train:  '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9.5 21l-2-4M14.5 21l2-4" stroke-linecap="round"/><circle cx="9.5" cy="14.5" r="1" fill="currentColor" stroke="none"/><circle cx="14.5" cy="14.5" r="1" fill="currentColor" stroke="none"/>',
  walk:   '<circle cx="13" cy="4.5" r="2"/><path d="M11 21l1-6-2-2 1-4 3 3h4M12 9l-3 3-3 1M12 15l-2 6" stroke-linecap="round" stroke-linejoin="round"/>',
  shrine: '<path d="M4 10h16M6 10V8c0-1 1.5-3 6-3s6 2 6 3v2M8 21v-8a4 4 0 0 1 8 0v8M3 21h18" stroke-linecap="round"/>',
  onsen:  '<path d="M9 9c0-1.5 1-2 1-4M14 9c0-1.5 1-2 1-4" stroke-linecap="round"/><path d="M3 14a9 5 0 0 0 18 0M6 20c1.5 1 3.5 1.5 6 1.5S16.5 21 18 20" stroke-linecap="round"/>',
  game:   '<rect x="3" y="9" width="18" height="10" rx="2"/><circle cx="16.5" cy="14" r="2.2"/><path d="M7 12v4M5 14h4M10.5 5.5l3 3M13.5 5.5l-3 3" stroke-linecap="round"/>',
  shop:   '<path d="M6 8l1-4h10l1 4M6 8h12l-1 13H7L6 8z" stroke-linejoin="round"/><path d="M10 12a2 2 0 0 0 4 0" stroke-linecap="round"/>',
  hotel:  '<path d="M4 18v-5a1 1 0 0 1 1-1h13a2 2 0 0 1 2 2v4M4 18h16" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8.5" cy="9" r="1.6"/>',
  park:   '<path d="M12 3l5 6-5-1-5 1 5-6zM12 8v9M8 21h8" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 17c-3 0-5-1-5-3M12 17c3 0 5-1 5-3" stroke-linecap="round"/>',
  cafe:   '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8z" stroke-linejoin="round"/><path d="M17 9h2a2.5 2.5 0 0 1 0 5h-2M7 3v2M10 3v2M13 3v2" stroke-linecap="round"/>',
  art:    '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 18h18M12 18v3M8 21h8" stroke-linecap="round"/><circle cx="9" cy="10" r="1.5"/><path d="M7 15c1-2 3-2 4 0M14 8l3 3-3 3-3-3 3-3z"/>',
  luggage:'<rect x="6" y="7" width="12" height="14" rx="2"/><path d="M9 7V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v3M10 11v5M14 11v5" stroke-linecap="round"/>',
  pin:    '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.5"/>',
};
function iconFor(e) {
  const s = ((e.activity || '') + ' ' + (e.remark || ''));
  const has = (...ws) => ws.some(w => s.includes(w));
  if (has('酒吧', 'BAR', 'バー', '酒場', 'トロ壱', 'T6O', 'ヤモリ', 'ガスコン', 'けごむす')) return 'bar';
  if (has('溫泉', 'onsen', '溫泉街')) return 'onsen';
  if (has('柏青哥', 'pachinko')) return 'game';
  if (has('神社', '寺', '太宰府', '櫛田', '天滿宮', '東長寺', '聖福寺', '崇福寺')) return 'shrine';
  if (has('航班', '起飛', '機場', 'UO6', '抵達香港', 'check-in（機場', '寄行李')) return 'plane';
  if (has('地鐵', '西鐵', '電車', '特急', '由布院之森', '博多站', '去天神', '返博多', '去唐人町', '去薬院', '→天神', '→博多', '→西中洲', '地鐵去')) return 'train';
  if (has('酒店', 'check-in', '退房', '放低嘢', '寄存')) return has('退房', '寄行李', '拿行李') ? 'luggage' : 'hotel';
  if (has('柏青哥')) return 'game';
  if (has('teamLab', '美術', '藝術')) return 'art';
  if (has('公園', '湖', '金鱗', '大濠', '福岡城')) return 'park';
  if (has('cafe', 'café', '喫茶', '咖啡')) return 'cafe';
  if (has('購物', '百貨', '地下街', '手信', '古着', 'ミーナ', '衝刺', '運河城', 'MEGA')) return 'shop';
  if (has('散步', '步行', '夜景', '慢慢行', '河畔', '夜遊', '自由時間')) return 'walk';
  if (has('早餐', '午餐', '晚餐', '屋台', '一蘭', '拉麵', 'ラーメン', '鍋', '燒肉', '壽喜燒', '爐端', '餃子', '烏冬', 'うどん', '餐廳', '料理', '牛雜', '水炊', '溫泉蛋', '美食')) return 'food';
  if (has('行李')) return 'luggage';
  return 'pin';
}
function iconTile(e) {
  const key = iconFor(e);
  return `<div class="icon-tile" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">${ICONS[key]}</svg></div>`;
}

/* ---- day view ---- */
function renderDay(t, st) {
  const idx = Math.min(S.view.idx, t.days.length - 1);
  S.view.idx = idx;
  const day = t.days[idx];
  const today = todayInTZ(t.timezone || 'UTC');
  const edit = isUnlocked();

  let html = `<div class="day-chips">`;
  html += t.days.map((d, i) => `
    <button class="day-chip ${i === idx ? 'active' : ''}" data-act="pick-day" data-idx="${i}">
      <span class="d">Day ${i + 1}</span>
      <span class="dt">${esc(d.date.slice(5).replace('-', '/'))}${d.date === today ? ' · <span class="today">今日</span>' : ''}</span>
    </button>`).join('');
  if (edit) html += `<button class="day-chip add-day" data-act="add-day"><span class="d">+ 新增日</span></button>`;
  html += `</div>`;

  if (st.phase === 'before') html += `<div class="notice">仲有 ${st.daysLeft} 日出發 — 而家睇緊 Day ${idx + 1}。行程會喺出發當日自動顯示「今日」。</div>`;
  if (st.phase === 'after') html += `<div class="notice">呢個旅程已完結 — 睇返行程做回顧。</div>`;

  html += `<div class="timeline">`;
  const entries = [...day.entries].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  if (!entries.length) html += `<p class="empty">呢日仲未有行程項目${edit ? ' — 加啲乜好？' : ''}</p>`;
  for (const e of entries) {
    const ei = day.entries.indexOf(e);
    const ref = refTarget(t, e.ref);
    html += `<div class="entry">
      <div class="time">${esc(e.time || '')}</div>
      ${e.img ? `<div class="thumb"><img src="${esc(e.img)}" alt="" loading="lazy" decoding="async"></div>` : iconTile(e)}
      <div class="body">
        <div class="activity">${linkify(e.activity || '')}</div>
        ${e.remark ? `<div class="remark">${linkify(e.remark)}</div>` : ''}
        ${ref ? `<button class="ref-link" data-act="goto-ref" data-tab="${esc(e.ref.tab)}" data-sec="${e.ref.section}">▸ ${esc(ref.tabName)}資料</button>` : ''}
        ${edit ? `<div class="tools">
          <button class="tool-btn" data-act="edit-entry" data-idx="${ei}">編輯</button>
          <button class="tool-btn danger" data-act="del-entry" data-idx="${ei}">刪除</button>
        </div>` : ''}
      </div>
    </div>`;
  }
  if (edit) html += `<button class="add-card" data-act="add-entry">+ 新增行程項目</button>`;
  html += `</div>`;
  return html;
}

/* ---- tab view (generic sections) ---- */
function renderTab(t) {
  const tab = t.tabs.find(x => x.id === S.view.id);
  if (!tab) return `<p class="empty">Tab 搵唔到</p>`;
  const edit = isUnlocked();
  let html = '';
  (tab.sections || []).forEach((sec, si) => {
    html += `<div class="section" id="sec-${si}">`;
    if (sec.title) html += `<div class="section-title">${esc(sec.title)}</div>`;
    else html += `<div class="section-title dark">${esc(tab.name)}</div>`;
    (sec.rows || []).forEach((row, ri) => {
      const c = row.cells || [];
      html += `<div class="data-row">
        <div class="head">${row.url ? `<a href="${esc(row.url)}" target="_blank" rel="noopener">${esc(c[0] || '')}</a>` : esc(c[0] || '')}</div>
        ${c.slice(1).map((v, i) => `<div class="kv"><span class="k">${esc(sec.headers ? sec.headers[i + 1] : '')}</span><span class="v">${linkify(v)}</span></div>`).join('')}
        ${edit ? `<div class="tools">
          <button class="tool-btn" data-act="edit-row" data-si="${si}" data-ri="${ri}">編輯</button>
          <button class="tool-btn danger" data-act="del-row" data-si="${si}" data-ri="${ri}">刪除</button>
        </div>` : ''}
      </div>`;
    });
    if (edit) html += `<button class="add-card" data-act="add-row" data-si="${si}">+ 新增資料列</button>`;
    html += `</div>`;
  });
  if (edit) {
    html += `<div class="section">
      <button class="add-card" data-act="add-section">+ 新增分節</button>
      <button class="add-card" data-act="del-tab">刪除呢個Tab</button>
    </div>`;
  }
  return html;
}

/* ================= modals ================= */
let modalState = null;
function modalHost() { return `<div id="modal-host"></div>` }

function closeModal() { modalState = null; document.getElementById('modal-host').innerHTML = ''; }

function openModal(html) {
  const host = document.getElementById('modal-host');
  host.innerHTML = `<div class="modal-backdrop" data-act="backdrop"><div class="modal">${html}</div></div>`;
}

/* ---- settings ---- */
function openSettings() {
  const t = currentTrip();
  const edit = isUnlocked();
  const draft = hasDraft(t.id);
  const isLocalOnly = !S.registry.trips.some(m => m.id === t.id);
  let html = `<h2>設定</h2>`;
  if (!edit) {
    html += `<div class="field">
      <label>編輯密碼</label>
      <input type="password" id="pw-input" placeholder="輸入密碼解鎖" autocomplete="off">
      <div class="pw-error" id="pw-err" hidden>密碼唔啱 — 再試一次</div>
    </div>
    <p class="sub">解鎖後可以編輯 ${SESSION_HOURS} 小時。密碼只係防朋友手滑，唔係真保安。</p>
    <div class="modal-actions">
      <button class="btn" data-act="close">取消</button>
      <button class="btn primary" data-act="try-unlock">解鎖編輯</button>
    </div>`;
  } else {
    html += `<p class="sub">編輯session剩餘 <b id="settings-clock">${fmtCountdown(S.sessionEnd - Date.now())}</b></p>
    <div class="set-list">
      <div class="set-item"><div><div class="lab">資料狀態</div><div class="desc">${draft ? '本地草稿（未發佈，其他人睇唔到）' : '與線上同步'}</div></div></div>
      <div class="set-item"><div><div class="lab">匯出 JSON</div><div class="desc">下載最新資料檔案（fukuoka2027.json）</div></div><button class="btn act" data-act="export">匯出</button></div>
      <div class="set-item"><div><div class="lab">匯入 JSON</div><div class="desc">載入資料檔案做本地草稿</div></div><button class="btn act" data-act="import">匯入</button></div>
      ${draft ? `<div class="set-item"><div><div class="lab">清除本地草稿</div><div class="desc">還原做線上版本（未匯出嘅改動會冇咗）</div></div><button class="btn act" data-act="clear-draft">還原</button></div>` : ''}
      <div class="set-item"><div><div class="lab">新增旅程</div><div class="desc">開一個新行程（本地建立，匯出後可發佈）</div></div><button class="btn act" data-act="new-trip">新增</button></div>
      <div class="set-item"><div><div class="lab">複製旅程做範本</div><div class="desc">複製現有行程做新旅程起點</div></div><button class="btn act" data-act="dup-trip">複製</button></div>
      ${isLocalOnly ? `<div class="set-item"><div><div class="lab">刪除此旅程</div><div class="desc">只刪本地版本</div></div><button class="btn danger act" data-act="del-trip">刪除</button></div>` : ''}
    </div>
    <h3>發佈畀朋友睇（重要）</h3>
    <ol class="publish-steps">
      <li>改完嘢，撳上面「匯出」下載 <code>${esc(t.id)}.json</code></li>
      <li>開 <a href="${esc(githubEditUrl(t.id))}" target="_blank" rel="noopener">GitHub 資料檔案</a>，全選刪除，貼上匯出嘅內容</li>
      <li>Commit changes — GitHub Pages 約1分鐘後自動更新</li>
      <li>朋友重新整理個網站就會見到</li>
    </ol>
    <p class="sub" style="margin-top:8px">GitHub戶口係你嘅朋友先改到檔案；改data檔案唔會影響個網站程式。</p>
    <div class="modal-actions">
      <button class="btn" data-act="lock">立即鎖定</button>
      <button class="btn primary" data-act="close">完成</button>
    </div>`;
  }
  openModal(html);
}

/* ---- entry editor ---- */
function openEntryEditor(ei) {
  const day = currentTrip().days[S.view.idx];
  const e = ei >= 0 ? day.entries[ei] : { time: '', activity: '', remark: '' };
  const foodTab = currentTrip().tabs[0];
  const refOpts = ['<option value="">— 無 —</option>'].concat((foodTab ? foodTab.sections : []).map((s, i) =>
    `<option value="${i}" ${e.ref && e.ref.tab === foodTab.id && e.ref.section === i ? 'selected' : ''}>${esc((s.title || foodTab.name).slice(0, 42))}</option>`)).join('');
  openModal(`<h2>${ei >= 0 ? '編輯行程項目' : '新增行程項目'}</h2>
    <div class="field"><label>時間 (HH:MM)</label><input type="text" id="f-time" value="${esc(e.time)}" placeholder="20:00"></div>
    <div class="field"><label>活動</label><input type="text" id="f-act" value="${esc(e.activity)}" placeholder="晚餐 (3間餐廳選1): ..."></div>
    <div class="field"><label>備註</label><textarea id="f-rem" placeholder="營業時間/交通/預約提示...">${esc(e.remark)}</textarea></div>
    <div class="field"><label>圖片網址 (img/… 或 https://…)</label><input type="text" id="f-img" value="${esc(e.img || '')}" placeholder="img/ukokkei.jpg"></div>
    ${foodTab ? `<div class="field"><label>連去${esc(foodTab.name)}邊一節</label><select id="f-ref">${refOpts}</select></div>` : ''}
    <div class="modal-actions">
      <button class="btn" data-act="close">取消</button>
      <button class="btn primary" data-act="save-entry" data-idx="${ei}">儲存</button>
    </div>`);
}

/* ---- row editor (generic) ---- */
function openRowEditor(si, ri) {
  const t = currentTrip();
  const tab = t.tabs.find(x => x.id === S.view.id);
  const sec = tab.sections[si];
  const headers = sec.headers || [];
  const isNew = ri < 0;
  const row = isNew ? { cells: headers.map(() => ''), url: '' } : sec.rows[ri];
  let html = `<h2>${isNew ? '新增資料列' : '編輯資料列'}</h2>`;
  row.cells.forEach((v, i) => {
    html += `<div class="field"><label>${esc(headers[i] || '欄位 ' + (i + 1))}</label><input type="text" class="f-cell" data-i="${i}" value="${esc(v)}"></div>`;
  });
  html += `<div class="field"><label>連結 URL（可留空）</label><input type="text" id="f-url" value="${esc(row.url || '')}" placeholder="https://..."></div>
    <div class="modal-actions">
      <button class="btn" data-act="close">取消</button>
      <button class="btn primary" data-act="save-row" data-si="${si}" data-ri="${ri}">儲存</button>
    </div>`;
  openModal(html);
}

/* ---- new trip ---- */
function openNewTrip(fromDup) {
  openModal(`<h2>${fromDup ? '複製旅程做範本' : '新增旅程'}</h2>
    <div class="field"><label>旅程標題</label><input type="text" id="nt-title" placeholder="例: 大阪 2028"></div>
    <div class="field"><label>副標題</label><input type="text" id="nt-sub" placeholder="例: 4人 · 3月10-14日"></div>
    <div class="field"><label>開始日期</label><input type="date" id="nt-start" value="2028-03-10"></div>
    <div class="field"><label>日數</label><input type="number" id="nt-days" min="1" max="30" value="5"></div>
    ${fromDup ? '' : `<div class="field"><label>時區</label><input type="text" id="nt-tz" value="Asia/Tokyo"></div>`}
    <p class="sub">新旅程會儲存喺你部機做本地草稿；想畀朋友睇就匯出JSON再上傳GitHub（設定入面有步驟）。</p>
    <div class="modal-actions">
      <button class="btn" data-act="close">取消</button>
      <button class="btn primary" data-act="create-trip" data-dup="${fromDup ? 1 : 0}">建立</button>
    </div>`);
}

/* ================= edit actions ================= */
function saveEntry(ei) {
  const t = currentTrip();
  const day = t.days[S.view.idx];
  const entry = {
    time: val('#f-time').trim(),
    activity: val('#f-act').trim(),
    remark: val('#f-rem').trim(),
  };
  const img = val('#f-img').trim();
  if (img) entry.img = img;
  const refSec = val('#f-ref').trim();
  if (refSec !== '' && currentTrip().tabs[0]) entry.ref = { tab: currentTrip().tabs[0].id, section: +refSec };
  if (!entry.activity) { toast('活動欄唔可以空'); return; }
  if (ei >= 0) day.entries[ei] = entry; else day.entries.push(entry);
  day.entries.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  saveDraft(); closeModal(); render(); toast('已儲存（本地草稿）');
}

function saveRow(si, ri) {
  const t = currentTrip();
  const tab = t.tabs.find(x => x.id === S.view.id);
  const sec = tab.sections[si];
  const cells = [...document.querySelectorAll('.f-cell')].map(inp => inp.value.trim());
  const url = val('#f-url').trim();
  const row = { cells, url };
  if (ri >= 0) sec.rows[ri] = row; else sec.rows.push(row);
  saveDraft(); closeModal(); render(); toast('已儲存（本地草稿）');
}

function addTab() {
  const name = prompt('新Tab名稱（例: 購物清單）');
  if (!name) return;
  const t = currentTrip();
  const tab = { id: uid(), name: name.trim(), type: 'sections', sections: [{ title: '', headers: ['項目', '內容'], rows: [] }] };
  t.tabs.push(tab);
  S.view = { type: 'tab', id: tab.id };
  saveDraft(); render(); toast('新Tab已加入');
}

function addSection() {
  const t = currentTrip();
  const tab = t.tabs.find(x => x.id === S.view.id);
  const title = prompt('分節標題（可留空）') || '';
  tab.sections.push({ title, headers: ['項目', '內容'], rows: [] });
  saveDraft(); render(); toast('新分節已加入');
}

function addDay() {
  const t = currentTrip();
  const last = t.days[t.days.length - 1];
  const d = addDays(last.date, 1);
  const wd = ['日', '一', '二', '三', '四', '五', '六'][new Date(d + 'T12:00:00').getDay()];
  t.days.push({ date: d, label: `Day ${t.days.length + 1} (${wd})`, entries: [] });
  t.endDate = d;
  S.view = { type: 'day', idx: t.days.length - 1 };
  saveDraft(); render(); toast('新一日已加入');
}

function createTrip(dup) {
  const title = val('#nt-title').trim();
  const start = val('#nt-start') || '2028-01-01';
  const n = Math.min(30, Math.max(1, +val('#nt-days') || 1));
  if (!title) { toast('要填旅程標題'); return; }
  const id = 'trip-' + Date.now().toString(36);
  let trip;
  if (dup) {
    trip = clone(currentTrip());
    trip.id = id; trip.title = title; trip.subtitle = val('#nt-sub').trim();
    trip.startDate = start; trip.endDate = addDays(start, n - 1);
    trip._local = false;
    const wd = ['日', '一', '二', '三', '四', '五', '六'];
    while (trip.days.length < n) trip.days.push({ date: addDays(start, trip.days.length), label: `Day ${trip.days.length + 1} (${wd[new Date(addDays(start, trip.days.length) + 'T12:00:00').getDay()]})`, entries: [] });
    trip.days = trip.days.slice(0, n).map((d, i) => ({ ...d, date: addDays(start, i) }));
  } else {
    const wd = ['日', '一', '二', '三', '四', '五', '六'];
    trip = {
      schemaVersion: 1, id, title, subtitle: val('#nt-sub').trim(),
      startDate: start, endDate: addDays(start, n - 1),
      timezone: val('#nt-tz').trim() || 'Asia/Tokyo',
      days: Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), label: `Day ${i + 1} (${wd[new Date(addDays(start, i) + 'T12:00:00').getDay()]})`, entries: [] })),
      tabs: [{ id: 'notes', name: '筆記', type: 'sections', sections: [{ title: '', headers: ['項目', '內容'], rows: [] }] }],
    };
  }
  const meta = { id, title, subtitle: trip.subtitle, file: id + '.json', startDate: trip.startDate, endDate: trip.endDate, timezone: trip.timezone };
  saveLocalTripMeta(meta);
  if (!S.metas.some(m => m.id === id)) S.metas.push(meta);
  S.trips[id] = trip;
  localStorage.setItem(LS.draft(id), JSON.stringify(trip));
  trip._local = true;
  S.tripId = id;
  S.view = { type: 'day', idx: 0 };
  localStorage.setItem(LS.lastTrip, id);
  closeModal(); render(); toast(`「${title}」已建立（本地）`);
}

function exportTrip() {
  const t = clone(currentTrip()); delete t._local;
  const blob = new Blob([JSON.stringify(t, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = t.id + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('已下載 ' + t.id + '.json');
}

function importTripFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.days || !data.id) throw new Error('格式唔啱');
      const meta = { id: data.id, title: data.title || data.id, subtitle: data.subtitle || '', file: data.id + '.json', startDate: data.startDate, endDate: data.endDate, timezone: data.timezone || 'Asia/Tokyo' };
      saveLocalTripMeta(meta);
      if (!S.metas.some(m => m.id === data.id)) S.metas.push(meta);
      localStorage.setItem(LS.draft(data.id), JSON.stringify(data));
      S.trips[data.id] = data; data._local = true;
      S.tripId = data.id; S.view = defaultView();
      localStorage.setItem(LS.lastTrip, data.id);
      render(); toast('已匯入做本地草稿');
    } catch (e) { toast('匯入失敗: ' + e.message); }
  };
  reader.readAsText(file);
}

const val = sel => { const el = document.querySelector(sel); return el ? el.value : ''; };

/* ================= session ticker ================= */
function tickSession() {
  const clock = document.getElementById('session-clock');
  if (!isUnlocked()) {
    if (S.sessionEnd > 0) { S.sessionEnd = 0; render(); return; }
    return;
  }
  if (clock) clock.textContent = fmtCountdown(S.sessionEnd - Date.now());
  const sc = document.getElementById('settings-clock');
  if (sc) sc.textContent = fmtCountdown(S.sessionEnd - Date.now());
  if (!isUnlocked()) render();
}

/* ================= events ================= */
function bindEvents() {
  app().addEventListener('click', onClick);
  app().addEventListener('change', onChange);
}

function onClick(e) {
  const backdrop = e.target.closest('[data-act="backdrop"]');
  if (backdrop && e.target === backdrop) { closeModal(); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const t = currentTrip();
  switch (act) {
    case 'settings': openSettings(); break;
    case 'close': closeModal(); break;
    case 'try-unlock': {
      if (unlock(val('#pw-input'))) { closeModal(); render(); toast('已解鎖 — 4小時編輯session開始'); }
      else { const err = document.getElementById('pw-err'); if (err) err.hidden = false; }
      break;
    }
    case 'lock': closeModal(); lock(); break;
    case 'view-day': S.view = defaultView(); render(); break;
    case 'view-tab': S.view = { type: 'tab', id: el.dataset.tab }; render(); break;
    case 'goto-ref': {
      S.view = { type: 'tab', id: el.dataset.tab };
      render();
      const secEl = document.getElementById('sec-' + el.dataset.sec);
      if (secEl) {
        secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        secEl.classList.remove('flash');
        void secEl.offsetWidth;
        secEl.classList.add('flash');
      }
      break;
    }
    case 'pick-day': S.view = { type: 'day', idx: +el.dataset.idx }; render(); break;
    case 'add-entry': openEntryEditor(-1); break;
    case 'edit-entry': openEntryEditor(+el.dataset.idx); break;
    case 'save-entry': saveEntry(+el.dataset.idx); break;
    case 'del-entry': {
      if (!confirm('刪除呢個行程項目？')) return;
      t.days[S.view.idx].entries.splice(+el.dataset.idx, 1);
      saveDraft(); render(); toast('已刪除');
      break;
    }
    case 'add-row': openRowEditor(+el.dataset.si, -1); break;
    case 'edit-row': openRowEditor(+el.dataset.si, +el.dataset.ri); break;
    case 'save-row': saveRow(+el.dataset.si, +el.dataset.ri); break;
    case 'del-row': {
      const tab = t.tabs.find(x => x.id === S.view.id);
      if (!confirm('刪除呢列資料？')) return;
      tab.sections[+el.dataset.si].rows.splice(+el.dataset.ri, 1);
      saveDraft(); render(); toast('已刪除');
      break;
    }
    case 'add-tab': addTab(); break;
    case 'add-section': addSection(); break;
    case 'del-tab': {
      const tab = t.tabs.find(x => x.id === S.view.id);
      if (!confirm(`刪除「${tab.name}」成個Tab？`)) return;
      t.tabs = t.tabs.filter(x => x.id !== tab.id);
      S.view = defaultView();
      saveDraft(); render(); toast('Tab已刪除');
      break;
    }
    case 'add-day': addDay(); break;
    case 'export': exportTrip(); break;
    case 'import': {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = () => inp.files[0] && importTripFile(inp.files[0]);
      inp.click();
      break;
    }
    case 'clear-draft': {
      if (!confirm('清除本地草稿，還原做線上版本？未匯出嘅改動會冇咗')) return;
      clearDraft(S.tripId);
      location.reload();
      break;
    }
    case 'new-trip': openNewTrip(false); break;
    case 'dup-trip': openNewTrip(true); break;
    case 'create-trip': createTrip(el.dataset.dup === '1'); break;
    case 'del-trip': {
      if (!confirm('刪除呢個本地旅程？')) return;
      localStorage.removeItem(LS.draft(S.tripId));
      localStorage.setItem(LS.localTrips, JSON.stringify(localTripMetas().filter(m => m.id !== S.tripId)));
      S.tripId = S.registry.currentTrip || S.registry.trips[0].id;
      localStorage.setItem(LS.lastTrip, S.tripId);
      location.reload();
      break;
    }
  }
}

function onChange(e) {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'switch-trip') {
    S.tripId = el.value;
    localStorage.setItem(LS.lastTrip, S.tripId);
    S.view = defaultView();
    render();
  }
}

boot();

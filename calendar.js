/**
 * 予定カレンダー（?view=calendar のときだけ動く。テンキーは app.js）。画面の流れはデザインの正本
 * line_cash_bot/design/calendar_design.dc.html のとおり：カレンダー／明日／1週間／1か月／その先 → 予定を書く。
 * ・ユーザーIDは送らない。テンキーと同じく LIFF の IDトークンを送り、GAS（calendar.gs）が確かめる
 * ・予定の中身はこのファイルには書かない（開いたときに GAS から受け取る）。セリフも GAS の messages.gs から
 * ・前半は計算だけ（テストで確かめる）、後半が画面の操作
 */
(function (root) {
  'use strict';

  // 女の子の動画と、止まったときの静止画。動画を差し替えるときは、ここだけを直す
  var CAL_MEDIA = { video: 'diary_loop.mp4', poster: 'card_top.jpg' };
  var WHO_CLASS = { '奥様': 'who-wife', '旦那様': 'who-husband', '家族': 'who-family' };
  var WHO_ORDER = ['奥様', '旦那様', '家族'];
  var MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  var DOW_JA = '日月火水木金土';
  // タブ：[見出し, 小さな見出し（デザインのフランス語）, 今日から何日後〜何日後の手前まで]
  var TABS = {
    tomorrow: ['明日の予定', 'Demain', 1, 2],
    week: ['1週間の予定', 'Semaine', 0, 7],        // 今日〜6日後
    month: ['1か月の予定', 'Mois', 0, 31],         // 今日〜30日後
    later: ['それより先', 'Plus tard', 31, null],  // 31日後より先
  };

  // ---- 計算だけ ----
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(y, m, d) { return y + '-' + pad(m) + '-' + pad(d); }
  function parse(s) {
    var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
  }
  function utc(s) { var p = parse(s); return p ? Date.UTC(p.y, p.m - 1, p.d) : NaN; }
  function addDays(s, n) {
    var d = new Date(utc(s) + n * 86400000);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  function dow(s) { return new Date(utc(s)).getUTCDay(); }
  function daysIn(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
  function shiftMonth(y, m, delta) {
    var i = y * 12 + (m - 1) + delta;
    return { y: Math.floor(i / 12), m: (i % 12) + 1 };
  }
  /** "2026-11-21" → "11/21" */
  function md(s) { var p = parse(s); return p ? p.m + '/' + p.d : ''; }
  /** "2026-11-21" → "11/21（土）" */
  function mdDow(s) { return md(s) + '（' + DOW_JA.charAt(dow(s)) + '）'; }
  /** "09:05" → "9:05"、'' → allDay（「終日」） */
  function timeLabel(t, allDay) { return t ? String(t).replace(/^0(\d)/, '$1') : allDay; }
  /** 時・分 → "09:05"。時がなければ終日（''） */
  function toTime(hh, mm) { return hh === null || hh === undefined ? '' : pad(hh) + ':' + pad(mm || 0); }

  function sortEvents(list) {
    return list.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.time !== b.time) return a.time < b.time ? -1 : 1;
      return 0;
    });
  }

  /** タブで絞り込む。cal はその日（sel）の予定。 */
  function filterTab(events, tab, today, sel) {
    var t = TABS[tab];
    if (!t) return sortEvents(events.filter(function (e) { return e.date === sel; }));
    var from = addDays(today, t[2]);
    var to = t[3] === null ? null : addDays(today, t[3]);
    return sortEvents(events.filter(function (e) { return e.date >= from && (to === null || e.date < to); }));
  }

  /** 月の表のます目。日曜はじまり。予定のある日は、だれの予定かの点（奥様・旦那様・家族の順）。 */
  function monthCells(y, m, today, sel, events) {
    var first = ymd(y, m, 1);
    var cells = [];
    for (var i = 0; i < dow(first); i++) cells.push({ blank: true });
    for (var d = 1; d <= daysIn(y, m); d++) {
      var date = ymd(y, m, d);
      var evs = events.filter(function (e) { return e.date === date; });
      cells.push({
        date: date, day: d, dow: dow(date), today: date === today, sel: date === sel, count: evs.length,
        who: WHO_ORDER.filter(function (w) { return evs.some(function (e) { return e.who === w; }); }),
      });
    }
    return cells;
  }

  function fill(text, vars) {
    return String(text || '').replace(/\{(\w+)\}/g, function (all, k) {
      return vars && vars[k] !== undefined ? String(vars[k]) : all;
    });
  }

  /** 一覧の見出し。 */
  function listHead(tab, sel) {
    var t = TABS[tab];
    if (t) return { title: t[0], sub: t[1] };
    var p = parse(sel);
    return { title: p.m + '月' + p.d + '日（' + DOW_JA.charAt(dow(sel)) + '）', sub: 'Ce jour' };
  }

  /** 女の子のセリフ（予定を書いた直後などの一言がないとき）。 */
  function bubbleFor(texts, tab, count, sel) {
    if (TABS[tab]) return count ? fill(texts.CAL_RANGE_SOME, { count: count }) : texts.CAL_RANGE_NONE;
    var p = parse(sel);
    return count ? fill(texts.CAL_DAY_SOME, { month: p.m, day: p.d, count: count }) : texts.CAL_DAY_NONE;
  }

  var logic = { CAL_MEDIA: CAL_MEDIA, addDays: addDays, shiftMonth: shiftMonth, md: md, mdDow: mdDow, timeLabel: timeLabel,
                toTime: toTime, sortEvents: sortEvents, filterTab: filterTab, monthCells: monthCells, listHead: listHead,
                bubbleFor: bubbleFor, fill: fill };
  if (typeof module !== 'undefined' && module.exports) { module.exports = logic; return; }
  if (root.KAKEIBO_VIEW !== 'calendar') return;   // テンキーのときは何もしない

  // ---- 画面 ----
  var config = root.KAKEIBO_LIFF_CONFIG || {};
  var EARLY = {   // GAS とつながる前に出す文（ほかのセリフは GAS の messages.gs から）
    NO_CONFIG: '準備中ですわ\n（config.js に LIFF ID と送り先をお書きになって）',
    CONNECT: 'あら、つながりませんでしたわ。\n電波の良いところで開き直してくださいな',
  };
  var $ = function (id) { return document.getElementById(id); };
  var el = {
    cal: $('cal'), bubble: $('calBubble'), video: $('calVideo'), still: $('calStill'), add: $('calAdd'),
    main: $('calMain'), tabs: $('calTabs'), month: $('calMonth'), prev: $('calPrev'), next: $('calNext'),
    monthNum: $('calMonthNum'), monthName: $('calMonthName'), grid: $('calGrid'),
    listTitle: $('calListTitle'), listSub: $('calListSub'), items: $('calItems'),
    confirm: $('calConfirm'), confirmText: $('calConfirmText'), confirmNo: $('calConfirmNo'), confirmYes: $('calConfirmYes'),
    form: $('calForm'), formDate: $('calFormDate'), title: $('calTitle'), timeText: $('calTimeText'),
    hours: $('calHours'), mins: $('calMins'), allDay: $('calAllDay'), whos: $('calWhos'), save: $('calSave'), back: $('calBack'),
  };
  var state = {
    texts: null, today: '', y: 0, m: 0, sel: '', tab: 'cal', events: {}, defaultWho: '奥様', who: WHO_ORDER,
    flash: '', flashError: false, confirming: null, busy: false,
    form: null,   // { title, hh, mm, who, requestId }
  };

  // カレンダーの部分を出す（テンキーの部分は calendar.css が隠す）。テンキーの動画は止める
  ['cal-sky', 'cal-aurora', 'cal-fade'].forEach(function (c) { document.querySelector('.' + c).hidden = false; });
  el.cal.hidden = false;
  var keypadVideo = $('video');
  if (keypadVideo) { try { keypadVideo.pause(); keypadVideo.removeAttribute('src'); keypadVideo.load(); } catch (e) { /* なくてもよい */ } }

  // ---- 女の子の動画：再生できない（低電力モードなど）・動きを減らす設定なら、止めて静止画（エラーは出さない） ----
  el.still.src = CAL_MEDIA.poster;
  el.video.poster = CAL_MEDIA.poster;
  function showStill() {
    try { el.video.pause(); } catch (e) { /* 止められなくても静止画を出す */ }
    el.video.hidden = true;
    el.still.hidden = false;
  }
  (function setupVideo() {
    var reduce = root.matchMedia ? root.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (reduce && reduce.matches) { showStill(); return; }
    el.video.addEventListener('error', showStill);
    el.video.autoplay = true;
    el.video.src = CAL_MEDIA.video;
    try {
      var p = el.video.play();
      if (p && typeof p.catch === 'function') p.catch(showStill);
    } catch (e) { showStill(); }
    if (reduce && reduce.addEventListener) reduce.addEventListener('change', function (e) { if (e.matches) showStill(); });
  })();

  function say(text, isError) {
    el.bubble.textContent = text || '…';
    el.bubble.classList.toggle('error', !!isError);
  }

  function call(body) {
    body.idToken = liff.getIDToken();
    // 見出し（Content-Type）を付けない「単純な送信」にする（GAS の Webアプリが受け取れる形。テンキーと同じ）
    return fetch(config.gasUrl, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' })
      .then(function (res) { return res.json(); });
  }

  function eventList() {
    return Object.keys(state.events).map(function (k) { return state.events[k]; });
  }

  /** GAS から届いた一覧を覚える（その月と今日から先の分は、届いたものに置き換える＝相手が消した予定も消える）。 */
  function merge(r) {
    var month = r.month;
    Object.keys(state.events).forEach(function (id) {
      var e = state.events[id];
      if (e.date.indexOf(month) === 0 || e.date >= state.today) delete state.events[id];
    });
    (r.events || []).forEach(function (e) { state.events[e.id] = e; });
  }

  function load() {
    var month = state.y + '-' + (state.m < 10 ? '0' : '') + state.m;
    return call({ action: 'liff_cal_list', month: month }).then(function (r) {
      if (!r || !r.ok) { flash((r && r.message) || state.texts.LIFF_FAILED, true); return; }
      merge(r);
      render();
    }).catch(function () { flash(state.texts.LIFF_FAILED, true); });
  }

  function flash(text, isError) {
    state.flash = text;
    state.flashError = !!isError;
    render();
  }

  // ---- カレンダーと一覧 ----
  function render() {
    var formOpen = !!state.form;
    el.main.hidden = formOpen;
    el.form.hidden = !formOpen;
    el.add.hidden = formOpen;
    if (formOpen) { renderForm(); return; }

    Array.prototype.forEach.call(el.tabs.children, function (b) {
      b.setAttribute('aria-selected', b.dataset.tab === state.tab ? 'true' : 'false');
    });
    el.month.hidden = state.tab !== 'cal';
    el.monthNum.textContent = state.m;
    el.monthName.textContent = MONTHS_FR[state.m - 1] + ' ' + state.y;

    var events = eventList();
    el.grid.textContent = '';
    monthCells(state.y, state.m, state.today, state.sel, events).forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      if (c.blank) { b.className = 'cal-cell blank'; b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); el.grid.appendChild(b); return; }
      b.className = 'cal-cell' + (c.today ? ' today' : '') + (c.sel ? ' sel' : '') + (c.dow === 0 ? ' sun' : c.dow === 6 ? ' sat' : '');
      b.setAttribute('aria-label', state.m + '月' + c.day + '日' + (c.count ? '、予定' + c.count + '件' : ''));
      if (c.sel) b.setAttribute('aria-current', 'date');
      var num = document.createElement('span');
      num.className = 'cal-num';
      num.textContent = c.day;
      var dots = document.createElement('span');
      dots.className = 'cal-dots';
      c.who.forEach(function (w) {
        var dot = document.createElement('span');
        dot.className = 'cal-dot ' + WHO_CLASS[w];
        dots.appendChild(dot);
      });
      b.appendChild(num);
      b.appendChild(dots);
      b.addEventListener('click', function () {
        state.sel = c.date; state.tab = 'cal'; clearFlash(); closeConfirm(); render();
        showList();
      });
      el.grid.appendChild(b);
    });

    var items = filterTab(events, state.tab, state.today, state.sel);
    var head = listHead(state.tab, state.sel);
    el.listTitle.textContent = head.title;
    el.listSub.textContent = head.sub;
    el.items.textContent = '';
    if (!items.length) {
      var none = document.createElement('div');
      none.className = 'cal-empty';
      none.textContent = state.texts.CAL_EMPTY;
      el.items.appendChild(none);
    }
    items.forEach(function (e) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'cal-item';
      var when = document.createElement('div');
      when.className = 'cal-item-when';
      var date = document.createElement('div');
      date.className = 'cal-item-date';
      date.textContent = md(e.date);
      var time = document.createElement('div');
      time.className = 'cal-item-time';
      time.textContent = timeLabel(e.time, state.texts.CAL_ALL_DAY);
      when.appendChild(date);
      when.appendChild(time);
      var tag = document.createElement('span');
      tag.className = 'cal-tag ' + (WHO_CLASS[e.who] || 'who-family');
      tag.textContent = e.who;
      var title = document.createElement('div');
      title.className = 'cal-item-title';
      title.textContent = e.title;
      row.appendChild(when);
      row.appendChild(tag);
      row.appendChild(title);
      row.addEventListener('click', function () { askDelete(e); });
      el.items.appendChild(row);
    });

    if (state.confirming) say(state.texts.CAL_DELETE_BUBBLE);
    else if (state.flash) say(state.flash, state.flashError);
    else say(bubbleFor(state.texts, state.tab, items.length, state.sel));
  }

  function clearFlash() { state.flash = ''; state.flashError = false; }

  /** 背の低い画面で日付を押したとき、その日の予定の一覧が画面の下に隠れていれば、見えるところまで動かす。 */
  function showList() {
    var box = el.items.getBoundingClientRect();
    if (box.top < root.innerHeight - 40) return;
    var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { el.items.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); } catch (e) { el.items.scrollIntoView(false); }
  }

  function pickTab(tab) {
    state.tab = tab;
    clearFlash();
    closeConfirm();
    render();
  }

  function moveMonth(delta) {
    var n = shiftMonth(state.y, state.m, delta);
    state.y = n.y;
    state.m = n.m;
    var thisMonth = state.today.slice(0, 7) === n.y + '-' + (n.m < 10 ? '0' : '') + n.m;
    state.sel = thisMonth ? state.today : n.y + '-' + (n.m < 10 ? '0' : '') + n.m + '-01';
    clearFlash();
    closeConfirm();
    render();
    load();
  }

  // ---- 消す ----
  function askDelete(e) {
    state.confirming = e;
    el.confirmText.textContent = fill(state.texts.CAL_DELETE_CONFIRM, { date: mdDow(e.date), title: e.title });
    el.confirm.hidden = false;
    say(state.texts.CAL_DELETE_BUBBLE);
  }

  function closeConfirm() {
    state.confirming = null;
    el.confirm.hidden = true;
  }

  function deleteYes() {
    var e = state.confirming;
    if (!e || state.busy) return;
    state.busy = true;
    el.confirmYes.setAttribute('aria-busy', 'true');
    call({ action: 'liff_cal_delete', id: e.id })
      .then(function (r) {
        state.busy = false;
        el.confirmYes.setAttribute('aria-busy', 'false');
        closeConfirm();
        if (r && (r.ok || r.error === 'already' || r.error === 'not_found')) {
          delete state.events[e.id];          // もう消えていた（相手が消した）ときも、表から外す
          flash(r.message);
          return;
        }
        flash((r && r.message) || state.texts.LIFF_FAILED, true);
      })
      .catch(function () {
        state.busy = false;
        el.confirmYes.setAttribute('aria-busy', 'false');
        closeConfirm();
        flash(state.texts.LIFF_FAILED, true);
      });
  }

  // ---- 予定を書く ----
  function openForm() {
    closeConfirm();
    clearFlash();
    state.form = { title: '', hh: null, mm: null, who: state.defaultWho, requestId: '' };
    el.title.value = '';
    render();
    say(state.texts.CAL_FORM);
    root.scrollTo(0, 0);
  }

  function closeForm() {
    state.form = null;
    render();
  }

  function chip(label, on, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cal-chip k';
    b.textContent = label;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.addEventListener('click', onClick);
    return b;
  }

  function renderForm() {
    var f = state.form;
    el.formDate.textContent = mdDow(state.sel);
    el.timeText.textContent = timeLabel(toTime(f.hh, f.mm), state.texts.CAL_ALL_DAY);
    el.hours.textContent = '';
    for (var h = 0; h < 24; h++) {
      (function (h) {
        el.hours.appendChild(chip(String(h), f.hh === h, function () {
          f.hh = h;
          if (f.mm === null) f.mm = 0;
          renderForm();
        }));
      })(h);
    }
    el.mins.textContent = '';
    for (var mi = 0; mi < 60; mi += 5) {
      (function (mi) {
        el.mins.appendChild(chip(':' + pad(mi), f.hh !== null && f.mm === mi, function () {
          f.mm = mi;
          if (f.hh === null) f.hh = 9;
          renderForm();
        }));
      })(mi);
    }
    el.allDay.setAttribute('aria-pressed', f.hh === null ? 'true' : 'false');
    el.whos.textContent = '';
    state.who.forEach(function (w) {
      el.whos.appendChild(chip(w, f.who === w, function () { f.who = w; renderForm(); }));
    });
    updateSave();
  }

  function updateSave() {
    var ok = !!state.form && el.title.value.trim().length > 0 && !state.busy;
    el.save.classList.toggle('ready', ok);
    el.save.classList.toggle('shine', ok);
    el.save.setAttribute('aria-disabled', ok ? 'false' : 'true');
  }

  function save() {
    var f = state.form;
    if (!f || state.busy || !el.title.value.trim()) return;
    state.busy = true;
    if (!f.requestId) f.requestId = 'c' + Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
    updateSave();
    call({ action: 'liff_cal_add', date: state.sel, time: toTime(f.hh, f.mm), who: f.who, title: el.title.value.trim(),
           requestId: f.requestId })
      .then(function (r) {
        state.busy = false;
        if (!r || !r.ok) {
          say((r && r.message) || state.texts.LIFF_FAILED, true);
          if (r && r.error !== 'failed') f.requestId = '';
          updateSave();
          return;
        }
        state.events[r.event.id] = r.event;
        state.form = null;
        state.tab = 'cal';
        flash(r.message);
        root.scrollTo(0, 0);
      })
      .catch(function () {
        state.busy = false;
        say(state.texts.LIFF_FAILED, true);
        updateSave();
      });
  }

  // ---- はじめ ----
  function start(r) {
    state.texts = r.texts;
    state.today = r.today;
    var p = parse(r.today);
    state.y = p.y;
    state.m = p.m;
    state.sel = r.today;
    state.defaultWho = r.defaultWho;
    state.who = r.who || WHO_ORDER;
    el.title.placeholder = r.texts.CAL_TITLE_PLACEHOLDER;
    merge(r);
    el.tabs.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-tab]');
      if (b) pickTab(b.dataset.tab);
    });
    el.prev.addEventListener('click', function () { moveMonth(-1); });
    el.next.addEventListener('click', function () { moveMonth(1); });
    el.add.addEventListener('click', openForm);
    el.back.addEventListener('click', closeForm);
    el.save.addEventListener('click', save);
    el.title.addEventListener('input', updateSave);
    el.allDay.addEventListener('click', function () { state.form.hh = null; state.form.mm = null; renderForm(); });
    el.confirmNo.addEventListener('click', function () { closeConfirm(); render(); });
    el.confirmYes.addEventListener('click', deleteYes);
    el.add.hidden = false;
    render();
  }

  if (!config.liffId || !config.gasUrl || !root.liff) { say(EARLY.NO_CONFIG, true); return; }
  liff.init({ liffId: config.liffId })
    .then(function () {
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return null; }
      return call({ action: 'liff_cal_list' });
    })
    .then(function (r) {
      if (!r) return;
      if (!r.ok) { say(r.message || EARLY.CONNECT, true); return; }
      start(r);
    })
    .catch(function () { say(EARLY.CONNECT, true); });
})(this);

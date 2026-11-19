/**
 * テンキー画面（LIFF）の動き。画面の流れは 入力 → 完了 → 履歴（デザイン：line_cash_bot/design/keypad_design.dc.html）。
 * セリフ・項目は開いたときに GAS（messages.gs・liff.gs）から受け取る。
 * ・ユーザーIDは送らない。LIFF の IDトークン（liff.getIDToken）を送り、GAS が LINE の検証 API で確かめる
 * ・チャットには何も送らない。記録・取り消しの確認はこの画面の中だけ
 * ・GAS とつながる前のエラー（設定がない・LINE の外で開いた など）だけは、ここに書いた文を出す
 */
(function () {
  'use strict';
  var K = window.Keypad;
  var config = window.KAKEIBO_LIFF_CONFIG || {};
  // GAS とつながる前に出す文（それ以外のセリフはすべて GAS の messages.gs から受け取る）
  var EARLY = {
    NO_CONFIG: '準備中ですわ\n（config.js に LIFF ID と送り先をお書きになって）',
    CONNECT: 'あら、つながりませんでしたわ。\n電波の良いところで開き直してくださいな',
  };
  // ボタンの言葉（デザインのとおり）
  var LABEL = { RECORD: '記録する', NEED_ITEM: '項目を選んでください', NEED_AMOUNT: '金額を入れてください',
                SENDING: '記録しています', HISTORY: '履歴', BACK: 'もどる' };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    bubble: $('bubble'), video: $('video'), still: $('still'), historyBtn: $('historyBtn'),
    input: $('input'), items: $('items'), name: $('name'), catLabel: $('catLabel'), amount: $('amount'),
    keys: $('keys'), record: $('record'),
    done: $('done'), doneItem: $('doneItem'), doneAmount: $('doneAmount'), doneTotal: $('doneTotal'),
    doneBudget: $('doneBudget'), again: $('again'), undo: $('undo'), close: $('close'),
    history: $('history'), historyMonth: $('historyMonth'), historyList: $('historyList'),
    confirm: $('confirm'), confirmText: $('confirmText'), confirmNo: $('confirmNo'), confirmYes: $('confirmYes'),
  };
  var state = {
    data: null, mode: 'input', before: 'input', item: '', digits: '', sending: false, requestId: '',
    last: null,          // 今の記録（完了の画面で取り消せる）{ id, item, digits }
    records: [],         // 履歴
    confirming: null,    // 取り消しを確かめている記録
  };

  // ---- 女の子の動画：再生できない（低電力モードなど）・動きを減らす設定なら、止めて静止画（エラーは出さない） ----
  function showStill() {
    try { el.video.pause(); } catch (e) { /* 止められなくても静止画を出す */ }
    el.video.hidden = true;
    el.still.hidden = false;
  }
  (function setupVideo() {
    var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (reduce && reduce.matches) { showStill(); return; }
    el.video.addEventListener('error', showStill);
    try {
      var p = el.video.play();
      if (p && typeof p.catch === 'function') p.catch(showStill);
    } catch (e) { showStill(); }
    if (reduce && reduce.addEventListener) reduce.addEventListener('change', function (e) { if (e.matches) showStill(); });
  })();

  // ---- セリフ ----
  function say(text, isError) {
    el.bubble.textContent = text || '…';
    el.bubble.classList.toggle('error', !!isError);
  }

  // ---- GAS とのやり取り ----
  function call(body) {
    body.idToken = liff.getIDToken();
    // 見出し（Content-Type）を付けない「単純な送信」にする（GAS の Webアプリが受け取れる形）
    return fetch(config.gasUrl, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' })
      .then(function (res) { return res.json(); });
  }

  // ---- 画面の切り替え ----
  function show(mode) {
    state.mode = mode;
    el.input.hidden = mode !== 'input';
    el.done.hidden = mode !== 'done';
    el.history.hidden = mode !== 'history';
    el.historyBtn.textContent = mode === 'history' ? LABEL.BACK : LABEL.HISTORY;
    window.scrollTo(0, 0);
  }

  // ---- 入力の画面 ----
  function renderItems(items) {
    el.items.textContent = '';
    el.items.style.gridTemplateColumns = 'repeat(' + K.itemColumns(items.length) + ', minmax(0, 1fr))';
    items.forEach(function (it, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'k item';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.dataset.item = it.name;
      var no = document.createElement('span');
      no.className = 'roman';
      no.textContent = K.roman(i + 1);
      no.setAttribute('aria-hidden', 'true');
      var label = document.createElement('span');
      label.textContent = it.name;
      b.appendChild(no);
      b.appendChild(label);
      b.addEventListener('click', function () { chooseItem(it); });
      el.items.appendChild(b);
    });
  }

  function chooseItem(it) {
    state.item = it.name;
    Array.prototype.forEach.call(el.items.children, function (b) {
      b.setAttribute('aria-checked', b.dataset.item === it.name ? 'true' : 'false');
    });
    var other = it.name === state.data.other;   // 「その他」だけ品名の欄を出す
    el.name.hidden = !other;
    if (!other) el.name.value = '';
    say(K.amountLine(state.data.texts, state.digits, state.data.bigAmount) || it.ask);
    update();
  }

  function currentAsk() {
    var it = state.data.items.filter(function (x) { return x.name === state.item; })[0];
    return it ? it.ask : state.data.texts.LIFF_OPEN;
  }

  function pressKey(key) {
    var next = K.press(state.digits, key, state.data.maxAmount);
    if (next === state.digits && key !== 'back') {
      if (state.digits) say(state.data.texts.LIFF_TOO_BIG, true);   // 9,999,999円 を超える（0 円のときの 0・00 は何もしない）
      return;
    }
    state.digits = next;
    say(K.amountLine(state.data.texts, state.digits, state.data.bigAmount) || (state.item ? currentAsk() : state.data.texts.LIFF_OPEN));
    update();
  }

  function ready() {
    return K.canRecord(state.item, state.digits, state.data.minAmount, state.data.maxAmount);
  }

  function update() {
    el.amount.textContent = '¥ ' + K.num(state.digits);
    el.amount.classList.remove('long', 'longer');
    var size = K.amountSize(state.digits);
    if (size) el.amount.classList.add(size);
    el.catLabel.textContent = state.item || LABEL.NEED_ITEM;
    var ok = ready() && !state.sending;
    el.record.classList.toggle('ready', ok);
    el.record.classList.toggle('shine', ok);       // 押せるときだけ光沢が流れる
    el.record.setAttribute('aria-disabled', ok ? 'false' : 'true');
    el.record.textContent = state.sending ? LABEL.SENDING : ready() ? LABEL.RECORD : state.item ? LABEL.NEED_AMOUNT : LABEL.NEED_ITEM;
  }

  function record() {
    if (state.sending || !ready()) return;
    state.sending = true;
    if (!state.requestId) state.requestId = K.requestId();   // やり直しのときは同じ名前（GAS が二重に記録しない）
    update();
    call({ action: 'liff_record', item: state.item, amount: state.digits, name: el.name.value, requestId: state.requestId })
      .then(function (r) {
        state.sending = false;
        if (!r || !r.ok) {
          say((r && r.message) || state.data.texts.LIFF_FAILED, true);
          if (r && r.error !== 'failed') state.requestId = '';   // 記録されなかったので、次は新しい送信
          update();
          return;
        }
        state.requestId = '';
        showDone(r);
      })
      .catch(function () {
        state.sending = false;
        say(state.data.texts.LIFF_FAILED, true);
        update();
      });
  }

  // ---- 完了の画面 ----
  function showDone(r) {
    state.last = { id: r.id, item: r.item, digits: state.digits };
    el.doneItem.textContent = r.item;
    el.doneAmount.textContent = '¥ ' + K.num(state.digits);
    el.doneTotal.textContent = r.monthTotal || '';
    el.doneBudget.textContent = r.budget || '';     // 予算のないカテゴリなら空（行ごと出さない）
    el.undo.disabled = false;
    show('done');
    say(r.message);
  }

  function reset(line) {
    state.item = '';
    state.digits = '';
    state.requestId = '';
    el.name.value = '';
    el.name.hidden = true;
    Array.prototype.forEach.call(el.items.children, function (b) { b.setAttribute('aria-checked', 'false'); });
    show('input');
    say(line || state.data.texts.LIFF_OPEN);
    update();
  }

  /** 完了の画面の「今の記録を取り消す」：いま記録した1件を取り消して、入力の画面に戻る。 */
  function undoLast() {
    if (!state.last || el.undo.getAttribute('aria-busy') === 'true') return;
    busy(el.undo, true);
    call({ action: 'liff_cancel', id: state.last.id })
      .then(function (r) {
        busy(el.undo, false);
        if (r && (r.ok || r.error === 'already')) {
          state.last = null;
          reset(state.data.texts.LIFF_UNDONE);
          return;
        }
        say((r && r.message) || state.data.texts.LIFF_FAILED, true);
      })
      .catch(function () { busy(el.undo, false); say(state.data.texts.LIFF_FAILED, true); });
  }

  function busy(button, on) {
    button.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  // ---- 履歴 ----
  function openHistory() {
    state.before = state.mode;
    state.confirming = null;
    el.confirm.hidden = true;
    el.historyMonth.textContent = '';
    note('…');
    show('history');
    say(state.data.texts.LIFF_HISTORY);
    call({ action: 'liff_history' })
      .then(function (r) {
        if (state.mode !== 'history') return;
        if (!r || !r.ok) { note(''); say((r && r.message) || state.data.texts.LIFF_FAILED, true); return; }
        state.records = r.records || [];
        el.historyMonth.textContent = K.monthName(r.month);
        renderHistory();
      })
      .catch(function () { note(''); say(state.data.texts.LIFF_FAILED, true); });
  }

  function closeHistory() {
    state.confirming = null;
    el.confirm.hidden = true;
    if (state.before === 'done' && state.last) { show('done'); say(state.data.texts.LIFF_RECORDED); return; }
    if (state.before === 'done') { reset(); return; }
    show('input');
    say(K.amountLine(state.data.texts, state.digits, state.data.bigAmount) || (state.item ? currentAsk() : state.data.texts.LIFF_OPEN));
    update();
  }

  function note(text) {
    el.historyList.textContent = '';
    if (!text) return;
    var d = document.createElement('div');
    d.className = 'history-note';
    d.textContent = text;
    el.historyList.appendChild(d);
  }

  function renderHistory() {
    if (!state.records.length) { note(state.data.texts.LIFF_HISTORY_EMPTY); return; }
    el.historyList.textContent = '';
    state.records.forEach(function (h) {
      var row = document.createElement('div');
      row.className = 'row' + (h.cancelled ? ' cancelled' : '');
      var main = document.createElement('div');
      main.className = 'row-main';
      var when = document.createElement('div');
      when.className = 'row-when';
      when.textContent = h.when;
      var what = document.createElement('div');
      what.className = 'row-what';
      what.appendChild(document.createTextNode(h.item + '　'));
      var amt = document.createElement('span');
      amt.className = 'row-amount';
      amt.textContent = '¥ ' + K.num(h.amount);
      what.appendChild(amt);
      main.appendChild(when);
      main.appendChild(what);
      row.appendChild(main);
      if (h.cancelled) {
        var doneMark = document.createElement('div');
        doneMark.className = 'row-done';
        doneMark.textContent = '取消済み';
        row.appendChild(doneMark);
      } else {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'row-cancel';
        b.textContent = '取り消す';
        b.addEventListener('click', function () { askCancel(h); });
        row.appendChild(b);
      }
      el.historyList.appendChild(row);
    });
  }

  function askCancel(h) {
    state.confirming = h;
    el.confirmText.textContent = K.fill(state.data.texts.LIFF_CONFIRM, { item: h.item, amount: K.yen(h.amount) });
    el.confirm.hidden = false;
    say(state.data.texts.LIFF_CONFIRM_BUBBLE);
  }

  function cancelNo() {
    state.confirming = null;
    el.confirm.hidden = true;
    say(state.data.texts.LIFF_HISTORY);
  }

  function cancelYes() {
    var h = state.confirming;
    if (!h || el.confirmYes.getAttribute('aria-busy') === 'true') return;
    busy(el.confirmYes, true);
    call({ action: 'liff_cancel', id: h.id })
      .then(function (r) {
        busy(el.confirmYes, false);
        state.confirming = null;
        el.confirm.hidden = true;
        if (r && (r.ok || r.error === 'already')) {
          h.cancelled = true;
          if (state.last && state.last.id === h.id) state.last = null;   // 今の記録だったら、完了の画面には戻さない
          renderHistory();
          say(r.message);
          return;
        }
        say((r && r.message) || state.data.texts.LIFF_FAILED, true);
      })
      .catch(function () { busy(el.confirmYes, false); say(state.data.texts.LIFF_FAILED, true); });
  }

  // ---- はじめ ----
  function start(data) {
    state.data = data;
    el.name.placeholder = data.texts.LIFF_ITEM_PLACEHOLDER;
    el.close.hidden = !liff.isInClient();   // LINE の外のブラウザでは閉じられないので出さない
    renderItems(data.items);
    el.keys.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-key]');
      if (b) pressKey(b.dataset.key);
    });
    el.record.addEventListener('click', record);
    el.again.addEventListener('click', function () { state.last = null; reset(); });
    el.undo.addEventListener('click', undoLast);
    el.close.addEventListener('click', function () { liff.closeWindow(); });
    el.historyBtn.addEventListener('click', function () {
      if (state.mode === 'history') closeHistory(); else openHistory();
    });
    el.confirmNo.addEventListener('click', cancelNo);
    el.confirmYes.addEventListener('click', cancelYes);
    el.historyBtn.hidden = false;
    show('input');
    say(data.texts.LIFF_OPEN);
    update();
  }

  if (!config.liffId || !config.gasUrl || !window.liff) {
    say(EARLY.NO_CONFIG, true);
    return;
  }
  liff.init({ liffId: config.liffId })
    .then(function () {
      if (!liff.isLoggedIn()) { liff.login(); return null; }   // LINE の外のブラウザで開いたとき
      return call({ action: 'liff_init' });
    })
    .then(function (data) {
      if (!data) return;
      if (!data.ok) { say(data.message || EARLY.CONNECT, true); return; }   // 登録していない人など
      start(data);
    })
    .catch(function () { say(EARLY.CONNECT, true); });
})();

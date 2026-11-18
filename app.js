/**
 * テンキー画面（LIFF）の動き。セリフ・項目は開いたときに GAS（messages.gs・liff.gs）から受け取る。
 * ・ユーザーIDは送らない。LIFF の IDトークン（liff.getIDToken）を送り、GAS が LINE の検証 API で確かめる
 * ・チャットには何も送らない。記録の確認はこの画面の中だけ
 * ・GAS とつながる前のエラー（設定がない・LINE の外で開いた など）だけは、ここに書いた文を出す
 */
(function () {
  'use strict';
  var K = window.Keypad;
  var config = window.KAKEIBO_LIFF_CONFIG || {};
  // GAS とつながる前に出す文（それ以外のセリフはすべて GAS の messages.gs から受け取る）
  var EARLY = {
    NO_CONFIG: '準備中ですわ（config.js に LIFF ID と送り先をお書きになって）',
    CONNECT: 'あら、つながりませんでしたわ。電波の良いところで開き直してくださいな',
  };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    bubble: $('bubble'), girl: $('girl'), input: $('input'), items: $('items'), name: $('name'), amount: $('amount'),
    keys: $('keys'), record: $('record'), done: $('done'), doneItem: $('doneItem'), doneAmount: $('doneAmount'),
    doneTotal: $('doneTotal'), doneBudget: $('doneBudget'), again: $('again'), close: $('close'),
  };
  var state = { data: null, item: '', digits: '', sending: false, requestId: '' };

  // ---- 吹き出し・女の子の動き ----
  function say(text, isError) {
    el.bubble.textContent = text || '…';
    el.bubble.classList.toggle('error', !!isError);
    el.bubble.classList.remove('pop');
    void el.bubble.offsetWidth;            // 同じ動きをもう一度始めるため
    el.bubble.classList.add('pop');
  }
  function hop() {
    el.girl.classList.remove('hop');
    void el.girl.offsetWidth;
    el.girl.classList.add('hop');
  }
  el.girl.addEventListener('animationend', function (e) { if (e.animationName === 'hop') el.girl.classList.remove('hop'); });

  // ---- GAS とのやり取り ----
  function call(body) {
    body.idToken = liff.getIDToken();
    // 見出し（Content-Type）を付けない「単純な送信」にする（GAS の Webアプリが受け取れる形）
    return fetch(config.gasUrl, { method: 'POST', body: JSON.stringify(body), redirect: 'follow' })
      .then(function (res) { return res.json(); });
  }

  // ---- 画面を作る ----
  function renderItems(items) {
    el.items.textContent = '';
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.dataset.item = it.name;
      var icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = it.icon;
      var label = document.createElement('span');
      label.textContent = it.name;
      b.appendChild(icon);
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
    say(state.digits ? K.amountLine(state.data.texts, state.digits, state.data.bigAmount) || it.ask : it.ask);
    update();
  }

  function pressKey(key) {
    var next = K.press(state.digits, key, state.data.maxAmount);
    if (next === state.digits && key !== 'back') {
      if (state.digits) say(state.data.texts.LIFF_TOO_BIG, true);   // 9,999,999円 を超える（0 円のときの 0・00 は何もしない）
      return;
    }
    state.digits = next;
    var line = K.amountLine(state.data.texts, state.digits, state.data.bigAmount);
    if (line) say(line);
    else if (state.item) say(currentAsk());
    else say(state.data.texts.LIFF_OPEN);
    update();
  }

  function currentAsk() {
    var it = state.data.items.filter(function (x) { return x.name === state.item; })[0];
    return it ? it.ask : state.data.texts.LIFF_OPEN;
  }

  function update() {
    el.amount.textContent = K.yen(state.digits);
    el.amount.classList.toggle('empty', !state.digits);
    el.record.disabled = state.sending || !K.canRecord(state.item, state.digits, state.data.minAmount, state.data.maxAmount);
  }

  function record() {
    if (el.record.disabled) return;
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

  function showDone(r) {
    el.doneItem.textContent = r.item;
    el.doneAmount.textContent = r.amount;
    el.doneTotal.textContent = r.monthTotal || '';
    el.doneBudget.textContent = r.budget || '';
    el.input.hidden = true;
    el.done.hidden = false;
    say(r.message);
    hop();
  }

  function reset() {
    state.item = '';
    state.digits = '';
    el.name.value = '';
    el.name.hidden = true;
    Array.prototype.forEach.call(el.items.children, function (b) { b.setAttribute('aria-checked', 'false'); });
    el.done.hidden = true;
    el.input.hidden = false;
    say(state.data.texts.LIFF_OPEN);
    update();
  }

  function start(data) {
    state.data = data;
    var t = data.texts;
    el.record.textContent = t.LIFF_RECORD_BUTTON;
    el.again.textContent = t.LIFF_AGAIN_BUTTON;
    el.close.textContent = t.LIFF_CLOSE_BUTTON;
    el.name.placeholder = t.LIFF_ITEM_PLACEHOLDER;
    el.close.hidden = !liff.isInClient();   // LINE の外のブラウザでは閉じられないので出さない
    renderItems(data.items);
    el.keys.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-key]');
      if (b) pressKey(b.dataset.key);
    });
    el.record.addEventListener('click', record);
    el.again.addEventListener('click', reset);
    el.close.addEventListener('click', function () { liff.closeWindow(); });
    el.input.hidden = false;
    say(t.LIFF_OPEN);
    update();
  }

  // ---- はじめ ----
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

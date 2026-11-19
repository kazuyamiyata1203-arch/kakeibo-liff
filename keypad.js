/**
 * テンキー画面の「計算だけ」の部分（画面の操作や通信はしない）。ブラウザでは window.Keypad、テストでは require で使う。
 */
(function (root) {
  var MAX_DIGITS = 7;   // 9,999,999円 まで

  /** キーを押したあとの金額の数字（文字）。key は '0'〜'9'・'00'・'back'。max を超える押し方は受け付けない（元のまま）。 */
  function press(digits, key, max) {
    var d = String(digits || '');
    if (key === 'back') return d.slice(0, -1);
    if (!/^(\d|00)$/.test(key)) return d;
    var next = (d + key).replace(/^0+/, '');          // 先頭の 0 は付けない（0 や 00 だけでは 0 円のまま）
    if (next.length > MAX_DIGITS) return d;
    if (max && Number(next) > max) return d;
    return next;
  }

  /** 1234 → "1,234"。空なら "0"（画面の「¥ 1,234」の数字の部分）。 */
  function num(digits) {
    var n = Math.round(Number(digits || 0)) || 0;
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /** 1234 → "1,234円"。空なら "0円"（セリフの中の金額）。 */
  function yen(digits) {
    return num(digits) + '円';
  }

  /** 項目の番号：1 → "I"、2 → "II" … 9 → "IX"、12 → "XII"（表示順に振る）。 */
  function roman(n) {
    var table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
                 [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    var v = Math.floor(Number(n) || 0);
    if (v < 1 || v > 3999) return '';
    var out = '';
    table.forEach(function (t) { while (v >= t[0]) { out += t[1]; v -= t[0]; } });
    return out;
  }

  /** 項目のボタンの列の数：5個までは1列に並べ、6個以上は5列で折り返す。 */
  function itemColumns(count) {
    return Math.max(1, Math.min(Number(count) || 0, 5));
  }

  /** 履歴の見出しの月（フランス語。デザインの「Novembre」）。1〜12。 */
  var MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  function monthName(m) {
    return MONTHS_FR[(Number(m) || 0) - 1] || '';
  }

  /** 金額の桁が多いときに文字を小さくする印（6桁 → long、7桁 → longer）。 */
  function amountSize(digits) {
    var len = String(digits || '').length;
    return len >= 7 ? 'longer' : len >= 6 ? 'long' : '';
  }

  /** {amount} などの波かっこに値を入れる（GAS の messages.gs と同じ書き方）。 */
  function fill(text, vars) {
    return String(text || '').replace(/\{(\w+)\}/g, function (all, k) {
      return vars && vars[k] !== undefined ? String(vars[k]) : all;
    });
  }

  /** 金額を入れたときのセリフ。big 円以上は「ずいぶん奮発しましたのね」の文。 */
  function amountLine(texts, digits, big) {
    var n = Number(digits || 0);
    if (!n) return '';
    return fill(n >= big ? texts.LIFF_AMOUNT_BIG : texts.LIFF_AMOUNT, { amount: yen(digits) });
  }

  /** 「記録する」を押せるか：項目を選び、金額が min〜max。 */
  function canRecord(item, digits, min, max) {
    var n = Number(digits || 0);
    return !!item && n >= (min || 1) && n <= max;
  }

  /** 二重送信を防ぐための、送信ごとの名前。 */
  function requestId(rand) {
    var r = rand || Math.random;
    return 'r' + Date.now().toString(36) + Math.floor(r() * 1e9).toString(36);
  }

  var api = { press: press, num: num, yen: yen, roman: roman, itemColumns: itemColumns, monthName: monthName,
              amountSize: amountSize, fill: fill, amountLine: amountLine, canRecord: canRecord, requestId: requestId,
              MAX_DIGITS: MAX_DIGITS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Keypad = api;
})(this);

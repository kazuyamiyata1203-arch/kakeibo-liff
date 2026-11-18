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

  /** 1234 → "1,234円"。空なら "0円"。 */
  function yen(digits) {
    var n = Number(digits || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '円';
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

  var api = { press: press, yen: yen, fill: fill, amountLine: amountLine, canRecord: canRecord, requestId: requestId,
              MAX_DIGITS: MAX_DIGITS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Keypad = api;
})(this);

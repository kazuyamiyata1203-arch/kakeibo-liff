/**
 * どちらの画面を出すか（テンキー／予定カレンダー）を、ページを描く前に決める。
 * ・https://liff.line.me/<LIFF ID>?view=calendar で開くとカレンダー。何も付けなければ今までどおりテンキー
 * ・LINE は最初、付けた部分を「liff.state」に入れてこのページを開き、liff.init のあとで ?view=calendar の形に開き直す
 *   （LINE の公式ドキュメント「Opening a LIFF app」）。どちらの形でもカレンダーと分かるようにする
 * ・<html data-view="calendar"> にして、style.css・calendar.css で見せる部分を切り替える
 */
(function (root) {
  function viewOf(search) {
    var q = String(search || '').replace(/^\?/, '');
    var parts = q ? q.split('&') : [];
    for (var i = 0; i < parts.length; i++) {
      var kv = parts[i].split('=');
      var key = decodeURIComponent(kv[0] || '');
      var val = '';
      try { val = decodeURIComponent((kv.slice(1).join('=') || '').replace(/\+/g, ' ')); } catch (e) { val = ''; }
      if (key === 'view' && val === 'calendar') return 'calendar';
      if (key === 'liff.state' && /(^|[?&])view=calendar(&|#|$)/.test(val)) return 'calendar';
    }
    return 'keypad';
  }

  if (typeof module !== 'undefined' && module.exports) { module.exports = { viewOf: viewOf }; return; }
  var view = viewOf(root.location && root.location.search);
  root.KAKEIBO_VIEW = view;
  root.document.documentElement.setAttribute('data-view', view);
})(this);

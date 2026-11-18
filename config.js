// テンキー画面の設定。このファイルをまねて「config.js」を作り、2つの値を入れてから GitHub Pages に置く。
// ・合言葉・トークン・ユーザーID・チャネルシークレットはここに書かない（公開されるため）
// ・config.js は kakeibo の Git には入れない（.gitignore 済み）
window.KAKEIBO_LIFF_CONFIG = {
  // LINE Developers の「LINEログイン」チャネル → LIFF タブの「LIFF ID」（例 1234567890-AbcdEfgh）
  liffId: '2012687004-23teCsDR',
  // GAS の Webアプリの URL（https://script.google.com/macros/s/……/exec）。kakeibo の .streamlit\secrets.toml の url と同じ
  gasUrl: 'https://script.google.com/macros/s/AKfycbw-3GzQSaLfYHrXz8PZDy0jKTul7r1iMnSRP54Y5YiRg3ClAxlC-JqmlUNHXvl98laSGA/exec',
};

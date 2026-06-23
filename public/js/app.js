/**
 * RET – main application orchestrator
 *
 * State machine:
 *   idle ──20s──> wandering（歩く / 座る / 画面外へ）
 *   wandering ──tap──> returning ──> listening ──result──> thinking ──reply──> talking ──done──> idle
 */

import { SceneController, STATE } from './scene.js?v=33';
import { VoiceController }        from './voice.js?v=2';

// ── Config ───────────────────────────────────────────────
const WANDER_DELAY_MS  = 20_000;
const BUTLER_MIN_MS    = 30_000;   // 執事発話：最短30秒
const BUTLER_MAX_MS    = 120_000;  // 執事発話：最長2分
const MSG_HIDE_MS      = 7_000;
const CLEAR_TRIGGERS   = ['クリア', 'くりあ', '消去', 'クリアー'];
const MEMORY_TRIGGERS  = ['覚えて', 'おぼえて', '記憶して'];
const OUTING_TRIGGERS  = ['外出', 'がいしゅつ', 'そとで', '出かけ', 'でかけ'];
const RETURN_TRIGGERS  = ['もういいよ', 'もういい', '帰宅', 'きたく', '戻って'];

// ── TRPGモード（GMセッション）──
const TRPG_START_TRIGGERS = ['ゲームしよう', 'ゲームしましょう', 'TRPG', 'ＴＲＰＧ', 'てぃーあーるぴーじー', 'セッション開始', 'シナリオ開始', 'GMして', 'ジーエムして', 'ゲームマスター'];
const TRPG_END_TRIGGERS   = ['終わり', 'おわり', '終了', 'しゅうりょう', 'ゲーム終了', 'セッション終了', 'おしまい', 'ゲームやめ'];
const FACE_API         = '/api/face';

// ── PHASE E: 共闘／単独シーケンス（「行くぞ」）──
const GO_TRIGGERS       = ['行くぞ', 'いくぞ', 'イクゾ', 'ゆくぞ'];
const GO_YES_TRIGGERS   = ['はい', 'うん', 'いいよ', 'お願い', 'おねがい', '一緒'];
const GO_NO_TRIGGERS    = ['いいえ', 'いや', 'ひとり', '一人', '単独', 'けっこう', '結構'];
const ARRIVE_COOP_TRIGGERS = ['着いたな', 'ついたな', 'ついたな'];
const ARRIVE_SOLO_TRIGGERS = ['着いたぞ', 'ついたぞ', 'ついたぞ'];
const GO_HOME_TRIGGERS  = ['帰ろう', 'かえろう', '帰る'];
const GO_IDLE_TALK_MS   = 5_000;   // 走行ループ中、5秒無操作で独り言

// 共闘（はい）: バイク→相乗り(ループ) → 着いたな → バックルーム1→2→3(ループ) → 帰ろう → 4→帰宅
const COOP_TRAVEL        = ['videos/バイク.mp4', 'videos/相乗り.mp4'];
const COOP_BACKROOM_LOOP = ['videos/バックルーム1.mp4', 'videos/バックルーム2.mp4', 'videos/バックルーム3.mp4'];
const COOP_RETURN        = ['videos/バックルーム4.mp4', 'videos/帰宅.mp4'];
// 単独（いいえ）: バイク→ソロ(ループ) → 着いたぞ → バックルーム単独1→2→3(ループ) → 帰ろう → 単独4→帰宅
const SOLO_TRAVEL        = ['videos/バイク.mp4', 'videos/ソロ.mp4'];
const SOLO_BACKROOM_LOOP = ['videos/バックルーム単独1.mp4', 'videos/バックルーム単独2.mp4', 'videos/バックルーム単独3.mp4'];
const SOLO_RETURN        = ['videos/バックルーム単独4.mp4', 'videos/帰宅.mp4'];
// 単独（新仕様）: 1→2→3→5→6→7→8 を一度だけ順番に再生（ループ廃止）。
// 8まで行ったら自動で SOLO_RETURN（単独4→帰宅）。途中で「帰ろう」が来たら即そちらを優先。
const SOLO_BACKROOM = [
  'videos/バックルーム単独1.mp4', 'videos/バックルーム単独2.mp4', 'videos/バックルーム単独3.mp4',
  'videos/バックルーム単独5.mp4', 'videos/バックルーム単独6.mp4',
  'videos/バックルーム単独7.mp4', 'videos/バックルーム単独7b.mp4', 'videos/バックルーム単独8.mp4',
];

// ── お絵描き演出（「絵を描いて」）──
const DRAW_TRIGGERS      = ['絵を描いて', '絵描いて', '絵を書いて', 'えをかいて', '絵かいて', 'イラスト描いて', '絵を描こう'];
const DRAW_DONE_TRIGGERS = ['できた', '出来た', 'もうできた', 'まだ', '終わった', '完成', 'まだなの', 'できましたか'];
// 記憶の同期状況を聞く
const STATUS_TRIGGERS = ['同期状況', '同期され', '同期は', '記憶の状態', '記憶ステータス', '最終同期', 'いつ同期', '記憶はいつ', '記憶は最新', '記憶は何件', '記憶の件数'];
// 「インストール」で再同期を依頼（Mac側の見張り役が拾って実行）
const INSTALL_TRIGGERS = ['インストール', 'いんすとーる', 'インストールして'];
const DRAW_VIDEO = 'videos/デザイン.mp4';   // 制作中の動画（ループ）
const DRAW_TALK  = 'videos/話す.mp4';        // 完成時に話す動画
const DRAW_MAX_MS = 30_000;                  // 0〜30秒のランダムで完成扱い

// ── 体調不良の問診モード ──
const ILLNESS_TRIGGERS    = ['具合が悪い', '具合悪い', '体調が悪い', '体調悪い', '熱がある', '頭が痛い', '頭痛', 'お腹が痛い', '腹痛', '咳が出る', '吐き気', '気持ち悪い', 'めまい', 'だるい', '病気かも', '調子が悪い', 'しんどい', '吐きそう'];
const MONSHIN_END_TRIGGERS = ['大丈夫', 'もういい', '終了', '問診終了', '戻る', '問題ない', '落ち着いた'];
const MONSHIN_VIDEO = 'videos/問診.mp4';     // 問診中の動画（ループ）

// ── PHASE D: DuckDuckGo検索シーケンス（「検索」コマンド）──
const SEARCH_TRIGGERS   = ['検索', 'けんさく', 'ケンサク', 'サーチ', 'しらべて', '調べて'];
// 音声の合言葉ゲートはハッシュのみで照合（平文を公開JSに置かない / R-6順守）。
// 値は従来どおり「214200」を声で言う体験を維持。SHA-256ハッシュのみを保持する。
const SEARCH_GATE_HASH  = 'a902ad8afbcb34418cb8608d0924bd1a2ac20cfd7d37c389eef5a4d256ca5456';
// 実際のサーバー防御は別の“強いトークン”。公開JSに置かず、初回にユーザーが入力して
// localStorage に保存し、サーバー側 env.SEARCH_TOKEN と突き合わせる。
const SEARCH_SAVE_YES   = ['はい', 'うん', '保存', 'ほぞん', 'お願い', 'おねがい', 'して'];
const SEARCH_SAVE_NO    = ['いいえ', 'いや', 'いらない', 'しない', '結構', 'けっこう', '不要'];
const SEARCH_CONT_YES   = ['はい', 'うん', '続け', 'つづけ', 'お願い', 'おねがい', 'もう一度', 'もういちど'];
const SEARCH_VID_ROOM   = 'videos/研究室.mp4';
const SEARCH_VID_PC     = 'videos/パソコン.mp4';
const SEARCH_VID_TALK   = 'videos/話す.mp4';
const SEARCH_END_SEQ    = ['videos/施錠.mp4', 'videos/帰宅.mp4'];
const SEARCH_FAIL_RATE  = 2.0;                             // 失敗ループの倍速

// パスワード失敗時セリフ（発狂大佐・全21本）。ランダム・倍速・「話す」動画でループ。
const COLONEL_LINES = [
  'ニセモノ、今すぐゲームの電源を切るんだ！任務は失敗に終わった！今すぐ電源を切れっ！',
  'うろたえるな、これはゲームだ！いつものゲームなんだ。',
  '巻き舌宇宙で有名な紫ミミズの剥製はハラキリ岩の上で音叉が生まばたきするといいらしいぞ。要ハサミだ。６１！',
  'ニセモノ！大変だ！TVに切り替えてみろ！',
  '前から思っていたんだが、君はゲームオーバーになりすぎだ。こういってはなんだがかなり下手だな',
  'しかし、ずいぶん長い間ゲームをしているな。他にすることはないのか。まったく…。',
  '君は敵を倒すのが随分好きなようだな。何か欲求不満なことでもあるのか？',
  '実は私はかなりお金に困っているんだ。離婚した元妻への慰謝料とかな…この前、食事代を君に払わせてしまったのも仕方のないことだったんだよ。申し訳ない…。',
  'まさか君は不正な手段でインチキなスコアを出そうとはしていないだろうな？それは最悪の行為だぞ。まったく…。',
  'そういえばこの前、グパヤマに会ったぞ。シポムニギでな。君によろしくと言っていた。',
  'むしゃむしゃ…。ん？ニセモノか？今、食事中だ。後にしてくれ…。むしゃむしゃ…。',
  '私は前世でアメリカシロヒトリだったんだ。あの頃は楽しかった…。君の前世はなんだ？',
  'らりるれろ！らりるれろ！！らりるれろ！！！',
  'やれやれ。女子便所でおかしなことをしていた奴がここまでたどり着くとは。世も末だ…。',
  '私の我慢にも限界がある。もう君には任せておけん。私が出撃する！君はもう帰れ！',
  'ん？君は今までほとんど連絡してこなかったじゃないか。こういう時だけ人に頼るのか？まったく…',
  '川西能勢口、絹延橋、滝山、鴬の森、皷滝、多田、平野、一の鳥居、畦野、山下笹部、光風台、ときわ台、妙見口',
  'Zzzzzzzzzz…',
  '只今、留守にしております。御用の方はピーという発信音の後にメッセージをどうぞ。ピー。',
  '実は言うべきか言うまいか迷っていた事があってな…。先週の土曜日の朝…ローズ君の部屋から男が出てくるのを見たんだ…。',
  'アネモネ、クレマチスは汁がつくとかぶれることがある。剪定する時は手袋をした方がいいかもしれんな。',
];

// ── メインユーザー認証（松村拓実）──
// 顔認証の名前入力で以下のいずれかを含む名前なら機能解放。それ以外は拒否。
const AUTHORIZED_NAMES = ['松村', 'まつむら', 'マツムラ', '拓実', 'たくみ', 'タクミ'];
const ACCESS_DENIED_MSG = '松村は外出中です。';
// フォールバック認証の固定パスワード。平文はコードに置かず SHA-256 ハッシュのみ（R-6順守）。
// 値: 214200（検索シーケンスのパスワードと共通）。
const FIXED_PW_HASH = 'a902ad8afbcb34418cb8608d0924bd1a2ac20cfd7d37c389eef5a4d256ca5456';

// ── 外出シーケンス動画（外出→ドア→発進→後部座席でループ待機 / 音声ON）──
const OUTING_SEQUENCE = [
  'videos/外出.mp4',        // 1
  'videos/ドア開ける.mp4',  // 2
  'videos/発進.mp4',        // 3
  'videos/後部座席.mp4',    // 4 ← ここで「もういいよ」までループ待機
];
// ── 帰宅シーケンス動画（停車→帰宅 / 音声ON）──
const RETURN_SEQUENCE = [
  'videos/停車.mp4',        // 5
  'videos/帰宅.mp4',        // 6
];

// ── 後部座席ループ中の雑談フレーズ（5秒無操作ごとに発話）──
const OUTING_SMALLTALK = [
  '今日は風が気持ちいいですね。',
  '今日は道が空いていますね。',
  '天気が良くて、ドライブ日和でございますね。',
  '景色がきれいですね。',
  'のんびりとした時間でございますね。',
  '快適な乗り心地でございますね。',
  // ── 一般的なドライバーのセリフ（10個追加）──
  'この辺りは信号が少なく、スムーズに進みますね。',
  '渋滞もなく、順調に走れております。',
  'もう少しで高速に入ります。シートベルトはよろしいでしょうか。',
  '前の車も丁寧な運転で、走りやすうございます。',
  '少し肌寒うございますか。空調を調整いたしましょうか。',
  '音楽でもおかけいたしましょうか。',
  '日差しが強うございますね。サンバイザーをお使いくださいませ。',
  'この道は久しぶりに通りますね。',
  'お飲み物がご入用でしたら、お申し付けくださいませ。',
  'そろそろ夕方の混み合う時間でございますね。',
];
const OUTING_SMALLTALK_MS = 5_000;  // 後部座席ループ中、5秒無操作で雑談

// ── 執事発話フレーズ（時間帯別） ─────────────────────────
const BUTLER_PHRASES = {
  morning: [
    'おはようございます。本日もどうぞよい一日を。',
    '朝食のご準備はよろしいでしょうか。',
    '今朝もお目覚めのようで、何よりでございます。',
    '本日のご予定をお聞かせいただけますか。',
  ],
  afternoon: [
    '今日のご予定はいかがでしょうか。',
    '私になんでも仰せくださいませ。',
    '少々お時間よろしいでしょうか。',
    'ご用件があればいつでもお申し付けください。',
    'お飲み物でもご用意いたしましょうか。',
    '何かお力になれることがございましたら。',
  ],
  evening: [
    '本日もお疲れ様でございました。',
    'ゆっくりとお過ごしいただけますと幸いです。',
    '夕食のご準備はいかがでしょうか。',
    '今日一日、いかがでしたでしょうか。',
  ],
  night: [
    'そろそろお休みになられてはいかがでしょうか。',
    '夜更かしはお体に触ります。ご自愛ください。',
    'ご用件がなければ、お休みをおすすめいたします。',
    '私はいつでもここにおります。ご安心ください。',
  ],
};

function _getTimeZone() {
  const h = new Date().getHours();
  if (h >= 5  && h < 11) return 'morning';
  if (h >= 11 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'night';
}

function _pickButlerPhrase() {
  const phrases = BUTLER_PHRASES[_getTimeZone()];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// ── 取扱説明書 ────────────────────────────────────────────
const MANUAL_HTML = `
<h3>🤖 RETってなに？</h3>
<p>話しかけると、なんでも答えてくれる<strong>AIのともだち「あいなす」</strong>がいるよ！</p>

<h3>🎙️ 話しかけかた</h3>
<p><strong>① 右上のまるいボタンを1回おす</strong><br>
ボタンが赤くなったら聞いているよ。</p>
<p><strong>② 話しかける</strong><br>
なんでも話してOK！終わると自動で送信されるよ。</p>
<p><strong>③ あいなすが答えてくれる</strong><br>
声と文字で答えてくれるよ。止めたいときはもう一度ボタンをおしてね。</p>

<h3>✨ まほうのことば</h3>
<p><strong>「クリア」</strong> と言う → この説明書が出るよ<br>
<strong>「覚えて」</strong> と言う → 大事なことを覚えてもらえるよ</p>

<h3>💤 ほっておくと…</h3>
<p>しばらく操作しないと、あいなすが動きだすよ。話しかけるとすぐ戻ってくるよ！</p>

<h3>🆘 こまったとき</h3>
<p><strong>「もう一度試して」と出た</strong> → ボタンをもう一回おしてね<br>
<strong>音が出ない</strong> → 音量を上げてマナーモードを確認してね<br>
<strong>マイクが使えない</strong> → ブラウザのマイク許可をONにしてね</p>
`;

// ════════════════════════════════════════════════════════
class RETApp {
  constructor() {
    this.scene      = null;
    this.voice      = null;
    this.busy       = false;
    this.userName   = null;

    this._wanderTimer  = null;
    this._actionTimer  = null;
    this._butlerTimer  = null;
    this._msgTimer     = null;
    this._outingMode   = false;
    this._ainasAbort   = null;

    // 復帰シーケンス（帰宅/施錠→帰宅）再生中ガード。
    // 音声認識は非継続モードのため result 直後に必ず onend が発火する。
    // 復帰開始でモードフラグを下ろした直後の onListenEnd が setState(IDLE) で
    // シーケンスを kill するのを防ぐ（「帰ろう」で4が映らず待機に飛ぶ問題の対策）。
    this._seqLock      = false;

    // PHASE E: 共闘／単独シーケンス用の状態
    this._goMode       = false;        // 「行くぞ」シーケンス中か
    this._drawMode     = false;        // 「絵を描いて」演出中か
    this._drawDoneAt   = 0;            // 完成予定時刻（ms）
    this._pickMode     = false;        // 候補から選択待ちか
    this._pickCandidates = null;       // 候補タイトル配列
    this._monshinMode  = false;        // 体調不良の問診モード中か
    this._monshinHistory = [];         // 問診の会話履歴
    this._goPhase      = null;         // 'prompt' | 'travel' | 'backroom'
    this._goSolo       = false;        // true=単独 / false=共闘
    this._goIdleTimer  = null;

    // PHASE F: アイドリング会話（ナレッジ参照）用 — 直前トピック
    this._lastIdleTopic = null;

    // PHASE D: 検索シーケンス用の状態
    // TRPGモード（GMセッション）
    this._trpgMode      = false;
    this._trpgLog       = [];      // 日報用の記録（「GM: …」「あなた: …」）
    this._trpgHistory   = [];      // /api/chat 用の会話履歴

    this._searchMode    = false;   // 「検索」シーケンス中か
    this._searchPhase   = null;    // 'await_pw' | 'await_query' | 'searching' | 'save_confirm' | 'continue_confirm' | 'fail'
    this._searchTalkTimer = null;  // 失敗ループのセリフ発話タイマー
    this._searchLast    = null;    // 直近の検索結果 { q, summary }

    this._startFaceAuth();
  }

  // ── 顔認証フロー ──────────────────────────────────────

  async _startFaceAuth() {
    const screen = document.getElementById('face-screen');
    const video  = document.getElementById('face-video');
    const status = document.getElementById('face-status');

    // カメラ起動
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      video.srcObject = stream;
    } catch {
      // カメラ不可でも認証はスキップせず、名前入力で本人確認する
      status.textContent = 'カメラが使えません。お名前を入力してください。';
      this._showNameForm(null);
      return;
    }

    status.textContent = '顔を認識しています...';

    // 2秒後にキャプチャして照合
    await new Promise(r => setTimeout(r, 2000));
    const imageData = this._captureFrame(video);

    try {
      const res  = await fetch(`${FACE_API}/verify`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ image: imageData }),
      });
      const data = await res.json();

      stream.getTracks().forEach(t => t.stop());

      if (data.matched && data.name && this._isAuthorizedName(data.name)) {
        // メインユーザーと認識 → 挨拶してアプリ起動
        this.userName = data.name;
        status.textContent = `おかえりなさいませ、${data.name}様。`;
        await new Promise(r => setTimeout(r, 1800));
        screen.classList.add('hidden');
        this._startApp(data.name);
      } else if (data.matched && data.name) {
        // 登録済みだがメインユーザー以外 → 拒否
        this._denyAccess();
      } else {
        // 未登録 → 名前を聞く
        this._showNameForm(imageData);
      }
    } catch {
      // APIエラー時も名前フォームを表示してユーザー登録を続行
      stream.getTracks().forEach(t => t.stop());
      this._showNameForm(imageData);
    }
  }

  _captureFrame(video) {
    const canvas = document.getElementById('face-canvas');
    canvas.width  = video.videoWidth  || 320;
    canvas.height = video.videoHeight || 240;
    canvas.getContext('2d').drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.8);
  }

  // メインユーザー（松村拓実）の名前かどうか判定
  _isAuthorizedName(name) {
    if (!name) return false;
    const n = name.replace(/[\s　]/g, '');
    return AUTHORIZED_NAMES.some(t => n.includes(t));
  }

  // ── PHASE C: パスワード（フォールバック認証）──
  // 固定パスワード（FIXED_PW_HASH）で照合する。localStorage には名前のみ保存（利便用）。
  // パスワードの平文もハッシュも保存しない（コード内の固定ハッシュのみと突き合わせる）。
  _loadProfile() {
    try { return JSON.parse(localStorage.getItem('ainas_profile') || 'null'); }
    catch { return null; }
  }
  _saveProfile(p) {
    try { localStorage.setItem('ainas_profile', JSON.stringify(p)); } catch { /* ignore */ }
  }
  async _hashPassword(pw) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // voiceController 初期化前でも発話できる簡易TTS（認証画面用）
  _speakRaw(text) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP'; u.rate = 0.96; u.pitch = 1.0;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch { /* TTS 非対応でも続行 */ }
  }

  // 認証拒否：固定文を表示・発話し、機能を解放しない
  _denyAccess() {
    const status = document.getElementById('face-status');
    const form   = document.getElementById('face-name-form');
    const input  = document.getElementById('face-name-input');
    const pass   = document.getElementById('face-pass-input');
    const btn    = document.getElementById('face-name-btn');
    if (status) status.textContent = ACCESS_DENIED_MSG;
    this._speakRaw(ACCESS_DENIED_MSG);
    // 名前フォームは残し、別の名前を再入力できるようにする
    if (form) form.classList.remove('hidden');
    if (input) { input.value = ''; input.focus(); }
    if (pass)  { pass.value  = ''; }
    if (btn) { btn.disabled = false; btn.textContent = '認証'; }
  }

  _showNameForm(imageData) {
    const form   = document.getElementById('face-name-form');
    const input  = document.getElementById('face-name-input');
    const pass   = document.getElementById('face-pass-input');
    const btn    = document.getElementById('face-name-btn');
    const hint   = document.getElementById('face-form-hint');
    const status = document.getElementById('face-status');

    const profile = this._loadProfile();
    status.textContent = '';
    if (hint) hint.textContent = 'お名前とパスワードを入力してください。';
    if (pass) pass.placeholder = 'パスワード';
    if (btn)  btn.textContent  = '認証';
    if (profile?.name) input.value = profile.name;
    form.classList.remove('hidden');
    input.focus();

    btn.onclick = async () => {
      const name = input.value.trim();
      const pw   = pass ? pass.value : '';
      if (!name) return;

      // メインユーザー（松村拓実）以外は機能解放しない
      if (!this._isAuthorizedName(name)) { this._denyAccess(); return; }

      // パスワード必須
      if (!pw) {
        status.textContent = 'パスワードを入力してください。';
        return;
      }

      btn.disabled = true;
      btn.textContent = '確認中...';
      const hash = await this._hashPassword(pw);

      // 固定パスワードと照合（C-5: 失敗時は固定文・再入力。自己登録は廃止）
      if (hash !== FIXED_PW_HASH) {
        status.textContent = 'パスワードが違います。もう一度お試しください。';
        this._speakRaw('パスワードが違います。');
        btn.disabled = false; btn.textContent = '認証';
        if (pass) { pass.value = ''; pass.focus(); }
        return;
      }

      // 名前のみ保存（次回の入力補助。パスワードは保存しない）
      this._saveProfile({ name });

      try {
        await fetch(`${FACE_API}/register`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ image: imageData, name }),
        });
      } catch { /* サーバー未起動でも続行 */ }

      this.userName = name;
      document.getElementById('face-screen').classList.add('hidden');
      this._startApp(name);
    };
  }

  // ─────────────────────────────────────────────────────
  _startApp(userName = null) {
    const setup = document.getElementById('setup-screen');
    if (setup) setup.classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    const stage = document.getElementById('video-stage');
    this.scene  = new SceneController(stage, false, {
      onProgress: pct => {
        const bar = document.getElementById('loading-progress');
        if (bar) bar.style.width = `${Math.round(pct * 100)}%`;
      },
      onReady: () => {
        const ls = document.getElementById('loading-screen');
        if (ls) { ls.classList.add('done'); setTimeout(() => ls.remove(), 900); }
        this.scene.enableSound();   // 認証ボタンのジェスチャー直後に音声解禁を試行
        this._loadMemories();
        if (userName) {
          // 初回のみ「はじめまして」。2回目以降は「おかえりなさいませ」。
          const firstEver = !localStorage.getItem('ainas_greeted');
          const greeting = firstEver
            ? `はじめまして、${userName}様。私はあいなすと申します。何なりとお申し付けください。`
            : `おかえりなさいませ、${userName}様。`;
          try { localStorage.setItem('ainas_greeted', '1'); } catch { /* ignore */ }
          setTimeout(() => {
            this._showMessage(`あいなす: ${greeting}`);
            this.voice.speak(greeting, { onEnd: () => this._announceSyncStatus() });
          }, 500);
          this._setStatus(`${userName}様、ようこそ`);
        } else {
          this._setStatus('タップして話しかける');
          setTimeout(() => this._announceSyncStatus(), 800);
        }
        this._resetWanderTimer();
        // PHASE G: 起動時にカレンダー予定を読み上げ（挨拶の後）
        setTimeout(() => this._announceCalendar(), userName ? 7000 : 3500);
      },
    });

    this.voice = new VoiceController({
      onRecognitionStart:  ()   => this._onListenStart(),
      onRecognitionResult: text => this._onUserSpeech(text),
      onRecognitionEnd:    ()   => this._onListenEnd(),
      onRecognitionError:  err  => this._onVoiceError(err),
    });

    document.getElementById('mic-btn').addEventListener('click', () => this._onMicTap());
    document.getElementById('close-manual').addEventListener('click', () => this._hideManual());
  }

  // ─────────────────────────────────────────────────────
  _onMicTap() {
    // iOS: ユーザージェスチャー内でaudioをアンロック＋動画音声を解禁
    this.voice.unlockAudio();
    this.scene?.enableSound();

    if (this.voice.isSpeaking) {
      this.voice.stopSpeaking();
      // 特殊モード中は発話を止めてそのまま聞き取りへ（通常idleに戻さない）
      if (this._outingMode) {
        this._clearOutingSmalltalk();
        this.voice.startListening();
        this._micState('listening');
        this._setStatus('聞いてるよ...（「もういいよ」で帰宅）');
        return;
      }
      if (this._goMode) {
        this._clearGoIdleTalk();
        this.voice.startListening();
        this._micState('listening');
        this._setStatus('聞いてるよ...');
        return;
      }
      if (this._searchMode) {
        this._clearSearchTalk();
        this.voice.startListening();
        this._micState('listening');
        this._setStatus('聞いてるよ...');
        return;
      }
      if (this._trpgMode) {
        this.voice.startListening();
        this._micState('listening');
        this._setStatus('聞いてるよ...（「終了」でセッション終了）');
        return;
      }
      this.scene.setState(STATE.IDLE);
      this._setStatus('タップして話しかける');
      this._micState('idle');
      this.busy = false;
      this._resetWanderTimer();
      return;
    }
    if (this.voice.isListening) {
      this.voice.stopListening();
      return;
    }

    // 外出モード中はbusyでもマイクを有効にする（「もういいよ」を受け付けるため）
    if (this._outingMode) {
      this._clearOutingSmalltalk();      // 聞き取り中は雑談を止める
      this.voice.stopSpeaking();
      this.voice.startListening();
      this._micState('listening');
      this._setStatus('聞いてるよ...（「もういいよ」で帰宅）');
      return;
    }

    // 共闘／単独モード中もbusyでマイクを有効に（はい/いいえ・着いた・帰ろう を受ける）
    if (this._goMode) {
      this._clearGoIdleTalk();
      this.voice.stopSpeaking();
      this.voice.startListening();
      this._micState('listening');
      this._setStatus('聞いてるよ...');
      return;
    }

    // 検索モード中もbusyでマイクを有効に（パスワード・検索ワード・はい/いいえ を受ける）
    if (this._searchMode) {
      this._clearSearchTalk();
      this.voice.stopSpeaking();
      this.voice.startListening();
      this._micState('listening');
      this._setStatus('聞いてるよ...');
      return;
    }

    // TRPGモード中もbusyでマイクを有効に（行動入力・「終了」を受ける）
    if (this._trpgMode) {
      this.voice.stopSpeaking();
      this.voice.startListening();
      this._micState('listening');
      this._setStatus('聞いてるよ...（「終了」でセッション終了）');
      return;
    }

    if (this.busy) return;

    this._stopWandering();
    // 歩き回り中なら戻りながらListeningを開始
    this.voice.startListening();
  }

  _onListenStart() {
    this.busy = true;
    this.scene.setState(STATE.LISTENING);  // 内部で _targetX=0 が設定される
    this._setStatus('聞いてるよ...');
    this._micState('listening');
  }

  _onListenEnd() {
    if (this._outingMode || this._goMode || this._searchMode || this._trpgMode || this._drawMode || this._pickMode || this._monshinMode || this._seqLock) return;
    if (this.scene.state === STATE.LISTENING) {
      this.busy = false;
      this.scene.setState(STATE.IDLE);
      this._setStatus('タップして話しかける');
      this._micState('idle');
      this._resetWanderTimer();
    }
  }

  _onVoiceError(err) {
    console.warn('[Voice error]', err);
    if (this._outingMode || this._goMode || this._searchMode || this._trpgMode || this._drawMode || this._pickMode || this._monshinMode || this._seqLock) return;
    this.busy = false;
    this.scene.setState(STATE.IDLE);
    this._setStatus('もう一度試してください');
    this._micState('idle');
    this._resetWanderTimer();
  }

  // ─────────────────────────────────────────────────────
  async _onUserSpeech(text) {
    console.log('[User]', text);
    this._showMessage(`🎙 "${text}"`);
    this._micState('processing');

    // iOS が「外 出して」のように空白を挿入する場合に備えて空白除去してマッチ
    const normalizedText = text.replace(/\s+/g, '');
    const _match = (triggers) => triggers.some(t => normalizedText.includes(t));

    if (this._outingMode) {
      if (_match(RETURN_TRIGGERS)) {
        this._cancelAinas();
        this._startReturn();
      } else {
        this.busy = false;
        this._micState('idle');
        this._setStatus('「もういいよ」で帰宅します');
        this._startOutingSmalltalk();   // 後部座席ループ中の雑談を再開
      }
      return;
    }

    if (this._goMode) {
      this._handleGoSpeech(text, _match);
      return;
    }

    if (this._searchMode) {
      this._handleSearchSpeech(text, _match);
      return;
    }

    if (this._trpgMode) {
      this._handleTrpgSpeech(text, _match);
      return;
    }

    if (this._drawMode) {
      this._handleDrawSpeech(text, _match);
      return;
    }

    if (this._pickMode) {
      this._handlePickSpeech(text, _match);
      return;
    }

    if (this._monshinMode) {
      this._handleMonshinSpeech(text, _match);
      return;
    }

    if (_match(ILLNESS_TRIGGERS)) {
      this._cancelAinas();
      this._startMonshin(text);
      return;
    }

    if (_match(TRPG_START_TRIGGERS)) {
      this._cancelAinas();
      this._startTrpg(text);
      return;
    }

    if (_match(SEARCH_TRIGGERS)) {
      this._cancelAinas();
      this._startSearch();
      return;
    }

    if (_match(CLEAR_TRIGGERS)) {
      this._showManual();
      this.busy = false;
      this.scene.setState(STATE.IDLE);
      this._setStatus('タップして話しかける');
      this._micState('idle');
      this._resetWanderTimer();
      return;
    }

    if (_match(OUTING_TRIGGERS)) {
      this._showMessage(`🚗 外出シーケンス開始`);
      this._cancelAinas();
      this._startOuting();
      return;
    }

    if (_match(INSTALL_TRIGGERS)) {
      this._cancelAinas();
      this._requestSync();
      return;
    }

    if (_match(STATUS_TRIGGERS)) {
      this._cancelAinas();
      this._showSyncStatus();
      return;
    }

    if (_match(DRAW_TRIGGERS)) {
      this._cancelAinas();
      this._startDraw();
      return;
    }

    if (_match(GO_TRIGGERS)) {
      this._cancelAinas();
      this._startGoPrompt();
      return;
    }

    if (_match(MEMORY_TRIGGERS)) {
      await this._saveMemory(text);
      return;
    }

    this._showMessage(`あなた: ${text}`);
    this.scene.setState(STATE.THINKING);
    this._setStatus('考えてる...');

    try {
      let reply;
      try {
        const data = await this._ainasAsk(text);            // 候補提示対応の問い合わせ
        if (data.candidates) { this._startPick(data.candidates); return; }
        reply = data.reply;
      } catch (e) {
        // 外出/他モードへの遷移によるキャンセルは静かに終了
        if (this._outingMode || this._goMode || this._searchMode || this._trpgMode || this._drawMode || this._pickMode || this._monshinMode) return;
        // タイムアウト/通信失敗で「考え中」のまま固まらないよう、通知して復帰
        this._showMessage('あいなす: 申し訳ございません、うまく応答できませんでした。もう一度お試しください。');
        this.busy = false;
        this.scene.setState(STATE.IDLE);
        this._setStatus('タップして話しかける');
        this._micState('idle');
        this._resetWanderTimer();
        return;
      }

      // 非同期待機中に外出モードへ遷移していた場合は返答を捨てる
      if (this._outingMode) return;

      console.log('[あいなす]', reply);

      this._showMessage(`あいなす: ${reply}`);
      this.scene.setState(STATE.TALKING);
      this._setStatus('話してる...');
      this._micState('idle');

      this.voice.speak(reply, {
        onStart: () => this.scene.setState(STATE.TALKING),
        onEnd:   () => {
          this.busy = false;
          this.scene.setState(STATE.IDLE);
          this._setStatus('タップして話しかける');
          this._resetWanderTimer();
        },
      });

    } catch (err) {
      console.error('[API error]', err);
      this.busy = false;
      this.scene.setState(STATE.IDLE);
      this._micState('idle');
      this._setStatus(err.status >= 500 ? 'サーバーエラーが発生しました' : 'エラーが発生しました');
      this._resetWanderTimer();
    }
  }

  // ── 外出モード ────────────────────────────────────────

  _startOuting() {
    this._outingMode = true;
    this.busy = true;
    clearTimeout(this._wanderTimer);
    clearTimeout(this._actionTimer);
    clearTimeout(this._butlerTimer);

    // 音声認識・発話を確実に停止して動画に移行
    this.voice?.stopListening();
    this.voice?.stopSpeaking();

    this._micState('idle');
    this._setStatus('外出中... 「もういいよ」で帰宅');
    console.log('[Outing] sequence started, _outingMode =', this._outingMode);

    // 外出→ドア→発進→後部座席（音声ON）。後部座席に入ったら雑談タイマー開始
    this.scene.playSequence(
      OUTING_SEQUENCE,
      null,
      /* loopLast  */ true,
      /* onLoopStart */ () => this._startOutingSmalltalk(),
      /* withSound */ true,
    );
  }

  // 後部座席ループ中：5秒無操作ごとに雑談を発話
  _startOutingSmalltalk() {
    this._clearOutingSmalltalk();
    if (!this._outingMode) return;
    this._outingSmalltalkTimer = setTimeout(() => {
      if (!this._outingMode || this.voice.isListening) {
        this._startOutingSmalltalk();
        return;
      }
      const phrase = OUTING_SMALLTALK[Math.floor(Math.random() * OUTING_SMALLTALK.length)];
      this._showMessage(`あいなす: ${phrase}`);
      this.voice.speak(phrase, {
        onEnd: () => { if (this._outingMode) this._startOutingSmalltalk(); },
      });
    }, OUTING_SMALLTALK_MS);
  }

  _clearOutingSmalltalk() {
    clearTimeout(this._outingSmalltalkTimer);
    this._outingSmalltalkTimer = null;
  }

  _startReturn() {
    this._seqLock = true;          // 復帰再生中は onListenEnd の IDLE 強制を抑止
    this._outingMode = false;
    this._clearOutingSmalltalk();
    this.voice?.stopListening();
    this._micState('processing');
    this._setStatus('帰宅中...');

    // 「帰りますね」と発話してから 停車→帰宅（音声ON）を再生
    const playReturn = () => {
      this.scene.playSequence(RETURN_SEQUENCE, () => {
        this._seqLock = false;
        this.busy = false;
        this.scene.setState(STATE.IDLE);
        this._setStatus('タップして話しかける');
        this._micState('idle');
        this._resetWanderTimer();
        const phrase = 'おかえりなさいませ。お疲れ様でございました。';
        this._showMessage(`あいなす: ${phrase}`);
        this.voice.speak(phrase);
      }, /* loopLast */ false, /* onLoopStart */ null, /* withSound */ true);
    };

    const phrase = '帰りますね。';
    this._showMessage(`あいなす: ${phrase}`);
    let started = false;
    const startOnce = () => { if (!started) { started = true; playReturn(); } };
    this.voice.speak(phrase, { onEnd: startOnce });
    // onEnd が発火しない端末向けのフォールバック
    setTimeout(startOnce, 4000);
  }

  // 起動時に「最新の同期は◯月◯日です」とひと言（常設UIは作らない）
  async _announceSyncStatus() {
    if (this._outingMode || this._goMode || this._searchMode || this._trpgMode || this._drawMode || this._pickMode || this._monshinMode) return;
    try {
      const res = await fetch('/api/vault/status');
      if (!res.ok) return;
      const { last_synced } = await res.json();
      if (!last_synced) return;
      const d = new Date(last_synced);
      if (isNaN(d)) return;
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const phrase = `最新の同期は${d.getMonth() + 1}月${d.getDate()}日 ${hh}時${mm}分です。`;
      this._showMessage(`あいなす: ${phrase}`);
      if (!this.voice?.isSpeaking && !this.voice?.isListening && !this.busy) {
        this.voice?.speak(phrase);
      }
    } catch { /* 取得できなければ何も言わない */ }
  }

  // ── PHASE G: カレンダー予定の読み上げ ──────────────────
  async _announceCalendar() {
    if (this._outingMode || this._goMode || this._searchMode || this._trpgMode || this._drawMode || this._pickMode || this._monshinMode) return;
    let value = '';
    try {
      const res = await fetch('/api/calendar');
      if (!res.ok) return;
      value = ((await res.json()).value || '').trim();
    } catch { return; }
    // 予定なしはスキップ（G仕様）
    if (!value || value.includes('予定はありません') || value.includes('予定はございません')) return;
    // 話し中・聞き取り中・特殊モードなら後で
    if (this.busy || this.voice?.isSpeaking || this.voice?.isListening || this._outingMode || this._goMode || this._searchMode || this._trpgMode || this._drawMode || this._pickMode || this._monshinMode) {
      setTimeout(() => this._announceCalendar(), 4000);
      return;
    }
    const phrase = `本日以降のご予定をお知らせいたします。${value}`;
    this._showMessage(`あいなす: ${phrase}`);
    this.scene?.setState(STATE.TALKING);
    this.voice?.speak(phrase, {
      onEnd: () => { this.scene?.setState(STATE.IDLE); this._resetWanderTimer(); },
    });
  }

  // ── PHASE E: 共闘／単独シーケンス（「行くぞ」）──────────

  _startGoPrompt() {
    this._goMode  = true;
    this._goPhase = 'prompt';
    this.busy = true;
    clearTimeout(this._wanderTimer);
    clearTimeout(this._actionTimer);
    clearTimeout(this._butlerTimer);
    this.voice?.stopListening();
    this._micState('idle');
    this._setStatus('一緒に行きますか？（「はい」か「いいえ」）');
    const phrase = '一緒にいかがですか？';
    this._showMessage(`あいなす: ${phrase}`);
    this.scene.setState(STATE.TALKING);
    this.voice.speak(phrase, {
      onEnd: () => { if (this._goMode && this._goPhase === 'prompt') this.scene.setState(STATE.IDLE); },
    });
  }

  _handleGoSpeech(text, _match) {
    if (this._goPhase === 'prompt') {
      if (_match(GO_YES_TRIGGERS))     this._startGoTravel(false);  // 共闘
      else if (_match(GO_NO_TRIGGERS)) this._startGoTravel(true);   // 単独
      else {
        this.busy = false; this._micState('idle');
        this._setStatus('「はい」か「いいえ」でお答えください');
      }
    } else if (this._goPhase === 'travel') {
      // どちらの「着いた」でも到着扱い（緩めに許容）
      if (_match(ARRIVE_COOP_TRIGGERS) || _match(ARRIVE_SOLO_TRIGGERS)) {
        this._startBackroom();
      } else {
        // 独り言への返事 → 会話として応答し、走行を継続
        this._goReplyToUser(text);
      }
    } else if (this._goPhase === 'backroom') {
      if (_match(GO_HOME_TRIGGERS)) { this._cancelAinas(); this._startGoReturn(); }
      else { this.busy = false; this._micState('idle'); this._setStatus('「帰ろう」で帰宅'); }
    }
  }

  // バイク → 相乗り/ソロ（ループ）。ループ開始で独り言を開始
  _startGoTravel(solo) {
    this._goSolo  = solo;
    this._goPhase = 'travel';
    this.busy = true;
    this.voice?.stopListening();
    this.voice?.stopSpeaking();
    this._micState('idle');
    this._setStatus(solo ? '走行中...（「着いたぞ」で到着）' : '走行中...（「着いたな」で到着）');
    const seq = solo ? SOLO_TRAVEL : COOP_TRAVEL;
    this.scene.playSequence(
      seq, null,
      /* loopLast */ true,
      /* onLoopStart */ () => this._startGoIdleTalk(),
      /* withSound */ true,
    );
  }

  // 着いた → バックルーム 1→2→3 を繰り返しループ
  _startBackroom() {
    this._goPhase = 'backroom';
    this._clearGoIdleTalk();
    this.busy = true;
    this.voice?.stopListening();
    this._micState('idle');
    this._setStatus('「帰ろう」で帰宅します');
    if (this._goSolo) this._playSoloBackroom();   // 単独=新仕様（1→2→3→5→6→7→8→帰宅・ループ無し）
    else this._playBackroomLoop();                // 共闘=従来どおりループ
  }

  // 単独: 1→2→3→5→6→7→8 を一度だけ順に再生。8の後は自動で SOLO_RETURN（単独4→帰宅）。
  // 途中で「帰ろう」が来ると _goPhase が変わり、ここは中断して _startGoReturn が引き継ぐ（帰ろう最優先）。
  _playSoloBackroom() {
    // 1→2→3→5→6→7→8 を「1本のシーケンス」としてまとめて再生（暗転・待ち防止＝従来ループと同じ滑らかさ）。
    // 再生し終わったら自動で帰宅（単独4→帰宅）。途中「帰ろう」が来たら _startGoReturn が引き継ぐ。
    this.scene.playSequence(SOLO_BACKROOM, () => {
      if (!this._goMode || this._goPhase !== 'backroom') return;  // 帰ろうで中断済みなら何もしない
      this._startGoReturn();                                       // 8の後 → 単独4→帰宅
    }, /* loopLast */ false, /* onLoopStart */ null, /* withSound */ true);
  }

  // ── 「インストール」: 再同期を依頼（Mac側が拾って実行）────
  async _requestSync() {
    this.busy = true;
    this.voice?.stopListening();
    this._micState('processing');
    this._setStatus('同期を依頼しています...');
    let ok = false;
    try {
      const r = await fetch('/api/sync-request', { method: 'POST' });
      ok = (await r.json()).ok === true;
    } catch { /* ignore */ }
    const phrase = ok
      ? 'インストールを開始しました。1〜2分ほどで最新の記憶に同期されます。'
      : '申し訳ございません、同期の依頼に失敗しました。';
    this._showMessage(`あいなす: ${phrase}`);
    this.scene.setState(STATE.TALKING);
    this.voice.speak(phrase, {
      onEnd: () => {
        this.busy = false;
        this.scene.setState(STATE.IDLE);
        this._setStatus('タップして話しかける');
        this._micState('idle');
        this._resetWanderTimer();
      },
    });
  }

  // ── 記憶の同期状況を答える ────────────────────────────
  async _showSyncStatus() {
    this.busy = true;
    this.voice?.stopListening();
    this._micState('processing');
    this._setStatus('記憶を確認しています...');
    let count = 0, latest = null;
    try {
      const r = await fetch('/api/vault-status');
      const d = await r.json();
      count = d.count || 0; latest = d.latest || null;
    } catch { /* ignore */ }
    let phrase;
    if (count > 0) {
      let when = '';
      if (latest) {
        const dt = new Date(latest);  // UTC ISO → 端末ローカル(JST)で表示
        when = `、最終更新は${dt.getMonth() + 1}月${dt.getDate()}日 ${dt.getHours()}時${String(dt.getMinutes()).padStart(2, '0')}分`;
      }
      phrase = `現在、記憶は${count}件ございます${when}。同期は正常でございます。`;
    } else {
      phrase = '申し訳ございません、記憶がまだ同期されていないようです。';
    }
    this._showMessage(`あいなす: ${phrase}`);
    this.scene.setState(STATE.TALKING);
    this.voice.speak(phrase, {
      onEnd: () => {
        this.busy = false;
        this.scene.setState(STATE.IDLE);
        this._setStatus('タップして話しかける');
        this._micState('idle');
        this._resetWanderTimer();
      },
    });
  }

  // ── 候補提示モード（複数トピックがヒット時）→ 選択 → 絞って説明 ──
  async _ainasAsk(text) {
    this._cancelAinas();
    this._ainasAbort = new AbortController();
    const timer = setTimeout(() => this._cancelAinas(), 30000);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, disambiguate: true }),
        signal: this._ainasAbort.signal,
      });
      if (!res.ok) throw new Error(`Chat API ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.candidates) && data.candidates.length >= 2) return { candidates: data.candidates };
      if (!data.reply) throw new Error('empty reply');
      return { reply: data.reply };
    } finally {
      clearTimeout(timer);
      this._ainasAbort = null;
    }
  }

  _startPick(candidates) {
    this._pickMode = true;
    this._pickCandidates = candidates.slice(0, 4);
    this.busy = true;
    this.voice?.stopListening();
    this._micState('idle');
    const list = this._pickCandidates.map((t, i) => `${i + 1}. ${t}`).join('\n');
    this._showMessage(`あいなす: いくつか見つかりました。どれをお知りになりたいですか？\n${list}\n（番号かキーワードでどうぞ）`);
    this.scene.setState(STATE.TALKING);
    const spoken = `いくつか見つかりました。${this._pickCandidates.map((t, i) => `${i + 1}番、${t}`).join('。')}。どれでしょうか？`;
    this.voice.speak(spoken, {
      onEnd: () => { if (this._pickMode) { this.busy = false; this._micState('idle'); this._setStatus('番号かキーワードでお選びください'); } },
    });
  }

  _handlePickSpeech(text, _match) {
    if (_match(RETURN_TRIGGERS)) {                 // 「もういいよ」等で取り消し
      this._pickMode = false; this._pickCandidates = null;
      this.busy = false; this._micState('idle'); this.scene.setState(STATE.IDLE);
      this._setStatus('タップして話しかける'); this._resetWanderTimer();
      return;
    }
    const cands = this._pickCandidates || [];
    let idx = -1;
    const numMap = { '１': 1, '２': 2, '３': 3, '４': 4, '一': 1, '二': 2, '三': 3, '四': 4 };
    const m = text.match(/[1-4１-４一二三四]/);
    if (m) { const c = m[0]; idx = (numMap[c] || parseInt(c, 10)) - 1; }
    if (idx < 0 || !cands[idx]) {                  // キーワードで一致
      const words = text.match(/[一-龥ァ-ヶ]{2,}/g) || [];
      idx = cands.findIndex(t => words.some(w => t.includes(w)));
    }
    if (idx >= 0 && cands[idx]) {
      const chosen = cands[idx];
      this._pickMode = false; this._pickCandidates = null;
      this._explainChosen(chosen);
    } else {
      this.busy = false; this._micState('idle'); this._setStatus('番号かキーワードでお選びください');
      const p = '恐れ入ります、番号かキーワードでお選びください。';
      this._showMessage(`あいなす: ${p}`); this.voice.speak(p);
    }
  }

  async _explainChosen(title) {
    this.busy = true;
    this.voice?.stopListening();
    this._micState('processing');
    this.scene.setState(STATE.THINKING);
    this._setStatus('考えてる...');
    let reply = '';
    try { reply = await this._ainasChat(`${title}について教えて`); }   // 具体化→明確な勝者→直接回答
    catch (e) {
      this.busy = false; this.scene.setState(STATE.IDLE); this._setStatus('タップして話しかける');
      this._micState('idle'); this._resetWanderTimer(); return;
    }
    this._showMessage(`あいなす: ${reply}`);
    this.scene.setState(STATE.TALKING); this._micState('idle');
    this.voice.speak(reply, {
      onEnd: () => { this.busy = false; this.scene.setState(STATE.IDLE); this._setStatus('タップして話しかける'); this._resetWanderTimer(); },
    });
  }

  // ── 体調不良の問診モード（Gemini主導・1問ずつ）──────────
  _startMonshin(text) {
    this._monshinMode = true;
    this._monshinHistory = [];
    this.busy = true;
    clearTimeout(this._wanderTimer);
    clearTimeout(this._actionTimer);
    clearTimeout(this._butlerTimer);
    this.voice?.stopListening();
    this._micState('idle');
    this._setStatus('問診中…（「大丈夫」で終了）');
    this.scene.playSequence([MONSHIN_VIDEO], null, /* loopLast */ true, null, /* withSound */ true);
    this._monshinTurn(text);   // 最初の訴えを受けて1問目へ
  }

  _handleMonshinSpeech(text, _match) {
    if (_match(MONSHIN_END_TRIGGERS)) { this._endMonshin(); return; }
    this._monshinTurn(text);
  }

  async _monshinTurn(text) {
    this.busy = true;
    this.voice?.stopListening();
    this._micState('processing');
    this._setStatus('考えています...');
    let reply = '';
    try {
      reply = await this._ainasChat(text, { mode: 'monshin', history: this._monshinHistory.slice(-16) });
    } catch (e) {
      if (!this._monshinMode) return;
      reply = '申し訳ございません、もう一度伺えますか。';
    }
    if (!this._monshinMode) return;
    this._monshinHistory.push({ role: 'user', parts: [{ text }] });
    this._monshinHistory.push({ role: 'model', parts: [{ text: reply }] });
    this._showMessage(`あいなす: ${reply}`);
    this.voice.speak(reply, {
      onEnd: () => {
        if (!this._monshinMode) return;
        this.busy = false;
        this._micState('idle');
        this._setStatus('問診中…（「大丈夫」で終了）');
      },
    });
  }

  _endMonshin() {
    this._monshinMode = false;
    this._monshinHistory = [];
    this.busy = true;
    this.voice?.stopListening();
    this._micState('processing');
    this._setStatus('問診終了');
    const phrase = '無理しないように。';
    this._showMessage(`あいなす: ${phrase}`);
    this.scene.playSequence([DRAW_TALK], () => {
      this.scene.setState(STATE.IDLE);
      this._setStatus('タップして話しかける');
      this._micState('idle');
      this.busy = false;
      this._resetWanderTimer();
    }, /* loopLast */ false, /* onLoopStart */ null, /* withSound */ true);
    this.voice.speak(phrase);
  }

  // ── お絵描き演出（「絵を描いて」）────────────────────────
  _startDraw() {
    this._drawMode = true;
    this.busy = true;
    clearTimeout(this._wanderTimer);
    clearTimeout(this._actionTimer);
    clearTimeout(this._butlerTimer);
    this.voice?.stopListening();
    this._micState('idle');
    // 0〜30秒のランダムで「完成」する
    this._drawDoneAt = Date.now() + Math.floor(Math.random() * DRAW_MAX_MS);
    this._setStatus('絵を描いています…（「もうできた？」と聞いてください）');
    const phrase = 'かしこまりました。少々お待ちを。';
    this._showMessage(`あいなす: ${phrase}`);
    this.scene.playSequence([DRAW_VIDEO], null, /* loopLast */ true, null, /* withSound */ true);
    this.voice.speak(phrase);
  }

  _handleDrawSpeech(text, _match) {
    if (_match(DRAW_DONE_TRIGGERS)) {
      if (Date.now() >= this._drawDoneAt) this._drawFinish();
      else this._drawNotDone();
    } else {
      this.busy = false; this._micState('idle');
      this._setStatus('まだ描いています…（「もうできた？」と聞いてください）');
    }
  }

  // 未完了: 「まあまあ。そう焦らないで。」→ アイドルトークを1度挟む
  async _drawNotDone() {
    this.busy = true;
    this.voice?.stopListening();
    this._micState('processing');
    let mutter = '';
    try { mutter = await this._drawMutter(); } catch { mutter = ''; }
    if (!this._drawMode) return;  // 途中で完成/終了していたら破棄
    const phrase = 'まあまあ。そう焦らないで。';
    this._showMessage(`あいなす: ${phrase}`);
    this.voice.speak(phrase, {
      onEnd: () => {
        if (!this._drawMode) return;
        if (mutter) {
          this._showMessage(`あいなす: ${mutter}`);
          this.voice.speak(mutter, { onEnd: () => this._drawIdleReady() });
        } else {
          this._drawIdleReady();
        }
      },
    });
  }

  _drawIdleReady() {
    if (!this._drawMode) return;
    this.busy = false;
    this._micState('idle');
    this._setStatus('まだ描いています…（「もうできた？」と聞いてください）');
  }

  // 絵を描きながらの独り言（Vault話題・100文字以内）
  async _drawMutter() {
    const seed = await this._randomTopic();
    const prompt = seed
      ? `絵を描きながらの独り言として、次のメモに少し触れて100文字以内で一言。挨拶・かぎ括弧・絵文字は不要。\n\nメモ: ${seed}`
      : `絵を描きながらの独り言を100文字以内で一言。挨拶・かぎ括弧・絵文字は不要。`;
    const reply = await this._ainasChat(prompt);
    return (reply || '').replace(/[「」]/g, '').slice(0, 110);
  }

  // 完了: 「話す」動画 → 「できましたよ」
  _drawFinish() {
    this._drawMode = false;
    this.busy = true;
    this.voice?.stopListening();
    this._micState('processing');
    this._setStatus('完成しました');
    const phrase = 'できましたよ。こういう絵ができました。';
    this._showMessage(`あいなす: ${phrase}`);
    this.scene.playSequence([DRAW_TALK], () => {
      this.scene.setState(STATE.IDLE);
      this._setStatus('タップして話しかける');
      this._micState('idle');
      this.busy = false;
      this._resetWanderTimer();
    }, /* loopLast */ false, /* onLoopStart */ null, /* withSound */ true);
    this.voice.speak(phrase);
  }

  _playBackroomLoop() {
    const loop = this._goSolo ? SOLO_BACKROOM_LOOP : COOP_BACKROOM_LOOP;
    const cycle = () => {
      if (!this._goMode || this._goPhase !== 'backroom') return;
      // 1→2→3 を再生し終わったら再度先頭から（無限ループ）
      this.scene.playSequence(loop, () => cycle(), /* loopLast */ false, /* onLoopStart */ null, /* withSound */ true);
    };
    cycle();
  }

  // 帰ろう → バックルーム4(単独4) → 帰宅 → 通常モード復帰
  _startGoReturn() {
    this._seqLock = true;          // 復帰再生中は onListenEnd の IDLE 強制を抑止
    this._goMode  = false;
    this._goPhase = null;
    this._clearGoIdleTalk();
    this.voice?.stopListening();
    this._micState('processing');
    this._setStatus('帰宅中...');
    const ret = this._goSolo ? SOLO_RETURN : COOP_RETURN;
    this.scene.playSequence(ret, () => {
      this._seqLock = false;
      this.busy = false;
      this.scene.setState(STATE.IDLE);
      this._setStatus('タップして話しかける');
      this._micState('idle');
      this._resetWanderTimer();
      const phrase = 'おかえりなさいませ。';
      this._showMessage(`あいなす: ${phrase}`);
      this.voice.speak(phrase);
    }, /* loopLast */ false, /* onLoopStart */ null, /* withSound */ true);
  }

  // 走行ループ中：5秒無操作ごとに Vault ナレッジから独り言を生成して発話
  _startGoIdleTalk() {
    this._clearGoIdleTalk();
    if (!this._goMode || this._goPhase !== 'travel') return;
    this._goIdleTimer = setTimeout(async () => {
      if (!this._goMode || this._goPhase !== 'travel' || this.voice.isListening) {
        this._startGoIdleTalk();
        return;
      }
      let phrase = '';
      try { phrase = await this._goGenerateMutter(); } catch { phrase = ''; }
      // 生成中にモード/フェーズが変わった、または聞き取り中になったら破棄
      if (!this._goMode || this._goPhase !== 'travel' || this.voice.isListening) return;
      if (!phrase) { this._startGoIdleTalk(); return; }
      this._showMessage(`あいなす: ${phrase}`);
      this.voice.speak(phrase, {
        onEnd: () => { if (this._goMode && this._goPhase === 'travel') this._startGoIdleTalk(); },
      });
    }, GO_IDLE_TALK_MS);
  }

  _clearGoIdleTalk() {
    clearTimeout(this._goIdleTimer);
    this._goIdleTimer = null;
  }

  // Vaultナレッジを参照した独り言（ぼやき/独白・100文字以内）を生成
  async _goGenerateMutter() {
    const tone = this._goSolo
      ? '一人でバイクを走らせながらの独白・独り言として'
      : '誰かを後ろに乗せて走りながらの、会話ではないぼやき・独り言として';
    const seed = await this._randomTopic();
    const prompt = seed
      ? `次のメモの内容に触れて、${tone}、100文字以内の短い独り言を一言だけ言ってください。` +
        `挨拶・前置き・絵文字・かぎ括弧は不要です。\n\nメモ: ${seed}`
      : `Vaultのナレッジから話題を一つ選び、${tone}、100文字以内の短い独り言を一言だけ言ってください。` +
        `挨拶・前置き・絵文字・かぎ括弧は不要です。`;
    const reply = await this._ainasChat(prompt);
    return (reply || '').replace(/[「」]/g, '').slice(0, 110);
  }

  // 走行中の独り言にユーザーが返事したら、会話として応答してから走行を継続する
  async _goReplyToUser(text) {
    this._clearGoIdleTalk();
    this.busy = true;
    this._micState('processing');
    this._setStatus('考えています...');
    let reply = '';
    try { reply = await this._ainasChat(text); } catch { reply = ''; }
    // 応答待ちの間にモード/フェーズが変わっていたら破棄
    if (!this._goMode || this._goPhase !== 'travel') return;
    if (!reply) reply = 'さようでございますか。';
    this._showMessage(`あいなす: ${reply}`);
    this.voice.speak(reply, {
      onEnd: () => {
        if (this._goMode && this._goPhase === 'travel') {
          this.busy = false;
          this._micState('idle');
          this._setStatus(this._goSolo ? '「着いたぞ」で到着' : '「着いたな」で到着');
          this._startGoIdleTalk();
        }
      },
    });
  }

  // ── PHASE D: DuckDuckGo検索シーケンス（「検索」）─────────

  // 音声認識結果からパスワード数字列を抽出（数字 / 全角 / 英語読み / 日本語読み）
  // 検索トークンを取得（初回のみ入力させ localStorage に保存）。公開JSには値を持たない。
  _getSearchToken() {
    let t = '';
    try { t = localStorage.getItem('ret_search_token') || ''; } catch { /* ignore */ }
    if (!t) {
      t = (window.prompt('検索トークン（暗証番号）を設定してください（初回のみ・サーバー設定値と同じもの）') || '').trim();
      if (t) { try { localStorage.setItem('ret_search_token', t); } catch { /* ignore */ } }
    }
    return t;
  }

  // 合言葉ゲート照合（平文なし・ハッシュ突き合わせ）。一致で入室、失敗で発狂ループ。
  async _checkSearchGate(text) {
    let ok = false;
    try { ok = (await this._hashPassword(this._normalizePw(text))) === SEARCH_GATE_HASH; }
    catch { ok = false; }
    if (ok) this._searchEnterRoom();
    else this._searchFail();
  }

  _normalizePw(text) {
    let s = (text || '').replace(/[\s　]/g, '');
    // 全角数字 → 半角
    s = s.replace(/[０-９]/g, d => String.fromCharCode(d.charCodeAt(0) - 0xFEE0));
    // 英語読みカタカナ → 数字（ツーワンフォーツーゼロゼロ 等）
    const en = { 'ゼロ':'0','ワン':'1','ツー':'2','スリー':'3','フォー':'4','フォア':'4',
                 'ファイブ':'5','シックス':'6','セブン':'7','エイト':'8','ナイン':'9' };
    for (const [k, v] of Object.entries(en)) s = s.split(k).join(v);
    // 日本語読み → 数字（長い読みを先に置換）
    const jp = [['れい','0'],['ぜろ','0'],['いち','1'],['よん','4'],['なな','7'],['きゅう','9'],
                ['さん','3'],['ろく','6'],['はち','8'],['ご','5'],['に','2'],['し','4'],['く','9']];
    for (const [k, v] of jp) s = s.split(k).join(v);
    return (s.match(/\d/g) || []).join('');
  }

  // D-2: 「検索」検知 → パスワード入力要求を発話
  _startSearch() {
    this._searchMode  = true;
    this._searchPhase = 'await_pw';
    this._searchLast  = null;
    this.busy = true;
    clearTimeout(this._wanderTimer);
    clearTimeout(this._actionTimer);
    clearTimeout(this._butlerTimer);
    this.voice?.stopListening();
    this.scene?.setPlaybackRate(1.0);
    this._micState('idle');
    this._setStatus('パスワードをどうぞ（タップして発声）');
    const phrase = '検索を始めます。パスワードをどうぞ。';
    this._showMessage(`あいなす: ${phrase}`);
    this.scene.setState(STATE.TALKING);
    this.voice.speak(phrase, {
      onEnd: () => { if (this._searchMode && this._searchPhase === 'await_pw') this.scene.setState(STATE.IDLE); },
    });
  }

  // 検索モード中の音声を段階ごとに処理（D-3/D-6/D-7/D-8）
  _handleSearchSpeech(text, _match) {
    // 「もういいよ」はどの段階でも終了（D-8）
    if (_match(RETURN_TRIGGERS)) { this._endSearch(); return; }

    switch (this._searchPhase) {
      case 'await_pw':
      case 'fail':
        // D-3 / D-6: 合言葉ゲート（音声で「214200」を言う体験を維持）。
        // 平文は持たずハッシュ照合（R-6）。実際のサーバー防御は別の強いトークン。
        this._checkSearchGate(text);
        break;

      case 'await_query':
        this._doSearch(text.trim());
        break;

      case 'save_confirm':
        if (_match(SEARCH_SAVE_YES))      this._searchSave();
        else if (_match(SEARCH_SAVE_NO))  this._searchAskContinue();
        else { this.busy = false; this._micState('idle'); this._setStatus('「はい」か「いいえ」でお答えください'); }
        break;

      case 'continue_confirm':
        if (_match(SEARCH_CONT_YES)) this._searchAskQuery();
        else                         this._endSearch();
        break;

      default:
        this.busy = false; this._micState('idle');
    }
  }

  // D-4: パスワード正解 → 研究室 → パソコン(ループ) → 検索ワードを尋ねる
  _searchEnterRoom() {
    this._searchPhase = 'entering';
    this._clearSearchTalk();
    this.busy = true;
    this.voice?.stopListening();
    this.voice?.stopSpeaking();
    this.scene.setPlaybackRate(1.0);   // 失敗ループの倍速を解除
    this._micState('idle');
    this._setStatus('研究室へ移動中...');
    this.scene.playSequence(
      [SEARCH_VID_ROOM, SEARCH_VID_PC],
      null,
      /* loopLast */ true,
      /* onLoopStart */ () => this._searchAskQuery(),
      /* withSound */ false,
    );
  }

  // 検索ワードを尋ねる（パソコンはループ継続）
  _searchAskQuery() {
    this._searchPhase = 'await_query';
    this.busy = false;
    this._micState('idle');
    this._setStatus('何をお調べしますか？（タップして発声 /「もういいよ」で終了）');
    const phrase = '何をお調べしますか？';
    this._showMessage(`あいなす: ${phrase}`);
    this.voice.speak(phrase);
  }

  // D-4: 検索実行 → 結果読み上げ → D-7 保存確認
  async _doSearch(query) {
    if (!query) { this._searchAskQuery(); return; }
    this._searchPhase = 'searching';
    this.busy = true;
    this.voice?.stopListening();
    this._micState('processing');
    this._setStatus(`「${query}」を検索中...`);

    let summary = '';
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 12000);
      const res = await fetch('/api/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ q: query, pw: this._getSearchToken() }),
        signal:  ctrl.signal,
      });
      clearTimeout(t);
      if (res.ok) summary = ((await res.json()).summary || '').trim();
      else if (res.status === 401) summary = '認証に失敗しました。';
    } catch { summary = ''; }

    if (!this._searchMode) return;  // 検索中に終了されていたら破棄
    if (!summary) summary = `「${query}」について、うまく調べられませんでした。`;

    this._searchLast = { q: query, summary };
    this._searchPhase = 'save_confirm';
    this._showMessage(`あいなす: ${summary}`);
    this.voice.speak(summary, {
      onEnd: () => {
        if (!this._searchMode || this._searchPhase !== 'save_confirm') return;
        this.busy = false;
        this._micState('idle');
        this._setStatus('保存しますか？（「はい」か「いいえ」）');
        const ask = '保存しますか？';
        this._showMessage(`あいなす: ${ask}`);
        this.voice.speak(ask);
      },
    });
  }

  // D-7: 検索結果を raw/ に保存（パスワード認証付き）→ 続けるか確認
  async _searchSave() {
    this.busy = true;
    this.voice?.stopListening();
    this._micState('processing');
    this._setStatus('保存中...');
    try {
      await fetch('/api/search', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          action:  'save',
          q:       this._searchLast?.q || '検索',
          content: this._searchLast?.summary || '',
          pw:      this._getSearchToken(),
        }),
        signal:  AbortSignal.timeout(8000),
      });
    } catch { /* 保存失敗でも続行 */ }
    const phrase = '保存しました。';
    this._showMessage(`あいなす: ${phrase}`);
    this.voice.speak(phrase, { onEnd: () => this._searchAskContinue() });
  }

  // 「検索を続けますか？」確認
  _searchAskContinue() {
    if (!this._searchMode) return;
    this._searchPhase = 'continue_confirm';
    this.busy = false;
    this._micState('idle');
    this._setStatus('検索を続けますか？（「はい」/「もういいよ」で終了）');
    const phrase = '検索を続けますか？';
    this._showMessage(`あいなす: ${phrase}`);
    this.voice.speak(phrase);
  }

  // D-5: パスワード失敗 → 発狂大佐セリフを倍速・「話す」動画ループで再生
  _searchFail() {
    this._searchPhase = 'fail';
    this._clearSearchTalk();
    this.busy = true;
    this.voice?.stopListening();
    this.voice?.stopSpeaking();
    this._micState('idle');
    this._setStatus('パスワードが違います…（タップでもう一度）');
    this.scene.setPlaybackRate(SEARCH_FAIL_RATE);
    this.scene.playSequence(
      [SEARCH_VID_TALK],
      null,
      /* loopLast */ true,
      /* onLoopStart */ () => this._startSearchFailTalk(),
      /* withSound */ false,
    );
  }

  // 失敗ループ：ランダムなセリフを倍速で発話し続ける（タップで中断しパスワード再入力へ）
  _startSearchFailTalk() {
    this._clearSearchTalk();
    if (!this._searchMode || this._searchPhase !== 'fail') return;
    this._searchTalkTimer = setTimeout(() => {
      if (!this._searchMode || this._searchPhase !== 'fail' || this.voice.isListening) {
        this._startSearchFailTalk();
        return;
      }
      const line = COLONEL_LINES[Math.floor(Math.random() * COLONEL_LINES.length)];
      this._showMessage(`あいなす: ${line}`);
      this.voice.speak(line, {
        rate:  1.8,   // 倍速
        onEnd: () => { if (this._searchMode && this._searchPhase === 'fail') this._startSearchFailTalk(); },
      });
    }, 600);
  }

  _clearSearchTalk() {
    clearTimeout(this._searchTalkTimer);
    this._searchTalkTimer = null;
  }

  // D-8: 「もういいよ」→ 施錠 → 帰宅 → 通常モード復帰
  _endSearch() {
    this._seqLock = true;          // 施錠→帰宅 再生中は onListenEnd の IDLE 強制を抑止
    this._searchMode  = false;
    this._searchPhase = null;
    this._clearSearchTalk();
    this.voice?.stopListening();
    this.voice?.stopSpeaking();
    this.scene.setPlaybackRate(1.0);
    this._micState('processing');
    this._setStatus('終了します...');
    this.scene.playSequence(SEARCH_END_SEQ, () => {
      this._seqLock = false;
      this.busy = false;
      this.scene.setState(STATE.IDLE);
      this._setStatus('タップして話しかける');
      this._micState('idle');
      this._resetWanderTimer();
      const phrase = '検索を終了しました。';
      this._showMessage(`あいなす: ${phrase}`);
      this.voice.speak(phrase);
    }, /* loopLast */ false, /* onLoopStart */ null, /* withSound */ true);
  }

  // ── TRPGモード（GMセッション）──────────────────────────

  _startTrpg(text) {
    this._trpgMode    = true;
    this._trpgLog     = [];
    this._trpgHistory = [];
    clearTimeout(this._wanderTimer);
    clearTimeout(this._actionTimer);
    clearTimeout(this._butlerTimer);
    this.voice?.stopListening();
    this.scene.playTrpgLoop();   // TRPG動画をミュート・ループで背景再生
    this._setStatus('TRPGセッション中...（「終わり」で終了）');
    // 最初の発言（開始の合図）を GM への最初のターンとして送る
    this._trpgTurn(text);
  }

  _handleTrpgSpeech(text, _match) {
    if (_match(TRPG_END_TRIGGERS)) { this._endTrpg(); return; }
    this._trpgTurn(text);
  }

  // 1ターン: ユーザー行動 → GM応答（TRPGモード・履歴付き）
  async _trpgTurn(text) {
    this.busy = true;
    this.voice?.stopListening();
    // TRPG動画はループしたまま（思考/発話で待機・話す動画へ切り替えない）
    this._micState('processing');
    this._setStatus('GMが考えています...');
    this._trpgLog.push(`あなた: ${text}`);
    this._trpgHistory.push({ role: 'user', parts: [{ text }] });

    let reply = '';
    try {
      reply = await this._ainasChat(text, { mode: 'trpg', history: this._trpgHistory.slice(-16) });
    } catch { reply = ''; }
    if (!this._trpgMode) return;   // 途中で終了されていたら破棄
    if (!reply) reply = '（GMは沈黙している…）もう一度お試しください。';

    this._trpgLog.push(`GM: ${reply}`);
    this._trpgHistory.push({ role: 'model', parts: [{ text: reply }] });
    if (this._trpgHistory.length > 24) this._trpgHistory.splice(0, this._trpgHistory.length - 24);

    this._showMessage(`あいなす(GM): ${reply}`);
    this._micState('idle');
    this.voice.speak(reply, {
      onEnd: () => {
        if (!this._trpgMode) return;
        this.busy = false;
        this._setStatus('あなたの行動をどうぞ（「終わり」で終了）');
      },
    });
  }

  // 「終了」→ セッションを要約して Obsidian の Daily に追記し終了
  async _endTrpg() {
    const log = this._trpgLog.slice();
    this._trpgMode = false;
    this.busy = true;
    this.voice?.stopListening();
    this.scene.setState(STATE.THINKING);
    this._setStatus('セッションを記録しています...');

    let summary = '';
    if (log.length) {
      try {
        const prompt =
          `次のTRPGセッションのログを、日報として日本語で簡潔にまとめてください（200字程度）。` +
          `起きた出来事・登場NPC・結末を中心に。前置き不要。\n\n${log.join('\n')}`;
        summary = await this._ainasChat(prompt, { mode: 'conversation' });
      } catch { summary = ''; }
    }
    const date = new Date().toISOString().slice(0, 10);
    const content =
      `**${date} のTRPGセッション**\n\n` +
      (summary ? `${summary}\n\n` : '') +
      `<details><summary>ログ全文</summary>\n\n${log.join('\n\n')}\n\n</details>`;

    try {
      await fetch('/api/daily', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ date, title: 'TRPGセッション記録', content }),
        signal:  AbortSignal.timeout(8000),
      });
    } catch { /* 保存失敗でも終了は続行 */ }

    this._trpgLog = [];
    this._trpgHistory = [];
    this.busy = false;
    this.scene.setState(STATE.IDLE);
    this._micState('idle');
    this._setStatus('タップして話しかける');
    this._resetWanderTimer();
    const phrase = 'セッションを終了します。本日の日報に記録しました。';
    this._showMessage(`あいなす: ${phrase}`);
    this.voice.speak(phrase);
  }

  // ── AINAS RAG チャット ────────────────────────────────

  _cancelAinas() {
    if (this._ainasAbort) { this._ainasAbort.abort(); this._ainasAbort = null; }
  }

  async _ainasChat(text, opts = {}) {
    this._cancelAinas();
    this._ainasAbort = new AbortController();
    // CF /api/chat（Gemini flash-lite主役・503時は別モデルへリトライ）。余裕を見て30s。
    const timer = setTimeout(() => this._cancelAinas(), 30000);
    try {
      const body = { message: text };
      if (opts.mode) body.mode = opts.mode;            // 明示モード（TRPG継続など）
      if (opts.history) body.history = opts.history;   // マルチターン履歴
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  this._ainasAbort.signal,
      });
      if (!res.ok) throw new Error(`Chat API ${res.status}`);
      const { reply } = await res.json();
      if (!reply) throw new Error('empty reply');
      return reply;
    } finally {
      clearTimeout(timer);
      this._ainasAbort = null;
    }
  }

  // ── 記憶 ─────────────────────────────────────────────

  async _saveMemory(text) {
    this.scene.setState(STATE.THINKING);
    this._setStatus('覚えています...');

    // 「覚えて」などのトリガーワードを除去して原文の事実だけ残す
    const keyword = text.replace(/覚えて|おぼえて|記憶して/g, '').trim();
    const context = '';

    try {
      // CF /api/memory 経由で保存 → KV + D1 + AINAS(起動中のみ) の3箇所に保存される
      await fetch('/api/memory', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ keyword, context }),
      });
      await this._loadMemories();

      const reply = 'かしこまりました。覚えておきます。';
      this._showMessage(`あいなす: ${reply}`);
      this.scene.setState(STATE.TALKING);
      this._setStatus('話してる...');
      this._micState('idle');
      this.voice.speak(reply, {
        onEnd: () => {
          this.busy = false;
          this.scene.setState(STATE.IDLE);
          this._setStatus('タップして話しかける');
          this._resetWanderTimer();
        },
      });
    } catch (e) {
      console.error('[Memory] save failed:', e);
      this.busy = false;
      this.scene.setState(STATE.IDLE);
      this._setStatus('タップして話しかける');
      this._micState('idle');
      this._resetWanderTimer();
    }
  }

  // ── ウロウロ管理 ─────────────────────────────────────

  /** 無操作タイマーリセット（操作完了後に呼ぶ） */
  _resetWanderTimer() {
    clearTimeout(this._wanderTimer);
    clearTimeout(this._actionTimer);
    this._wanderTimer = setTimeout(() => {
      if (!this.busy && this.scene) this._startWandering();
    }, WANDER_DELAY_MS);
    this._resetButlerTimer();
  }

  /** 執事発話タイマーリセット */
  _resetButlerTimer() {
    clearTimeout(this._butlerTimer);
    const delay = BUTLER_MIN_MS + Math.random() * (BUTLER_MAX_MS - BUTLER_MIN_MS);
    this._butlerTimer = setTimeout(() => this._butlerSpeak(), delay);
  }

  /** 執事の自発的発話（PHASE F: Obsidianナレッジ参照の話しかけ。失敗時は固定フレーズ） */
  async _butlerSpeak() {
    const idleNow = () =>
      !(this.busy || this.voice?.isSpeaking || this.voice?.isListening || this._outingMode || this._goMode || this._searchMode || this._trpgMode || this._drawMode || this._pickMode || this._monshinMode);
    if (!idleNow()) { this._resetButlerTimer(); return; }

    // F-1/F-2: Vaultナレッジから話題を選んで自然な話しかけを生成
    let phrase = '';
    try { phrase = await this._generateIdleTalk(); } catch { phrase = ''; }

    // 生成中（数秒）に状態が変わっていたら中止
    if (!idleNow()) { this._resetButlerTimer(); return; }

    if (!phrase) phrase = _pickButlerPhrase();   // フォールバック（固定フレーズ）
    this._showMessage(`あいなす: ${phrase}`);
    this.scene?.setState(STATE.BORED);           // F-3: アイドリング動画と同期再生
    this.voice?.speak(phrase, {
      onEnd: () => {
        this.scene?.setState(STATE.IDLE);
        this._resetButlerTimer();
      },
    });
  }

  /** Vault からランダムに話題の種を取得（同じ話題への偏り＝五右衛門ばかり問題の対策） */
  async _randomTopic() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch('/api/vault/random', { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return '';
      return ((await res.json()).topic || '').toString().slice(0, 300);
    } catch { return ''; }
  }

  /** Vaultナレッジを参照した話しかけ文を生成（F-1/F-2/F-4/F-5） */
  async _generateIdleTalk() {
    // ランダムなVaultチャンクを話題の種にして毎回違う話題にする
    const seed = await this._randomTopic();
    const exclude = this._lastIdleTopic ? `「${this._lastIdleTopic}」の話題は避けてください。` : '';
    const prompt = seed
      ? `次のメモの内容について、ユーザーへの自然な話しかけを一言だけ言ってください。${exclude}` +
        `例:「〜には驚かされました」「〜について、ご存知でしたか？」のような口調。100文字以内。` +
        `挨拶・前置き・絵文字・かぎ括弧は不要です。\n\nメモ: ${seed}`
      : `Vaultのナレッジ（Obsidian）から話題を一つ選び、ユーザーへの自然な話しかけを一言だけ言ってください。` +
        `${exclude}例:「〜には驚かされました」「〜について、ご存知でしたか？」のような口調。` +
        `100文字以内。挨拶・前置き・絵文字・かぎ括弧は不要です。`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message: prompt }),
        signal:  ctrl.signal,
      });
      if (!res.ok) return '';
      const { reply } = await res.json();
      const text = (reply || '').replace(/[「」]/g, '').trim().slice(0, 110);  // F-5: 100字程度に制限
      if (text) this._lastIdleTopic = text.slice(0, 12);  // 直前トピックとして記録
      return text;
    } catch {
      return '';
    } finally {
      clearTimeout(t);
    }
  }

  /** ウロウロを停止してキャラをデフォルト位置へ */
  _stopWandering() {
    clearTimeout(this._wanderTimer);
    clearTimeout(this._actionTimer);
    const s = this.scene?.state;
    if (s === STATE.WANDERING || s === STATE.SITTING || s === STATE.RETURNING) {
      this.scene.returnToDefault();
    }
  }

  /** ウロウロ開始（初回アクションを即実行） */
  _startWandering() {
    if (this.busy) return;
    this._doAction();
  }

  /** 1アクション実行して次アクションをスケジュール */
  _doAction() {
    if (this.busy || !this.scene) return;

    // アイドリング動画は約10秒。各アクションの間隔を動画長以上にして、
    // 1本ずつフル再生させてから次のアイドリング動画へ切り替える（途中で切れないように）。
    const FULL = 10500;   // 動画フル再生待ち（約10秒＋余白）
    const roll = Math.random();

    if (roll < 0.40) {
      // 左右どちらかへ歩く
      const dir  = Math.random() > 0.5 ? 1 : -1;
      const dist = 1.0 + Math.random() * 1.5;
      this.scene.walkTo(dir * dist);
      this._scheduleNextAction(FULL + Math.random() * 2500);

    } else if (roll < 0.65) {
      // 座る → しばらく後に立つ
      this.scene.sitDown();
      const sitMs = FULL + Math.random() * 3000;
      this._actionTimer = setTimeout(() => {
        if (!this.busy) {
          this.scene.standUp();
          this._scheduleNextAction(FULL);
        }
      }, sitMs);

    } else if (roll < 0.85) {
      // 中央付近をうろうろ（小刻みに左右）
      const dir = Math.random() > 0.5 ? 1 : -1;
      this.scene.walkTo(dir * (0.5 + Math.random() * 0.8));
      this._scheduleNextAction(FULL + Math.random() * 2500);

    } else {
      // 画面外へ歩き出す → フル再生後に戻ってくる
      this.scene.leaveScreen();
      this._actionTimer = setTimeout(() => {
        if (!this.busy) {
          const returnX = (Math.random() - 0.5) * 1.5;
          this.scene.walkTo(returnX);
          this._scheduleNextAction(FULL + Math.random() * 2500);
        }
      }, FULL);
    }
  }

  _scheduleNextAction(ms) {
    clearTimeout(this._actionTimer);
    this._actionTimer = setTimeout(() => {
      if (!this.busy && this.scene) this._doAction();
    }, ms);
  }

  // ── UI ───────────────────────────────────────────────
  _setStatus(text) {
    const el = document.getElementById('status-text');
    if (el) el.textContent = text;
  }

  _showMessage(text) {
    const box = document.getElementById('message-box');
    const txt = document.getElementById('message-text');
    if (!box || !txt) return;
    txt.textContent = text;
    box.classList.remove('hidden');
    clearTimeout(this._msgTimer);
    this._msgTimer = setTimeout(() => box.classList.add('hidden'), MSG_HIDE_MS);
  }

  _micState(state) {
    const btn = document.getElementById('mic-btn');
    if (!btn) return;
    btn.classList.remove('listening', 'processing');
    if (state !== 'idle') btn.classList.add(state);
  }

  _showManual() {
    document.getElementById('manual-content').innerHTML = MANUAL_HTML;
    document.getElementById('manual-overlay').classList.remove('hidden');
    clearTimeout(this._wanderTimer);
    clearTimeout(this._actionTimer);
  }

  _hideManual() {
    document.getElementById('manual-overlay').classList.add('hidden');
    this._resetWanderTimer();
  }

  // ── 記憶ロード ──────────────────────────────────────
  async _loadMemories() {
    try {
      const res = await fetch('/api/memory');
      if (!res.ok) return;
      const { memories } = await res.json();
      this._memories = memories || [];
      console.log(`[Memory] ${this._memories.length} 件読み込み完了`);
    } catch (e) {
      console.warn('[Memory] load failed:', e);
      this._memories = [];
    }
  }

}

// ── Boot ─────────────────────────────────────────────────
new RETApp();

/**
 * My agent – main application orchestrator
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
const OUTING_TRIGGERS  = ['外出', 'がいしゅつ', 'そとで', '出かけ', 'でかけ'];
const RETURN_TRIGGERS  = ['もういいよ', 'もういい', '帰宅', 'きたく', '戻って'];


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
<h3>🤖 My agentってなに？</h3>
<p>話しかけると、なんでも答えてくれる<strong>AIアシスタント</strong>がいるよ！</p>

<h3>🎙️ 話しかけかた</h3>
<p><strong>① 右上のまるいボタンを1回おす</strong><br>
ボタンが赤くなったら聞いているよ。</p>
<p><strong>② 話しかける</strong><br>
なんでも話してOK！終わると自動で送信されるよ。</p>
<p><strong>③ 執事が答えてくれる</strong><br>
声と文字で答えてくれるよ。止めたいときはもう一度ボタンをおしてね。</p>

<h3>✨ まほうのことば</h3>
<p><strong>「クリア」</strong> と言う → この説明書が出るよ
</p>

<h3>💤 ほっておくと…</h3>
<p>しばらく操作しないと、執事が動きだすよ。話しかけるとすぐ戻ってくるよ！</p>

<h3>🆘 こまったとき</h3>
<p><strong>「もう一度試して」と出た</strong> → ボタンをもう一回おしてね<br>
<strong>音が出ない</strong> → 音量を上げてマナーモードを確認してね<br>
<strong>マイクが使えない</strong> → ブラウザのマイク許可をONにしてね</p>
`;

// ════════════════════════════════════════════════════════
class MyAgentApp {
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
    this._aiAbort   = null;

    // 復帰シーケンス（帰宅/施錠→帰宅）再生中ガード。
    // 音声認識は非継続モードのため result 直後に必ず onend が発火する。
    // 復帰開始でモードフラグを下ろした直後の onListenEnd が setState(IDLE) で
    // シーケンスを kill するのを防ぐ（「帰ろう」で4が映らず待機に飛ぶ問題の対策）。
    this._seqLock      = false;

    // 外出系シーケンス（「行くぞ」）用の状態
    this._goMode       = false;        // 「行くぞ」シーケンス中か
    this._goPhase      = null;         // 'prompt' | 'travel' | 'backroom'
    this._goSolo       = false;        // true=単独 / false=共闘
    this._goIdleTimer  = null;

    // 認証ゲートなし：直接アプリ起動（テンプレートは 会話 / 外出 / アイドル / 動画 のみ）
    document.getElementById('face-screen')?.classList.add('hidden');
    this._startApp();
  }


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
        this.scene.enableSound();
        // 起動の挨拶（会話テンプレート）
        const greeting = 'はじめまして。何なりとお申し付けください。';
        setTimeout(() => {
          this._showMessage(`執事: ${greeting}`);
          this.voice.speak(greeting);
        }, 500);
        this._setStatus('タップして話しかける');
        this._resetWanderTimer();
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
    if (this._outingMode || this._goMode || this._seqLock) return;
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
    if (this._outingMode || this._goMode || this._seqLock) return;
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
        this._cancelLocalAI();
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
      this._cancelLocalAI();
      this._startOuting();
      return;
    }

    if (_match(GO_TRIGGERS)) {
      this._cancelLocalAI();
      this._startGoPrompt();
      return;
    }


    this._showMessage(`あなた: ${text}`);
    this.scene.setState(STATE.THINKING);
    this._setStatus('考えてる...');

    try {
      let reply;
      try {
        const data = await this._aiAsk(text);
        reply = data.reply;
      } catch (e) {
        // 外出/他モードへの遷移によるキャンセルは静かに終了
        if (this._outingMode || this._goMode) return;
        // タイムアウト/通信失敗で「考え中」のまま固まらないよう、通知して復帰
        this._showMessage('執事: 申し訳ございません、うまく応答できませんでした。もう一度お試しください。');
        this.busy = false;
        this.scene.setState(STATE.IDLE);
        this._setStatus('タップして話しかける');
        this._micState('idle');
        this._resetWanderTimer();
        return;
      }

      // 非同期待機中に外出モードへ遷移していた場合は返答を捨てる
      if (this._outingMode) return;

      console.log('[執事]', reply);

      this._showMessage(`執事: ${reply}`);
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
      this._showMessage(`執事: ${phrase}`);
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
        this._showMessage(`執事: ${phrase}`);
        this.voice.speak(phrase);
      }, /* loopLast */ false, /* onLoopStart */ null, /* withSound */ true);
    };

    const phrase = '帰りますね。';
    this._showMessage(`執事: ${phrase}`);
    let started = false;
    const startOnce = () => { if (!started) { started = true; playReturn(); } };
    this.voice.speak(phrase, { onEnd: startOnce });
    // onEnd が発火しない端末向けのフォールバック
    setTimeout(startOnce, 4000);
  }

  // 起動時に「最新の同期は◯月◯日です」とひと言（常設UIは作らない）
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
    this._showMessage(`執事: ${phrase}`);
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
      if (_match(GO_HOME_TRIGGERS)) { this._cancelLocalAI(); this._startGoReturn(); }
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
  async _aiAsk(text) {
    this._cancelLocalAI();
    this._aiAbort = new AbortController();
    const timer = setTimeout(() => this._cancelLocalAI(), 30000);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, disambiguate: true }),
        signal: this._aiAbort.signal,
      });
      if (!res.ok) throw new Error(`Chat API ${res.status}`);
      const data = await res.json();
      if (Array.isArray(data.candidates) && data.candidates.length >= 2) return { candidates: data.candidates };
      if (!data.reply) throw new Error('empty reply');
      return { reply: data.reply };
    } finally {
      clearTimeout(timer);
      this._aiAbort = null;
    }
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
      this._showMessage(`執事: ${phrase}`);
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
      this._showMessage(`執事: ${phrase}`);
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
    const reply = await this._aiChat(prompt);
    return (reply || '').replace(/[「」]/g, '').slice(0, 110);
  }

  // 走行中の独り言にユーザーが返事したら、会話として応答してから走行を継続する
  async _goReplyToUser(text) {
    this._clearGoIdleTalk();
    this.busy = true;
    this._micState('processing');
    this._setStatus('考えています...');
    let reply = '';
    try { reply = await this._aiChat(text); } catch { reply = ''; }
    // 応答待ちの間にモード/フェーズが変わっていたら破棄
    if (!this._goMode || this._goPhase !== 'travel') return;
    if (!reply) reply = 'さようでございますか。';
    this._showMessage(`執事: ${reply}`);
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


  // 音声認識結果からパスワード数字列を抽出（数字 / 全角 / 英語読み / 日本語読み）
  // 検索トークンを取得（初回のみ入力させ localStorage に保存）。公開JSには値を持たない。
  _cancelLocalAI() {
    if (this._aiAbort) { this._aiAbort.abort(); this._aiAbort = null; }
  }

  async _aiChat(text, opts = {}) {
    this._cancelLocalAI();
    this._aiAbort = new AbortController();
    // CF /api/chat（Gemini flash-lite主役・503時は別モデルへリトライ）。余裕を見て30s。
    const timer = setTimeout(() => this._cancelLocalAI(), 30000);
    try {
      const body = { message: text };
      if (opts.mode) body.mode = opts.mode;            // 明示モード（任意）
      if (opts.history) body.history = opts.history;   // マルチターン履歴
      const res = await fetch('/api/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  this._aiAbort.signal,
      });
      if (!res.ok) throw new Error(`Chat API ${res.status}`);
      const { reply } = await res.json();
      if (!reply) throw new Error('empty reply');
      return reply;
    } finally {
      clearTimeout(timer);
      this._aiAbort = null;
    }
  }

  // ── 記憶 ─────────────────────────────────────────────

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

  /** 執事の自発的発話（アイドリング中の小話・固定フレーズ） */
  async _butlerSpeak() {
    const idleNow = () =>
      !(this.busy || this.voice?.isSpeaking || this.voice?.isListening || this._outingMode || this._goMode);
    if (!idleNow()) { this._resetButlerTimer(); return; }

    const phrase = _pickButlerPhrase();
    this._showMessage(`執事: ${phrase}`);
    this.scene?.setState(STATE.BORED);           // アイドリング動画と同期再生
    this.voice?.speak(phrase, {
      onEnd: () => {
        this.scene?.setState(STATE.IDLE);
        this._resetButlerTimer();
      },
    });
  }

  /** 話題の種（外出時の独り言などで使用）。テンプレートでは未使用のため空を返す。 */
  async _randomTopic() { return ''; }

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

}

// ── Boot ─────────────────────────────────────────────────
new MyAgentApp();

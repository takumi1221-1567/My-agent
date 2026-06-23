export const STATE = {
  IDLE:      'idle',
  LISTENING: 'listening',
  THINKING:  'thinking',
  TALKING:   'talking',
  BORED:     'bored',
  WANDERING: 'wandering',
  SITTING:   'sitting',
  RETURNING: 'returning',
};

const IDLE_SRC    = 'videos/待機.mp4';
const TALK_SRC    = 'videos/話す.mp4';
const IDLING_SRCS = [
  'videos/アイドリング1.mp4',
  'videos/アイドリング2.mp4',
  'videos/アイドリング3.mp4',
  'videos/アイドリング4.mp4',
];

// 直前に再生したアイドリングを除外してランダム選択（同じ動画の連続再生を防ぐ）
let _lastIdling = null;
function pickIdling() {
  const pool = IDLING_SRCS.filter(s => s !== _lastIdling);
  const pick = pool[Math.floor(Math.random() * pool.length)];
  _lastIdling = pick;
  return pick;
}

export class SceneController {
  constructor(stage, _vrMode, { onProgress, onReady } = {}) {
    this.state    = STATE.IDLE;
    this._current = null;
    this._seqId   = 0;   // シーケンス世代トークン（古い遷移の取り消し用）
    this._soundOn = false; // ユーザー操作で音声を解禁したら true（全動画の音を出す）

    this._vA = this._makeVideo();
    this._vB = this._makeVideo();
    stage.appendChild(this._vA);
    stage.appendChild(this._vB);
    this._front = this._vA;
    this._back  = this._vB;

    this._crossfade(IDLE_SRC);

    if (onProgress) onProgress(1);
    if (onReady) setTimeout(onReady, 300);
  }

  _makeVideo() {
    const v = document.createElement('video');
    v.loop         = true;
    v.muted        = true;
    v.defaultMuted = true;
    v.playsInline  = true;
    v.volume       = 0.6;   // デスクトップ向けに音量控えめ（iOSはhardware制御のため無視されるが無害）
    // iOS Safari では property だけでなく attribute も必要
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.5s ease;';
    return v;
  }

  _crossfade(src) {
    if (this._current === src) return;
    this._current = src;

    // 実行中のシーケンスを無効化（setState 等が割り込んでも競合しない）
    this._seqId++;

    const next = this._back;
    const prev = this._front;

    if (next._fadeTimer)   { clearTimeout(next._fadeTimer);   next._fadeTimer   = null; }
    if (next._canplayOff)  { next._canplayOff();  next._canplayOff  = null; }
    if (next._pollId)      { clearInterval(next._pollId);     next._pollId      = null; }
    // 前面に残ったポーリングも停止
    if (this._front._pollId) { clearInterval(this._front._pollId); this._front._pollId = null; }

    // 待機/話す/アイドリングのループ動画は常にミュート。
    // 執事の声はTTSで出るため、ループ動画の常時音は煩く、かつiOSではvolumeをJS制御できない。
    // イベント動画（外出/ドライブ/検索/帰宅等）の音は playSequence(withSound) 側で再生する。
    next.loop  = true;
    next.muted = true;
    next.setAttribute('muted', '');
    next.src = src;
    next.load();

    let fired = false;
    const doFade = () => {
      if (fired) return;
      fired = true;
      if (next._canplayOff) { next._canplayOff(); next._canplayOff = null; }
      // 音声ONで自動再生が拒否されたらミュートで必ず再生（映像は止めない）
      next.play().catch(() => {
        if (!next.muted) { next.muted = true; next.setAttribute('muted', ''); next.play().catch(() => {}); }
      });
      next.style.opacity = '1';
      prev.style.opacity = '0';
      this._front = next;
      this._back  = prev;
      prev._fadeTimer = setTimeout(() => { prev.pause(); prev._fadeTimer = null; }, 600);
    };

    // canplay → loadeddata → 3秒タイムアウトの順でフォールバック
    if (next.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      doFade();
    } else {
      const onReady = () => doFade();
      next.addEventListener('canplay',    onReady, { once: true });
      next.addEventListener('loadeddata', onReady, { once: true });
      next._canplayOff = () => {
        next.removeEventListener('canplay',    onReady);
        next.removeEventListener('loadeddata', onReady);
      };
      // 3秒経っても発火しなければ強制フェード（形式非対応でも止まらない）
      setTimeout(() => doFade(), 3000);
    }
  }

  setState(s) {
    // アイドリング系（WANDERING/SITTING/BORED）は同一stateでも毎回 pickIdling で
    // 別のアイドリング動画に切り替える。それ以外は同一stateなら何もしない。
    const idleStates = (s === STATE.WANDERING || s === STATE.SITTING || s === STATE.BORED);
    if (this.state === s && !idleStates) return;
    this.state = s;
    switch (s) {
      case STATE.TALKING:
        this._crossfade(TALK_SRC);
        break;
      case STATE.WANDERING:
      case STATE.SITTING:
      case STATE.BORED:
        this._crossfade(pickIdling());
        break;
      default:
        this._crossfade(IDLE_SRC);
    }
  }

  /**
   * 動画を順番に1回ずつ再生し、全て終わったら onDone を呼ぶ。
   * 最後の動画は loop=true でループ再生（onDone なしで呼んだ場合）。
   * @param {string[]} srcs          再生する動画パスの配列
   * @param {Function} [onDone]      全シーケンス終了後のコールバック
   * @param {boolean}  [loopLast]    trueなら最後の動画をループ（デフォルト false）
   * @param {Function} [onLoopStart] ループ動画（最後）の再生開始時に1度呼ぶ
   * @param {boolean}  [withSound]   trueなら音声ONで再生（デフォルト false=ミュート）
   */
  playSequence(srcs, onDone = null, loopLast = false, onLoopStart = null, withSound = false) {
    if (!srcs || srcs.length === 0) { onDone?.(); return; }

    // 新しいシーケンス世代を発番。古いシーケンスの ended/ポーリング/doFade を無効化する。
    const myId = ++this._seqId;
    // 前のシーケンスが front 側に残したポーリングを止める（暗転・上書き防止）
    if (this._front._pollId) { clearInterval(this._front._pollId); this._front._pollId = null; }
    if (this._back._pollId)  { clearInterval(this._back._pollId);  this._back._pollId  = null; }

    const play = (index) => {
      if (myId !== this._seqId) return;   // 既に新しいシーケンスが始まっている → 中止
      const src  = srcs[index];
      const last = index === srcs.length - 1;
      const next = this._back;
      const prev = this._front;

      // advance を doFade より前に定義（play().catch からも参照できるよう）
      let advanceFired = false;
      const advance = () => {
        if (advanceFired || myId !== this._seqId) return;
        advanceFired = true;
        if (next._pollId) { clearInterval(next._pollId); next._pollId = null; }
        next.removeEventListener('ended', advance);
        if (last) { onDone?.(); }
        else      { play(index + 1); }
      };

      if (next._fadeTimer) { clearTimeout(next._fadeTimer); next._fadeTimer = null; }
      if (next._canplayOff)  { next._canplayOff();  next._canplayOff  = null; }
      if (next._pollId)      { clearInterval(next._pollId); next._pollId = null; }

      next.loop  = last && loopLast;
      const soundOn = withSound || this._soundOn;   // 音声解禁後は全シーケンスで音を出す
      next.muted = !soundOn;
      if (soundOn) next.removeAttribute('muted');
      else         next.setAttribute('muted', '');
      next.src  = src;
      next.load();

      let fired = false;
      const doFade = () => {
        if (fired || myId !== this._seqId) return;
        fired = true;
        if (next._canplayOff) { next._canplayOff(); next._canplayOff = null; }

        // 再生失敗（AbortError/自動再生拒否等）は即スキップせずリトライ。
        // handoff 中の一時的中断で動画（例: バックルーム4）が飛ばされるのを防ぐ。
        // 何度試しても再生できない時だけ次へ進める（ハング防止）。映像を出すことを最優先。
        const playWithRetry = (tries) => {
          if (myId !== this._seqId) return;
          const p = next.play();
          if (p && p.catch) p.catch(() => {
            // 音声ONで拒否されたらミュートに落として再生（映像は止めない）
            if (!next.muted) { next.muted = true; next.setAttribute('muted', ''); }
            if (myId !== this._seqId) return;
            if (tries > 0)               setTimeout(() => playWithRetry(tries - 1), 150);
            else if (!last || !loopLast) setTimeout(advance, 500);  // 最終手段
          });
        };
        playWithRetry(4);

        next.style.opacity = '1';
        prev.style.opacity = '0';
        this._front = next;
        this._back  = prev;
        this._current = src;
        prev._fadeTimer = setTimeout(() => { prev.pause(); prev._fadeTimer = null; }, 600);

        // ループ動画（最後）の再生開始を通知
        if (last && loopLast) onLoopStart?.();

        if (!last || !loopLast) {
          next.addEventListener('ended', advance, { once: true });
          // iOS Safari で ended が発火しない場合の setInterval ポーリング（100ms）
          next._pollId = setInterval(() => {
            if (myId !== this._seqId) { clearInterval(next._pollId); next._pollId = null; return; }
            if (next.duration > 0 && isFinite(next.duration) &&
                next.currentTime > 0 &&
                next.currentTime >= next.duration - 0.5) {
              advance();
            }
          }, 100);
        }
      };

      if (next.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        doFade();
      } else {
        const onReady = () => doFade();
        next.addEventListener('canplay',    onReady, { once: true });
        next.addEventListener('loadeddata', onReady, { once: true });
        next._canplayOff = () => {
          next.removeEventListener('canplay',    onReady);
          next.removeEventListener('loadeddata', onReady);
        };
        setTimeout(() => doFade(), 3000);
      }
    };

    play(0);
  }

  // ユーザー操作（マイクタップ等のジェスチャー）後に「イベント動画」の音声を解禁する。
  // 待機/話す/アイドリングのループ動画は対象外（常時ミュートのまま）。
  enableSound() {
    this._soundOn = true;
  }

  // 再生速度の変更（PHASE D-5: 失敗ループの「話す」動画を倍速再生）。
  // load() は playbackRate を defaultPlaybackRate に戻すため、両方を設定する。
  // 通常時は必ず 1.0 に戻すこと。
  setPlaybackRate(rate = 1.0) {
    for (const v of [this._vA, this._vB]) {
      v.playbackRate = rate;
      v.defaultPlaybackRate = rate;
    }
  }

  walkTo()            { this.setState(STATE.WANDERING); }
  sitDown()           { this.setState(STATE.SITTING); }
  standUp()           { this.setState(STATE.IDLE); }
  leaveScreen()       { this.setState(STATE.WANDERING); }
  returnToDefault(cb) { this.setState(STATE.IDLE); if (cb) setTimeout(cb, 500); }
  setTalkLevel()      {}
  setARMode()         {}
}

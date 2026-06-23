/**
 * VoiceController
 *
 * Handles:
 *  - Speech recognition (Web Speech API, ja-JP)
 *  - Speech synthesis  (Web Speech API, ja-JP, boy-like voice)
 *  - Optional Web Audio analysis for real-time talk level (lip sync amplitude)
 */

const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

export class VoiceController {
  constructor({ onRecognitionStart, onRecognitionResult, onRecognitionEnd, onRecognitionError } = {}) {
    this.onRecognitionStart  = onRecognitionStart  || (() => {});
    this.onRecognitionResult = onRecognitionResult || (() => {});
    this.onRecognitionEnd    = onRecognitionEnd    || (() => {});
    this.onRecognitionError  = onRecognitionError  || (() => {});

    this.synth         = window.speechSynthesis;
    this.recognition   = null;
    this.isListening   = false;
    this.isSpeaking    = false;
    this.selectedVoice = null;
    this._audioUnlocked = false;
    this._resumeTimer   = null;
    this._pendingSpeak  = null;

    this._initRecognition();
    this._loadVoices();

    // iOS: synthesisが止まらないよう定期的にresumeを呼ぶ
    if (IS_IOS) {
      setInterval(() => {
        if (this.isSpeaking && this.synth.paused) this.synth.resume();
      }, 5000);
    }
  }

  // ─────────────────────────────────────────────────────
  get isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  // ─────────────────────────────────────────────────────
  _initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { console.warn('[Voice] SpeechRecognition not available'); return; }

    const r = new SR();
    r.lang             = 'ja-JP';
    r.continuous       = false;
    r.interimResults   = false;
    r.maxAlternatives  = 1;

    r.onstart  = () => { this.isListening = true;  this.onRecognitionStart(); };
    r.onresult = e  => {
      const text = e.results[0][0].transcript.trim();
      if (text) this.onRecognitionResult(text);
    };
    r.onend    = () => { this.isListening = false; this.onRecognitionEnd(); };
    r.onerror  = e  => { this.isListening = false; this.onRecognitionError(e.error); };

    this.recognition = r;
  }

  _loadVoices() {
    const pick = () => {
      const voices = this.synth.getVoices();
      this.selectedVoice =
        voices.find(v => v.lang === 'ja-JP' && /male/i.test(v.name))  ||
        voices.find(v => v.lang === 'ja-JP' && /kyoko/i.test(v.name)) ||
        voices.find(v => v.lang === 'ja-JP')                          ||
        voices.find(v => v.lang.startsWith('ja'))                     ||
        null;
      console.log('[Voice] selected:', this.selectedVoice?.name ?? 'none');
    };
    pick();
    this.synth.addEventListener('voiceschanged', pick);

    // iOS は voiceschanged が遅延 or 発火しないことがある → ポーリング
    if (IS_IOS && !this.selectedVoice) {
      let tries = 0;
      const t = setInterval(() => {
        pick();
        if (this.selectedVoice || ++tries > 20) clearInterval(t);
      }, 300);
    }
  }

  // iOS Safari はユーザージェスチャー内で一度 speak() を呼ばないと
  // 後のasync文脈での speak() がブロックされる。マイクタップ時に呼ぶ。
  unlockAudio() {
    if (this._audioUnlocked) return;
    this._audioUnlocked = true;
    const utt = new SpeechSynthesisUtterance('');
    utt.volume = 0;
    utt.lang   = 'ja-JP';
    this.synth.speak(utt);
  }

  // ─────────────────────────────────────────────────────
  startListening() {
    if (!this.isSupported || this.isListening || this.isSpeaking) return false;
    // iOS Safari は毎回インスタンスを作り直す
    if (IS_IOS) this._initRecognition();
    if (!this.recognition) return false;
    try { this.recognition.start(); return true; }
    catch (e) { console.error('[Voice] start error', e); return false; }
  }

  stopListening() {
    if (this.isListening) this.recognition?.stop();
  }

  // ─────────────────────────────────────────────────────
  speak(text, { onStart, onEnd, onBoundary, rate } = {}) {
    if (!text) { onEnd?.(); return; }
    this.synth.cancel();
    this._stopped = false;

    // iOSは長文を一気にspeakすると途中で切れるバグがある → 句点で分割して順番に再生
    const chunks = IS_IOS
      ? (text.match(/[^。！？\n]+[。！？\n]?/g) || [text]).map(s => s.trim()).filter(Boolean)
      : [text];

    const speakChunk = (i) => {
      if (this._stopped || i >= chunks.length) {
        this.isSpeaking = false;
        onEnd?.();
        return;
      }

      const utt    = new SpeechSynthesisUtterance(chunks[i]);
      utt.lang     = 'ja-JP';
      utt.voice    = this.selectedVoice;
      utt.rate     = rate ?? 0.96;   // 倍速発話（PHASE D 失敗ループ等）に対応
      utt.pitch    = 1.25;
      utt.volume   = 1.0;

      if (i === 0) {
        utt.onstart = () => { this.isSpeaking = true; onStart?.(); };
      }
      utt.onend      = () => { setTimeout(() => speakChunk(i + 1), IS_IOS ? 80 : 0); };
      utt.onerror    = (e) => {
        console.warn('[Voice] speak error', e.error, 'chunk:', i);
        this.isSpeaking = false;
        onEnd?.();
      };
      utt.onboundary = (e) => onBoundary?.(e);

      this.synth.speak(utt);
    };

    // iOS: cancel直後にspeakすると無視されるので遅らせる
    setTimeout(() => speakChunk(0), IS_IOS ? 100 : 0);
  }

  stopSpeaking() {
    this._stopped = true;
    this.synth.cancel();
    this.isSpeaking = false;
  }
}

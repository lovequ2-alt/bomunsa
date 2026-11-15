// 고품질 전통 사찰 사운드 엔진
// 차임벨(풍경) 자동 소리 제거 (배경엔 고요한 산바람만 흐름)

class TempleAudio {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    let savedTts = null;
    try {
      savedTts = localStorage.getItem('bomunsa_tts_enabled');
    } catch (e) {}
    this.isTtsEnabled = savedTts === null ? true : savedTts === '1';
    this.isAmbientPlaying = false;
    this.ambientNodes = [];
    this.masterGain = null;

    // 목탁 루프 상태
    this.isMoktakLooping = false;
    this.moktakInterval = null;
    this.moktakBuffer = null;
    this.moktakAudio = new Audio('목탁소리.mp3');
    this.moktakAudio.preload = 'auto';
    this.moktakAudio.loop = true;
    this.hasPlayedBellIntro = false;

    // 요령 루프 상태 (지장전)
    this.isYoryeongLooping = false;
    this.yoryeongAudio = new Audio('요령.mp3');
    this.yoryeongAudio.preload = 'auto';
    this.yoryeongAudio.loop = true;

    // 단타 목탁 상태 (삼배 등)
    this.singleMoktakAudio = new Audio('단타목탁.wav');
    this.singleMoktakAudio.preload = 'auto';

    // 풍경소리 루프 상태 (산령각)
    this.isWindChimeLooping = false;
    this.windChimeInterval = null;
    this.windChimeAudio = new Audio('풍경소리.wav');
    this.windChimeAudio.preload = 'auto';
    this.windChimeAudio.loop = true;

    // 산속 새소리 스케줄러
    this.birdTimeout = null;

    // 전각별 경전 독송(비구니 톤 MP3 우선 + TTS 폴백) 상태
    this.isChanting = false;
    this.chantSessionId = 0;
    this.chantTimer = null;
    this.chantUtterance = null;
    this.chantAudio = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.getVoices) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }

  init() {
    if (this.ctx) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.generateRealisticMoktakBuffer();
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.85, this.ctx.currentTime);
    }
    if (this.yoryeongAudio) {
      this.yoryeongAudio.muted = this.isMuted;
    }
    if (this.moktakAudio) {
      this.moktakAudio.muted = this.isMuted;
    }
    if (this.singleMoktakAudio) {
      this.singleMoktakAudio.muted = this.isMuted;
    }
    if (this.windChimeAudio) {
      this.windChimeAudio.muted = this.isMuted;
    }
    if (this.isMuted) {
      this.stopChant();
      this.stopSpeech();
    }
    return this.isMuted;
  }

  toggleTts() {
    this.isTtsEnabled = !this.isTtsEnabled;
    try {
      localStorage.setItem('bomunsa_tts_enabled', this.isTtsEnabled ? '1' : '0');
    } catch (e) {}
    if (!this.isTtsEnabled) {
      this.stopChant();
      this.stopSpeech();
    }
    return this.isTtsEnabled;
  }

  pickKoreanNunVoice() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !window.speechSynthesis.getVoices) {
      return null;
    }
    const voices = window.speechSynthesis.getVoices() || [];
    const koVoices = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('ko'));
    if (koVoices.length === 0) return null;
    const femaleKeywords = ['sunhi', 'heami', 'soonbok', 'yuna', 'sora', 'female', '여성', 'google 한국의'];
    const maleKeywords = ['injoon', 'hyunsu', 'bongjin', 'gookmin', 'jimin', 'male', '남성'];
    const preferredFemale = koVoices.find(v => {
      const n = (v.name || '').toLowerCase();
      return femaleKeywords.some(k => n.includes(k));
    });
    if (preferredFemale) return preferredFemale;
    const nonMale = koVoices.find(v => {
      const n = (v.name || '').toLowerCase();
      return !maleKeywords.some(k => n.includes(k));
    });
    return nonMale || koVoices[0];
  }

  getScriptureData(hallId) {
    const scriptures = {
      seokguram: {
        title: '천수경',
        file: '천수경.mp3',
        lines: [
          '정구업진언. 수리수리 마하수리 수수리 사바하.',
          '개경게. 무상심심미묘법 백천만겁난조우 아금문견득수지 원해여래진실의.',
          '개법장진언. 옴 아라남 아라다.',
          '천수천안 관자재보살 광대원만 무애대비심 대다라니 계청.',
          '나무 관세음보살 마하살.',
          '신묘장구대다라니.',
          '나모라 다나다라 야야 나막알야 바로기제 새바라야 모지사다바야 마하사다바야 마하가로 니가야.',
          '옴 살바 바예수 다라나 가라야 다사명 나막 가리다바 이맘알야 바로기제 새바라 다바 니라간타.',
          '나막 하리나야 마발다 이사미 살발타 사다남 수반 아예염 살바 보다남 바바마라 미수다감.',
          '다냐타 옴 아로게 아로가 마지로가 지가란제 혜혜하례 마하모지 사다바.',
          '사마라 사마라 하리나야 구로구로 갈마 사다야 사다야 도로도로 미연제 마하 미연제.',
          '다라다라 다린 나례 새바라 자라자라 마라 미마라 아마라 몰제 예혜혜 로게 새바라.',
          '라아 미사미 나사야 나베 사미사미 나사야 모하자라 미사미 나사야 호로호로 마라호로.',
          '사라사라 시리시리 소로소로 못자못자 모다야 모다야 매다리야 니라간타 가마사 날사남.',
          '바라하라 나야 마낙 사바하. 싯다야 사바하. 마하싯다야 사바하.',
          '원아금차 치송지 천수다라니 신주. 일체중생 이고득락 성불도.'
        ]
      },
      daewoong: {
        title: '반야심경',
        file: '반야심경.mp3',
        lines: [
          '마하반야바라밀다심경.',
          '관자재보살 행심반야바라밀다시 조견오온개공 도일체고액.',
          '사리자. 색불이공 공불이색 색즉시공 공즉시색 수상행식 역부여시.',
          '사리자. 시제법공상 불생불멸 불구부정 부증불감.',
          '시고 공중무색 무수상행식 무안이비설신의 무색성향미촉법.',
          '무안계 내지 무의식계 무무명 역무무명진 내지 무노사 역무노사진.',
          '무고집멸도 무지 역무득 이무소득고.',
          '보리살타 의반야바라밀다고 심무가애 무가애고 무유공포 원리전도몽상 구경열반.',
          '삼세제불 의반야바라밀다고 득아뇩다라삼먁삼보리.',
          '고지 반야바라밀다 시대신주 시대명주 시무상주 시무등등주 능제일체고 진실불허.',
          '고설 반야바라밀다주 즉설주왈.',
          '아제아제 바라아제 바라승아제 모지 사바하.',
          '아제아제 바라아제 바라승아제 모지 사바하.',
          '아제아제 바라아제 바라승아제 모지 사바하.'
        ]
      },
      jijang: {
        title: '멸업장진언',
        file: '멸업장진언.mp3',
        lines: [
          '지장보살 멸업장진언.',
          '나무 대원본존 지장보살 마하살.',
          '옴 바라 마니다니 사바하.',
          '옴 바라 마니다니 사바하.',
          '옴 바라 마니다니 사바하.',
          '일체 업장이 맑게 소멸되고, 모든 중생이 평안과 해탈을 얻기를 발원합니다.',
          '옴 바라 마니다니 사바하.',
          '옴 바라 마니다니 사바하.',
          '옴 바라 마니다니 사바하.'
        ]
      },
      sansin: {
        title: '화엄경 약찬게',
        file: '화엄경_약찬게.mp3',
        lines: [
          '대방광불 화엄경, 용수보살 약찬게.',
          '나무 화장세계 해회불보살.',
          '대방광불 화엄경, 주세신중 무량중.',
          '제대보살 마하살, 보현보살 위상수.',
          '여래현상 품제이, 보현삼매 제삼품.',
          '세계성취 화엄장, 비로자나 여래명.',
          '사성제법 광명각, 보살문명 정행품.',
          '현수보살 수미정, 십주십행 십회향.',
          '십지십정 여래상, 보현행원 입법계.',
          '선재동자 선지식, 오십삼선 지식처.',
          '보현보살 십대원, 원왕생 극락세계.',
          '나무 대방광불 화엄경, 나무 화장세계 해회불보살.'
        ]
      }
    };
    return scriptures[hallId] || null;
  }

  startChant(hallId, onLineChange, onComplete) {
    const data = this.getScriptureData(hallId);
    if (!data) return false;
    if (this.isMuted) return false;

    this.stopChant();
    this.isChanting = true;
    this.chantSessionId += 1;
    const sessionId = this.chantSessionId;

    const startTtsFallback = () => {
      if (!this.isChanting || sessionId !== this.chantSessionId || this.isMuted) return;
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        this.isChanting = false;
        if (onComplete) onComplete();
        return;
      }
      const voice = this.pickKoreanNunVoice();
      let idx = 0;

      const speakNext = () => {
        if (!this.isChanting || sessionId !== this.chantSessionId || this.isMuted) return;
        if (idx >= data.lines.length) {
          this.isChanting = false;
          this.chantUtterance = null;
          if (onComplete) onComplete();
          return;
        }
        const lineText = data.lines[idx];
        if (onLineChange) onLineChange(data.title, lineText, idx, data.lines.length);

        try {
          const utter = new SpeechSynthesisUtterance(lineText);
          utter.lang = 'ko-KR';
          utter.rate = 0.74;
          utter.pitch = 0.84;
          utter.volume = 0.65;
          if (voice) utter.voice = voice;
          utter.onend = () => {
            if (!this.isChanting || sessionId !== this.chantSessionId) return;
            idx += 1;
            this.chantTimer = setTimeout(speakNext, 420);
          };
          utter.onerror = () => {
            if (!this.isChanting || sessionId !== this.chantSessionId) return;
            this.isChanting = false;
            this.chantUtterance = null;
            if (onComplete) onComplete();
          };
          this.chantUtterance = utter;
          window.speechSynthesis.speak(utter);
        } catch (e) {
          this.isChanting = false;
          this.chantUtterance = null;
          if (onComplete) onComplete();
        }
      };

      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
      this.chantTimer = setTimeout(speakNext, 80);
    };

    if (data.file) {
      try {
        const audio = new Audio(data.file);
        audio.volume = 0.72;
        audio.muted = this.isMuted;
        audio.onended = () => {
          if (!this.isChanting || sessionId !== this.chantSessionId) return;
          this.isChanting = false;
          this.chantAudio = null;
          if (onComplete) onComplete();
        };
        audio.onerror = () => {
          if (!this.isChanting || sessionId !== this.chantSessionId) return;
          this.chantAudio = null;
          startTtsFallback();
        };
        this.chantAudio = audio;
        if (onLineChange) onLineChange(data.title, '비구니 스님의 고요한 독경 소리가 이어집니다...', 0, 1);
        const p = audio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            if (!this.isChanting || sessionId !== this.chantSessionId) return;
            this.chantAudio = null;
            startTtsFallback();
          });
        }
        return true;
      } catch (e) {
        this.chantAudio = null;
      }
    }

    startTtsFallback();
    return true;
  }

  stopChant() {
    this.isChanting = false;
    this.chantSessionId += 1;
    if (this.chantAudio) {
      try {
        this.chantAudio.pause();
        this.chantAudio.currentTime = 0;
      } catch (e) {}
      this.chantAudio = null;
    }
    if (this.chantTimer) {
      clearTimeout(this.chantTimer);
      this.chantTimer = null;
    }
    this.chantUtterance = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch (e) {}
    }
  }

  toggleChant(hallId, onLineChange, onComplete) {
    if (this.isChanting) {
      this.stopChant();
      return false;
    }
    return this.startChant(hallId, onLineChange, onComplete);
  }

  speakDescription(text) {
    if (!this.isTtsEnabled || !text) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(String(text).trim());
      utter.lang = 'ko-KR';
      utter.rate = 0.92;
      utter.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
      const koVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('ko'));
      if (koVoice) utter.voice = koVoice;
      window.speechSynthesis.speak(utter);
    } catch (e) {}
  }

  stopSpeech() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
    } catch (e) {}
  }

  playTempleBell() {
    this.resume();
    if (this.isMuted) return;

    const t = this.ctx.currentTime;
    const duration = 12.0;

    const partials = [
      { freq: 108, gain: 0.65, decay: 11.0 },
      { freq: 110.5, gain: 0.65, decay: 11.0 },
      { freq: 216, gain: 0.45, decay: 8.5 },
      { freq: 324, gain: 0.3, decay: 6.0 },
      { freq: 540, gain: 0.18, decay: 4.0 },
      { freq: 864, gain: 0.08, decay: 2.5 }
    ];

    const bufSize = Math.floor(this.ctx.sampleRate * 0.08);
    const noiseBuf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.2));
    }
    const strike = this.ctx.createBufferSource();
    strike.buffer = noiseBuf;
    const strikeFilter = this.ctx.createBiquadFilter();
    strikeFilter.type = 'lowpass';
    strikeFilter.frequency.setValueAtTime(320, t);
    const strikeGain = this.ctx.createGain();
    strikeGain.gain.setValueAtTime(0.8, t);
    strikeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    strike.connect(strikeFilter);
    strikeFilter.connect(strikeGain);
    strikeGain.connect(this.masterGain);
    strike.start(t);

    partials.forEach((p) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(p.freq, t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(p.gain, t + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + p.decay);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + p.decay);
    });
  }

  generateRealisticMoktakBuffer() {
    const sampleRate = this.ctx.sampleRate;
    const duration = 0.4;
    const numSamples = Math.floor(sampleRate * duration);
    this.moktakBuffer = this.ctx.createBuffer(1, numSamples, sampleRate);
    const data = this.moktakBuffer.getChannelData(0);

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const impactNoise = (Math.random() * 2 - 1) * Math.exp(-t * 350) * 0.6;
      const woodRes = Math.sin(2 * Math.PI * 620 * t) * Math.exp(-t * 26) * 0.75 +
                      Math.sin(2 * Math.PI * 1240 * t) * Math.exp(-t * 42) * 0.35;
      const cavity = Math.sin(2 * Math.PI * 380 * t) * Math.exp(-t * 19) * 0.45;
      data[i] = (impactNoise + woodRes + cavity) * 0.85;
    }
  }

  playSingleMoktak() {
    this.resume();
    if (this.isMuted) return;
    if (this.singleMoktakAudio) {
      try {
        this.singleMoktakAudio.pause();
        this.singleMoktakAudio.currentTime = 0;
        this.singleMoktakAudio.volume = 0.88;
        this.singleMoktakAudio.muted = this.isMuted;
        const p = this.singleMoktakAudio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => this.playSynthMoktakFallback());
        }
        return;
      } catch (e) {}
    }
    this.playSynthMoktakFallback();
  }

  playSynthMoktakFallback() {
    if (!this.ctx || this.isMuted) return;
    if (!this.moktakBuffer) this.generateRealisticMoktakBuffer();

    const source = this.ctx.createBufferSource();
    source.buffer = this.moktakBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3600, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1.85, this.ctx.currentTime);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    source.start(this.ctx.currentTime);
  }

  async loadMoktakMp3Buffer() {
    if (this.moktakMp3Buffer || !this.ctx) return this.moktakMp3Buffer;
    try {
      const res = await fetch('목탁소리.mp3');
      if (!res.ok) throw new Error('fetch failed');
      const arr = await res.arrayBuffer();
      this.moktakMp3Buffer = await this.ctx.decodeAudioData(arr);
      return this.moktakMp3Buffer;
    } catch (e) {
      return null;
    }
  }

  playMoktakBufferLoop(buffer) {
    if (!this.isMoktakLooping || !this.ctx || !buffer) return;
    if (this.moktakBufferSource) {
      try { this.moktakBufferSource.stop(); } catch (e) {}
      this.moktakBufferSource = null;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;

    const boostGain = this.ctx.createGain();
    // masterGain(0.85)을 감안하여 순수 출력이 약 5배 이상(6.0 * 0.85 = 5.1배) 되도록 증폭
    boostGain.gain.setValueAtTime(6.0, this.ctx.currentTime);

    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-2, this.ctx.currentTime);
    compressor.knee.setValueAtTime(6, this.ctx.currentTime);
    compressor.ratio.setValueAtTime(3, this.ctx.currentTime);

    src.connect(boostGain);
    boostGain.connect(compressor);
    compressor.connect(this.masterGain);
    src.start(0);
    this.moktakBufferSource = src;
  }

  toggleMoktakLoop(callback) {
    this.resume();
    if (this.isMoktakLooping) {
      this.stopMoktakLoop();
      if (callback) callback(false);
      return false;
    } else {
      this.stopYoryeongLoop();
      this.stopWindChimeLoop();
      this.isMoktakLooping = true;

      if (this.moktakMp3Buffer) {
        this.playMoktakBufferLoop(this.moktakMp3Buffer);
      } else {
        this.loadMoktakMp3Buffer().then((buf) => {
          if (!this.isMoktakLooping) return;
          if (buf) {
            this.playMoktakBufferLoop(buf);
          } else if (this.moktakAudio) {
            // file:// 환경 등에서 fetch 불가 시 MediaElementSource 없이 직접 재생(무음 방지)
            this.moktakAudio.currentTime = 0;
            this.moktakAudio.volume = 1.0;
            this.moktakAudio.muted = this.isMuted;
            this.moktakAudio.loop = true;
            const p = this.moktakAudio.play();
            if (p && typeof p.catch === 'function') {
              p.catch(() => {
                if (!this.isMoktakLooping) return;
                this.playSingleMoktak();
                this.moktakInterval = setInterval(() => this.playSingleMoktak(), 1250);
              });
            }
          } else {
            this.playSingleMoktak();
            this.moktakInterval = setInterval(() => this.playSingleMoktak(), 1250);
          }
        });
      }
      if (callback) callback(true);
      return true;
    }
  }

  stopMoktakLoop() {
    this.isMoktakLooping = false;
    if (this.moktakBufferSource) {
      try { this.moktakBufferSource.stop(); } catch (e) {}
      this.moktakBufferSource = null;
    }
    if (this.moktakInterval) {
      clearInterval(this.moktakInterval);
      this.moktakInterval = null;
    }
    if (this.moktakAudio) {
      this.moktakAudio.pause();
      this.moktakAudio.currentTime = 0;
    }
  }

  toggleYoryeongLoop(callback) {
    this.resume();
    if (this.isYoryeongLooping) {
      this.stopYoryeongLoop();
      if (callback) callback(false);
      return false;
    } else {
      this.stopMoktakLoop();
      this.stopWindChimeLoop();
      this.isYoryeongLooping = true;
      if (this.yoryeongAudio) {
        this.yoryeongAudio.currentTime = 0;
        this.yoryeongAudio.volume = 0.85;
        this.yoryeongAudio.muted = this.isMuted;
        this.yoryeongAudio.play().catch(() => {});
      }
      if (callback) callback(true);
      return true;
    }
  }

  stopYoryeongLoop() {
    this.isYoryeongLooping = false;
    if (this.yoryeongAudio) {
      this.yoryeongAudio.pause();
      this.yoryeongAudio.currentTime = 0;
    }
  }

  toggleWindChimeLoop(callback) {
    this.resume();
    if (this.isWindChimeLooping) {
      this.stopWindChimeLoop();
      if (callback) callback(false);
      return false;
    } else {
      this.stopMoktakLoop();
      this.stopYoryeongLoop();
      this.isWindChimeLooping = true;
      if (this.windChimeAudio) {
        this.windChimeAudio.currentTime = 0;
        this.windChimeAudio.volume = 0.85;
        this.windChimeAudio.muted = this.isMuted;
        const p = this.windChimeAudio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            this.playWindChime();
            this.windChimeInterval = setInterval(() => {
              this.playWindChime();
            }, 3600);
          });
        }
      } else {
        this.playWindChime();
        this.windChimeInterval = setInterval(() => {
          this.playWindChime();
        }, 3600);
      }
      if (callback) callback(true);
      return true;
    }
  }

  stopWindChimeLoop() {
    this.isWindChimeLooping = false;
    if (this.windChimeAudio) {
      try {
        this.windChimeAudio.pause();
        this.windChimeAudio.currentTime = 0;
      } catch (e) {}
    }
    if (this.windChimeInterval) {
      clearInterval(this.windChimeInterval);
      this.windChimeInterval = null;
    }
  }

  playSingingBowl(freq = 216, duration = 7.5) {
    this.resume();
    if (this.isMuted) return;

    const t = this.ctx.currentTime;
    const harmonics = [1, 2.01, 3.02, 4.85];
    const gains = [0.55, 0.22, 0.12, 0.04];

    harmonics.forEach((mult, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq * mult + (idx * 0.3), t);

      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(gains[idx], t + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + duration);
    });
  }

  playIgniteSound() {
    this.resume();
    if (this.isMuted) return;

    const t = this.ctx.currentTime;
    const bufSize = Math.floor(this.ctx.sampleRate * 0.18);
    const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.3));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, t);
    filter.Q.setValueAtTime(2.0, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(t);
  }

  // 산령각 청아한 처마 풍경소리
  playWindChime() {
    this.resume();
    if (this.isMuted) return;

    const now = this.ctx.currentTime;
    const strikes = [
      { delay: 0.00, baseFreq: 1318.5, gain: 0.24, decay: 3.4 },
      { delay: 0.34, baseFreq: 1760.0, gain: 0.19, decay: 2.9 },
      { delay: 0.78, baseFreq: 1567.98, gain: 0.16, decay: 3.2 }
    ];

    strikes.forEach((s) => {
      const start = now + s.delay;
      const partials = [
        { mult: 1.0, amp: 1.0, decay: s.decay },
        { mult: 2.02, amp: 0.42, decay: s.decay * 0.7 },
        { mult: 2.76, amp: 0.22, decay: s.decay * 0.5 }
      ];

      partials.forEach((p) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(s.baseFreq * p.mult, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(s.gain * p.amp, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + p.decay);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(start);
        osc.stop(start + p.decay + 0.05);
      });
    });
  }

  playFootstep(isStone = false) {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;

    const bufferSize = Math.floor(this.ctx.sampleRate * 0.06);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(isStone ? 850 : 380, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(t);
  }

  startAmbient() {
    this.resume();
    if (this.isAmbientPlaying) return;
    this.isAmbientPlaying = true;

    if (!this.hasPlayedBellIntro) {
      this.hasPlayedBellIntro = true;
      this.playTempleBell();
    }

    // 부드러운 산바람 배경음만 유지 (차임벨 자동 소리 완전 제거)
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const windSource = this.ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(240, this.ctx.currentTime);
    windFilter.Q.setValueAtTime(1.2, this.ctx.currentTime);

    const windGain = this.ctx.createGain();
    windGain.gain.setValueAtTime(0.025, this.ctx.currentTime);

    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(this.masterGain);

    windSource.start();
    this.ambientNodes.push(windSource, windGain);

    // [요청 반영] 도량에 들어서자마자 맑고 고요한 새소리가 즉시 들리고, 이후 자연스럽게 이어지도록 재생
    setTimeout(() => {
      if (this.isAmbientPlaying && !this.isMuted) {
        this.playBirdChirp();
      }
    }, 250);
    this.scheduleNextBirdChirp();
  }

  playBirdChirp() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // 2~4회 연속으로 청아하게 지저귀는 산새 소리
    const chirpCount = Math.floor(Math.random() * 3) + 2;
    const baseFreq = 2400 + Math.random() * 950; // 2400 ~ 3350Hz 맑은 숲속 새 음역대

    for (let i = 0; i < chirpCount; i++) {
      const startTime = t + i * (0.12 + Math.random() * 0.05);
      const dur = 0.09 + Math.random() * 0.04;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      const f1 = baseFreq * (0.92 + Math.random() * 0.15);
      const f2 = f1 * (1.28 + Math.random() * 0.32);
      const f3 = f1 * (1.05 + Math.random() * 0.15);

      osc.frequency.setValueAtTime(f1, startTime);
      osc.frequency.linearRampToValueAtTime(f2, startTime + dur * 0.4);
      osc.frequency.exponentialRampToValueAtTime(f3, startTime + dur);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(0.075, startTime + dur * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + dur);
    }
  }

  scheduleNextBirdChirp() {
    if (!this.isAmbientPlaying) return;
    const nextDelay = 2600 + Math.random() * 3400; // 2.6 ~ 6초 주기로 생기 있게 지저귐
    this.birdTimeout = setTimeout(() => {
      if (this.isAmbientPlaying) {
        this.playBirdChirp();
        this.scheduleNextBirdChirp();
      }
    }, nextDelay);
  }

  // [요청 반영] 전각 내부(대웅전, 산신각, 석굴암)에 들어서면 산새 소리 중지
  pauseBirdChirp() {
    if (this.birdTimeout) {
      clearTimeout(this.birdTimeout);
      this.birdTimeout = null;
    }
  }

  // [요청 반영] 마당으로 나오면 다시 평화로운 산새 소리 재개
  resumeBirdChirp() {
    if (this.isAmbientPlaying && !this.birdTimeout) {
      this.scheduleNextBirdChirp();
    }
  }

  // [관욕식 맑은 청수 감로수 물소리 효과음]
  playWaterPour() {
    this.resume();
    if (this.isMuted) return;

    const t = this.ctx.currentTime;
    const dur = 2.4;

    // 흐르는 물줄기 핑크 노이즈 버퍼
    const bufSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      data[i] = (b0 + b1 + b2) * 0.28 * Math.sin((i / bufSize) * Math.PI);
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(950, t);
    filter.frequency.linearRampToValueAtTime(1400, t + dur * 0.5);
    filter.frequency.linearRampToValueAtTime(800, t + dur);
    filter.Q.setValueAtTime(3.2, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.24, t + 0.35);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(t);
    noise.stop(t + dur);

    // 맑은 물방울(또르르) 톤
    [0.2, 0.55, 0.9, 1.3, 1.7].forEach((delay, idx) => {
      const osc = this.ctx.createOscillator();
      const dropGain = this.ctx.createGain();
      const st = t + delay;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200 + idx * 160, st);
      osc.frequency.exponentialRampToValueAtTime(650 + idx * 80, st + 0.12);

      dropGain.gain.setValueAtTime(0.06, st);
      dropGain.gain.exponentialRampToValueAtTime(0.0001, st + 0.12);

      osc.connect(dropGain);
      dropGain.connect(this.masterGain);

      osc.start(st);
      osc.stop(st + 0.13);
    });
  }

  stopAmbient() {
    this.isAmbientPlaying = false;
    this.stopMoktakLoop();
    if (this.birdTimeout) {
      clearTimeout(this.birdTimeout);
      this.birdTimeout = null;
    }
    this.ambientNodes.forEach(node => {
      try { node.stop(); } catch(e) {}
    });
    this.ambientNodes = [];
  }
}

window.templeAudio = new TempleAudio();

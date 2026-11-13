// 고품질 전통 사찰 사운드 엔진
// 차임벨(풍경) 자동 소리 제거 (배경엔 고요한 산바람만 흐름)

class TempleAudio {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
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

    // 풍경소리 루프 상태 (산령각)
    this.isWindChimeLooping = false;
    this.windChimeInterval = null;

    // 산속 새소리 스케줄러
    this.birdTimeout = null;
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
    return this.isMuted;
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
    gain.gain.setValueAtTime(0.95, this.ctx.currentTime);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    source.start(this.ctx.currentTime);
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
      if (this.moktakAudio) {
        this.moktakAudio.currentTime = 0;
        this.moktakAudio.volume = 0.85;
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
      if (callback) callback(true);
      return true;
    }
  }

  stopMoktakLoop() {
    this.isMoktakLooping = false;
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
      this.playWindChime();
      this.windChimeInterval = setInterval(() => {
        this.playWindChime();
      }, 3600);
      if (callback) callback(true);
      return true;
    }
  }

  stopWindChimeLoop() {
    this.isWindChimeLooping = false;
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

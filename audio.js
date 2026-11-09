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
    this.hasPlayedBellIntro = false;

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
      this.isMoktakLooping = true;
      this.playSingleMoktak();
      this.moktakInterval = setInterval(() => {
        this.playSingleMoktak();
      }, 1250);
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

  // [요청 반영] 차임벨 소리 완전 비활성화 (싱잉볼 및 목탁/범종만 허용)
  playWindChime() {
    // 차임벨 소리 제거: 사용자가 원하지 않으므로 무음 처리 또는 은은한 싱잉볼로 대체
    this.playSingingBowl();
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

    // [요청 반영] 산속 느낌이 물씬 나는 맑고 고요한 새소리 간헐적 재생
    this.scheduleNextBirdChirp();
  }

  playBirdChirp() {
    if (!this.ctx || this.isMuted) return;
    const t = this.ctx.currentTime;
    // 2~3회 연속으로 청아하게 지저귀는 산새 소리
    const chirpCount = Math.floor(Math.random() * 3) + 2;
    const baseFreq = 2600 + Math.random() * 900; // 2600 ~ 3500Hz 맑은 숲속 새 음역대

    for (let i = 0; i < chirpCount; i++) {
      const startTime = t + i * (0.11 + Math.random() * 0.05);
      const dur = 0.08 + Math.random() * 0.04;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      const f1 = baseFreq * (0.92 + Math.random() * 0.15);
      const f2 = f1 * (1.28 + Math.random() * 0.35);
      const f3 = f1 * (1.05 + Math.random() * 0.15);

      osc.frequency.setValueAtTime(f1, startTime);
      osc.frequency.linearRampToValueAtTime(f2, startTime + dur * 0.4);
      osc.frequency.exponentialRampToValueAtTime(f3, startTime + dur);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(0.045, startTime + dur * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(startTime);
      osc.stop(startTime + dur);
    }
  }

  scheduleNextBirdChirp() {
    if (!this.isAmbientPlaying) return;
    const nextDelay = 3500 + Math.random() * 4500; // 3.5 ~ 8초 주기
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

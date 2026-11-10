// 보문사 웹앱 메인 컨트롤러

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('canvas-container');
  const app = new Bomunsa3D(container);

  // UI 캐싱
  const muteBtn = document.getElementById('mute-btn');
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const locationCard = document.getElementById('location-card');
  const locationTitle = document.getElementById('location-title');
  const locationTag = document.getElementById('location-tag');
  const locationDesc = document.getElementById('location-desc');
  const enterBtn = document.getElementById('enter-btn');
  const meditationOverlay = document.getElementById('meditation-overlay');
  const templeHeaderGroup = document.getElementById('temple-header-group');
  const meditationTitle = document.getElementById('meditation-title');
  const meditationSub = document.getElementById('meditation-sub');
  const pagodaCounterCard = document.getElementById('pagoda-counter-card');
  const pagodaRoundDisplay = document.getElementById('pagoda-round-display');
  const pagodaRoundDesc = document.getElementById('pagoda-round-desc');
  const activePrayerBadge = document.getElementById('active-prayer-badge');
  const breathContainer = document.getElementById('breath-circle-container');
  const breathCircle = document.getElementById('breath-circle');
  const startMeditationBtn = document.getElementById('start-meditation-btn');
  const meditationBtnText = document.getElementById('meditation-btn-text');
  const breathText = document.getElementById('breath-text');
  const exitBtn = document.getElementById('exit-btn');
  const navPills = document.querySelectorAll('.nav-pill');

  // 컨트롤 버튼들
  const bowBtn = document.getElementById('bow-btn');
  const bowText = document.getElementById('bow-text');
  const bowStatusCard = document.getElementById('bow-status-card');
  const bowStatusText = document.getElementById('bow-status-text');
  const instrumentBtn = document.getElementById('instrument-btn');
  const instrumentText = document.getElementById('instrument-text');
  const candleBtn = document.getElementById('candle-btn');
  const candleText = document.getElementById('candle-text');
  const incenseBtn = document.getElementById('incense-btn');
  const incenseText = document.getElementById('incense-text');

  // 발원문 모달
  const openPrayerBtn = document.getElementById('open-prayer-btn');
  const prayerModalOverlay = document.getElementById('prayer-modal-overlay');
  const prayerModalTitle = document.getElementById('prayer-modal-title');
  const prayerInput = document.getElementById('prayer-input');
  const prayerSubmitBtn = document.getElementById('prayer-submit-btn');
  const prayerCancelBtn = document.getElementById('prayer-cancel-btn');

  let breathInterval = null;
  function startBreathTextLoop() {
    let isInhale = true;
    breathText.textContent = '숨을 들이마십니다...';
    if (breathInterval) clearInterval(breathInterval);
    breathInterval = setInterval(() => {
      isInhale = !isInhale;
      breathText.textContent = isInhale ? '숨을 들이마십니다...' : '숨을 고요히 비웁니다...';
    }, 4000);
  }

  function stopBreathTextLoop() {
    if (breathInterval) {
      clearInterval(breathInterval);
      breathInterval = null;
    }
  }

  function refreshPrayerBadge(locationId) {
    const saved = localStorage.getItem(`bomunsa_prayer_${locationId}`);
    if (saved) {
      activePrayerBadge.textContent = `🙏 나의 발원: "${saved}"`;
      activePrayerBadge.classList.add('visible');
    } else {
      activePrayerBadge.classList.remove('visible');
    }
  }

  // 1. 전각 근접 시 카드 업데이트
  window.onLocationChanged = (loc) => {
    if (!loc) {
      locationCard.classList.remove('visible');
      navPills.forEach(p => p.classList.remove('active'));
      return;
    }

    locationTitle.textContent = loc.name;
    locationDesc.textContent = loc.desc;
    locationTag.textContent = loc.enterable ? '참배 및 명상 가능 도량' : '경내 안내';

    if (loc.enterable) {
      enterBtn.style.display = 'flex';
      if (loc.id === 'pagoda') {
        enterBtn.innerHTML = '<span>🚶</span> 탑돌이 (사색 걷기) 시작';
      } else {
        enterBtn.innerHTML = '<span>🚪</span> 전각 안으로 입장하기';
      }
    } else {
      enterBtn.style.display = 'none';
    }

    locationCard.classList.add('visible');

    navPills.forEach(p => {
      if (p.dataset.id === loc.id) p.classList.add('active');
      else p.classList.remove('active');
    });
  };

  // 2. 하단 내비게이션 탭 클릭 (전각 정면 이동)
  navPills.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      locationCard.classList.remove('visible'); // [요청 반영] 이동 중에는 팝업을 닫고, 바로 앞에 설 때까지 대기!
      app.walkToLocation(id);
      navPills.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 3. 탑돌이 라운드 카운터 업데이트: [사용자 요청 반영: 1/3 제거, 2줄 표시 (1줄 몇번째, 2줄 발원 내용)]
  window.onPagodaRoundUpdate = (roundTitle, roundDesc, isFinished = false, isBowing = false) => {
    pagodaCounterCard.classList.add('visible');
    if (isBowing) {
      pagodaRoundDisplay.textContent = roundTitle || '합장 반배(半拜) 올리기 🙏';
      pagodaRoundDisplay.style.color = '#ffd766';
      pagodaRoundDesc.textContent = roundDesc;
      bowBtn.classList.add('active');
      bowText.textContent = '합장 반배 중... 🙏';
    } else if (isFinished) {
      pagodaRoundDisplay.textContent = roundTitle || '탑돌이 원만 회향 🙏';
      pagodaRoundDisplay.style.color = '#ffd766';
      pagodaRoundDesc.textContent = roundDesc;
      // 3바퀴 완료 시 버튼을 '탑돌이 다시 시작'으로 전환
      bowBtn.classList.remove('active');
      bowText.textContent = '탑돌이 다시 시작';
    } else {
      pagodaRoundDisplay.textContent = roundTitle;
      pagodaRoundDisplay.style.color = '#ffd766';
      pagodaRoundDesc.textContent = roundDesc;
      bowBtn.classList.add('active');
      bowText.textContent = '탑돌이 멈추기';
    }
  };

  // 4. 전각 입장 / 탑돌이 시작
  enterBtn.addEventListener('click', () => {
    if (!app.activeLocation) return;
    const currentLoc = app.activeLocation;

    locationCard.classList.remove('visible');
    document.body.classList.add('in-meditation');

    app.enterCurrentBuilding();
    refreshPrayerBadge(currentLoc.id);

    // 버튼 초기화 (사용자 요청 반영: 처음에 들어가면 향과 초가 꺼진 상태로 시작)
    instrumentBtn.classList.remove('active');
    candleBtn.classList.remove('active');
    candleText.textContent = '초 켜기';
    incenseBtn.classList.remove('active');
    incenseText.textContent = '향 피우기';

    if (currentLoc.id === 'pagoda') {
      // [요청 반영] 탑돌이 시: 상단 중복 제목 숨기고 전용 탑돌이 카드만 1번 깔끔하게 표시!
      templeHeaderGroup.style.display = 'none';
      pagodaCounterCard.classList.add('visible');
      breathContainer.style.display = 'none';
      startMeditationBtn.style.display = 'none';
      candleBtn.style.display = 'none';
      incenseBtn.style.display = 'none';

      // [요청 반영] 묘보탑 이동 시 3배 대신 '탑돌이' 표출 (시작 시 합장 반배 진행)
      bowBtn.style.gridColumn = '1 / -1';
      bowBtn.classList.add('active');
      bowText.textContent = '합장 반배 중... 🙏';

      instrumentText.textContent = '🪵 목탁 울리기';
      instrumentBtn.onclick = () => {
        window.templeAudio.toggleMoktakLoop((isLooping) => {
          if (isLooping) {
            instrumentBtn.classList.add('active');
            instrumentText.textContent = '🪵 목탁 멈추기';
          } else {
            instrumentBtn.classList.remove('active');
            instrumentText.textContent = '🪵 목탁 울리기';
          }
        });
      };
    } else {
      // 전각 내부 법당 모드
      templeHeaderGroup.style.display = 'block';
      pagodaCounterCard.classList.remove('visible');
      breathContainer.style.display = 'flex';
      startMeditationBtn.style.display = 'flex';
      candleBtn.style.display = 'flex';
      incenseBtn.style.display = 'flex';
      bowBtn.style.gridColumn = '';
      bowBtn.classList.remove('active');
      bowText.textContent = '삼배 올리기';

      // [요청 반영] 불상과 제단 시야 확보: 호흡 가이드 원은 평소 숨김 처리
      isMeditationActive = false;
      stopBreathTextLoop();
      breathContainer.style.display = 'none';
      startMeditationBtn.classList.remove('active');
      if (meditationBtnText) meditationBtnText.textContent = '호흡 명상';

      if (currentLoc.id === 'seokguram') {
        meditationTitle.textContent = '보문사 석굴암';
        if (meditationSub) meditationSub.style.display = 'none';
        instrumentText.textContent = '싱잉볼 치기';
        instrumentBtn.onclick = () => {
          window.templeAudio.stopMoktakLoop();
          window.templeAudio.playSingingBowl(196, 8.0);
        };
      } else if (currentLoc.id === 'daewoong') {
        meditationTitle.textContent = '보문사 대웅전';
        if (meditationSub) meditationSub.style.display = 'none';
        instrumentText.textContent = '목탁 울리기';
        instrumentBtn.onclick = () => {
          window.templeAudio.toggleMoktakLoop((isLooping) => {
            if (isLooping) {
              instrumentBtn.classList.add('active');
              instrumentText.textContent = '목탁 멈추기';
            } else {
              instrumentBtn.classList.remove('active');
              instrumentText.textContent = '목탁 울리기';
            }
          });
        };
      } else if (currentLoc.id === 'sansin') {
        meditationTitle.textContent = '보문사 산신각';
        if (meditationSub) meditationSub.style.display = 'none';
        instrumentText.textContent = '싱잉볼 치기';
        instrumentBtn.onclick = () => {
          window.templeAudio.stopMoktakLoop();
          window.templeAudio.playSingingBowl();
        };
      }
    }

    meditationOverlay.classList.add('active');
  });

  // [요청 반영] '호흡 명상' 메뉴 버튼 토글 (불단을 가리지 않고 필요할 때만 켜고 끔)
  let isMeditationActive = false;
  startMeditationBtn.addEventListener('click', () => {
    isMeditationActive = !isMeditationActive;
    if (isMeditationActive) {
      startMeditationBtn.classList.add('active');
      if (meditationBtnText) meditationBtnText.textContent = '명상 멈추기';
      breathContainer.style.display = 'flex';
      breathCircle.className = 'breath-circle active';

      if (window.templeAudio) {
        window.templeAudio.playSingleMoktak();
      }
      startBreathTextLoop();
    } else {
      startMeditationBtn.classList.remove('active');
      if (meditationBtnText) meditationBtnText.textContent = '호흡 명상';
      stopBreathTextLoop();
      breathContainer.style.display = 'none';
    }
  });

  // [사용자 요청 반영: 삼배 인터랙션 (1/3 표기 제거)]
  const bowMeanings = [
    '첫 번째 절: 지난 모든 허물과 번뇌를 비워냅니다.',
    '두 번째 절: 모든 이웃과 생명을 향해 자비로운 마음을 품습니다.',
    '세 번째 절: 지혜와 평안이 가득한 삶을 간절히 발원합니다.'
  ];

  bowBtn.addEventListener('click', () => {
    // [요청 반영: 묘보탑 이동 시 3배 대신 탑돌이 수행]
    if (app.activeLocation && app.activeLocation.id === 'pagoda') {
      const isRunning = app.togglePagodaSpin();
      if (app.isPagodaBowing) {
        bowBtn.classList.add('active');
        bowText.textContent = '합장 반배 중... 🙏';
      } else if (isRunning) {
        bowBtn.classList.add('active');
        bowText.textContent = '탑돌이 멈추기';
      } else {
        bowBtn.classList.remove('active');
        bowText.textContent = '탑돌이 재개';
      }
      return;
    }

    if (app.isBowing) return;
    bowBtn.classList.add('active');
    bowText.textContent = '삼배 올리는 중...';
    bowStatusCard.style.display = 'block';

    app.performThreeBows(
      (currentBow, totalBows) => {
        bowStatusText.textContent = bowMeanings[currentBow - 1];
      },
      () => {
        bowBtn.classList.remove('active');
        bowText.textContent = '삼배 올리기';
        bowStatusText.textContent = '정성스런 삼배를 마쳤습니다. 마음이 깊이 맑아집니다.';
        setTimeout(() => {
          if (!app.isBowing) {
            bowStatusCard.style.display = 'none';
          }
        }, 4500);
      }
    );
  });

  // 초 켜기/끄기 인터랙션
  candleBtn.addEventListener('click', () => {
    const isLit = app.lightCandles();
    if (isLit) {
      candleBtn.classList.add('active');
      candleText.textContent = '촛불 공양 중';
    } else {
      candleBtn.classList.remove('active');
      candleText.textContent = '초 켜기';
    }
  });

  // 향 피우기/끄기 인터랙션
  incenseBtn.addEventListener('click', () => {
    const isLit = app.lightIncense();
    if (isLit) {
      incenseBtn.classList.add('active');
      incenseText.textContent = '향 공양 중';
    } else {
      incenseBtn.classList.remove('active');
      incenseText.textContent = '향 피우기';
    }
  });

  // 5. 사찰 마당으로 나가기
  exitBtn.addEventListener('click', () => {
    meditationOverlay.classList.remove('active');
    pagodaCounterCard.classList.remove('visible');
    activePrayerBadge.classList.remove('visible');
    bowStatusCard.style.display = 'none';
    bowBtn.classList.remove('active');
    bowBtn.style.gridColumn = '';
    bowText.textContent = '삼배 올리기';

    startMeditationBtn.style.display = 'flex';
    candleBtn.style.display = 'flex';
    incenseBtn.style.display = 'flex';

    isMeditationActive = false;
    startMeditationBtn.classList.remove('active');
    if (meditationBtnText) meditationBtnText.textContent = '호흡 명상';
    stopBreathTextLoop();
    breathContainer.style.display = 'none';

    if (window.templeAudio) window.templeAudio.stopMoktakLoop();
    instrumentBtn.classList.remove('active');

    document.body.classList.remove('in-meditation');
    app.exitBuilding();

    if (app.activeLocation) {
      locationCard.classList.add('visible');
    }
  });

  // 6. 발원문 팝업 모달
  openPrayerBtn.addEventListener('click', () => {
    if (!app.activeLocation) return;
    prayerModalTitle.textContent = `${app.activeLocation.name} 발원문(發願文)`;
    const saved = localStorage.getItem(`bomunsa_prayer_${app.activeLocation.id}`) || '';
    prayerInput.value = saved;
    prayerModalOverlay.classList.add('active');
    prayerInput.focus();
  });

  prayerCancelBtn.addEventListener('click', () => {
    prayerModalOverlay.classList.remove('active');
  });

  prayerSubmitBtn.addEventListener('click', () => {
    const text = prayerInput.value.trim();
    if (!text) {
      alert('발원문 내용을 적어주세요.');
      return;
    }

    if (app.activeLocation) {
      localStorage.setItem(`bomunsa_prayer_${app.activeLocation.id}`, text);
      refreshPrayerBadge(app.activeLocation.id);
    }

    prayerModalOverlay.classList.remove('active');

    if (window.templeAudio) {
      window.templeAudio.playSingingBowl(240, 8.0);
    }
  });

  // 7. 사운드 토글
  muteBtn.addEventListener('click', () => {
    if (!window.templeAudio) return;
    window.templeAudio.resume();
    window.templeAudio.startAmbient();
    const isMuted = window.templeAudio.toggleMute();
    muteBtn.textContent = isMuted ? '🔇' : '🔔';
  });

  // 8. 전체화면 토글
  fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // [요청 반영] 보문사에 들어서면(첫 화면 터치/클릭 시) 장엄한 대형 범종 소리가 도량에 울려 퍼짐
  const firstTouchHandler = () => {
    if (window.templeAudio) {
      window.templeAudio.resume();
      window.templeAudio.startAmbient(); // 내부에서 첫 타종으로 playTempleBell() 자동 실행
    }
    window.removeEventListener('click', firstTouchHandler);
    window.removeEventListener('touchstart', firstTouchHandler);
  };
  window.addEventListener('click', firstTouchHandler);
  window.addEventListener('touchstart', firstTouchHandler);
});

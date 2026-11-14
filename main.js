// 저 절로 웹앱 메인 컨트롤러

document.addEventListener('DOMContentLoaded', () => {
  // [사용자 요청 반영: 대문 진입 전 정지화면 스플래시 (절로 절로 저 절로 / 도심속 / 천년고찰 / 비구니 사찰입니다.)]
  const splashOverlay = document.getElementById('splash-overlay');
  if (splashOverlay) {
    const dismissSplash = () => {
      splashOverlay.classList.add('hidden');
    };
    const splashTimer = setTimeout(dismissSplash, 2800);
    splashOverlay.addEventListener('click', () => {
      clearTimeout(splashTimer);
      dismissSplash();
    });
  }

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
  const bellReturnBtn = document.getElementById('bell-return-btn');
  const gwanyokMeditationMsg = document.getElementById('gwanyok-meditation-msg');
  let bellMsgTimer = null;

  function setBellReturnVisible(visible) {
    if (bellReturnBtn) {
      bellReturnBtn.style.display = visible ? 'inline-flex' : 'none';
    }
    document.body.classList.toggle('beomjong-ready', Boolean(visible));
  }
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
  const openPrayerText = document.getElementById('open-prayer-text');
  const prayerModalOverlay = document.getElementById('prayer-modal-overlay');
  const prayerModalTitle = document.getElementById('prayer-modal-title');
  const prayerModalDesc = document.getElementById('prayer-modal-desc');
  const prayerInput = document.getElementById('prayer-input');
  const prayerSubmitBtn = document.getElementById('prayer-submit-btn');
  const prayerCancelBtn = document.getElementById('prayer-cancel-btn');

  // 오른쪽 '발원문 보기' 버튼 & 타인 발원문 목록 모달
  const viewPrayersBtn = document.getElementById('view-prayers-btn');
  const prayersListModalOverlay = document.getElementById('prayers-list-modal-overlay');
  const prayersListModalTitle = document.getElementById('prayers-list-modal-title');
  const prayersListBody = document.getElementById('prayers-list-body');
  const prayersListCloseBtn = document.getElementById('prayers-list-close-btn');
  const PRAYER_LOCATION_IDS = new Set(['daewoong', 'jijang', 'seokguram', 'sansin', 'pagoda']);

  function updateViewPrayersBtn(loc) {
    if (!viewPrayersBtn) return;
    if (loc && PRAYER_LOCATION_IDS.has(loc.id)) {
      viewPrayersBtn.style.display = 'inline-flex';
    } else {
      viewPrayersBtn.style.display = 'none';
    }
  }

  async function renderPrayersListModal(loc) {
    if (!prayersListBody || !loc) return;
    if (prayersListModalTitle) {
      prayersListModalTitle.innerHTML = `${WHITE_LOTUS_SVG}<span>${loc.name} 발원문</span>`;
    }
    prayersListBody.innerHTML = '<div class="prayers-list-empty">발원문을 불러오는 중입니다...</div>';
    const prayers = window.templeSync
      ? await window.templeSync.fetchPrayers(loc.id)
      : [];
    // 다른 참배객들이 올린 발원문을 올라온 순서대로 위에서 아래로 차곡차곡 표시
    const othersPrayers = prayers.filter(p => !p.isMine).slice().reverse();

    prayersListBody.innerHTML = '';
    if (othersPrayers.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'prayers-list-empty';
      emptyEl.textContent = '아직 이 전각에 다른 참배객이 올린 발원문이 없습니다.';
      prayersListBody.appendChild(emptyEl);
      return;
    }

    othersPrayers.forEach((pItem, idx) => {
      const card = document.createElement('div');
      card.className = 'prayers-list-item';

      const tag = document.createElement('div');
      tag.className = 'prayers-list-item-tag';
      tag.style.color = '#7a5a10';
      tag.innerHTML = `${WHITE_LOTUS_SVG}<span>${loc.id === 'jijang' ? `도량 영가등 ${idx + 1}` : `참배객 발원 ${idx + 1}`}</span>`;

      const textEl = document.createElement('div');
      textEl.className = 'prayers-list-item-text';
      textEl.style.color = '#1a1714';
      textEl.textContent = pItem.text;

      card.appendChild(tag);
      card.appendChild(textEl);
      prayersListBody.appendChild(card);
    });
  }

  if (viewPrayersBtn) {
    viewPrayersBtn.addEventListener('click', () => {
      const loc = app.activeLocation;
      if (!loc) return;
      renderPrayersListModal(loc);
      if (prayersListModalOverlay) {
        prayersListModalOverlay.classList.add('active');
      }
    });
  }
  if (prayersListCloseBtn) {
    prayersListCloseBtn.addEventListener('click', () => {
      if (prayersListModalOverlay) prayersListModalOverlay.classList.remove('active');
    });
  }
  if (prayersListModalOverlay) {
    prayersListModalOverlay.addEventListener('click', (e) => {
      if (e.target === prayersListModalOverlay) {
        prayersListModalOverlay.classList.remove('active');
      }
    });
  }

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

  // 하얀 연꽃 로고 공통 SVG 마크업
  const WHITE_LOTUS_SVG = '<svg class="white-lotus-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#ffffff" stroke="#c8a858" stroke-width="0.9" stroke-linejoin="round" d="M12 2.5C10.2 6.2 9.4 9.6 12 14.5C14.6 9.6 13.8 6.2 12 2.5Z M12 14.5C8.5 11.2 5.4 9.2 3.2 11.2C4.2 14.4 7.5 16.5 12 16.5Z M12 14.5C15.5 11.2 18.6 9.2 20.8 11.2C19.8 14.4 16.5 16.5 12 16.5Z M12 16.5C7.2 16.5 3.6 15.2 1.8 16.8C4.4 19.6 8.2 20.2 12 20.2C15.8 20.2 19.6 19.6 22.2 16.8C20.4 15.2 16.8 16.5 12 16.5Z"/></svg>';

  // 동시접속 인원 배지 및 실시간 동기화 연결
  const presenceBadge = document.getElementById('presence-badge');
  if (window.templeSync) {
    if (presenceBadge && !window.templeSync.isConfigured) {
      presenceBadge.textContent = '👥 도량 1명';
    }
    window.templeSync.onPresenceChange = ({ count, isConfigured }) => {
      if (!presenceBadge) return;
      const displayCount = isConfigured ? (count || 1) : 1;
      presenceBadge.textContent = `👥 도량 ${displayCount}명`;
      presenceBadge.classList.remove('solo-mode');
    };
    window.templeSync.onRemoteStatesChange = (states) => {
      if (app.syncRemotePilgrims) {
        app.syncRemotePilgrims(states);
      }
    };
    window.templeSync.onPrayersUpdated = (locId) => {
      if (app.activeLocation && (!locId || app.activeLocation.id === locId)) {
        refreshPrayerBadge(app.activeLocation.id);
        if (prayersListModalOverlay && prayersListModalOverlay.classList.contains('active')) {
          renderPrayersListModal(app.activeLocation);
        }
      }
    };
  }

  // 발원문 목록 및 수정 대상 (모든 전각 공통)
  let jijangPrayers = [];
  let editingPrayerTarget = null;

  function openPrayerEditModal(loc, targetItem = null) {
    if (!loc) return;
    editingPrayerTarget = targetItem;
    if (loc.id === 'jijang') {
      if (targetItem !== null && targetItem !== undefined) {
        prayerModalTitle.innerHTML = `${WHITE_LOTUS_SVG}<span>지장전 발원문 변경하기</span>`;
        if (prayerModalDesc) {
          prayerModalDesc.textContent = '올려둔 영가등의 극락왕생·업장소멸 발원문 내용을 수정합니다.';
        }
        prayerInput.value = targetItem.text || '';
        prayerSubmitBtn.innerHTML = `${WHITE_LOTUS_SVG}<span>발원문 수정 완료</span>`;
      } else {
        prayerModalTitle.innerHTML = `${WHITE_LOTUS_SVG}<span>지장전 영가등 올리고 소원빌기</span>`;
        if (prayerModalDesc) {
          prayerModalDesc.textContent = '돌아가신 분을 위한 극락왕생(極樂往生)과 업장소멸(業障消滅)의 소원을 빌면 천정의 회색 영가등에 노란 불빛이 하나씩 밝게 켜집니다.';
        }
        prayerInput.placeholder = '예: 사랑하는 고인의 극락왕생과 모든 업장소멸을 간절히 발원합니다...';
        prayerInput.value = '';
        prayerSubmitBtn.innerHTML = `${WHITE_LOTUS_SVG}<span>영가등 추가하고 소원 빌기</span>`;
      }
    } else {
      if (targetItem !== null && targetItem !== undefined) {
        prayerModalTitle.innerHTML = `${WHITE_LOTUS_SVG}<span>${loc.name} 발원문 변경하기</span>`;
        if (prayerModalDesc) {
          prayerModalDesc.textContent = '올려둔 발원문 내용을 수정합니다.';
        }
        prayerInput.value = targetItem.text || '';
        prayerSubmitBtn.innerHTML = `${WHITE_LOTUS_SVG}<span>발원문 수정 완료</span>`;
      } else {
        prayerModalTitle.innerHTML = `${WHITE_LOTUS_SVG}<span>${loc.name} 발원문(發願文)</span>`;
        if (prayerModalDesc) {
          prayerModalDesc.textContent = '고요히 두 손을 모으고 마음속 간절한 서원(소원)을 적어보세요.';
        }
        prayerInput.placeholder = '예: 가족 모두의 건강과 마음의 평안을 발원합니다...';
        prayerInput.value = '';
        prayerSubmitBtn.innerHTML = `${WHITE_LOTUS_SVG}<span>발원 올리기</span>`;
      }
    }
    prayerModalOverlay.classList.add('active');
    prayerInput.focus();
  }

  function attachPrayerBadgeActions(itemDiv, locId, pItem) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'prayer-badge-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'prayer-action-btn';
    editBtn.textContent = '발원문 변경';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const loc = app.activeLocation || { id: locId, name: locId };
      openPrayerEditModal(loc, pItem);
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'prayer-action-btn turn-off';
    delBtn.textContent = locId === 'jijang' ? '등 끄기' : '발원문 지우기';
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (window.templeSync) {
        await window.templeSync.deletePrayer(locId, pItem.id);
      }
      refreshPrayerBadge(locId);
    });

    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(delBtn);
    itemDiv.appendChild(actionsDiv);

    itemDiv.addEventListener('mouseenter', () => {
      activePrayerBadge.querySelectorAll('.prayer-badge-item').forEach(el => {
        if (el !== itemDiv) el.classList.remove('show-actions');
      });
      itemDiv.classList.add('show-actions');
    });
    itemDiv.addEventListener('mouseleave', () => {
      itemDiv.classList.remove('show-actions');
    });

    itemDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      const willShow = !itemDiv.classList.contains('show-actions');
      activePrayerBadge.querySelectorAll('.prayer-badge-item').forEach(el => {
        el.classList.remove('show-actions');
      });
      if (willShow) itemDiv.classList.add('show-actions');
    });
  }

  async function refreshPrayerBadge(locationId) {
    const prayers = window.templeSync
      ? await window.templeSync.fetchPrayers(locationId)
      : [];
    // 내 기기(폰) 상단에는 내가 올린 발원문만 표시하여 전각 화면이 가려지지 않도록 관리
    const myPrayers = prayers.filter(p => p.isMine);

    if (locationId === 'jijang') {
      jijangPrayers = myPrayers;
      if (app.syncJijangLanterns) {
        app.syncJijangLanterns(prayers.length);
      }
      if (openPrayerText) {
        openPrayerText.textContent = myPrayers.length > 0 ? '영가등 추가하고 소원빌기' : '영가등 올리고 소원빌기';
      }
      if (myPrayers.length > 0) {
        activePrayerBadge.innerHTML = '';
        myPrayers.forEach((pItem) => {
          const itemDiv = document.createElement('div');
          itemDiv.className = 'prayer-badge-item';

          const titleDiv = document.createElement('div');
          titleDiv.className = 'prayer-badge-title';
          titleDiv.innerHTML = `${WHITE_LOTUS_SVG}<span>${pItem.isMine ? '나의 영가등 · 극락왕생 소원' : '도량 영가등 · 극락왕생 소원'}</span>`;

          const textDiv = document.createElement('div');
          textDiv.className = 'prayer-badge-text';
          textDiv.textContent = pItem.text;

          itemDiv.appendChild(titleDiv);
          itemDiv.appendChild(textDiv);

          if (pItem.isMine) {
            attachPrayerBadgeActions(itemDiv, 'jijang', pItem);
          }

          activePrayerBadge.appendChild(itemDiv);
        });
        activePrayerBadge.classList.add('visible');
      } else {
        activePrayerBadge.innerHTML = '';
        activePrayerBadge.classList.remove('visible');
      }
      return;
    }

    if (myPrayers.length > 0) {
      activePrayerBadge.innerHTML = '';
      myPrayers.forEach((pItem) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'prayer-badge-item';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'prayer-badge-title';
        titleDiv.innerHTML = `${WHITE_LOTUS_SVG}<span>나의 발원</span>`;

        const textDiv = document.createElement('div');
        textDiv.className = 'prayer-badge-text';
        textDiv.textContent = pItem.text;

        itemDiv.appendChild(titleDiv);
        itemDiv.appendChild(textDiv);
        attachPrayerBadgeActions(itemDiv, locationId, pItem);
        activePrayerBadge.appendChild(itemDiv);
      });
      activePrayerBadge.classList.add('visible');
    } else {
      activePrayerBadge.innerHTML = '';
      activePrayerBadge.classList.remove('visible');
    }
  }

  // 발원문 배지 바깥 영역을 터치/클릭하면 수정 메뉴 닫기
  const hidePrayerActionsOutside = (e) => {
    if (!activePrayerBadge) return;
    if (!e.target.closest || !e.target.closest('.prayer-badge-item')) {
      activePrayerBadge.querySelectorAll('.prayer-badge-item.show-actions').forEach(el => {
        el.classList.remove('show-actions');
      });
    }
  };
  document.addEventListener('pointerdown', hidePrayerActionsOutside);
  document.addEventListener('touchstart', hidePrayerActionsOutside, { passive: true });
  document.addEventListener('click', hidePrayerActionsOutside);

  // 대기 / 순서 안내 토스트
  const turnToast = document.getElementById('turn-toast');
  let turnToastTimer = null;
  function showTurnToast(msg, isReady = false, autoHideMs = 0) {
    if (!turnToast) return;
    if (turnToastTimer) {
      clearTimeout(turnToastTimer);
      turnToastTimer = null;
    }
    if (!msg) {
      turnToast.style.display = 'none';
      turnToast.classList.remove('ready');
      return;
    }
    turnToast.textContent = msg;
    turnToast.classList.toggle('ready', !!isReady);
    turnToast.style.display = 'block';
    if (autoHideMs > 0) {
      turnToastTimer = setTimeout(() => {
        turnToast.style.display = 'none';
        turnToast.classList.remove('ready');
        turnToastTimer = null;
      }, autoHideMs);
    }
  }

  window.onTurnReady = (loc) => {
    if (!loc) return;
    showTurnToast(`🔔 순서가 되었습니다! 이제 ${loc.name}을(를) 이용하실 수 있습니다.`, true, 5000);
    window.templeAudio?.playSingleMoktak();
  };

  // 1. 전각 근접 시 카드 업데이트
  const hojimunPill = document.querySelector('.nav-pill[data-id="hojimun"]');
  window.onLocationChanged = (loc) => {
    if (bellMsgTimer) {
      clearTimeout(bellMsgTimer);
      bellMsgTimer = null;
    }
    if (!loc) {
      locationCard.classList.remove('visible');
      navPills.forEach(p => p.classList.remove('active'));
      if (hojimunPill) hojimunPill.textContent = '🚪 입구';
      setBellReturnVisible(false);
      updateViewPrayersBtn(null);
      if (gwanyokMeditationMsg) gwanyokMeditationMsg.style.display = 'none';
      if (locationDesc) locationDesc.style.display = '';
      enterBtn.disabled = false;
      if (turnToast && !turnToast.classList.contains('ready')) {
        showTurnToast(null);
      }
      return;
    }
    updateViewPrayersBtn(loc);
    if (hojimunPill) {
      hojimunPill.textContent = loc.id === 'hojimun' ? '🚪 입장' : '🚪 입구';
    }

    if (loc.id === 'jijang') {
      locationTitle.innerHTML = `${WHITE_LOTUS_SVG}<span>${loc.name}</span>`;
    } else {
      locationTitle.textContent = loc.name;
    }
    locationDesc.textContent = loc.desc;
    locationDesc.style.display = '';
    if (locationTag) locationTag.style.display = 'none';
    if (gwanyokMeditationMsg) gwanyokMeditationMsg.style.display = 'none';

    if (loc.id !== 'beomjong') {
      setBellReturnVisible(false);
    }

    if (loc.enterable) {
      enterBtn.style.display = 'flex';
      if (loc.occupiedByOther) {
        enterBtn.disabled = true;
        const rankText = loc.queueRank > 0
          ? ` (${loc.queueRank}번째 대기 중${loc.queueTotal > 1 ? ` / 총 ${loc.queueTotal}명` : ''})`
          : '';
        enterBtn.innerHTML = `<span>⏳</span> 순서 기다리는 중${rankText}`;
        showTurnToast(`⏳ 앞선 참배객이 이용 중입니다.${loc.queueRank > 0 ? ` 현재 대기 ${loc.queueRank}번째입니다.` : ''} 잠시만 기다려 주세요.`, false, 0);
      } else {
        enterBtn.disabled = false;
        if (turnToast && !turnToast.classList.contains('ready')) {
          showTurnToast(null);
        }
        if (loc.id === 'pagoda') {
          enterBtn.innerHTML = '<span>🚶</span> 탑돌이 (사색 걷기) 시작';
        } else if (loc.id === 'beomjong') {
          if (app.isBeomjongReady) {
            enterBtn.innerHTML = '<span>🔔</span> 타종하기';
            setBellReturnVisible(true);
          } else {
            enterBtn.innerHTML = '<span>🔔</span> 타종준비';
            setBellReturnVisible(false);
          }
        } else if (loc.id === 'gwanyok') {
          enterBtn.innerHTML = '<span>💧</span> 아기 부처님 관욕식 올리기';
        } else {
          enterBtn.innerHTML = '<span>🚪</span> 전각 안으로 입장하기';
        }
      }
    } else {
      enterBtn.disabled = false;
      enterBtn.style.display = 'none';
      if (turnToast && !turnToast.classList.contains('ready')) {
        showTurnToast(null);
      }
    }

    locationCard.classList.add('visible');

    navPills.forEach(p => {
      if (p.dataset.id === loc.id) p.classList.add('active');
      else p.classList.remove('active');
    });
  };

  // 초기 시작 시 캐릭터가 입구(hojimun) 앞에 서 있으면 즉시 하단 메뉴를 '입장'으로 갱신
  if (app.activeLocation) {
    window.onLocationChanged(app.activeLocation);
  }

  // 2. 하단 내비게이션 탭 클릭 (전각 정면 이동)
  navPills.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      locationCard.classList.remove('visible'); // [요청 반영] 이동 중에는 팝업을 닫고, 바로 앞에 설 때까지 대기!
      if (id === 'hojimun' && ((app.activeLocation && app.activeLocation.id === 'hojimun') || app.playerPos.z >= 29.5)) {
        if (app.enterTempleGate) app.enterTempleGate();
        return;
      }
      app.walkToLocation(id);
      navPills.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 3. 탑돌이 라운드 카운터 업데이트: [사용자 요청 반영: 1/3 및 🙏 제거, 깔끔한 2줄 표시]
  window.onPagodaRoundUpdate = (roundTitle, roundDesc, isFinished = false, isBowing = false) => {
    pagodaCounterCard.classList.add('visible');
    if (isBowing) {
      pagodaRoundDisplay.textContent = roundTitle || '합장 반배(半拜) 올리기';
      pagodaRoundDisplay.style.color = '#ffd766';
      pagodaRoundDesc.textContent = roundDesc;
      bowBtn.classList.add('active');
      bowText.textContent = '합장 반배 중...';
    } else if (isFinished) {
      pagodaRoundDisplay.textContent = roundTitle || '탑돌이 원만 회향';
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

  // 4. 전각 입장 / 탑돌이 시작 / 범종 타종
  enterBtn.addEventListener('click', () => {
    if (!app.activeLocation) return;
    const currentLoc = app.activeLocation;

    if (currentLoc.id === 'beomjong') {
      if (!app.isBeomjongReady) {
        if (app.prepareBeomjongBell) app.prepareBeomjongBell();
        enterBtn.innerHTML = '<span>🔔</span> 타종하기';
        setBellReturnVisible(true);
      } else {
        if (bellMsgTimer) {
          clearTimeout(bellMsgTimer);
          bellMsgTimer = null;
        }
        if (locationDesc) locationDesc.style.display = 'none';
        if (gwanyokMeditationMsg) {
          gwanyokMeditationMsg.textContent = '종소리가 울리는 순간, 고통받는 영혼들이 평안을 얻고 번뇌를 끊어 깨달음의 길로 나아가길 기원합니다.';
          gwanyokMeditationMsg.style.display = 'block';
        }
        if (app.ringBeomjongBell) {
          app.ringBeomjongBell(() => {
            bellMsgTimer = setTimeout(() => {
              if (app.activeLocation && app.activeLocation.id === 'beomjong' && !app.isBeomjongRinging) {
                if (gwanyokMeditationMsg) gwanyokMeditationMsg.style.display = 'none';
                if (locationDesc) locationDesc.style.display = '';
              }
            }, 4000);
          });
        }
      }
      return;
    }

    if (currentLoc.id === 'gwanyok') {
      if (app.isGwanyokActive) return;
      const waterSteps = [
        { label: '첫번째 물', msg: '탐욕(貪)을 씻어냄 · 욕심과 집착을 비우고 마음을 맑힙니다.' },
        { label: '두번째 물', msg: '성냄(瞋)을 씻어냄 · 화와 미움을 내려놓고 자비심을 키웁니다.' },
        { label: '세번째 물', msg: '어리석음(癡)을 씻어냄 · 무지와 편견을 씻고 지혜의 눈을 뜹니다.' }
      ];
      enterBtn.innerHTML = `<span>💧</span> ${waterSteps[0].label}`;
      if (gwanyokMeditationMsg) {
        gwanyokMeditationMsg.textContent = waterSteps[0].msg;
        gwanyokMeditationMsg.style.display = 'block';
      }

      app.performGwanyok(
        (currentStep) => {
          const stepInfo = waterSteps[currentStep - 1] || waterSteps[0];
          enterBtn.innerHTML = `<span>💧</span> ${stepInfo.label}`;
          if (gwanyokMeditationMsg) {
            gwanyokMeditationMsg.textContent = stepInfo.msg;
            gwanyokMeditationMsg.style.display = 'block';
          }
        },
        () => {
          enterBtn.innerHTML = '<span>💧</span> 아기 부처님 관욕식 올리기';
          if (gwanyokMeditationMsg) {
            gwanyokMeditationMsg.style.display = 'none';
          }
        }
      );
      return;
    }

    locationCard.classList.remove('visible');
    document.body.classList.add('in-meditation');

    app.enterCurrentBuilding();
    if (openPrayerText && currentLoc.id !== 'jijang') {
      openPrayerText.textContent = '발원문 올리기';
    }
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

      // [요청 반영] 묘보탑 이동 시 3배 대신 '탑돌이' 표출 (시작 시 합장 반배 진행, 🙏 및 🪵 제거하여 타 전각과 통일)
      bowBtn.style.gridColumn = '1 / -1';
      bowBtn.classList.add('active');
      bowText.textContent = '합장 반배 중...';

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
        meditationTitle.textContent = '석굴암';
        if (meditationSub) meditationSub.style.display = 'none';
        instrumentText.textContent = '싱잉볼 치기';
        instrumentBtn.onclick = () => {
          window.templeAudio.stopMoktakLoop();
          window.templeAudio.playSingingBowl(196, 8.0);
        };
      } else if (currentLoc.id === 'daewoong' || currentLoc.id === 'jijang') {
        if (meditationSub) meditationSub.style.display = 'none';
        if (currentLoc.id === 'jijang') {
          meditationTitle.innerHTML = `${WHITE_LOTUS_SVG}<span>지장전</span>`;
          instrumentText.textContent = '요령흔들기';
          instrumentBtn.onclick = () => {
            window.templeAudio.toggleYoryeongLoop((isLooping) => {
              if (isLooping) {
                instrumentBtn.classList.add('active');
                instrumentText.textContent = '요령 멈추기';
              } else {
                instrumentBtn.classList.remove('active');
                instrumentText.textContent = '요령흔들기';
              }
            });
          };
        } else {
          meditationTitle.textContent = '대웅전';
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
        }
      } else if (currentLoc.id === 'sansin') {
        meditationTitle.textContent = '산령각';
        if (meditationSub) meditationSub.style.display = 'none';
        instrumentText.textContent = '풍경소리';
        instrumentBtn.onclick = () => {
          window.templeAudio.toggleWindChimeLoop((isLooping) => {
            if (isLooping) {
              instrumentBtn.classList.add('active');
              instrumentText.textContent = '풍경소리 멈추기';
            } else {
              instrumentBtn.classList.remove('active');
              instrumentText.textContent = '풍경소리';
            }
          });
        };
      }
    }

    meditationOverlay.classList.add('active');
  });

  if (bellReturnBtn) {
    bellReturnBtn.addEventListener('click', () => {
      if (bellMsgTimer) {
        clearTimeout(bellMsgTimer);
        bellMsgTimer = null;
      }
      if (app.stopBeomjongBell) app.stopBeomjongBell();
      enterBtn.innerHTML = '<span>🔔</span> 타종준비';
      if (locationDesc) locationDesc.style.display = '';
      if (gwanyokMeditationMsg) gwanyokMeditationMsg.style.display = 'none';
      setBellReturnVisible(false);
    });
  }

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
        bowText.textContent = '합장 반배 중...';
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

    if (window.templeAudio) {
      window.templeAudio.stopMoktakLoop();
      window.templeAudio.stopYoryeongLoop();
      window.templeAudio.stopWindChimeLoop();
    }
    instrumentBtn.classList.remove('active');

    document.body.classList.remove('in-meditation');
    app.exitBuilding();

    if (app.activeLocation) {
      locationCard.classList.add('visible');
    }
  });

  // 6. 발원문 / 지장전 소원 쓰고 등달기 팝업 모달
  openPrayerBtn.addEventListener('click', () => {
    if (!app.activeLocation) return;
    openPrayerEditModal(app.activeLocation, null);
  });

  prayerCancelBtn.addEventListener('click', () => {
    editingPrayerTarget = null;
    prayerModalOverlay.classList.remove('active');
  });

  prayerSubmitBtn.addEventListener('click', async () => {
    const text = prayerInput.value.trim();
    if (!text) {
      alert('소원(발원문) 내용을 적어주세요.');
      return;
    }

    if (app.activeLocation) {
      const locId = app.activeLocation.id;
      if (editingPrayerTarget !== null && window.templeSync) {
        await window.templeSync.updatePrayer(locId, editingPrayerTarget.id, text);
      } else if (window.templeSync) {
        await window.templeSync.addPrayer(locId, text);
      }
      editingPrayerTarget = null;
      refreshPrayerBadge(locId);
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

  // 9. 음원 출처 및 저작권 안내 모달
  const creditBtn = document.getElementById('credit-btn');
  const creditModalOverlay = document.getElementById('credit-modal-overlay');
  const creditCloseBtn = document.getElementById('credit-close-btn');
  if (creditBtn && creditModalOverlay) {
    creditBtn.addEventListener('click', () => {
      creditModalOverlay.classList.add('active');
    });
    if (creditCloseBtn) {
      creditCloseBtn.addEventListener('click', () => {
        creditModalOverlay.classList.remove('active');
      });
    }
    creditModalOverlay.addEventListener('click', (e) => {
      if (e.target === creditModalOverlay) {
        creditModalOverlay.classList.remove('active');
      }
    });
  }

  // [요청 반영] 도량에 들어서면(첫 화면 터치/클릭 시) 장엄한 대형 범종 소리가 도량에 울려 퍼짐
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

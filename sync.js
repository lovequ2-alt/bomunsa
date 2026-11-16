// 저 절로(보문사) 다중 이용자 동기화 모듈 (서버 교체 시 이 파일만 변경하면 됩니다)
// 지원: 공용 발원문/영가등 저장(DB) + 실시간 캐릭터 동시접속(최대 10명 제한)

window.BOMUNSA_SYNC_CONFIG = {
  provider: 'supabase',
  // 아래 두 값에 Supabase 대시보드(Project Settings -> API)의 URL과 anon public key를 입력하세요.
  // 비어 있으면 자동으로 개인 기기(localStorage) 단독 모드로 동작합니다.
  supabaseUrl: 'https://tlqmjatgoaltjmvahskk.supabase.co',
  supabaseAnonKey: 'sb_publishable_CoMeHch-_mH_6N5yATJIQg_SiF_Q35t',
  maxConcurrentUsers: 10
};

class TempleSync {
  constructor(config) {
    this.config = config || window.BOMUNSA_SYNC_CONFIG;
    this.clientId = this.getOrCreateClientId();
    this.joinedAt = Date.now();
    this.supabase = null;
    this.channel = null;
    this.isChannelSubscribed = false;
    this.lastSentSignature = '';
    this.isConfigured = Boolean(
      this.config.supabaseUrl &&
      this.config.supabaseAnonKey &&
      window.supabase &&
      typeof window.supabase.createClient === 'function'
    );

    this.activeUsersCount = 1;
    this.isObserverOnly = false; // 10명 초과 시 혼자 참배 모드로 전환
    this.remoteStates = new Map(); // clientId -> { x, z, rotY, isWalking, mode, joinedAt }
    this.lastBroadcastTime = 0;

    // UI/3D 콜백
    this.onPresenceChange = null;
    this.onRemoteStatesChange = null;
    this.onPrayersUpdated = null;
    this.onGreeting = null;

    if (this.isConfigured) {
      try {
        this.supabase = window.supabase.createClient(
          this.config.supabaseUrl,
          this.config.supabaseAnonKey
        );
        this.initRealtime();
      } catch (err) {
        console.warn('Supabase 초기화 실패, 로컬 모드로 동작합니다:', err);
        this.isConfigured = false;
      }
    }
  }

  getOrCreateClientId() {
    let id = localStorage.getItem('bomunsa_client_id');
    if (!id) {
      id = 'pilgrim_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
      localStorage.setItem('bomunsa_client_id', id);
    }
    return id;
  }

  getSpawnPosForId(cid) {
    // 입구(0, 34.0) 주변 10개 분산 배치 슬롯 (대문 '입장' 인식 반경 3.6m 이내 유지)
    const slots = [
      { x: 0.0, z: 34.0 },
      { x: -1.1, z: 34.2 },
      { x: 1.1, z: 34.2 },
      { x: -1.8, z: 34.7 },
      { x: 1.8, z: 34.7 },
      { x: -0.6, z: 35.1 },
      { x: 0.6, z: 35.1 },
      { x: -1.5, z: 33.4 },
      { x: 1.5, z: 33.4 },
      { x: 0.0, z: 35.6 }
    ];
    let hash = 0;
    const str = String(cid || '');
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return slots[Math.abs(hash) % slots.length];
  }

  getInitialSpawnPos() {
    if (!this.initialSpawn) {
      this.initialSpawn = this.getSpawnPosForId(this.clientId);
    }
    return this.initialSpawn;
  }

  initRealtime() {
    if (!this.supabase) return;

    // 1. 공용 도량 채널 (동시접속 10명 제한 Presence + 위치 Broadcast)
    this.channel = this.supabase.channel('bomunsa-doryang-1', {
      config: { presence: { key: this.clientId } }
    });

    this.channel
      .on('presence', { event: 'sync' }, () => {
        this.handlePresenceSync();
      })
      .on('broadcast', { event: 'move' }, ({ payload }) => {
        if (!payload || payload.clientId === this.clientId) return;
        if (this.isObserverOnly) return;
        if (this.remoteStates.has(payload.clientId) || this.remoteStates.size < this.config.maxConcurrentUsers - 1) {
          this.remoteStates.set(payload.clientId, {
            ...this.remoteStates.get(payload.clientId),
            ...payload
          });
          if (this.onRemoteStatesChange) {
            this.onRemoteStatesChange(this.remoteStates);
          }
        }
      })
      .on('broadcast', { event: 'greet' }, ({ payload }) => {
        if (!payload || payload.fromClientId === this.clientId) return;
        if (payload.targetClientId && payload.targetClientId !== this.clientId) return;
        if (this.onGreeting) {
          this.onGreeting(payload.fromClientId);
        }
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          this.isChannelSubscribed = true;
          const spawn = this.getInitialSpawnPos();
          await this.channel.track({
            clientId: this.clientId,
            joinedAt: this.joinedAt,
            x: spawn.x,
            z: spawn.z,
            rotY: Math.PI,
            isWalking: false,
            mode: 'outside',
            isBowing: false,
            bowSeq: 0,
            busyLoc: null,
            queueLoc: null,
            queuedAt: null
          });
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.isChannelSubscribed = false;
        }
      });

    // 2. 공용 발원문 테이블 실시간 구독
    this.supabase
      .channel('bomunsa-prayers-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'prayers' },
        (payload) => {
          const locId = (payload.new && payload.new.location_id) || (payload.old && payload.old.location_id);
          if (this.onPrayersUpdated) {
            this.onPrayersUpdated(locId || null);
          }
        }
      )
      .subscribe();
  }

  handlePresenceSync() {
    if (!this.channel) return;
    const state = this.channel.presenceState();
    const list = [];
    Object.keys(state).forEach((key) => {
      const entries = state[key];
      if (entries && entries.length > 0) {
        list.push(entries[0]);
      }
    });

    // 입장 순서(joinedAt)대로 정렬하여 상위 10명까지만 실시간 도량에 표시
    list.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || String(a.clientId).localeCompare(String(b.clientId)));

    const maxUsers = this.config.maxConcurrentUsers || 10;
    const allowedList = list.slice(0, maxUsers);
    const amIAllowed = allowedList.some((u) => u.clientId === this.clientId);

    this.activeUsersCount = Math.min(list.length, maxUsers);
    this.isObserverOnly = !amIAllowed && list.length > maxUsers;

    const allowedIds = new Set(allowedList.map((u) => u.clientId));
    // 떠난 사용자 또는 정원 외 사용자 제거
    Array.from(this.remoteStates.keys()).forEach((cid) => {
      if (!allowedIds.has(cid)) {
        this.remoteStates.delete(cid);
      }
    });

    if (!this.isObserverOnly) {
      allowedList.forEach((u) => {
        if (u.clientId === this.clientId) return;
        if (!this.remoteStates.has(u.clientId)) {
          const fallbackSpawn = this.getSpawnPosForId(u.clientId);
          this.remoteStates.set(u.clientId, {
            clientId: u.clientId,
            x: u.x ?? fallbackSpawn.x,
            z: u.z ?? fallbackSpawn.z,
            rotY: u.rotY ?? Math.PI,
            isWalking: Boolean(u.isWalking),
            mode: u.mode || 'outside',
            isBowing: Boolean(u.isBowing),
            bowSeq: u.bowSeq || 0,
            busyLoc: u.busyLoc || null,
            queueLoc: u.queueLoc || null,
            queuedAt: u.queuedAt || null,
            joinedAt: u.joinedAt || Date.now()
          });
        }
      });
    } else {
      this.remoteStates.clear();
    }

    if (this.onRemoteStatesChange) {
      this.onRemoteStatesChange(this.remoteStates);
    }
    if (this.onPresenceChange) {
      this.onPresenceChange({
        count: this.activeUsersCount,
        totalOnline: list.length,
        max: maxUsers,
        isObserverOnly: this.isObserverOnly,
        isConfigured: this.isConfigured
      });
    }
  }

  broadcastState(state, force = false) {
    if (!this.isConfigured || !this.channel || !this.isChannelSubscribed || this.isObserverOnly) return;
    const now = performance.now();
    const x = Number(state.x.toFixed(2));
    const z = Number(state.z.toFixed(2));
    const rotY = Number(state.rotY.toFixed(2));
    const isWalking = Boolean(state.isWalking);
    const mode = state.mode || 'outside';
    const isBowing = Boolean(state.isBowing);
    const bowSeq = state.bowSeq || 0;
    const busyLoc = state.busyLoc || null;
    const queueLoc = state.queueLoc || null;
    const queuedAt = state.queuedAt || null;

    const sig = `${x}|${z}|${rotY}|${isWalking}|${mode}|${isBowing}|${bowSeq}|${busyLoc || ''}|${queueLoc || ''}`;
    const changed = sig !== this.lastSentSignature;

    if (!force) {
      if (changed && now - this.lastBroadcastTime < 120) return;
      if (!changed && now - this.lastBroadcastTime < 3000) return;
    }
    this.lastBroadcastTime = now;
    this.lastSentSignature = sig;

    this.channel.send({
      type: 'broadcast',
      event: 'move',
      payload: {
        clientId: this.clientId,
        x,
        z,
        rotY,
        isWalking,
        mode,
        isBowing,
        bowSeq,
        busyLoc,
        queueLoc,
        queuedAt
      }
    });
  }

  sendGreeting(targetClientId = null) {
    if (!this.isConfigured || !this.channel || !this.isChannelSubscribed || this.isObserverOnly) return;
    this.channel.send({
      type: 'broadcast',
      event: 'greet',
      payload: {
        fromClientId: this.clientId,
        targetClientId
      }
    });
  }

  // ==============================
  // 도량 누적 방문자수 조회 및 증가 (재방문/재입장 시에도 매번 누적 증가, Supabase 미설정 시 localStorage 폴백)
  // ==============================
  async fetchTotalVisitors(shouldIncrement = false) {
    const canIncrement = Boolean(shouldIncrement);

    if (!this.isConfigured || !this.supabase) {
      return this.getLocalTotalVisitors(canIncrement);
    }

    try {
      if (canIncrement) {
        const { data, error } = await this.supabase.rpc('increment_total_visitors');
        if (!error && typeof data === 'number') {
          return data;
        }
      }
      const { data: row, error: selErr } = await this.supabase
        .from('temple_stats')
        .select('count')
        .eq('key', 'total_visitors')
        .single();
      if (!selErr && row && typeof row.count === 'number') {
        return row.count;
      }

      // temple_stats 테이블 생성 전이라면 기존 prayers 기록의 고유 방문자 수 + 로컬 방문 수로 추산
      const { data: prayerOwners, error: pErr } = await this.supabase
        .from('prayers')
        .select('owner_id');
      if (!pErr && Array.isArray(prayerOwners)) {
        const uniqueOwners = new Set(prayerOwners.map(r => r.owner_id).filter(Boolean));
        const localCount = this.getLocalTotalVisitors(canIncrement);
        const total = Math.max(uniqueOwners.size + (canIncrement ? 1 : 0), uniqueOwners.size, localCount);
        if (canIncrement) {
          localStorage.setItem('bomunsa_total_visitors', String(total));
        }
        return total;
      }
    } catch (e) {}

    return this.getLocalTotalVisitors(canIncrement);
  }

  getLocalTotalVisitors(shouldIncrement) {
    let count = parseInt(localStorage.getItem('bomunsa_total_visitors') || '0', 10);
    if (Number.isNaN(count) || count < 0) count = 0;
    if (shouldIncrement) {
      count += 1;
      localStorage.setItem('bomunsa_total_visitors', String(count));
    }
    return Math.max(1, count);
  }

  // ==============================
  // 반야용선 실제 탑승 불자 조회 / 탑승·하선 기록 (1회성 조회로 부하 없음)
  // ==============================
  async fetchBanyaOtherCount() {
    if (!this.isConfigured || !this.supabase) {
      return 0;
    }
    try {
      const { data, error } = await this.supabase
        .from('banya_passengers')
        .select('owner_id')
        .neq('owner_id', this.clientId)
        .order('boarded_at', { ascending: false })
        .limit(30);
      if (!error && Array.isArray(data)) {
        return data.length;
      }
    } catch (e) {}
    return 0;
  }

  async setBanyaBoarding(isBoarding) {
    if (!this.isConfigured || !this.supabase) return;
    try {
      if (isBoarding) {
        await this.supabase
          .from('banya_passengers')
          .upsert({ owner_id: this.clientId, boarded_at: new Date().toISOString() }, { onConflict: 'owner_id' });
      } else {
        await this.supabase
          .from('banya_passengers')
          .delete()
          .eq('owner_id', this.clientId);
      }
    } catch (e) {}
  }

  // ==============================
  // 공용 발원문/영가등 CRUD (서버 미설정 시 localStorage 폴백)
  // ==============================
  async fetchPrayers(locationId) {
    if (!this.isConfigured || !this.supabase) {
      return this.fetchLocalPrayers(locationId);
    }
    try {
      const { data, error } = await this.supabase
        .from('prayers')
        .select('id, location_id, text, owner_id, created_at')
        .eq('location_id', locationId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      return (data || []).map((row) => ({
        id: row.id,
        locationId: row.location_id,
        text: row.text,
        isMine: row.owner_id === this.clientId,
        createdAt: row.created_at
      }));
    } catch (err) {
      console.warn('발원문 불러오기 오류 (로컬 폴백):', err);
      return this.fetchLocalPrayers(locationId);
    }
  }

  async addPrayer(locationId, rawText) {
    const text = (rawText || '').trim().slice(0, 200);
    if (!text) return null;

    if (!this.isConfigured || !this.supabase) {
      return this.addLocalPrayer(locationId, text);
    }
    try {
      const { data, error } = await this.supabase
        .from('prayers')
        .insert([{ location_id: locationId, text, owner_id: this.clientId }])
        .select('id, location_id, text, owner_id, created_at')
        .single();
      if (error) throw error;
      return {
        id: data.id,
        locationId: data.location_id,
        text: data.text,
        isMine: true,
        createdAt: data.created_at
      };
    } catch (err) {
      console.warn('발원문 저장 오류 (로컬 폴백):', err);
      return this.addLocalPrayer(locationId, text);
    }
  }

  async updatePrayer(locationId, idOrIdx, rawText) {
    const text = (rawText || '').trim().slice(0, 200);
    if (!text) return false;

    if (!this.isConfigured || !this.supabase) {
      return this.updateLocalPrayer(locationId, idOrIdx, text);
    }
    try {
      const { error } = await this.supabase
        .from('prayers')
        .update({ text })
        .eq('id', idOrIdx)
        .eq('owner_id', this.clientId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('발원문 수정 오류:', err);
      return false;
    }
  }

  async deletePrayer(locationId, idOrIdx) {
    if (!this.isConfigured || !this.supabase) {
      return this.deleteLocalPrayer(locationId, idOrIdx);
    }
    try {
      const { error } = await this.supabase
        .from('prayers')
        .delete()
        .eq('id', idOrIdx)
        .eq('owner_id', this.clientId);
      if (error) throw error;
      return true;
    } catch (err) {
      console.warn('발원문 삭제 오류:', err);
      return false;
    }
  }

  // --- 로컬 저장소 폴백 (서버 연결 전에도 동일하게 동작) ---
  fetchLocalPrayers(locationId) {
    if (locationId === 'jijang') {
      try {
        const raw = localStorage.getItem('bomunsa_prayers_jijang_list');
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr)
          ? arr.map((text, idx) => ({ id: idx, locationId, text, isMine: true }))
          : [];
      } catch (e) {
        return [];
      }
    }
    const saved = localStorage.getItem(`bomunsa_prayer_${locationId}`);
    return saved ? [{ id: 0, locationId, text: saved, isMine: true }] : [];
  }

  addLocalPrayer(locationId, text) {
    if (locationId === 'jijang') {
      const list = this.fetchLocalPrayers('jijang').map((p) => p.text);
      list.push(text);
      localStorage.setItem('bomunsa_prayers_jijang_list', JSON.stringify(list));
      return { id: list.length - 1, locationId, text, isMine: true };
    }
    localStorage.setItem(`bomunsa_prayer_${locationId}`, text);
    return { id: 0, locationId, text, isMine: true };
  }

  updateLocalPrayer(locationId, idx, text) {
    if (locationId === 'jijang') {
      const list = this.fetchLocalPrayers('jijang').map((p) => p.text);
      if (list[idx] !== undefined) {
        list[idx] = text;
        localStorage.setItem('bomunsa_prayers_jijang_list', JSON.stringify(list));
        return true;
      }
      return false;
    }
    localStorage.setItem(`bomunsa_prayer_${locationId}`, text);
    return true;
  }

  deleteLocalPrayer(locationId, idx) {
    if (locationId === 'jijang') {
      const list = this.fetchLocalPrayers('jijang').map((p) => p.text);
      list.splice(idx, 1);
      localStorage.setItem('bomunsa_prayers_jijang_list', JSON.stringify(list));
      return true;
    }
    localStorage.removeItem(`bomunsa_prayer_${locationId}`);
    return true;
  }
}

window.templeSync = new TempleSync(window.BOMUNSA_SYNC_CONFIG);

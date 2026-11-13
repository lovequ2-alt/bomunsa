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
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const spawn = this.getInitialSpawnPos();
          await this.channel.track({
            clientId: this.clientId,
            joinedAt: this.joinedAt,
            x: spawn.x,
            z: spawn.z,
            rotY: Math.PI,
            isWalking: false,
            mode: 'outside'
          });
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
    if (!this.isConfigured || !this.channel || this.isObserverOnly) return;
    const now = performance.now();
    if (!force) {
      if (state.isWalking && now - this.lastBroadcastTime < 120) return;
      if (!state.isWalking && now - this.lastBroadcastTime < 60) return;
    }
    this.lastBroadcastTime = now;

    this.channel.send({
      type: 'broadcast',
      event: 'move',
      payload: {
        clientId: this.clientId,
        x: Number(state.x.toFixed(2)),
        z: Number(state.z.toFixed(2)),
        rotY: Number(state.rotY.toFixed(2)),
        isWalking: Boolean(state.isWalking),
        mode: state.mode || 'outside'
      }
    });
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

// 저 절로 3D 사찰 씬 및 인터랙션 엔진 (Three.js 기반)

class Bomunsa3D {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.groundMesh = null;
    this.walkTarget = null;
    this.targetLookAt = null;
    const initialSpawn = window.templeSync && window.templeSync.getInitialSpawnPos
      ? window.templeSync.getInitialSpawnPos()
      : { x: 0, z: 34.0 };
    this.playerPos = new THREE.Vector3(initialSpawn.x, 0, initialSpawn.z);
    this.isWalking = false;
    this.walkSpeed = 3.2;
    this.footstepTimer = 0;
    this.interactables = [];
    this.obstacles = [];
    this.boxObstacles = [];
    this.activeLocation = null;
    this.currentMode = 'outside';
    this.clock = new THREE.Clock();

    // 조명
    this.sunLight = null;
    this.hemiLight = null;
    this.insideCandleLight = null;

    // 카메라
    this.isDragging = false;
    this.previousMousePosition = { x: 0, y: 0 };
    this.cameraAngles = { theta: 0, phi: 0.42 };
    this.cameraDistance = 6.8;
    this.touchStartTime = 0;
    this.touchStartPos = { x: 0, y: 0 };

    // 동글동글 작고 귀여운 동자승 캐릭터 (1명만 이동)
    this.characterGroup = null;
    this.charLimbs = {};
    this.walkAnimTime = 0;
    this.currentCharRotation = Math.PI;

    // 다중 접속 다른 참배객(최대 9명 추가 -> 본인 포함 10명)
    this.remotePilgrims = new Map();
    this.remoteInsideGroup = null;
    this.waitingForLoc = null;
    this.waitingQueuedAt = null;
    this.lastBusyLoc = null;
    this.lastQueueKey = null;
    this.lastOccupiedState = false;
    this.remoteRobePalette = [
      0x74828f, 0x8d8274, 0x6f8076, 0x8b7b84, 0x7a7f8c,
      0x8e8670, 0x6c7a89, 0x857468, 0x76857d
    ];

    // 범종각 타종 애니메이션 상태
    this.beomjongStriker = null;
    this.beomjongRingTime = 0;
    this.isBeomjongRinging = false;

    // 탑돌이 (묘보탑)
    this.pagodaPos = new THREE.Vector3(-17, 0, -5);
    this.pagodaAngle = Math.PI / 2;
    this.pagodaRoundsCompleted = 0;
    this.pagodaTotalAngle = 0;
    this.pagodaRadius = 6.2;
    this.pagodaIsRunning = false;
    this.isPagodaBowing = false;
    this.pagodaBowElapsed = 0;
    this.pagodaBowDuration = 3.8; // [요청 반영: 반배 타임을 3.8초로 넉넉히 늘려 경건한 반배 동작이 확실히 눈에 띄도록 설정]
    this.pagodaStep = 0;
    this.pagodaNextStep = 1;
    this.pagodaBowIsFinal = false;
    this.footprints = [];
    this.lastFootprintDist = 0;
    this.footprintStepSide = 1;
    this.startMarkerMesh = null;

    // 법당 내부 및 초/향
    this.insideGroup = null;
    this.candleFlames = [];
    this.incenseSmokes = [];
    this.incenseSmoke = null;
    this.isCandleLit = false;
    this.isIncenseLit = false;

    // 터치 파문 마커
    this.rippleMesh = null;

    this.init();
  }

  init() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xdcebf5);
    this.scene.fog = new THREE.FogExp2(0xdcebf5, 0.012);

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.5, 300);
    this.updateCameraPosition();

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.container.appendChild(this.renderer.domElement);

    this.setupLighting();
    this.buildWorld();
    this.createGasshoMonkCharacter();
    this.createInsideTempleProps();
    this.createRippleMarker();
    this.setupEvents();
    this.animate();
  }

  setupLighting() {
    this.sunLight = new THREE.DirectionalLight(0xfff3db, 1.25);
    this.sunLight.position.set(45, 65, 35);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 160;
    const d = 50;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    this.hemiLight = new THREE.HemisphereLight(0xd9ecf7, 0x82705b, 0.75);
    this.scene.add(this.hemiLight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(ambientLight);

    this.insideCandleLight = new THREE.PointLight(0xff9933, 0, 20);
    this.insideCandleLight.position.set(0, -80 + 2.0, 0.5);
    this.scene.add(this.insideCandleLight);
  }

  // [사용자 요청 완벽 반영: 첨부 인형 사진처럼 동글동글 작고 귀여운 2등신 동자승 + 얼굴에는 동그란 코만 + 뒷모습엔 아무 표시 없이 매끈하게 구현]
  buildCuteMonkMesh(robeColorHex = 0x868c94) {
    const root = new THREE.Group();

    const robeMat = new THREE.MeshStandardMaterial({ color: robeColorHex, roughness: 0.78 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffe2c8, roughness: 0.48 });
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xf7cbb0, roughness: 0.48 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf2efe9, roughness: 0.65 });

    // 상체 피벗 (허리 y=0.28 기준 반배 및 아장아장 보행 율동)
    const upperBodyPivot = new THREE.Group();
    upperBodyPivot.position.set(0, 0.28, 0);

    // 1. 작고 동글동글한 눈사람/달마 인형 볼륨의 승복 몸통 (뒷모습에 아무런 선이나 표시 없이 100% 매끈하고 둥근 형태)
    const body = new THREE.Group();
    body.position.set(0, 0.19, 0);

    const bellySphere = new THREE.Mesh(new THREE.SphereGeometry(0.25, 28, 24), robeMat);
    bellySphere.scale.set(1.12, 0.96, 1.04);
    bellySphere.castShadow = true;
    body.add(bellySphere);

    upperBodyPivot.add(body);

    // 2. 몸통보다 큼직하고 포근한 동글동글 아기 동자승 머리 + 양옆 동그란 귀 + 앞얼굴엔 동그란 코만!
    const head = new THREE.Group();
    head.position.set(0, 0.64, 0);

    const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.30, 32, 32), skinMat);
    headSphere.scale.set(1.10, 0.98, 1.04);
    headSphere.castShadow = true;
    head.add(headSphere);

    // 양옆에 나지막하고 도톰하게 붙은 동글동글 귀여운 귀 (인형 사진 비율 그대로)
    [-1, 1].forEach((side) => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.088, 20, 20), skinMat);
      ear.scale.set(0.82, 1.08, 0.68);
      ear.position.set(side * 0.315, -0.035, 0);
      ear.castShadow = true;
      head.add(ear);
    });

    // [사용자 요청: 캐릭터 얼굴에 코만 만들어 주시고] -> 눈·입·볼터치 없이 앞면 중앙에 작고 동글동글한 코만 조형
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.038, 16, 16), noseMat);
    nose.scale.set(1.08, 0.92, 0.95);
    nose.position.set(0, -0.025, 0.308);
    head.add(nose);

    upperBodyPivot.add(head);

    // 3. 배 앞에 아담하고 동그랗게 모은 통통한 소매와 합장 두 손 (뒷모습에는 아무 표시도 나지 않음)
    const gasshoGroup = new THREE.Group();
    gasshoGroup.position.set(0, 0.19, 0.19);

    [-1, 1].forEach((side) => {
      const chubbyArm = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 18), robeMat);
      chubbyArm.scale.set(0.95, 1.38, 0.95);
      chubbyArm.position.set(side * 0.115, 0.0, -0.01);
      chubbyArm.rotation.z = side * 0.62;
      chubbyArm.rotation.x = 0.35;
      chubbyArm.castShadow = true;
      gasshoGroup.add(chubbyArm);
    });

    const handsPair = new THREE.Group();
    handsPair.position.set(0, 0.01, 0.055);

    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 16), skinMat);
    leftHand.scale.set(0.82, 1.18, 0.92);
    leftHand.position.set(-0.022, 0.01, 0);
    leftHand.rotation.z = -0.20;
    handsPair.add(leftHand);

    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 16), skinMat);
    rightHand.scale.set(0.82, 1.18, 0.92);
    rightHand.position.set(0.022, 0.01, 0);
    rightHand.rotation.z = 0.20;
    handsPair.add(rightHand);

    gasshoGroup.add(handsPair);
    upperBodyPivot.add(gasshoGroup);
    root.add(upperBodyPivot);

    // 4. 아장아장 걷는 작고 동글동글한 다리와 신발 (뒷모습에 아무런 줄/테두리 표시 없음)
    const makeLeg = (lx) => {
      const legPivot = new THREE.Group();
      legPivot.position.set(lx, 0.27, 0);

      const chubbyLeg = new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 18), robeMat);
      chubbyLeg.scale.set(1.02, 1.25, 1.02);
      chubbyLeg.position.set(0, -0.10, 0);
      chubbyLeg.castShadow = true;
      legPivot.add(chubbyLeg);

      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.082, 16, 16), shoeMat);
      shoe.scale.set(0.98, 0.68, 1.22);
      shoe.position.set(0, -0.215, 0.025);
      shoe.castShadow = true;
      legPivot.add(shoe);

      return legPivot;
    };

    const leftLegPivot = makeLeg(-0.105);
    const rightLegPivot = makeLeg(0.105);
    root.add(leftLegPivot);
    root.add(rightLegPivot);

    // 전체적으로 작고 앙증맞은 비율 조정 (더 아담한 크기로 축소)
    root.scale.set(0.72, 0.72, 0.72);

    return {
      group: root,
      limbs: {
        leftLeg: leftLegPivot,
        rightLeg: rightLegPivot,
        upperBody: upperBodyPivot,
        body: body,
        head: head,
        gassho: gasshoGroup
      }
    };
  }

  createGasshoMonkCharacter() {
    const built = this.buildCuteMonkMesh(0x868c94);
    this.characterGroup = built.group;
    this.charLimbs = built.limbs;

    this.characterGroup.position.copy(this.playerPos);
    this.characterGroup.rotation.y = Math.PI;
    this.scene.add(this.characterGroup);
  }

  getTerrainHeight(x, z) {
    // [요청 반영: 모든 경내를 완전한 평지로 구현]
    return 0;
  }

  // [사용자 스케치 1(보문사 지도) 완벽 반영: 구불구불 이어지는 중앙 길과 각 전각 갈래길]
  createMapPathways() {
    const pathGroup = new THREE.Group();
    const pathwayMat = new THREE.MeshStandardMaterial({ color: 0xd8cbb8, roughness: 0.92 });
    const borderMat = new THREE.MeshStandardMaterial({ color: 0xb5a895, roughness: 0.95 });

    const addPathSegment = (x1, z1, x2, z2, width = 3.6) => {
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.hypot(dx, dz);
      const cx = (x1 + x2) / 2;
      const cz = (z1 + z2) / 2;
      const angle = Math.atan2(dx, dz);

      // 가장자리 석조 경계석 느낌 바닥
      const borderMesh = new THREE.Mesh(new THREE.PlaneGeometry(width + 0.45, len + 0.45), borderMat);
      borderMesh.rotation.x = -Math.PI / 2;
      borderMesh.rotation.z = angle;
      borderMesh.position.set(cx, 0.015, cz);
      borderMesh.receiveShadow = true;
      pathGroup.add(borderMesh);

      // 주 산책로 마사토/박석 길
      const segMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, len + 0.3), pathwayMat);
      segMesh.rotation.x = -Math.PI / 2;
      segMesh.rotation.z = angle;
      segMesh.position.set(cx, 0.024, cz);
      segMesh.receiveShadow = true;
      pathGroup.add(segMesh);

      // 양 끝 둥근 연결 조인트 (갈래길 이음매가 매끄럽게 이어지도록 처리)
      [[x1, z1], [x2, z2]].forEach(([jx, jz]) => {
        const bDisk = new THREE.Mesh(new THREE.CircleGeometry((width + 0.45) / 2, 20), borderMat);
        bDisk.rotation.x = -Math.PI / 2;
        bDisk.position.set(jx, 0.015, jz);
        pathGroup.add(bDisk);

        const pDisk = new THREE.Mesh(new THREE.CircleGeometry(width / 2, 20), pathwayMat);
        pDisk.rotation.x = -Math.PI / 2;
        pDisk.position.set(jx, 0.024, jz);
        pathGroup.add(pDisk);
      });
    };

    // 1. 중앙 줄기 길 (입구 -> 불사중 갈림길 -> 대웅전 갈림길 -> 묘보탑 갈림길 -> 범종각 갈림길 -> 산령각 갈림길 -> 석굴암)
    const spine = [
      [0, 36.0],     // 입구 바깥
      [0, 30.0],     // 입구(절대문) 통과
      [0, 22.0],
      [-0.4, 18.2],  // 좌측 불사중 건물 갈림길
      [1.0, 11.5],   // 우측 대웅전 갈림길
      [-2.2, 1.2],   // 좌측 묘보탑 갈림길
      [-0.5, -4.2],  // 우측 범종각 갈림길
      [-3.2, -11.5], // 우상단 산령각 갈림길
      [-4.5, -19.5]  // 북단 석굴암 입구 마당
    ];
    for (let i = 0; i < spine.length - 1; i++) {
      addPathSegment(spine[i][0], spine[i][1], spine[i + 1][0], spine[i + 1][1], 3.8);
    }

    // 2. 좌하단 갈래길 -> 불사중 건물
    addPathSegment(-0.4, 18.2, -14.0, 18.2, 3.2);

    // 3. 우측 갈래길 -> 대웅전 앞마당 -> 우하단 곡선으로 이어지는 지장전 길 (충돌 없이 매끄럽게 연결)
    addPathSegment(1.0, 11.5, 12.0, 11.5, 3.6);
    addPathSegment(12.0, 11.5, 18.2, 16.6, 3.2);
    addPathSegment(18.2, 16.6, 25.0, 17.0, 3.2);

    // 4. 좌중단 갈래길 -> 묘보탑
    addPathSegment(-2.2, 1.2, -17.0, 1.2, 3.5);

    // 5. 우중단 갈래길 -> 범종각 (대웅전에 가리지 않도록 좀 더 오른쪽 x = 22.0 으로 연결)
    addPathSegment(-0.5, -4.2, 22.0, -4.2, 3.4);

    // 6. 우상단 대각선 갈래길 -> 산령각
    addPathSegment(-3.2, -11.5, 10.0, -16.5, 3.3);

    this.scene.add(pathGroup);
  }

  buildWorld() {
    const groundGeo = new THREE.PlaneGeometry(200, 200, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x728c60, roughness: 0.92, metalness: 0.03 });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    // 사용자 스케치 1과 일치하는 구불구불한 보문사 산책로 생성
    this.createMapPathways();

    // 도심속 천년고찰 배경 (외곽 전통 기와 담장 + 보문산 암석 산자락 + 원경 도심 스카이라인)
    this.createMountainRock();

    // [사용자 스케치 1(보문사 지도) 배치 완벽 구현]
    this.createHojimun(0, 0, 30.0);          // 하단: 입구 (절대문 참고, 벽돌 제외 간단 대문)
    this.createGwanyokAltar(-4.2, 0, 15.6);   // 입구 왼쪽으로 여유 있게 배치하여 석굴암 직행 경로에 걸리지 않도록 조정
    this.createBulsaBuilding(-14, 0, 13.5);  // 좌하단: 불사중 건물
    this.createDaewoongjeon(12, 0, 4.5);     // 우중하단: 대웅전
    this.createJijangjeon(25, 0, 11.5);      // 대웅전 우하단 연결: 지장전
    this.createPagoda(-17, 0, -5.0);         // 좌중상단: 묘보탑 (기존 9층 석탑 그대로 사용)
    this.createBeomjonggak(22.0, 0, -9.5);   // 우중상단(대웅전에 가리지 않게 오른쪽 이동): 범종각
    this.createSansingak(10, 0, -22.0);      // 우상단: 산령각
    this.createSeokguram(-4.5, 0, -27.0);    // 최상단(북단): 석굴암 (흰색 기둥 + 2D/3D 혼합 입구)

    this.createEnvironmentDetails();
  }

  addObstacle(x, z, radius) {
    this.obstacles.push({ x, z, radius });
  }

  addBoxObstacle(minX, maxX, minZ, maxZ) {
    this.boxObstacles.push({ minX, maxX, minZ, maxZ });
  }

  checkCollision(newPos) {
    const playerRadius = 0.55;
    let collided = false;

    // 도량 외곽 보행 경계 제한
    if (newPos.x < -34.2) { newPos.x = -34.2; collided = true; }
    if (newPos.x > 35.2) { newPos.x = 35.2; collided = true; }
    if (newPos.z < -31.5) { newPos.z = -31.5; collided = true; }
    if (newPos.z > 37.5) { newPos.z = 37.5; collided = true; }

    // 2회 반복 검사로 모서리 끼임 및 벽 투과를 완벽 차단
    for (let pass = 0; pass < 2; pass++) {
      // 1. 직사각형(AABB) 벽·담장·전각 충돌 검사
      if (this.boxObstacles) {
        for (let box of this.boxObstacles) {
          const minX = box.minX - playerRadius;
          const maxX = box.maxX + playerRadius;
          const minZ = box.minZ - playerRadius;
          const maxZ = box.maxZ + playerRadius;

          if (newPos.x > minX && newPos.x < maxX && newPos.z > minZ && newPos.z < maxZ) {
            const penLeft = newPos.x - minX;
            const penRight = maxX - newPos.x;
            const penTop = newPos.z - minZ;
            const penBottom = maxZ - newPos.z;
            const minPen = Math.min(penLeft, penRight, penTop, penBottom);

            if (minPen === penLeft) {
              newPos.x = minX - 0.01;
            } else if (minPen === penRight) {
              newPos.x = maxX + 0.01;
            } else if (minPen === penTop) {
              newPos.z = minZ - 0.01;
            } else {
              newPos.z = maxZ + 0.01;
            }
            collided = true;
          }
        }
      }

      // 2. 원형 기둥·석탑·소나무·석등 충돌 검사
      for (let obs of this.obstacles) {
        const dist = Math.hypot(newPos.x - obs.x, newPos.z - obs.z);
        const minDist = obs.radius + playerRadius;
        if (dist < minDist) {
          const angle = Math.atan2(newPos.z - obs.z, newPos.x - obs.x);
          newPos.x = obs.x + Math.cos(angle) * (minDist + 0.01);
          newPos.z = obs.z + Math.sin(angle) * (minDist + 0.01);
          collided = true;
        }
      }

      // 3. 다른 참배객 캐릭터 충돌 검사 (서로 밀치거나 겹쳐 지나가지 않도록 부드럽게 우회)
      if (this.remotePilgrims && this.currentMode === 'outside') {
        const otherRadius = 0.42;
        const minCharDist = otherRadius + playerRadius;
        this.remotePilgrims.forEach((entry) => {
          if (!entry.group || !entry.group.visible) return;
          const ox = entry.group.position.x;
          const oz = entry.group.position.z;
          const dist = Math.hypot(newPos.x - ox, newPos.z - oz);
          if (dist < minCharDist) {
            const angle = dist > 0.001
              ? Math.atan2(newPos.z - oz, newPos.x - ox)
              : Math.PI * 0.25;
            newPos.x = ox + Math.cos(angle) * (minCharDist + 0.02);
            newPos.z = oz + Math.sin(angle) * (minCharDist + 0.02);
            collided = true;
          }
        });
      }
    }

    return collided;
  }

  // [도심속 천년고찰 분위기 연출: 북측 보문산 바위 병풍 + 경내 외곽 기와 담장 + 원경의 아련한 서울 도심 실루엣]
  createMountainRock() {
    const group = new THREE.Group();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7e8489, roughness: 0.95, flatShading: true });

    // 1. 북측(석굴암·산령각·묘보탑 뒤편) 보문산 암산 병풍 바위
    for (let i = 0; i < 26; i++) {
      const geo = new THREE.DodecahedronGeometry(9 + Math.random() * 4, 1);
      const mesh = new THREE.Mesh(geo, rockMat);
      const angle = (i / 25) * Math.PI * 1.15 + Math.PI * 0.92;
      const r = 56 + (Math.random() * 7);
      const mx = Math.cos(angle) * r;
      const mz = Math.sin(angle) * r - 8;
      mesh.position.set(mx, 6 + Math.random() * 6, mz);
      mesh.scale.set(1.5, 2.1 + Math.random() * 0.6, 1.3);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      this.addObstacle(mx, mz, 9);
    }

    // 2. 도량 외곽을 감싸는 고즈넉한 전통 한옥 기와 담장 (남쪽 입구 대문 통로만 개방하고 빈틈없이 연결)
    const wallStoneMat = new THREE.MeshStandardMaterial({ color: 0xd8d0c2, roughness: 0.9 });
    const wallBaseMat = new THREE.MeshStandardMaterial({ color: 0x9c968c, roughness: 0.92 });
    const wallRoofMat = new THREE.MeshStandardMaterial({ color: 0x353a40, roughness: 0.78 });

    const buildPerimeterWall = (wx, wz, len, rotY) => {
      const wGroup = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(len, 0.45, 0.55), wallBaseMat);
      base.position.y = 0.225;
      wGroup.add(base);

      const body = new THREE.Mesh(new THREE.BoxGeometry(len, 1.35, 0.42), wallStoneMat);
      body.position.y = 1.12;
      body.castShadow = true;
      body.receiveShadow = true;
      wGroup.add(body);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(len + 0.3, 0.24, 0.72), wallRoofMat);
      cap.position.y = 1.90;
      wGroup.add(cap);

      wGroup.position.set(wx, 0, wz);
      wGroup.rotation.y = rotY;
      group.add(wGroup);
    };

    // 남측 좌·우 담장 (입구 대문 좌우 기둥 x = ±2.2 까지 빈틈없이 연결)
    buildPerimeterWall(-18.85, 30.0, 33.3, 0);
    buildPerimeterWall(19.35, 30.0, 34.3, 0);
    // 좌·우 측면 담장 및 북측 경계 담장
    buildPerimeterWall(-35.5, 0, 62, Math.PI / 2);
    buildPerimeterWall(36.5, 0, 62, Math.PI / 2);
    buildPerimeterWall(0.5, -31.5, 72, 0);

    // 외곽 담장 전체에 직사각형(AABB) 충돌 판정 등록 (담장을 절대 뚫고 지나갈 수 없음)
    this.addBoxObstacle(-36.0, -1.15, 29.45, 30.55); // 남측 왼쪽 담장 + 대문 좌측 문틀
    this.addBoxObstacle(1.15, 37.0, 29.45, 30.55);   // 남측 오른쪽 담장 + 대문 우측 문틀
    this.addBoxObstacle(-36.2, -34.8, -32.0, 31.0);  // 서측 담장
    this.addBoxObstacle(35.8, 37.2, -32.0, 31.0);    // 동측 담장
    this.addBoxObstacle(-36.0, 37.0, -32.5, -30.8);  // 북측 담장

    // 3. [도심속 천년고찰(성북구 보문사) 감성]: 담장과 소나무 숲 너머 원경에 은은한 안개 속 도심 건축물 실루엣 배치
    const cityMat1 = new THREE.MeshStandardMaterial({ color: 0xc2d3e0, roughness: 0.95 });
    const cityMat2 = new THREE.MeshStandardMaterial({ color: 0xb6c8d6, roughness: 0.95 });
    for (let i = 0; i < 34; i++) {
      const angle = (i / 34) * Math.PI * 2;
      // 북쪽 석굴암 산자락 정면 뒤쪽은 산세가 주를 이루고, 좌·우·남쪽 원경에 도심 실루엣이 아련히 펼쳐짐
      if (Math.sin(angle) < -0.65) continue;
      const dist = 76 + (i % 4) * 9;
      const bx = Math.cos(angle) * dist;
      const bz = Math.sin(angle) * dist;
      const bw = 5 + (i % 3) * 2.5;
      const bd = 5 + ((i + 1) % 3) * 2.0;
      const bh = 8 + (i % 5) * 4.5;
      const bMesh = new THREE.Mesh(
        new THREE.BoxGeometry(bw, bh, bd),
        i % 2 === 0 ? cityMat1 : cityMat2
      );
      bMesh.position.set(bx, bh / 2 - 0.5, bz);
      group.add(bMesh);
    }

    this.scene.add(group);
  }

  // [한국 전통 사찰 건축 고해상도 절차적 텍스처 세트 (꽃살문·연꽃 궁판·단청·서까래·기와·벽돌·판문)]
  getKoreanTempleTextures() {
    if (this._koreanTexCache) return this._koreanTexCache;

    // 1. 사진 3 기반 청자/쑥빛 꽃살문 + 하단 연꽃 문양(궁판) 텍스처 (한 칸 2짝 대문 기준)
    const doorCanvas = document.createElement('canvas');
    doorCanvas.width = 512;
    doorCanvas.height = 1024;
    const dctx = doorCanvas.getContext('2d');

    // 외곽 문틀 목재 (차분한 쑥빛 청록)
    dctx.fillStyle = '#587e5e';
    dctx.fillRect(0, 0, 512, 1024);

    // 좌우 문짝 2개 렌더링
    [10, 260].forEach((lx) => {
      const lw = 242;
      // 창호지 안쪽 바탕 (상단 격자 영역)
      const latticeY = 26;
      const latticeH = 656;
      dctx.fillStyle = '#f3f1e7';
      dctx.fillRect(lx + 18, latticeY + 18, lw - 36, latticeH - 36);

      // 문짝 바깥 쑥빛 프레임
      dctx.strokeStyle = '#6b9472';
      dctx.lineWidth = 18;
      dctx.strokeRect(lx + 9, 14, lw - 18, 996);
      dctx.strokeStyle = '#3b5840';
      dctx.lineWidth = 3;
      dctx.strokeRect(lx + 18, latticeY + 18, lw - 36, latticeH - 36);

      // 정교한 한국 전통 띠살·우물살 격자
      dctx.strokeStyle = '#5c8362';
      dctx.lineWidth = 5;
      const cols = 6;
      const innerX = lx + 18;
      const innerW = lw - 36;
      const innerY = latticeY + 18;
      const innerH = latticeH - 36;
      for (let c = 1; c < cols; c++) {
        const vx = innerX + (innerW / cols) * c;
        dctx.beginPath();
        dctx.moveTo(vx, innerY);
        dctx.lineTo(vx, innerY + innerH);
        dctx.stroke();
      }
      // 상·중·하 정자살 교차 띠
      const hRows = [0.05, 0.10, 0.15, 0.20, 0.36, 0.50, 0.64, 0.80, 0.85, 0.90, 0.95];
      hRows.forEach(r => {
        const hy = innerY + innerH * r;
        dctx.beginPath();
        dctx.moveTo(innerX, hy);
        dctx.lineTo(innerX + innerW, hy);
        dctx.stroke();
      });

      // 작은 쇠 문고리 및 장식 못
      dctx.fillStyle = '#252624';
      const pullX = lx < 100 ? lx + lw - 30 : lx + 30;
      dctx.beginPath();
      dctx.arc(pullX, latticeY + latticeH * 0.72, 10, 0, Math.PI * 2);
      dctx.strokeStyle = '#1d1e1c';
      dctx.lineWidth = 4;
      dctx.stroke();
      dctx.beginPath();
      dctx.arc(pullX, latticeY + latticeH * 0.60, 6, 0, Math.PI * 2);
      dctx.fill();

      // 하단 궁판(목판) 배경 + 전통 부조 연꽃(연화문) 채색
      const panelX = lx + 20;
      const panelY = 708;
      const panelW = lw - 40;
      const panelH = 266;
      dctx.fillStyle = '#4e7254';
      dctx.fillRect(panelX, panelY, panelW, panelH);
      dctx.strokeStyle = '#7ba381';
      dctx.lineWidth = 6;
      dctx.strokeRect(panelX + 8, panelY + 8, panelW - 16, panelH - 16);

      // 연꽃 모티브 (사진 3 하단 연꽃 조각 참고: 주홍/분홍/청자빛 연화)
      const fcx = panelX + panelW / 2;
      const fcy = panelY + panelH * 0.54;
      // 연잎 줄기와 잎
      dctx.strokeStyle = '#335038';
      dctx.lineWidth = 5;
      dctx.beginPath();
      dctx.moveTo(fcx, panelY + panelH - 22);
      dctx.quadraticCurveTo(fcx - 10, fcy + 40, fcx, fcy + 10);
      dctx.stroke();

      dctx.fillStyle = '#6da078';
      dctx.beginPath();
      dctx.ellipse(fcx - 38, fcy + 42, 26, 12, -0.35, 0, Math.PI * 2);
      dctx.ellipse(fcx + 38, fcy + 42, 26, 12, 0.35, 0, Math.PI * 2);
      dctx.fill();

      // 활짝 핀 연꽃잎
      const isLeftLeaf = lx < 100;
      const petalMain = isLeftLeaf ? '#e3906e' : '#7b8fc7';
      const petalSoft = isLeftLeaf ? '#f4c6a8' : '#b7c7eb';
      [-0.55, -0.28, 0.28, 0.55, 0].forEach((ang, idx) => {
        dctx.save();
        dctx.translate(fcx, fcy + 8);
        dctx.rotate(ang);
        dctx.fillStyle = idx === 4 ? petalSoft : petalMain;
        dctx.beginPath();
        dctx.ellipse(0, -24, 15, 32, 0, 0, Math.PI * 2);
        dctx.fill();
        dctx.strokeStyle = '#3b4f3e';
        dctx.lineWidth = 2;
        dctx.stroke();
        dctx.restore();
      });
      dctx.fillStyle = '#e7c66c';
      dctx.beginPath();
      dctx.arc(fcx, fcy - 6, 10, 0, Math.PI * 2);
      dctx.fill();
    });

    const doorTex = new THREE.CanvasTexture(doorCanvas);
    doorTex.anisotropy = 4;

    // 2. 사진 3 기반 한국 전통 모로단청(인방·포벽) 텍스처
    const danCanvas = document.createElement('canvas');
    danCanvas.width = 1024;
    danCanvas.height = 256;
    const dct = danCanvas.getContext('2d');
    dct.fillStyle = '#4e7960'; // 뇌록색 바탕
    dct.fillRect(0, 0, 1024, 256);

    // 상하 주홍/황토 경계 띠
    dct.fillStyle = '#9b3a2e';
    dct.fillRect(0, 0, 1024, 26);
    dct.fillRect(0, 230, 1024, 26);
    dct.fillStyle = '#e2b857';
    dct.fillRect(0, 26, 1024, 8);
    dct.fillRect(0, 222, 1024, 8);

    // 반복되는 단청 머리초·금문 패턴
    for (let x = 64; x < 1024; x += 256) {
      // 파랑·초록·주홍·노랑 색실 아치 띠
      const colors = ['#2b5486', '#3d8f75', '#d9763c', '#c1382d', '#e8c468'];
      colors.forEach((col, i) => {
        dct.strokeStyle = col;
        dct.lineWidth = 10;
        dct.beginPath();
        dct.arc(x, 128, 72 - i * 11, 0, Math.PI * 2);
        dct.stroke();
      });
      // 중심 연화문
      dct.fillStyle = '#f2e8cf';
      dct.beginPath();
      dct.arc(x, 128, 16, 0, Math.PI * 2);
      dct.fill();
      dct.fillStyle = '#b9362b';
      dct.beginPath();
      dct.arc(x, 128, 8, 0, Math.PI * 2);
      dct.fill();

      // 중간 바 격자
      dct.fillStyle = '#2d4d3e';
      dct.fillRect(x + 92, 46, 72, 164);
      dct.strokeStyle = '#9bd1ae';
      dct.lineWidth = 4;
      dct.strokeRect(x + 98, 54, 60, 148);
    }
    const dancheongTex = new THREE.CanvasTexture(danCanvas);
    dancheongTex.wrapS = THREE.RepeatWrapping;
    dancheongTex.anisotropy = 4;

    // 3. 서까래 끝 마구리(연화 꽃무늬) 텍스처
    const rafCanvas = document.createElement('canvas');
    rafCanvas.width = 128;
    rafCanvas.height = 128;
    const rctx = rafCanvas.getContext('2d');
    rctx.fillStyle = '#3a6650';
    rctx.fillRect(0, 0, 128, 128);
    rctx.fillStyle = '#c43e2d';
    rctx.beginPath();
    rctx.arc(64, 64, 58, 0, Math.PI * 2);
    rctx.fill();
    rctx.fillStyle = '#316a56';
    rctx.beginPath();
    rctx.arc(64, 64, 46, 0, Math.PI * 2);
    rctx.fill();
    for (let i = 0; i < 8; i++) {
      rctx.save();
      rctx.translate(64, 64);
      rctx.rotate((i * Math.PI) / 4);
      rctx.fillStyle = '#f4ebd4';
      rctx.beginPath();
      rctx.ellipse(0, -24, 9, 17, 0, 0, Math.PI * 2);
      rctx.fill();
      rctx.restore();
    }
    rctx.fillStyle = '#e8b948';
    rctx.beginPath();
    rctx.arc(64, 64, 13, 0, Math.PI * 2);
    rctx.fill();
    const rafterCapTex = new THREE.CanvasTexture(rafCanvas);

    // 4. 한국 전통 기와골 텍스처
    const giwaCanvas = document.createElement('canvas');
    giwaCanvas.width = 512;
    giwaCanvas.height = 512;
    const gctx = giwaCanvas.getContext('2d');
    gctx.fillStyle = '#343940';
    gctx.fillRect(0, 0, 512, 512);
    const cols = 16;
    const cw = 512 / cols;
    for (let c = 0; c < cols; c++) {
      const gx = c * cw;
      const grad = gctx.createLinearGradient(gx, 0, gx + cw, 0);
      grad.addColorStop(0, '#22262b');
      grad.addColorStop(0.35, '#464d56');
      grad.addColorStop(0.65, '#3b4149');
      grad.addColorStop(1, '#202429');
      gctx.fillStyle = grad;
      gctx.fillRect(gx, 0, cw, 512);
    }
    gctx.strokeStyle = 'rgba(20, 22, 26, 0.45)';
    gctx.lineWidth = 2;
    for (let y = 32; y < 512; y += 32) {
      gctx.beginPath();
      gctx.moveTo(0, y);
      gctx.lineTo(512, y);
      gctx.stroke();
    }
    const giwaTex = new THREE.CanvasTexture(giwaCanvas);
    giwaTex.wrapS = THREE.RepeatWrapping;
    giwaTex.wrapT = THREE.RepeatWrapping;
    giwaTex.repeat.set(3, 2);

    // 5. 사진 2 기반 붉은 적벽돌 텍스처
    const brickCanvas = document.createElement('canvas');
    brickCanvas.width = 512;
    brickCanvas.height = 512;
    const bctx = brickCanvas.getContext('2d');
    bctx.fillStyle = '#c8bfb5'; // 줄눈 회색 모르타르
    bctx.fillRect(0, 0, 512, 512);
    const bRows = 12;
    const bCols = 6;
    const bh = 512 / bRows;
    const bw = 512 / bCols;
    const shades = ['#925140', '#834435', '#9d5b49', '#773d30', '#a6624f'];
    for (let r = 0; r < bRows; r++) {
      const offset = (r % 2) * (bw * 0.5);
      for (let c = -1; c <= bCols; c++) {
        bctx.fillStyle = shades[(r * 7 + c * 3 + 10) % shades.length];
        bctx.fillRect(c * bw + offset + 3, r * bh + 3, bw - 6, bh - 6);
      }
    }
    const brickTex = new THREE.CanvasTexture(brickCanvas);
    brickTex.wrapS = THREE.RepeatWrapping;
    brickTex.wrapT = THREE.RepeatWrapping;

    // 6. 사진 2 기반 대문 판문(세로 나무 판자 + 철제 경첩 + 광두정 못 + 문고리) 텍스처
    const makeGateLeafTex = (isRight) => {
      const gc = document.createElement('canvas');
      gc.width = 512;
      gc.height = 1024;
      const ctx = gc.getContext('2d');

      // 3개의 세로 원목 널빤지
      const plankCols = ['#84431a', '#914d1f', '#783c16'];
      for (let p = 0; p < 3; p++) {
        const px = p * (512 / 3);
        const pw = 512 / 3;
        const pgrad = ctx.createLinearGradient(px, 0, px + pw, 0);
        pgrad.addColorStop(0, '#6a3312');
        pgrad.addColorStop(0.25, plankCols[p]);
        pgrad.addColorStop(0.8, '#9b5524');
        pgrad.addColorStop(1, '#58290d');
        ctx.fillStyle = pgrad;
        ctx.fillRect(px, 0, pw, 1024);

        // 결 라인
        ctx.strokeStyle = 'rgba(42, 18, 6, 0.25)';
        ctx.lineWidth = 2;
        for (let k = 12; k < pw - 8; k += 18) {
          ctx.beginPath();
          ctx.moveTo(px + k, 0);
          ctx.bezierCurveTo(px + k + 4, 340, px + k - 4, 680, px + k, 1024);
          ctx.stroke();
        }
      }
      // 판자 사이 틈새 어두운 선
      ctx.fillStyle = '#2d1507';
      ctx.fillRect(169, 0, 5, 1024);
      ctx.fillRect(339, 0, 5, 1024);

      // 상하 철제 L자 경첩(바깥쪽 가장자리에 위치)
      ctx.fillStyle = '#222528';
      if (!isRight) {
        ctx.fillRect(0, 72, 165, 42);
        ctx.fillRect(0, 72, 42, 130);
        ctx.fillRect(0, 860, 165, 42);
        ctx.fillRect(0, 772, 42, 130);
      } else {
        ctx.fillRect(512 - 165, 72, 165, 42);
        ctx.fillRect(512 - 42, 72, 42, 130);
        ctx.fillRect(512 - 165, 860, 165, 42);
        ctx.fillRect(512 - 42, 772, 42, 130);
      }

      // 가로 3줄 철제 광두정(마름모 못 장식)
      [182, 466, 800].forEach(ry => {
        for (let sx = 38; sx <= 474; sx += 72) {
          ctx.save();
          ctx.translate(sx, ry);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = '#1b1d1f';
          ctx.fillRect(-10, -10, 20, 20);
          ctx.fillStyle = '#4c5258';
          ctx.fillRect(-4, -4, 8, 8);
          ctx.restore();
        }
      });

      // 중앙 문고리 원형 철판
      const ringX = isRight ? 42 : 512 - 42;
      const ringY = 540;
      ctx.fillStyle = '#1f2225';
      ctx.beginPath();
      ctx.arc(ringX, ringY, 64, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#474c52';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(ringX, ringY + 12, 34, 0, Math.PI * 2);
      ctx.stroke();

      return new THREE.CanvasTexture(gc);
    };

    this._koreanTexCache = {
      doorTex,
      dancheongTex,
      rafterCapTex,
      giwaTex,
      brickTex,
      gateLeftTex: makeGateLeafTex(false),
      gateRightTex: makeGateLeafTex(true)
    };
    return this._koreanTexCache;
  }

  // [한국 전통 처마 곡선(앙곡·안허리곡)을 구현한 기와 지붕 빌더]
  createKoreanCurvedRoof(group, { width, depth, baseY, ridgeHeight = 2.0, roofColor = 0x363b42, isStone = false, texSet }) {
    const eaveW = width + 2.5;
    const eaveD = depth + 2.6;
    const ridgeHalfW = Math.max(width * 0.30, eaveW * 0.5 - 1.75);
    const halfW = eaveW * 0.5;
    const halfD = eaveD * 0.5;

    const uSteps = 16;
    const vSteps = 10;
    const roofMat = new THREE.MeshStandardMaterial({
      map: isStone ? null : texSet.giwaTex,
      color: roofColor,
      roughness: isStone ? 0.85 : 0.72,
      side: THREE.DoubleSide
    });

    // 사면 경사면 생성 함수 (front: +1, back: -1)
    const buildMainSlope = (zSign) => {
      const positions = [];
      const uvs = [];
      const indices = [];
      for (let j = 0; j <= vSteps; j++) {
        const v = j / vSteps; // 0: 용마루, 1: 처마 끝
        const slopeDrop = ridgeHeight * (1 - Math.pow(v, 0.72));
        for (let i = 0; i <= uSteps; i++) {
          const u = (i / uSteps) * 2 - 1; // -1 .. +1
          const absU = Math.abs(u);
          const xAtRow = u * (ridgeHalfW * (1 - v) + halfW * (1 + 0.05 * v) * v);
          const zAtRow = zSign * (v * halfD * (1 + 0.05 * Math.pow(absU, 2.2) * v));
          // 처마 네 귀퉁이 추녀 들림(앙곡)
          const tipLift = (0.38 * Math.pow(absU, 2.0) * Math.pow(v, 1.4)) - (0.08 * Math.sin(v * Math.PI) * (1 - absU * 0.4));
          positions.push(xAtRow, baseY + slopeDrop + tipLift, zAtRow);
          uvs.push(i / uSteps, v);
        }
      }
      for (let j = 0; j < vSteps; j++) {
        for (let i = 0; i < uSteps; i++) {
          const a = j * (uSteps + 1) + i;
          const b = a + 1;
          const c = (j + 1) * (uSteps + 1) + i;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, roofMat);
      mesh.castShadow = true;
      group.add(mesh);
    };

    // 좌우 측면 지붕 경사면 (팔작/우진각 지붕 측면부)
    const buildSideSlope = (xSign) => {
      const positions = [];
      const uvs = [];
      const indices = [];
      for (let j = 0; j <= vSteps; j++) {
        const v = j / vSteps;
        const slopeDrop = ridgeHeight * (1 - Math.pow(v, 0.72));
        for (let i = 0; i <= 8; i++) {
          const w = (i / 8) * 2 - 1; // -1(뒤) .. +1(앞)
          const zAtRow = w * (v * halfD * 1.05);
          const xAtRow = xSign * (ridgeHalfW * (1 - v) + halfW * 1.05 * v);
          const tipLift = 0.38 * Math.pow(Math.abs(w), 1.6) * Math.pow(v, 1.4);
          positions.push(xAtRow, baseY + slopeDrop + tipLift, zAtRow);
          uvs.push(i / 8, v);
        }
      }
      for (let j = 0; j < vSteps; j++) {
        for (let i = 0; i < 8; i++) {
          const a = j * 9 + i;
          const b = a + 1;
          const c = (j + 1) * 9 + i;
          const d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, roofMat);
      mesh.castShadow = true;
      group.add(mesh);
    };

    buildMainSlope(1);
    buildMainSlope(-1);
    buildSideSlope(1);
    buildSideSlope(-1);

    // 용마루(지붕 꼭대기 기와 능선) + 양 끝 장식(치미/취두 느낌)
    const ridgeMat = new THREE.MeshStandardMaterial({ color: isStone ? 0x3b3f44 : 0x22262c, roughness: 0.7 });
    const ridgeBeam = new THREE.Mesh(new THREE.BoxGeometry(ridgeHalfW * 2 + 0.24, 0.28, 0.32), ridgeMat);
    ridgeBeam.position.set(0, baseY + ridgeHeight + 0.08, 0);
    group.add(ridgeBeam);

    [-ridgeHalfW - 0.08, ridgeHalfW + 0.08].forEach(rx => {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.38, 8), ridgeMat);
      cap.position.set(rx, baseY + ridgeHeight + 0.22, 0);
      cap.rotation.z = rx < 0 ? 0.22 : -0.22;
      group.add(cap);
    });

    // 어두운 처마 밑 소핏(하부 닫힘)
    const soffit = new THREE.Mesh(
      new THREE.BoxGeometry(eaveW - 0.5, 0.14, eaveD - 0.5),
      new THREE.MeshStandardMaterial({ color: isStone ? 0x45494e : 0x3f2419, roughness: 0.85 })
    );
    soffit.position.y = baseY + 0.06;
    group.add(soffit);
  }

  // [사용자 요청 반영: '전각모습' 사진을 참고한 전각 앞면 + 불사중 건물은 방문창살 없이 연두색 테두리 벽 마감 지원]
  createHanokBuilding({
    width,
    depth,
    height,
    roofColor = 0x353b42,
    woodColor = 0x6b2d24,
    pillarColor = null,
    doorCount = 3,
    openCenterBay = false,
    hasWoodenFish = true,
    lightGreenBorderWall = false
  }) {
    const group = new THREE.Group();
    const texSet = this.getKoreanTempleTextures();

    const actualPillarHex = pillarColor !== null ? pillarColor : woodColor;
    const isWhitePillar = pillarColor !== null && pillarColor > 0xdddddd;

    // 1. 화강암 기단부 + 정면 돌계단 및 장대석 댓돌 ('전각모습' 하단 석조 기단 재현)
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xc2bfb7, roughness: 0.88 });
    const darkStoneMat = new THREE.MeshStandardMaterial({ color: 0xa5a198, roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(width + 1.4, 0.8, depth + 1.4), baseMat);
    base.position.y = 0.4;
    base.receiveShadow = true;
    group.add(base);

    // 앞쪽 2단 돌계단 및 문 앞 장대석(댓돌)
    const stepW = Math.min(width * 0.58, 5.4);
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(stepW, 0.36, 0.85), baseMat);
    step1.position.set(0, 0.18, depth / 2 + 0.95);
    group.add(step1);
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(stepW - 0.35, 0.38, 0.55), darkStoneMat);
    step2.position.set(0, 0.55, depth / 2 + 0.72);
    group.add(step2);

    // 2. 몸체 외벽
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.2, height, depth - 0.2),
      new THREE.MeshStandardMaterial({ color: 0xdfd6c7, roughness: 0.88 })
    );
    wall.position.y = 0.8 + height / 2;
    group.add(wall);

    // 3. 전면 기둥 (석굴암: 흰색기둥 / 타 전각: '전각모습' 적갈색 기둥) + 사다리꼴 화강암 주춧돌 + 상단 단청 머리초
    const pillarMat = new THREE.MeshStandardMaterial({
      color: actualPillarHex,
      roughness: isWhitePillar ? 0.38 : 0.65
    });
    const frameWoodMat = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.68 });
    const ochreTrimMat = new THREE.MeshStandardMaterial({ color: 0xd89d6a, roughness: 0.72 });
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0xb5b1a8, roughness: 0.88 });
    const pRadius = 0.23;
    const pHeight = height;

    const colCount = doorCount + 1;
    const colStep = width / (colCount - 1);
    const frontColX = [];
    for (let c = 0; c < colCount; c++) frontColX.push(-width / 2 + c * colStep);

    frontColX.forEach((px, idx) => {
      // '전각모습' 사진의 각진 사다리꼴 화강암 주춧돌
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.26, 4), plinthMat);
      plinth.rotation.y = Math.PI / 4;
      plinth.position.set(px, 0.93, depth / 2 + 0.05);
      group.add(plinth);

      const pMesh = new THREE.Mesh(new THREE.CylinderGeometry(pRadius * 0.94, pRadius, pHeight, 16), pillarMat);
      pMesh.position.set(px, 0.8 + pHeight / 2, depth / 2 + 0.05);
      pMesh.castShadow = true;
      group.add(pMesh);

      // 기둥 상단 연화 단청 머리초
      const collarRing = new THREE.Mesh(
        new THREE.CylinderGeometry(pRadius + 0.016, pRadius + 0.016, 0.48, 16),
        new THREE.MeshStandardMaterial({ map: texSet.dancheongTex, roughness: 0.58 })
      );
      collarRing.position.set(px, 0.8 + pHeight - 0.26, depth / 2 + 0.05);
      group.add(collarRing);

      // '전각모습' 사진의 기둥 중간 목어(목탁) 조각 장식
      if (hasWoodenFish && idx === Math.floor(colCount / 2)) {
        const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.26), frameWoodMat);
        bracket.position.set(px, 0.8 + pHeight * 0.62, depth / 2 + 0.24);
        group.add(bracket);
        const moktakOrnament = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 12, 12),
          new THREE.MeshStandardMaterial({ color: 0xa6896d, roughness: 0.75 })
        );
        moktakOrnament.scale.set(1.15, 0.88, 0.95);
        moktakOrnament.position.set(px, 0.8 + pHeight * 0.62 + 0.11, depth / 2 + 0.26);
        group.add(moktakOrnament);
      }
    });

    // 후면 기둥
    [[-width / 2, -depth / 2], [width / 2, -depth / 2], [0, -depth / 2]].forEach(([px, pz]) => {
      const pMesh = new THREE.Mesh(new THREE.CylinderGeometry(pRadius, pRadius, pHeight, 12), pillarMat);
      pMesh.position.set(px, 0.8 + pHeight / 2, pz);
      group.add(pMesh);
    });

    // 4. '전각모습' 사진의 초록색 격자 창살문 + 하단 연꽃 궁판 + 기둥 옆 황토색 세로 액자 패널
    const doorMat = new THREE.MeshStandardMaterial({
      map: texSet.doorTex,
      emissive: 0xffffff,
      emissiveMap: texSet.doorTex,
      emissiveIntensity: 0.42,
      roughness: 0.55,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const lintelHeight = height * 0.22;
    const doorH = height * 0.73;

    // 정면 가로 문인방
    const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 0.16, 0.24), frameWoodMat);
    frontBeam.position.set(0, 0.8 + doorH + 0.14, depth / 2 + 0.03);
    group.add(frontBeam);

    for (let d = 0; d < doorCount; d++) {
      const isCenter = openCenterBay && d === Math.floor(doorCount / 2);
      const doorCenterX = (frontColX[d] + frontColX[d + 1]) / 2;
      const bayW = colStep - pRadius * 1.85;
      const doorW = bayW * 0.84;

      if (!isCenter) {
        if (lightGreenBorderWall) {
          // [사용자 요청 반영: 불사중 건물은 방문창살을 없애고 연두색 테두리 벽으로 깔끔하게 마감]
          const lightGreenMat = new THREE.MeshStandardMaterial({ color: 0x8ccf72, roughness: 0.68 });
          const cleanWallMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.82 });

          // 연두색 테두리 바탕 판
          const greenBorderPanel = new THREE.Mesh(new THREE.BoxGeometry(bayW + 0.04, doorH + 0.12, 0.09), lightGreenMat);
          greenBorderPanel.position.set(doorCenterX, 0.8 + doorH / 2 + 0.06, depth / 2 + 0.01);
          group.add(greenBorderPanel);

          // 연두색 테두리 안쪽의 깔끔한 마감 벽면 (방문창살 완전 제거)
          const borderThickness = 0.22;
          const innerWallPanel = new THREE.Mesh(
            new THREE.BoxGeometry(bayW - borderThickness * 2, doorH - borderThickness * 2 + 0.06, 0.11),
            cleanWallMat
          );
          innerWallPanel.position.set(doorCenterX, 0.8 + doorH / 2 + 0.06, depth / 2 + 0.015);
          group.add(innerWallPanel);
        } else {
          // '전각모습' 기둥 양옆 주황/황토색 액자형 문선 배접 패널
          const trimBack = new THREE.Mesh(new THREE.BoxGeometry(bayW, doorH + 0.08, 0.08), ochreTrimMat);
          trimBack.position.set(doorCenterX, 0.8 + doorH / 2 + 0.06, depth / 2 - 0.01);
          group.add(trimBack);

          // 초록 꽃살문 + 연꽃 궁판
          const doorBox = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.06), frameWoodMat);
          doorBox.position.set(doorCenterX, 0.8 + doorH / 2 + 0.06, depth / 2 + 0.03);
          group.add(doorBox);

          const doorFace = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 0.04, doorH - 0.04), doorMat);
          doorFace.position.set(doorCenterX, 0.8 + doorH / 2 + 0.06, depth / 2 + 0.068);
          group.add(doorFace);
        }
      }
    }

    // 5. 상단 모로단청 공포대/창방 띠 ('전각모습' 상단 화려한 단청)
    const danMat = new THREE.MeshStandardMaterial({
      map: texSet.dancheongTex,
      emissive: 0xffffff,
      emissiveMap: texSet.dancheongTex,
      emissiveIntensity: 0.30,
      roughness: 0.58
    });
    const dancheongFrieze = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, lintelHeight * 0.78, depth + 0.5), danMat);
    dancheongFrieze.position.y = 0.8 + height + (lintelHeight * 0.36);
    group.add(dancheongFrieze);

    // 6. '전각모습' 처마 밑 촘촘한 초록색 연화문 서까래 행렬
    const rafterCount = Math.max(12, Math.round(width * 2.2));
    const rafStep = (width + 1.4) / (rafterCount - 1);
    const rafBodyMat = new THREE.MeshStandardMaterial({ color: 0x3b6752, roughness: 0.68 });
    const rafCapMat = new THREE.MeshStandardMaterial({ map: texSet.rafterCapTex, roughness: 0.52 });
    const rafY = 0.8 + height + lintelHeight * 0.72;
    const rafGeo = new THREE.CylinderGeometry(0.10, 0.11, 1.35, 10);
    rafGeo.rotateX(Math.PI / 2 + 0.18);

    for (let r = 0; r < rafterCount; r++) {
      const rx = -(width + 1.4) / 2 + r * rafStep;
      const raf = new THREE.Mesh(rafGeo, [rafBodyMat, rafCapMat, rafBodyMat]);
      raf.position.set(rx, rafY, depth / 2 + 0.58);
      group.add(raf);
    }

    // 7. 한국 전통 곡선 기와지붕
    this.createKoreanCurvedRoof(group, {
      width,
      depth,
      baseY: 0.8 + height + lintelHeight * 0.78,
      ridgeHeight: Math.max(1.75, width * 0.18),
      roofColor,
      isStone: false,
      texSet
    });

    return group;
  }

  // [사용자 요청 반영: 입구는 간단하게, '절대문' 사진 및 스케치 2를 참고하여 벽돌은 빼고 대문과 지붕만 깔끔하게 모델링]
  createHojimun(x, y, z) {
    const group = new THREE.Group();
    const texSet = this.getKoreanTempleTextures();

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xc8c3ba, roughness: 0.88 });
    const woodPostMat = new THREE.MeshStandardMaterial({ color: 0x4d2814, roughness: 0.72 });
    const subFrameMat = new THREE.MeshStandardMaterial({ color: 0x66361c, roughness: 0.72 });

    // 1. 스케치 2 하단부의 넓고 깔끔한 화강암 문턱 기단
    const stepBase = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.22, 1.45), stoneMat);
    stepBase.position.set(0, 0.11, 0);
    stepBase.receiveShadow = true;
    group.add(stepBase);

    // 2. 벽돌 없이 깔끔한 목조 대문 기둥 프레임 (스케치 2의 좌우 이중 기둥 선 반영)
    [-2.05, 2.05].forEach((px) => {
      const mainPost = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, 3.4, 14), woodPostMat);
      mainPost.position.set(px, 0.22 + 1.7, 0);
      mainPost.castShadow = true;
      group.add(mainPost);
    });

    [-1.52, 1.52].forEach((px) => {
      const innerPost = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.35, 0.22), subFrameMat);
      innerPost.position.set(px, 0.22 + 1.675, 0);
      innerPost.castShadow = true;
      group.add(innerPost);
    });

    // 상단 목조 문인방(상인방) 들보
    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.26, 0.36), woodPostMat);
    topBeam.position.set(0, 3.52, 0);
    topBeam.castShadow = true;
    group.add(topBeam);

    // 3. 스케치 2 상단의 양끝이 살짝 들린 단아한 전통 기와지붕
    this.createKoreanCurvedRoof(group, {
      width: 4.3,
      depth: 1.7,
      baseY: 3.62,
      ridgeHeight: 1.05,
      roofColor: 0x363b42,
      isStone: false,
      texSet
    });

    // 4. '절대문' 사진 완벽 반영: 세로 결 원목 널빤지 + 검은 철제 경첩 + 3줄 마름모 광두정 못 + 둥근 문고리가 달린 두 짝 대문
    // 스케치 2처럼 양쪽으로 비스듬히 열려 있어 앞에서도 문짝과 둥근 문고리가 잘 보이고 사이로 지나다닐 수 있음
    const doorW = 1.42;
    const doorH = 3.12;
    const ringIronMat = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.45, metalness: 0.7 });

    const leftDoorPivot = new THREE.Group();
    leftDoorPivot.position.set(-1.44, 0.22, 0.04);
    leftDoorPivot.rotation.y = 1.12; // 양쪽 귀가 가리지 않도록 여유 있게 열림
    const leftDoorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, doorH, 0.09),
      new THREE.MeshStandardMaterial({ map: texSet.gateLeftTex, roughness: 0.65 })
    );
    leftDoorMesh.position.set(doorW / 2, doorH / 2, 0);
    leftDoorMesh.castShadow = true;
    leftDoorPivot.add(leftDoorMesh);

    // 스케치 2의 입체 둥근 문고리 (왼쪽 문)
    const leftRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 10, 20), ringIronMat);
    leftRing.position.set(doorW * 0.82, doorH * 0.48, 0.065);
    leftDoorPivot.add(leftRing);
    group.add(leftDoorPivot);

    const rightDoorPivot = new THREE.Group();
    rightDoorPivot.position.set(1.44, 0.22, 0.04);
    rightDoorPivot.rotation.y = -1.12;
    const rightDoorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, doorH, 0.09),
      new THREE.MeshStandardMaterial({ map: texSet.gateRightTex, roughness: 0.65 })
    );
    rightDoorMesh.position.set(-doorW / 2, doorH / 2, 0);
    rightDoorMesh.castShadow = true;
    rightDoorPivot.add(rightDoorMesh);

    // 스케치 2의 입체 둥근 문고리 (오른쪽 문)
    const rightRing = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 10, 20), ringIronMat);
    rightRing.position.set(-doorW * 0.82, doorH * 0.48, 0.065);
    rightDoorPivot.add(rightRing);
    group.add(rightDoorPivot);

    // 지붕 아래 하얀 바탕 검정 글씨 현판 ('저 절로')
    this.createSignboard(group, '저 절로', '', 0, 3.55, 1.15, 2.0, 0.56);

    // 좌우 문기둥 및 열린 문짝 충돌체 등록 (가운데 대문 통로만 통과 가능하고 옆벽은 통과 불가)
    this.addBoxObstacle(x - 2.35, x - 1.05, z - 1.15, z + 0.85);
    this.addBoxObstacle(x + 1.05, x + 2.35, z - 1.15, z + 0.85);

    group.position.set(x, y, z);
    this.scene.add(group);

    this.registerInteractable({
      id: 'hojimun',
      name: '입구 (저 절로 대문)',
      desc: '도심 속 천년고찰, 언제든 마음이 쉬어가는 평화로운 도량 저 절로로 들어서는 정겨운 나무 대문입니다.',
      position: new THREE.Vector3(x, 0, z + 4.2),
      lookTarget: new THREE.Vector3(x, 1.8, z),
      enterable: false
    });
  }

  // [사용자 요청 완벽 반영: 입구 바로 중앙에서 살짝 왼쪽에 위치한 아기부처님 관욕식(灌浴式) 단]
  // 사진 '관욕식' 참고: 은빛 아기 부처님(천상천하 유아독존), 연꽃 화반(수조), 바닥과 주변의 풍성하고 아기자기한 오색 꽃들, 목재 제단, 감로수 표주박
  createGwanyokAltar(x, y, z) {
    const group = new THREE.Group();

    // 1. 목재 관욕대 테이블 (긴 원목 화대)
    const tableMat = new THREE.MeshStandardMaterial({ color: 0x6e4528, roughness: 0.72 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.1), tableMat);
    tableTop.position.y = 0.78;
    tableTop.castShadow = true;
    tableTop.receiveShadow = true;
    group.add(tableTop);

    // 테이블 4개 다리
    [-1.05, 1.05].forEach(lx => {
      [-0.42, 0.42].forEach(lz => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.78, 0.10), tableMat);
        leg.position.set(lx, 0.39, lz);
        leg.castShadow = true;
        group.add(leg);
      });
    });

    // 테이블 앞쪽 하단 보조 서안(낮은 작은 전통 탁자)
    const subTableMat = new THREE.MeshStandardMaterial({ color: 0x482d1a, roughness: 0.65 });
    const subTable = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.38, 0.55), subTableMat);
    subTable.position.set(0, 0.19, 0.72);
    subTable.receiveShadow = true;
    group.add(subTable);

    // 2. 아기 부처님이 모셔진 관불식 화반 & 초록 잔디 대좌 & 2단 연화대 (사진 '관욕식' 완벽 참고)
    // 화반 받침대 (짙은 자단색 받침)
    const trayBaseMat = new THREE.MeshStandardMaterial({ color: 0x4e322c, roughness: 0.65 });
    const trayBase = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.58), trayBaseMat);
    trayBase.position.set(0, 0.84 + 0.04, 0);
    trayBase.castShadow = true;
    group.add(trayBase);

    // 그 위 푸른 잔디 단 (사진 속 아기 부처님 발아래 초록 잔디 매트)
    const turfMat = new THREE.MeshStandardMaterial({ color: 0x3f7e32, roughness: 0.92 });
    const turfBed = new THREE.Mesh(new THREE.BoxGeometry(0.90, 0.05, 0.52), turfMat);
    turfBed.position.set(0, 0.84 + 0.10, 0);
    group.add(turfBed);

    // 수조 중앙 2단 연화대 (아기부처님 황금 연꽃 좌대)
    const lotusBaseMat = new THREE.MeshStandardMaterial({
      color: 0xe2b94e,
      roughness: 0.32,
      metalness: 0.45,
      emissive: 0x45350f,
      emissiveIntensity: 0.28
    });
    const lotusBaseLower = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.25, 0.07, 16), lotusBaseMat);
    lotusBaseLower.position.set(0, 0.84 + 0.16, 0);
    group.add(lotusBaseLower);
    const lotusBaseUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.08, 16), lotusBaseMat);
    lotusBaseUpper.position.set(0, 0.84 + 0.23, 0);
    group.add(lotusBaseUpper);
    // 연화대 둘레 입체 연꽃잎 조각
    for (let lp = 0; lp < 12; lp++) {
      const lAng = (lp / 12) * Math.PI * 2;
      const lPetal = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 8), lotusBaseMat);
      lPetal.scale.set(0.85, 1.35, 0.5);
      lPetal.position.set(Math.cos(lAng) * 0.20, 0.84 + 0.21, Math.sin(lAng) * 0.20);
      lPetal.rotation.y = -lAng + Math.PI / 2;
      lPetal.rotation.x = -0.35;
      group.add(lPetal);
    }

    // 3. [사용자 요청 완벽 반영: 아기 부처님을 금빛으로 바꾸고 눈·코·입 및 양쪽 작은 동그라미 제거]
    const babyBuddhaGroup = new THREE.Group();
    babyBuddhaGroup.position.set(0, 0.84 + 0.27, 0);

    // 아기 부처님 온화하고 화사한 황금빛 피부 재질
    const goldSkinMat = new THREE.MeshStandardMaterial({
      color: 0xf7d060,
      roughness: 0.25,
      metalness: 0.58,
      emissive: 0x6b4c0c,
      emissiveIntensity: 0.38
    });
    // 아기 부처님 금빛 가사(천의) 재질 (한 톤 깊은 황금빛)
    const goldRobeMat = new THREE.MeshStandardMaterial({
      color: 0xe2a828,
      roughness: 0.30,
      metalness: 0.55,
      emissive: 0x543806,
      emissiveIntensity: 0.32
    });
    // 동글동글 귀여운 아기 부처님 검은색 머리카락(나발) & 육계 재질
    const goldHairMat = new THREE.MeshStandardMaterial({
      color: 0x1c1f24,
      roughness: 0.72,
      metalness: 0.12
    });
    // 온화한 미소와 눈매를 표현하는 짙은 금동 포인트 재질
    const goldFeatureMat = new THREE.MeshStandardMaterial({
      color: 0x6e470c,
      roughness: 0.35,
      metalness: 0.45
    });

    // 두 발과 통통하고 짧은 아기 다리 (연화대 위에 나란히 서 계신 동글동글한 비율)
    [-0.048, 0.048].forEach(dx => {
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 12), goldSkinMat);
      foot.scale.set(1.0, 0.68, 1.38);
      foot.position.set(dx, 0.022, 0.025);
      babyBuddhaGroup.add(foot);

      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.036, 0.14, 14), goldSkinMat);
      leg.position.set(dx, 0.095, 0);
      leg.castShadow = true;
      babyBuddhaGroup.add(leg);
    });

    // 치마처럼 허리부터 무릎까지 둥글고 풍성하게 감싼 금빛 하의 가사
    const lowerRobe = new THREE.Mesh(new THREE.CylinderGeometry(0.106, 0.132, 0.165, 22), goldRobeMat);
    lowerRobe.position.set(0, 0.20, 0);
    lowerRobe.castShadow = true;
    babyBuddhaGroup.add(lowerRobe);

    // 부드러운 곡선 주름 디테일
    for (let f = -2; f <= 2; f++) {
      const fold = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.014, 0.155, 10), goldRobeMat);
      fold.position.set(f * 0.030, 0.20, 0.112 - Math.abs(f) * 0.008);
      fold.rotation.z = f * 0.05;
      babyBuddhaGroup.add(fold);
    }

    // 동글동글 통통한 아기 부처님 상체
    const upperTorso = new THREE.Mesh(new THREE.SphereGeometry(0.118, 22, 18), goldSkinMat);
    upperTorso.scale.set(1.06, 1.06, 0.94);
    upperTorso.position.set(0, 0.325, 0);
    upperTorso.castShadow = true;
    babyBuddhaGroup.add(upperTorso);

    // 왼쪽 어깨에서 오른쪽 허리로 비스듬히 걸쳐진 금빛 가사 띠(편단우견)
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.028, 14, 26), goldRobeMat);
    sash.position.set(0.012, 0.325, 0);
    sash.rotation.y = 0.24;
    sash.rotation.z = -0.68;
    sash.scale.set(1.08, 1.12, 0.96);
    babyBuddhaGroup.add(sash);

    // 짧은 아기 목
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.056, 0.045, 14), goldSkinMat);
    neck.position.set(0, 0.425, 0);
    babyBuddhaGroup.add(neck);

    // 동글동글 귀엽고 복스러운 아기 부처님 큰 머리 (황금상)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 0.545, 0);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.142, 26, 22), goldSkinMat);
    head.scale.set(1.06, 0.98, 0.98);
    head.castShadow = true;
    headGroup.add(head);

    // 통통한 양 볼
    [-0.068, 0.068].forEach(cx => {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.042, 14, 12), goldSkinMat);
      cheek.scale.set(1.15, 0.9, 0.75);
      cheek.position.set(cx, -0.028, 0.112);
      headGroup.add(cheek);
    });

    // 귀엽고 오똑한 작은 코
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), goldSkinMat);
    nose.scale.set(1.0, 0.9, 1.1);
    nose.position.set(0, -0.012, 0.140);
    headGroup.add(nose);

    // 온화하게 웃는 반달 눈과 미소
    [-0.048, 0.048].forEach(ex => {
      const eye = new THREE.Mesh(new THREE.TorusGeometry(0.017, 0.0042, 8, 14, Math.PI), goldFeatureMat);
      eye.position.set(ex, 0.010, 0.132);
      eye.rotation.y = ex < 0 ? -0.22 : 0.22;
      headGroup.add(eye);
    });
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0042, 8, 16, Math.PI), goldFeatureMat);
    smile.position.set(0, -0.040, 0.132);
    smile.rotation.z = Math.PI;
    headGroup.add(smile);

    // 이마 백호(작은 금구슬)
    const urna = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 10), goldRobeMat);
    urna.position.set(0, 0.045, 0.136);
    headGroup.add(urna);

    // 황금 나발(동글동글한 소라 모양 머리카락 캡 & 웨이브)
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.146, 26, 20, 0, Math.PI * 2, 0, Math.PI * 0.56),
      goldHairMat
    );
    hairCap.scale.set(1.06, 0.98, 0.98);
    hairCap.position.set(0, 0.016, -0.010);
    hairCap.rotation.x = -0.20;
    headGroup.add(hairCap);

    // 앞이마를 따라 동글동글한 나발 구슬 장식
    for (let c = -4; c <= 4; c++) {
      const ang = c * 0.26;
      const curl = new THREE.Mesh(new THREE.SphereGeometry(0.020, 10, 10), goldHairMat);
      curl.position.set(Math.sin(ang) * 0.132, 0.068 + Math.cos(ang) * 0.012, Math.cos(ang) * 0.112 - 0.01);
      headGroup.add(curl);
    }

    // 정수리 동글동글한 황금 육계
    const ushnisha = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 14), goldHairMat);
    ushnisha.scale.set(1.12, 0.85, 1.12);
    ushnisha.position.set(0, 0.150, -0.012);
    headGroup.add(ushnisha);

    // 복스러운 동글한 귀 (양쪽 귓불)
    [-0.142, 0.142].forEach(ex => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 12), goldSkinMat);
      ear.scale.set(0.58, 1.38, 0.78);
      ear.position.set(ex, -0.012, 0.0);
      headGroup.add(ear);
    });

    babyBuddhaGroup.add(headGroup);

    // [통통하고 매끄럽게 이어진 아기 팔 포즈: 오른손은 하늘, 왼손은 땅]
    const rightShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 12), goldSkinMat);
    rightShoulder.position.set(-0.108, 0.375, 0.01);
    babyBuddhaGroup.add(rightShoulder);

    const rightUpperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.031, 0.095, 14), goldSkinMat);
    rightUpperArm.position.set(-0.142, 0.384, 0.012);
    rightUpperArm.rotation.z = -1.36;
    babyBuddhaGroup.add(rightUpperArm);

    const rightElbow = new THREE.Mesh(new THREE.SphereGeometry(0.033, 14, 12), goldSkinMat);
    rightElbow.position.set(-0.178, 0.395, 0.015);
    babyBuddhaGroup.add(rightElbow);

    const rightForeArm = new THREE.Mesh(new THREE.CylinderGeometry(0.029, 0.032, 0.135, 14), goldSkinMat);
    rightForeArm.position.set(-0.182, 0.460, 0.018);
    rightForeArm.rotation.z = -0.06;
    babyBuddhaGroup.add(rightForeArm);

    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.032, 14, 12), goldSkinMat);
    rightHand.position.set(-0.186, 0.528, 0.02);
    babyBuddhaGroup.add(rightHand);

    // 하늘을 가리키는 오른손 검지손가락
    const rightFinger = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.048, 10), goldSkinMat);
    rightFinger.position.set(-0.186, 0.566, 0.02);
    babyBuddhaGroup.add(rightFinger);

    // 왼팔 (몸통 옆으로 자연스럽게 내려 땅을 가리킴 - 유아독존)
    const leftShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.035, 14, 12), goldRobeMat);
    leftShoulder.position.set(0.106, 0.370, 0.01);
    babyBuddhaGroup.add(leftShoulder);

    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.028, 0.19, 14), goldSkinMat);
    leftArm.position.set(0.132, 0.275, 0.01);
    leftArm.rotation.z = 0.20;
    babyBuddhaGroup.add(leftArm);

    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.030, 14, 12), goldSkinMat);
    leftHand.position.set(0.152, 0.180, 0.015);
    babyBuddhaGroup.add(leftHand);

    // 땅을 가리키는 왼손 검지손가락
    const leftFinger = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.007, 0.042, 10), goldSkinMat);
    leftFinger.position.set(0.154, 0.148, 0.015);
    babyBuddhaGroup.add(leftFinger);

    // 금빛 아기 부처님 정면과 후면을 화사하게 비추는 전용 조명
    const babyGlowFront = new THREE.PointLight(0xfff4d0, 0.95, 4.0);
    babyGlowFront.position.set(0, 0.55, 0.65);
    babyGlowFront.add(new THREE.Object3D());
    babyBuddhaGroup.add(babyGlowFront);

    const babyGlowBack = new THREE.PointLight(0xffe8a3, 0.65, 3.5);
    babyGlowBack.position.set(0, 0.48, -0.35);
    babyBuddhaGroup.add(babyGlowBack);

    group.add(babyBuddhaGroup);

    // 4. 앞쪽 작은 전통 탁자(subTable) 위의 불전함 & 유리 감로수 수조와 원목 표주박 (사진 '관욕식' 하단 그대로 재현)
    // 좌측: 원목 불전함(보시함)
    const boxWoodMat = new THREE.MeshStandardMaterial({ color: 0xd8a15d, roughness: 0.65 });
    const donationBox = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.36, 0.28), boxWoodMat);
    donationBox.position.set(-0.28, 0.38 + 0.18, 0.72);
    donationBox.castShadow = true;
    group.add(donationBox);

    // 우측: 청자빛 받침 대야와 투명 감로수 단지
    const ceramicBasinMat = new THREE.MeshStandardMaterial({ color: 0x4b687a, roughness: 0.35, metalness: 0.2 });
    const frontBasin = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.20, 0.09, 20), ceramicBasinMat);
    frontBasin.position.set(0.26, 0.38 + 0.045, 0.72);
    group.add(frontBasin);

    const glassJarMat = new THREE.MeshStandardMaterial({
      color: 0xdff4ff,
      roughness: 0.12,
      metalness: 0.1,
      transparent: true,
      opacity: 0.65
    });
    const waterJar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.26, 20), glassJarMat);
    waterJar.position.set(0.26, 0.38 + 0.20, 0.72);
    group.add(waterJar);

    // 단지 위 원목 뚜껑 및 대나무 표주박(국자)
    const dipperMat = new THREE.MeshStandardMaterial({ color: 0xd4a36b, roughness: 0.65 });
    const jarLid = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 20), dipperMat);
    jarLid.position.set(0.26, 0.38 + 0.34, 0.72);
    group.add(jarLid);

    const dipperGroup = new THREE.Group();
    const dipperCup = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.065, 12), dipperMat);
    dipperGroup.add(dipperCup);
    const dipperHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.36, 8), dipperMat);
    dipperHandle.rotation.z = Math.PI / 2;
    dipperHandle.position.set(0.19, 0.01, 0);
    dipperGroup.add(dipperHandle);
    dipperGroup.position.set(0.20, 0.38 + 0.38, 0.72);
    dipperGroup.rotation.z = -0.08;
    group.add(dipperGroup);

    // 5. [사용자 요청 완벽 반영: 바닥과 주변은 아기자기하고 풍성한 작은 꽃들로 구성]
    // 사진 '관욕식'처럼 분홍, 노랑, 하양, 연꽃잎(연청록)의 작은 꽃송이들과 잎사귀들이 테이블 위와 주변 바닥에 소복하게 장식됨
    const petalColors = [0xff7ba5, 0xffd54f, 0xffffff, 0xf06292, 0xffb74d, 0x81c784];
    const flowerGeo = new THREE.SphereGeometry(0.042, 7, 6);
    const leafGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.015, 8);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x5a8868, roughness: 0.82 });

    // 테이블 위 수조 주변 꽃 장식 (수조 둘레)
    for (let f = 0; f < 32; f++) {
      const ang = (f / 32) * Math.PI * 2;
      const r = 0.58 + Math.random() * 0.42;
      const fx = Math.cos(ang) * r;
      const fz = Math.sin(ang) * (r * 0.72);
      const c = petalColors[f % petalColors.length];
      const flMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
      const fl = new THREE.Mesh(flowerGeo, flMat);
      fl.position.set(fx, 0.84 + 0.02 + Math.random() * 0.03, fz);
      fl.scale.set(0.9 + Math.random() * 0.4, 0.7, 0.9 + Math.random() * 0.4);
      group.add(fl);
    }

    // 바닥과 테이블 주변의 풍성한 오색 작은 꽃들과 연잎들 (사진 속 바닥 꽃 장식)
    for (let g = 0; g < 64; g++) {
      const ang = Math.random() * Math.PI * 2;
      const r = 0.85 + Math.random() * 1.35;
      const gx = Math.cos(ang) * (r * 1.15);
      const gz = Math.sin(ang) * (r * 0.85);
      if (Math.abs(gx) < 0.35 && gz > 0.8) continue; // 앞쪽 캐릭터 참배 발판 공간 확보

      if (g % 3 === 0) {
        // 넓은 연잎/수련잎
        const leaf = new THREE.Mesh(leafGeo, leafMat);
        leaf.position.set(gx, 0.02 + Math.random() * 0.04, gz);
        leaf.rotation.y = Math.random() * Math.PI;
        leaf.scale.set(0.9 + Math.random() * 0.5, 1, 0.9 + Math.random() * 0.5);
        group.add(leaf);
      } else {
        // 작은 오색 꽃송이
        const c = petalColors[g % petalColors.length];
        const flMat = new THREE.MeshStandardMaterial({ color: c, roughness: 0.65 });
        const fl = new THREE.Mesh(flowerGeo, flMat);
        fl.position.set(gx, 0.03 + Math.random() * 0.06, gz);
        fl.scale.set(0.8 + Math.random() * 0.5, 0.7 + Math.random() * 0.4, 0.8 + Math.random() * 0.5);
        group.add(fl);
      }
    }

    // 6. 관욕식 관욕수 감로수 파티클 그룹 (적당한 크기의 맑은 물방울 조형)
    const splashGroup = new THREE.Group();
    splashGroup.position.set(0, 0.84 + 0.56, 0.08);
    const dropMat = new THREE.MeshBasicMaterial({ color: 0x72d6ff, transparent: true, opacity: 0.90 });
    const dropHighlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.88 });
    const dropGeo = new THREE.SphereGeometry(0.020, 10, 10);
    dropGeo.scale(0.88, 1.32, 0.88); // 물방울 모양으로 세로로 살짝 길게
    const splashDrops = [];
    for (let d = 0; d < 14; d++) {
      const drop = new THREE.Mesh(dropGeo, d % 3 === 0 ? dropHighlightMat : dropMat);
      drop.visible = false;
      splashGroup.add(drop);
      splashDrops.push(drop);
    }
    group.add(splashGroup);
    this.gwanyokSplashDrops = splashDrops;

    group.position.set(x, y, z);
    this.scene.add(group);
    this.gwanyokPos = new THREE.Vector3(x, y, z);

    // 관욕대 테이블 장애물 충돌체 등록
    this.addBoxObstacle(x - 1.35, x + 1.35, z - 0.75, z + 0.75);

    // 전각 인터랙터블 등록
    this.registerInteractable({
      id: 'gwanyok',
      name: '아기 부처님 관욕식(灌浴式)',
      desc: '아기 부처님께 맑은 감로수를 부어 몸과 마음을 씻어내는 관욕예식입니다.',
      position: new THREE.Vector3(x, 0, z + 1.55), // 관욕대 바로 앞
      lookTarget: new THREE.Vector3(x, 1.25, z),
      triggerRadius: 2.0,
      enterable: true,
      enterType: 'gwanyok'
    });
  }

  // [사용자 요청 반영: 탑전(묘보탑)은 먼저 만든 8각9층 석탑 그대로 사용]
  createPagoda(x, y, z) {
    const pagoda = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9fa1a4, roughness: 0.85, flatShading: true });

    const base1 = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.8, 8), stoneMat);
    base1.position.y = 0.4;
    pagoda.add(base1);

    const base2 = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 0.7, 8), stoneMat);
    base2.position.y = 1.15;
    pagoda.add(base2);

    let currentY = 1.5;
    let radius = 1.6;
    for (let layer = 1; layer <= 9; layer++) {
      const hScale = Math.pow(0.92, layer);
      const bodyMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.72, radius * 0.78, 0.45 * hScale, 8), stoneMat);
      bodyMesh.position.y = currentY + (0.45 * hScale) / 2;
      pagoda.add(bodyMesh);
      currentY += 0.45 * hScale;

      const roofMesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.4, radius * 1.05, 0.28 * hScale, 8), stoneMat);
      roofMesh.position.y = currentY + (0.28 * hScale) / 2;
      pagoda.add(roofMesh);
      currentY += 0.28 * hScale;

      radius *= 0.91;
    }

    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 12), new THREE.MeshStandardMaterial({ color: 0xbfa760, roughness: 0.3, metalness: 0.6 }));
    finial.position.y = currentY + 0.4;
    pagoda.add(finial);

    this.createPagodaBasePlaque(pagoda);

    this.pagodaPos = new THREE.Vector3(x, y, z);
    pagoda.position.set(x, y, z);
    this.scene.add(pagoda);

    this.addObstacle(x, z, 2.9);

    const ring = new THREE.Mesh(new THREE.RingGeometry(5.2, 7.2, 48), new THREE.MeshStandardMaterial({ color: 0xc8bea6, roughness: 0.9, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.02, z);
    this.scene.add(ring);

    const markerGroup = new THREE.Group();
    const stonePlate = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.1, 16), new THREE.MeshStandardMaterial({ color: 0xaa9f88, roughness: 0.8 }));
    stonePlate.position.y = 0.05;
    markerGroup.add(stonePlate);

    const lotusEmblem = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.45, 16), new THREE.MeshBasicMaterial({ color: 0xd4af37, side: THREE.DoubleSide }));
    lotusEmblem.rotation.x = -Math.PI / 2;
    lotusEmblem.position.y = 0.11;
    markerGroup.add(lotusEmblem);

    markerGroup.position.set(x, 0, z + 6.2);
    this.scene.add(markerGroup);
    this.startMarkerMesh = markerGroup;

    this.registerInteractable({
      id: 'pagoda',
      name: '묘보탑 (팔각구층석탑)',
      desc: '오대산 월정사 팔각구층석탑을 모본으로 조성하여 스리랑카에서 모셔온 부처님 진신사리를 봉안한 9층 석탑입니다. 시계 방향으로 3바퀴 탑돌이를 하며 발원을 올립니다.',
      position: new THREE.Vector3(x, 0, z + 6.2),
      lookTarget: new THREE.Vector3(x, 2.5, z),
      enterable: true,
      enterType: 'pagoda'
    });
  }

  createDaewoongjeon(x, y, z) {
    const daewoong = this.createHanokBuilding({
      width: 11.2, depth: 7.0, height: 4.4,
      roofColor: 0x383e45, woodColor: 0x6b2d24, doorCount: 3
    });
    daewoong.position.set(x, y, z);
    this.scene.add(daewoong);

    // [사용자 요청 반영: 지붕 아래 밖에서 선명히 보이는 하얀 바탕 검정 글씨 현판]
    this.createSignboard(daewoong, '대웅전', '大雄殿', 0, 4.95, 7.0 / 2 + 1.15, 2.8, 0.74);
    this.createStoneLantern(x - 3.8, 0, z + 5.2);
    this.createStoneLantern(x + 3.8, 0, z + 5.2);

    // 대웅전 전체 직사각형 기단/벽체 충돌 박스 등록 (벽 투과 완전 차단)
    this.addBoxObstacle(x - 6.0, x + 6.0, z - 3.9, z + 3.9);

    this.registerInteractable({
      id: 'daewoong',
      name: '대웅전 (중심 법당)',
      desc: '도량의 중심 법당으로 가운데 석가불상, 좌측에 문수보살, 우측에 보현보살 세 분의 금동삼존불상이 봉안되어 있는 천년고찰의 본전입니다.',
      position: new THREE.Vector3(x, 0, z + 7.0),
      lookTarget: new THREE.Vector3(x, 2.2, z),
      enterable: true,
      enterType: 'daewoong'
    });
  }

  // [사용자 스케치 1 반영: 대웅전 우하단 길로 이어지는 지장전]
  createJijangjeon(x, y, z) {
    const jijang = this.createHanokBuilding({
      width: 8.6, depth: 5.6, height: 3.8,
      roofColor: 0x383e45, woodColor: 0x6b2d24, doorCount: 3
    });
    jijang.position.set(x, y, z);
    this.scene.add(jijang);

    this.createSignboard(jijang, '지장전', '地藏殿', 0, 4.30, 5.6 / 2 + 1.15, 2.4, 0.66);

    // 지장전 전체 직사각형 기단/벽체 충돌 박스 등록
    this.addBoxObstacle(x - 4.7, x + 4.7, z - 3.2, z + 3.2);

    this.registerInteractable({
      id: 'jijang',
      name: '지장전 (명부전)',
      desc: '대웅전 옆길로 이어지는 전각으로, 자비로운 지장보살님을 모시고 돌아가신 분의 극락왕생과 업장소멸을 빌며 소원 등을 달아 밝히는 기도 도량입니다.',
      position: new THREE.Vector3(x, 0, z + 5.5),
      lookTarget: new THREE.Vector3(x, 2.0, z),
      enterable: true,
      enterType: 'jijang'
    });
  }

  // [사용자 요청 반영: 입구 좌측 갈래길의 '불사중 건물' - 짓다 만 공사/골조 진행 느낌을 주도록 구현]
  createBulsaBuilding(x, y, z) {
    const group = new THREE.Group();

    // 1. 단단한 석조 기단 및 디딤돌
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x9e988e, roughness: 0.92 });
    const platform = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.8, 5.4), stoneMat);
    platform.position.y = 0.4;
    platform.receiveShadow = true;
    group.add(platform);

    const stepMat = new THREE.MeshStandardMaterial({ color: 0xbdb7ab, roughness: 0.88 });
    const frontStep = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 0.8), stepMat);
    frontStep.position.set(0, 0.2, 5.4 / 2 + 0.4);
    group.add(frontStep);

    // 2. 화강암 주춧돌 8개
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0xb5b1a8, roughness: 0.88 });
    const pXs = [-3.6, -1.2, 1.2, 3.6];
    const pZs = [-2.2, 2.2];
    pXs.forEach(px => {
      pZs.forEach(pz => {
        const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 0.25, 4), plinthMat);
        plinth.rotation.y = Math.PI / 4;
        plinth.position.set(px, 0.92, pz);
        group.add(plinth);
      });
    });

    // 3. 세워진 원목 기둥들 (적갈색 다듬어진 원목 기둥)
    const woodPillarMat = new THREE.MeshStandardMaterial({ color: 0x7a3a28, roughness: 0.72 });
    pXs.forEach(px => {
      pZs.forEach(pz => {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 3.2, 14), woodPillarMat);
        pillar.position.set(px, 0.8 + 1.6, pz);
        pillar.castShadow = true;
        group.add(pillar);
      });
    });

    // 4. 상단 대들보와 창방 목재 프레임 (골조 형태)
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x824430, roughness: 0.75 });
    // 전면 및 후면 주심도리
    [-2.2, 2.2].forEach(pz => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.32, 0.32), beamMat);
      beam.position.set(0, 4.0, pz);
      beam.castShadow = true;
      group.add(beam);
    });
    // 측면 및 가로질러 결속된 대들보들
    pXs.forEach(px => {
      const tieBeam = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.34, 4.8), beamMat);
      tieBeam.position.set(px, 4.15, 0);
      tieBeam.castShadow = true;
      group.add(tieBeam);
    });

    // 5. [짓다 만 느낌]: 지붕 서까래(골조 뼈대)만 일부 얹혀있고 기와는 아직 반만 덮인 모습
    const rafterWoodMat = new THREE.MeshStandardMaterial({ color: 0xb58852, roughness: 0.82 });
    for (let r = 0; r < 14; r++) {
      const rx = -3.7 + r * 0.58;
      // 앞뒤로 경사진 지붕 뼈대 서까래 목재
      const rafFront = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 3.1, 6), rafterWoodMat);
      rafFront.position.set(rx, 4.8, 1.25);
      rafFront.rotation.x = 0.52;
      group.add(rafFront);

      const rafBack = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 3.1, 6), rafterWoodMat);
      rafBack.position.set(rx, 4.8, -1.25);
      rafBack.rotation.x = -0.52;
      group.add(rafBack);
    }
    // 용마루 중앙 지지대 통나무
    const ridgeLog = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 8.2, 8), rafterWoodMat);
    ridgeLog.rotation.z = Math.PI / 2;
    ridgeLog.position.set(0, 5.5, 0);
    group.add(ridgeLog);

    // 지붕 한쪽에 임시로 덮어둔 공사용 파란/녹색 방수포(천막)
    const tarpMat = new THREE.MeshStandardMaterial({
      color: 0x1f5e82,
      roughness: 0.65,
      side: THREE.DoubleSide
    });
    const tarp = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.8), tarpMat);
    tarp.position.set(-1.8, 5.0, 1.3);
    tarp.rotation.x = 0.52;
    group.add(tarp);

    // 6. [공사 현장 비계(Scaffolding) 철제 파이프 & 발판 & 목재 사다리]
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x6e7680, metalness: 0.6, roughness: 0.45 });
    const timberMat = new THREE.MeshStandardMaterial({ color: 0xc89d66, roughness: 0.8 });
    [-4.1, 4.1].forEach(sx => {
      // 수직 비계 파이프
      [-2.6, 0, 2.6].forEach(sz => {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 4.8, 8), pipeMat);
        pipe.position.set(sx, 2.4, sz);
        group.add(pipe);
      });
      // 수평 비계 연결대
      [1.6, 3.2].forEach(sy => {
        const hPipe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 5.4), pipeMat);
        hPipe.position.set(sx, sy, 0);
        group.add(hPipe);
        // 비계 발판 목재
        const plank = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 5.2), timberMat);
        plank.position.set(sx < 0 ? sx + 0.22 : sx - 0.22, sy + 0.04, 0);
        group.add(plank);
      });
    });

    // 7. 건물 앞 계단(기단) 아래 바닥에 정갈하게 내려놓은 건축 목재 더미 및 기와 더미
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3 - r; c++) {
        const log = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.18), timberMat);
        log.position.set(-2.6, 0.08 + r * 0.17, 5.4 / 2 + 0.95 + c * 0.24);
        group.add(log);
      }
    }
    // 계단 아래 바닥에 쌓여있는 검은 기와장 더미
    const giwaTileMat = new THREE.MeshStandardMaterial({ color: 0x363b42, roughness: 0.75 });
    for (let h = 0; h < 6; h++) {
      const tileStack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.08, 0.72), giwaTileMat);
      tileStack.position.set(2.4, 0.04 + h * 0.09, 5.4 / 2 + 0.95);
      group.add(tileStack);
    }

    // 8. 목수 작업대 및 기대어 놓은 목재 사다리
    const workBench = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.65), timberMat);
    workBench.position.set(0.6, 0.8 + 0.35, 1.8);
    group.add(workBench);

    const ladder = new THREE.Group();
    [-0.18, 0.18].forEach(lx => {
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 3.4, 6), timberMat);
      rail.position.x = lx;
      ladder.add(rail);
    });
    for (let st = -1.4; st <= 1.4; st += 0.35) {
      const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.36, 6), timberMat);
      rung.rotation.z = Math.PI / 2;
      rung.position.y = st;
      ladder.add(rung);
    }
    ladder.position.set(3.4, 1.8, 5.4 / 2 + 0.3);
    ladder.rotation.x = -0.22;
    ladder.rotation.y = 0.15;
    group.add(ladder);

    group.position.set(x, y, z);
    this.scene.add(group);

    // 하얀 바탕 검정 글씨 '불사중' 안내 현판
    this.createSignboard(group, '불사중', '佛事中', 0, 4.15, 5.4 / 2 + 0.35, 2.3, 0.64);

    // 불사중 건물 전체 직사각형 기단/벽체 충돌 박스 등록
    this.addBoxObstacle(x - 4.6, x + 4.6, z - 3.2, z + 3.4);

    this.registerInteractable({
      id: 'bulsa',
      name: '불사중 건물 (도량 불사)',
      desc: '더욱 청정하고 안온한 수행 도량을 가꾸기 위해 정성껏 목재 골조와 기와를 올리며 불사(佛事)를 진행하고 있는 전각입니다.',
      position: new THREE.Vector3(x, 0, z + 4.8),
      lookTarget: new THREE.Vector3(x, 2.0, z),
      enterable: false
    });
  }

  // [사용자 요청 완벽 반영: '범종.jpg' 사진을 참고하여 사방이 트인 전각기둥과 그 사이에 범종·당목이 들어가도록 모델링]
  createBeomjonggak(x, y, z) {
    const beomjong = new THREE.Group();
    const texSet = this.getKoreanTempleTextures();

    const width = 6.2;
    const depth = 4.6;
    const height = 3.7;
    const woodColor = 0x6b2d24; // '범종.jpg'의 적갈색 전각기둥 색상

    const baseMat = new THREE.MeshStandardMaterial({ color: 0xc2bfb7, roughness: 0.88 });
    const floorWoodMat = new THREE.MeshStandardMaterial({ color: 0x5c3624, roughness: 0.72 });
    const pillarMat = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.62 });
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0xb0aca2, roughness: 0.88 });
    const stepWoodMat = new THREE.MeshStandardMaterial({ color: 0x7c583c, roughness: 0.78 });
    const ironBracketMat = new THREE.MeshStandardMaterial({ color: 0x222528, roughness: 0.45, metalness: 0.75 });
    const boltMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.35, metalness: 0.85 });

    // 1. 하단 석조 기단 및 목조 마루 ('범종.jpg' 하단 마루 및 나무 계단 반영)
    const stoneBase = new THREE.Mesh(new THREE.BoxGeometry(width + 1.1, 0.62, depth + 1.1), baseMat);
    stoneBase.position.y = 0.31;
    stoneBase.receiveShadow = true;
    beomjong.add(stoneBase);

    const woodDeck = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.18, depth + 0.3), floorWoodMat);
    woodDeck.position.y = 0.71;
    woodDeck.receiveShadow = true;
    beomjong.add(woodDeck);

    // '범종.jpg' 우측 하단에 보이는 나무 계단 (정면 및 우측면 진입 계단)
    for (let s = 0; s < 3; s++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.18, 0.34), stepWoodMat);
      step.position.set(0, 0.16 + s * 0.20, depth / 2 + 0.95 - s * 0.26);
      beomjong.add(step);
    }

    // 2. 벽체 없이 사방이 시원하게 트인 적갈색 전각기둥 ('범종.jpg'의 굵은 원통형 전각기둥과 주춧돌)
    const pRadius = 0.25;
    const pillarPositions = [
      [-width / 2, depth / 2],
      [width / 2, depth / 2],
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [-width / 2, 0],
      [width / 2, 0]
    ];

    pillarPositions.forEach(([px, pz]) => {
      // 사다리꼴 주춧돌
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.38, 0.24, 4), plinthMat);
      plinth.rotation.y = Math.PI / 4;
      plinth.position.set(px, 0.92, pz);
      beomjong.add(plinth);

      // 적갈색 원통형 전각기둥
      const pMesh = new THREE.Mesh(new THREE.CylinderGeometry(pRadius * 0.95, pRadius, height, 18), pillarMat);
      pMesh.position.set(px, 0.8 + height / 2, pz);
      pMesh.castShadow = true;
      beomjong.add(pMesh);

      // 기둥 상단 단청 머리초
      const collarRing = new THREE.Mesh(
        new THREE.CylinderGeometry(pRadius + 0.016, pRadius + 0.016, 0.45, 16),
        new THREE.MeshStandardMaterial({ map: texSet.dancheongTex, roughness: 0.58 })
      );
      collarRing.position.set(px, 0.8 + height - 0.24, pz);
      beomjong.add(collarRing);
    });

    // 3. '범종.jpg' 상단의 굵은 적갈색 가로 들보(창방/대들보) + 중앙 수직 종걸이 기둥 및 볼트 철물 브래킷
    const topY = 0.8 + height;
    const frontCrossBeam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 0.28, 0.32), pillarMat);
    frontCrossBeam.position.set(0, topY - 0.12, depth / 2);
    beomjong.add(frontCrossBeam);

    const backCrossBeam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 0.28, 0.32), pillarMat);
    backCrossBeam.position.set(0, topY - 0.12, -depth / 2);
    beomjong.add(backCrossBeam);

    // 범종을 매다는 중앙 가로 대들보 ('범종.jpg' 상단 가로 적갈색 보)
    const centerBellBeam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.3, 0.34, 0.38), pillarMat);
    centerBellBeam.position.set(0, topY - 0.08, 0.15);
    beomjong.add(centerBellBeam);

    // '범종.jpg' 사진 상단 중앙: 대들보에서 아래로 내려와 용뉴를 잡아주는 적갈색 수직 걸쇠 기둥과 볼트 체결 브래킷
    const hangerPost = new THREE.Mesh(new THREE.BoxGeometry(0.24, 1.15, 0.24), pillarMat);
    hangerPost.position.set(0, topY - 0.65, 0.15);
    beomjong.add(hangerPost);

    const tBracketH = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.28), pillarMat);
    tBracketH.position.set(0, topY - 1.14, 0.15);
    beomjong.add(tBracketH);

    // 브래킷 위 8개의 은빛 볼트 너트 디테일 ('범종.jpg' 상단 볼트 체결부 재현)
    [-0.20, -0.07, 0.07, 0.20].forEach((bx) => {
      [-0.04, 0.04].forEach((by) => {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.30, 6), boltMat);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(bx, topY - 1.14 + by, 0.15);
        beomjong.add(bolt);
      });
    });

    // 4. 전각기둥 한가운데 당당히 자리한 대형 청동 범종 ('범종.jpg' 완벽 고증, 당목 높이에 맞춰 하향 배치)
    const bellGroup = new THREE.Group();
    bellGroup.position.set(0, 0.45, 0.15);

    const bronzeBellMat = new THREE.MeshStandardMaterial({
      color: 0x56645e, // '범종.jpg'의 청회록색 고색창연한 청동 빛깔
      roughness: 0.42,
      metalness: 0.62
    });
    const bellReliefMat = new THREE.MeshStandardMaterial({
      color: 0x67756f,
      roughness: 0.48,
      metalness: 0.58
    });
    const bellRimMat = new THREE.MeshStandardMaterial({
      color: 0x424e49,
      roughness: 0.48,
      metalness: 0.65
    });

    // 범종 몸체 (전각기둥 사이 공간을 꽉 채우는 웅장한 비율)
    const bellBody = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 1.02, 1.92, 32), bronzeBellMat);
    bellBody.position.y = 1.66;
    bellBody.castShadow = true;
    bellGroup.add(bellBody);

    // 종 어깨 둥근 천판(천판 돔)
    const bellTopDome = new THREE.Mesh(
      new THREE.SphereGeometry(0.68, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.42),
      bronzeBellMat
    );
    bellTopDome.scale.set(1, 0.52, 1);
    bellTopDome.position.y = 2.60;
    bellGroup.add(bellTopDome);

    // 상단 입상화문대(연꽃 장식 테두리)
    const upperCrownRim = new THREE.Mesh(new THREE.TorusGeometry(0.67, 0.038, 10, 28), bellRimMat);
    upperCrownRim.rotation.x = Math.PI / 2;
    upperCrownRim.position.y = 2.62;
    bellGroup.add(upperCrownRim);

    // 용뉴(종 꼭대기 용 조각 고리)와 음통
    const dragonCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.48, 12), bellRimMat);
    dragonCrown.position.y = 2.86;
    bellGroup.add(dragonCrown);

    const ironShackle = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.032, 10, 20), ironBracketMat);
    ironShackle.position.y = 2.98;
    bellGroup.add(ironShackle);

    // '범종.jpg'의 4방향 사각형 유곽(乳廓)과 9유(연꽃 봉오리 돌기)
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + Math.PI / 4;
      const yugwak = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.48, 0.05), bellReliefMat);
      const rPos = 0.76;
      yugwak.position.set(Math.sin(ang) * rPos, 2.22, Math.cos(ang) * rPos);
      yugwak.rotation.y = ang;
      bellGroup.add(yugwak);
    }

    // '범종.jpg'의 중앙 원형 연화 당좌(撞座: 당목이 부딪히는 연꽃 원판) 및 비천상 부조
    [0, Math.PI, Math.PI / 2, -Math.PI / 2].forEach((ang, idx) => {
      const rPos = 0.89;
      if (idx < 2) {
        const dangjwa = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.04, 20), bellReliefMat);
        dangjwa.rotation.x = Math.PI / 2;
        dangjwa.position.set(Math.sin(ang) * rPos, 1.32, Math.cos(ang) * rPos);
        dangjwa.rotation.z = -ang;
        bellGroup.add(dangjwa);
      } else {
        // 우측 당목 타격 방향 당좌
        const sideDangjwa = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.045, 20), bellReliefMat);
        sideDangjwa.rotation.z = Math.PI / 2;
        sideDangjwa.position.set(Math.sin(ang) * rPos, 1.32, Math.cos(ang) * rPos);
        bellGroup.add(sideDangjwa);
      }
    });

    // 종 하단 구연부(하대 연화 당초문 띠)
    const lowerBand = new THREE.Mesh(new THREE.TorusGeometry(1.01, 0.048, 12, 32), bellRimMat);
    lowerBand.rotation.x = Math.PI / 2;
    lowerBand.position.y = 0.72;
    bellGroup.add(lowerBand);

    // 5. '범종.jpg' 우측 기둥과 범종 사이에 두 줄 쇠사슬로 매달린 굵은 통나무 당목(타종봉) - 주인공 가슴 및 범종 하부 높이
    const strikerPivot = new THREE.Group();
    strikerPivot.position.set(1.15, 2.75, 0.18);

    const strikerWoodMat = new THREE.MeshStandardMaterial({ color: 0x7c5032, roughness: 0.72 });
    const strikerEndMat = new THREE.MeshStandardMaterial({ color: 0xc49a6c, roughness: 0.65 });
    const strikerBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.125, 0.125, 1.65, 16),
      [strikerWoodMat, strikerEndMat, strikerEndMat]
    );
    strikerBeam.rotation.z = Math.PI / 2;
    strikerBeam.position.set(0.42, -1.90, 0);
    strikerBeam.castShadow = true;
    strikerPivot.add(strikerBeam);

    // 당목을 감싸는 검은 철제 밴드와 두 줄 쇠사슬 ('범종.jpg' 우측 쇠사슬 고증 - 전각 상단 들보까지 연결)
    const chainMat = new THREE.MeshStandardMaterial({ color: 0x26292c, metalness: 0.82, roughness: 0.38 });
    const chainBottomLocalY = -1.90;
    const chainTopLocalY = topY - 3.15;
    const chainHeight = Math.max(1.90, chainTopLocalY - chainBottomLocalY);
    const chainCenterLocalY = (chainBottomLocalY + chainTopLocalY) / 2;
    [-0.08, 0.86].forEach((cx) => {
      const ironBand = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.016, 8, 18), ironBracketMat);
      ironBand.rotation.y = Math.PI / 2;
      ironBand.position.set(cx, -1.90, 0);
      strikerPivot.add(ironBand);

      // 사슬 고리 표현 (전각 상단 대들보/천장까지 이어지도록 연장)
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, chainHeight, 8), chainMat);
      chain.position.set(cx, chainCenterLocalY, 0);
      strikerPivot.add(chain);
    });

    bellGroup.add(strikerPivot);
    this.beomjongStriker = strikerPivot;
    beomjong.add(bellGroup);

    // 6. 상단 단청 창방·서까래·전통 기와지붕 및 '범종각' 현판
    const lintelHeight = 0.78;
    const danMat = new THREE.MeshStandardMaterial({ map: texSet.dancheongTex, roughness: 0.58 });
    const dancheongFrieze = new THREE.Mesh(new THREE.BoxGeometry(width + 0.55, lintelHeight * 0.76, depth + 0.45), danMat);
    dancheongFrieze.position.y = topY + lintelHeight * 0.36;
    beomjong.add(dancheongFrieze);

    const rafterCount = 14;
    const rafStep = (width + 1.2) / (rafterCount - 1);
    const rafBodyMat = new THREE.MeshStandardMaterial({ color: 0x3b6752, roughness: 0.68 });
    const rafCapMat = new THREE.MeshStandardMaterial({ map: texSet.rafterCapTex, roughness: 0.52 });
    const rafY = topY + lintelHeight * 0.70;
    const rafGeo = new THREE.CylinderGeometry(0.095, 0.105, 1.25, 10);
    rafGeo.rotateX(Math.PI / 2 + 0.18);

    for (let r = 0; r < rafterCount; r++) {
      const rx = -(width + 1.2) / 2 + r * rafStep;
      const raf = new THREE.Mesh(rafGeo, [rafBodyMat, rafCapMat, rafBodyMat]);
      raf.position.set(rx, rafY, depth / 2 + 0.52);
      beomjong.add(raf);
    }

    this.createKoreanCurvedRoof(beomjong, {
      width,
      depth,
      baseY: topY + lintelHeight * 0.75,
      ridgeHeight: 1.72,
      roofColor: 0x383e45,
      isStone: false,
      texSet
    });

    this.beomjongPos = new THREE.Vector3(x, y, z);
    beomjong.position.set(x, y, z);
    this.scene.add(beomjong);

    this.createSignboard(beomjong, '범종각', '梵鐘閣', 0, 4.18, depth / 2 + 1.15, 2.3, 0.64);

    // 범종각 기단 충돌 박스 등록
    this.addBoxObstacle(x - 3.7, x + 3.7, z - 2.8, z + 2.8);

    this.registerInteractable({
      id: 'beomjong',
      name: '범종각 (종루)',
      desc: '전각 기둥 사이에 장엄한 대범종이 봉안된 종루입니다. 타종 버튼을 누르면 동자승이 범종 옆 치는 막대기(당목) 앞에서 힘차게 종을 칩니다.',
      position: new THREE.Vector3(x, 0, z + 5.2),
      lookTarget: new THREE.Vector3(x, 2.1, z),
      enterable: true,
      enterType: 'beomjong'
    });
  }

  // [사용자 요청 반영: 타종준비 -> 타종 위치로 이동, 타종하기 -> 당목으로 타종, 그만하기 -> 마당 복귀]
  prepareBeomjongBell() {
    if (!this.beomjongPos) return;
    if (!this.isBeomjongReady && !this.isBeomjongRinging) {
      this.preBellPlayerPos = this.playerPos.clone();
    }
    this.isWalking = false;
    this.walkTarget = null;
    this.walkWaypoints = [];

    // 범종각 누각 위, 당목(치는 막대기) 옆에 서서 범종을 바라보며 타종하는 뒷모습 위치
    this.playerPos.set(this.beomjongPos.x + 2.08, 0.80, this.beomjongPos.z + 0.85);
    this.characterGroup.position.copy(this.playerPos);
    this.currentCharRotation = -2.15;
    this.characterGroup.rotation.y = -2.15;
    this.resetCharacterPose();

    this.isBeomjongReady = true;
    this.isBeomjongRinging = false;
  }

  ringBeomjongBell(onComplete = null) {
    if (!this.beomjongPos) return;
    if (!this.isBeomjongReady) {
      this.prepareBeomjongBell();
    }
    if (this.isBeomjongRinging) return;
    this.isBeomjongRinging = true;
    this.beomjongRingTime = 0;
    this.beomjongSoundPlayed = false;
    this.onBeomjongComplete = onComplete;
  }

  stopBeomjongBell() {
    this.isBeomjongReady = false;
    this.isBeomjongRinging = false;
    this.onBeomjongComplete = null;
    if (this.beomjongStriker) {
      this.beomjongStriker.position.x = 1.15;
    }
    this.resetCharacterPose();
    if (this.preBellPlayerPos) {
      this.playerPos.copy(this.preBellPlayerPos);
      this.characterGroup.position.copy(this.playerPos);
      this.currentCharRotation = Math.PI;
      this.characterGroup.rotation.y = Math.PI;
    }
  }

  // [사용자 스케치 1 반영: 우상단 산령각]
  createSansingak(x, y, z) {
    const sansin = this.createHanokBuilding({
      width: 6.8, depth: 4.6, height: 3.4,
      roofColor: 0x383e45, woodColor: 0x6b2d24, doorCount: 2
    });
    sansin.position.set(x, y, z);
    this.scene.add(sansin);

    this.createSignboard(sansin, '산령각', '山靈閣', 0, 3.85, 4.6 / 2 + 1.15, 2.2, 0.60);

    // 산령각 전체 직사각형 기단/벽체 충돌 박스 등록
    this.addBoxObstacle(x - 3.8, x + 3.8, z - 2.7, z + 2.7);

    this.registerInteractable({
      id: 'sansin',
      name: '산령각',
      desc: '가족의 삶과 터전을 지키는 소원은 산신님께\n학업과 결실에 대한 소원성취 소원은 독성님께\n올리는 소원성취기도처입니다.',
      position: new THREE.Vector3(x, 0, z + 5.5),
      lookTarget: new THREE.Vector3(x, 1.8, z),
      enterable: true,
      enterType: 'sansin'
    });
  }

  // [사용자 요청 완벽 반영: 석굴암은 기와지붕모양 전각 대신 첨부 사진 같은 대리석 기둥모양의 전각으로 기둥과 평지붕을 그리고, 어두운 부분은 진한 회색 처리]
  createSeokguram(x, y, z) {
    const group = new THREE.Group();

    // 1. 대리석 결(Marble) 캔버스 텍스처 생성
    const marbleCanvas = document.createElement('canvas');
    marbleCanvas.width = 512;
    marbleCanvas.height = 512;
    const mctx = marbleCanvas.getContext('2d');
    mctx.fillStyle = '#eceee9';
    mctx.fillRect(0, 0, 512, 512);
    // 은은한 회백색 대리석 결과 블록 줄눈
    for (let i = 0; i < 28; i++) {
      mctx.strokeStyle = i % 2 === 0 ? 'rgba(165, 170, 176, 0.28)' : 'rgba(255, 255, 255, 0.45)';
      mctx.lineWidth = 2 + (i % 3);
      mctx.beginPath();
      const sy = (i * 23) % 512;
      mctx.moveTo(0, sy);
      mctx.bezierCurveTo(160, sy + ((i % 5) - 2) * 18, 350, sy - ((i % 4) - 1.5) * 18, 512, sy + ((i % 3) - 1) * 14);
      mctx.stroke();
    }
    const marbleTex = new THREE.CanvasTexture(marbleCanvas);
    marbleTex.wrapS = THREE.RepeatWrapping;
    marbleTex.wrapT = THREE.RepeatWrapping;

    const whiteMarbleMat = new THREE.MeshStandardMaterial({
      map: marbleTex,
      color: 0xf0f2ee,
      roughness: 0.42,
      metalness: 0.05
    });
    const carvedMarbleMat = new THREE.MeshStandardMaterial({
      map: marbleTex,
      color: 0xdcddda,
      roughness: 0.52,
      metalness: 0.05
    });
    // [요청 반영: 어두운 부분은 진한 회색 처리 - 모바일에서도 시커멓게 뭉개지지 않도록 밝기 조정]
    const darkGreyWallMat = new THREE.MeshStandardMaterial({
      color: 0x5c626b,
      roughness: 0.82
    });
    const deepDarkGreyMat = new THREE.MeshStandardMaterial({
      color: 0x454a52,
      roughness: 0.86
    });
    const midGreyStoneMat = new THREE.MeshStandardMaterial({
      color: 0x6f7680,
      roughness: 0.78
    });

    const width = 10.6;
    const depth = 6.0;
    const baseH = 0.64;
    const pillarH = 3.65;

    // 2. 하단 대리석 기단 및 사진 속 중앙 대리석 진입로(돌계단/경사로)
    const basePlatform = new THREE.Mesh(new THREE.BoxGeometry(width + 0.8, baseH, depth + 0.6), carvedMarbleMat);
    basePlatform.position.set(0, baseH / 2, 0);
    basePlatform.receiveShadow = true;
    group.add(basePlatform);

    // 기단 앞면 진한 회색 음영 단차
    const baseShadowStrip = new THREE.Mesh(new THREE.BoxGeometry(width + 0.84, 0.14, 0.12), darkGreyWallMat);
    baseShadowStrip.position.set(0, 0.10, (depth + 0.6) / 2 + 0.02);
    group.add(baseShadowStrip);

    // 사진 하단 중앙의 밝은 대리석 진입 보도와 계단
    const frontWalkway = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.12, 3.2), whiteMarbleMat);
    frontWalkway.position.set(0, 0.06, depth / 2 + 1.6);
    frontWalkway.receiveShadow = true;
    group.add(frontWalkway);

    const step1 = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.24, 0.85), whiteMarbleMat);
    step1.position.set(0, 0.18, depth / 2 + 0.65);
    group.add(step1);

    const step2 = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.42, 0.65), carvedMarbleMat);
    step2.position.set(0, 0.32, depth / 2 + 0.35);
    group.add(step2);

    // 3. [어두운 부분 진한 회색 처리]: 대리석 기둥 뒤쪽의 깊숙한 본체 벽면 및 그늘진 내부 영역
    const mainDarkBody = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.6, pillarH + 0.1, depth - 1.0),
      darkGreyWallMat
    );
    mainDarkBody.position.set(0, baseH + pillarH / 2, -0.35);
    mainDarkBody.castShadow = true;
    mainDarkBody.receiveShadow = true;
    group.add(mainDarkBody);

    // 처마 밑과 기둥 뒤쪽 상단의 짙은 회색 음영부
    const upperShadowBand = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.2, 0.55, depth - 0.2),
      deepDarkGreyMat
    );
    upperShadowBand.position.set(0, baseH + pillarH - 0.22, -0.05);
    group.add(upperShadowBand);

    // 4. 첨부 사진 속 좌·우 아치형(둥근 상단) 대리석 창문틀 + 내부 진한 회색 창문 처리
    [-2.85, 2.85].forEach((wx) => {
      const winGroup = new THREE.Group();
      winGroup.position.set(wx, baseH + 1.75, (depth - 1.0) / 2 - 0.33);

      // 대리석 사각 하부 창틀
      const outerRect = new THREE.Mesh(new THREE.BoxGeometry(1.42, 1.55, 0.14), carvedMarbleMat);
      outerRect.position.y = -0.15;
      winGroup.add(outerRect);

      // 대리석 반원 아치 상부 창틀
      const outerArch = new THREE.Mesh(new THREE.CylinderGeometry(0.71, 0.71, 0.14, 24), carvedMarbleMat);
      outerArch.rotation.x = Math.PI / 2;
      outerArch.position.y = 0.62;
      winGroup.add(outerArch);

      // 창문 안쪽 어두운 진한 회색 면
      const innerDarkRect = new THREE.Mesh(new THREE.BoxGeometry(1.06, 1.38, 0.16), deepDarkGreyMat);
      innerDarkRect.position.y = -0.15;
      winGroup.add(innerDarkRect);

      const innerDarkArch = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.53, 0.16, 20), deepDarkGreyMat);
      innerDarkArch.rotation.x = Math.PI / 2;
      innerDarkArch.position.y = 0.54;
      winGroup.add(innerDarkArch);

      // 사진 속 창문 가로/세로 대리석 창살(중간 가로 바)
      const hBar = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.11, 0.18), carvedMarbleMat);
      hBar.position.y = 0.22;
      winGroup.add(hBar);

      const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.35, 0.17), midGreyStoneMat);
      vBar.position.y = -0.15;
      winGroup.add(vBar);

      // 창문 하단 대리석 창대석
      const sill = new THREE.Mesh(new THREE.BoxGeometry(1.58, 0.16, 0.22), whiteMarbleMat);
      sill.position.y = -0.92;
      winGroup.add(sill);

      group.add(winGroup);
    });

    // 5. 중앙 석굴 감실 입구 (진한 회색 석굴 배경 + 대리석 문틀 + 내부 화강석 본존불 실루엣)
    const centerPortal = new THREE.Group();
    centerPortal.position.set(0, baseH, (depth - 1.0) / 2 - 0.32);

    // 중앙 입구 진한 회색 오목 벽면
    const portalRecess = new THREE.Mesh(new THREE.BoxGeometry(2.35, 3.10, 0.18), deepDarkGreyMat);
    portalRecess.position.set(0, 1.55, -0.02);
    centerPortal.add(portalRecess);

    // 중앙 입구 대리석 테두리 기둥과 상인방
    [-1.12, 1.12].forEach((px) => {
      const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.20, 3.15, 0.24), carvedMarbleMat);
      jamb.position.set(px, 1.575, 0.02);
      centerPortal.add(jamb);
    });
    const portalLintel = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.24, 0.26), whiteMarbleMat);
    portalLintel.position.set(0, 3.12, 0.03);
    centerPortal.add(portalLintel);

    // 중앙 입구 하단 대리석 불단/기단턱
    const portalLowStep = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.46, 0.32), carvedMarbleMat);
    portalLowStep.position.set(0, 0.23, 0.06);
    centerPortal.add(portalLowStep);

    // 입구 안쪽 어두운 진회색 배경 너머로 보이는 미니멀 회색 본존불과 방사형 광배 (외부 정면 표시)
    const halo2D = new THREE.Mesh(
      new THREE.PlaneGeometry(2.15, 2.15),
      new THREE.MeshBasicMaterial({ map: this.createSoftAureoleTexture(), transparent: true, opacity: 0.90, depthWrite: false })
    );
    halo2D.position.set(0, 1.85, 0.082);
    centerPortal.add(halo2D);

    const buddha2D = new THREE.Mesh(
      new THREE.PlaneGeometry(1.30, 1.92),
      new THREE.MeshBasicMaterial({ map: this.createFlatBuddhaTexture(), transparent: true, opacity: 0.96, depthWrite: false })
    );
    buddha2D.position.set(0, 1.50, 0.088);
    centerPortal.add(buddha2D);

    group.add(centerPortal);

    // 6. [첨부 사진 핵심 요소: 웅장한 백색 대리석 기둥 (전면 중앙 2개 돌출 대리석 기둥 + 좌우 외곽 대리석 기둥)]
    const addMarbleColumn = (cx, cz, radius = 0.28, isFrontMain = true) => {
      const colGroup = new THREE.Group();
      colGroup.position.set(cx, baseH, cz);

      // 하단 사각/팔각 대리석 주초 및 연화문 받침
      const plinthBox = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.5, 0.22, radius * 2.5), carvedMarbleMat);
      plinthBox.position.y = 0.11;
      colGroup.add(plinthBox);

      const lotusBase = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.15, radius * 1.32, 0.24, 16), whiteMarbleMat);
      lotusBase.position.y = 0.34;
      colGroup.add(lotusBase);

      // 대리석 원기둥 몸체 (세로 플루팅/음각 느낌을 위해 20각 세그먼트 적용)
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.94, radius, pillarH - 0.68, 20),
        whiteMarbleMat
      );
      shaft.position.y = 0.46 + (pillarH - 0.68) / 2;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      colGroup.add(shaft);

      // 상단 대리석 연화 주두(Capital) 및 사각 받침(Abacus)
      const capitalNeck = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.18, radius * 0.96, 0.20, 16), carvedMarbleMat);
      capitalNeck.position.y = pillarH - 0.22;
      colGroup.add(capitalNeck);

      const abacus = new THREE.Mesh(new THREE.BoxGeometry(radius * 2.4, 0.16, radius * 2.4), whiteMarbleMat);
      abacus.position.y = pillarH - 0.06;
      colGroup.add(abacus);

      if (isFrontMain) {
        // 전면 돌출 대리석 기둥과 본체 벽을 잇는 상단 대리석 보(아키트레이브)
        const tieBeam = new THREE.Mesh(new THREE.BoxGeometry(radius * 1.7, 0.32, 1.15), carvedMarbleMat);
        tieBeam.position.set(0, pillarH - 0.16, -0.55);
        colGroup.add(tieBeam);
      }

      group.add(colGroup);
    };

    // 사진 정면 중앙에 나란히 서 있는 두 개의 굵은 백색 대리석 기둥
    addMarbleColumn(-1.32, depth / 2 - 0.05, 0.29, true);
    addMarbleColumn(1.32, depth / 2 - 0.05, 0.29, true);

    // 좌·우 양 끝을 받치는 외곽 대리석 기둥 및 후면 기둥
    addMarbleColumn(-4.65, depth / 2 - 0.28, 0.26, false);
    addMarbleColumn(4.65, depth / 2 - 0.28, 0.26, false);
    addMarbleColumn(-4.65, -depth / 2 + 0.35, 0.25, false);
    addMarbleColumn(4.65, -depth / 2 + 0.35, 0.25, false);

    // 7. [첨부 사진 핵심 요소: 기와지붕 대신 두툼하고 수평적인 백색 대리석 지붕(엔타블러처/평지붕 처마)]
    const roofBaseY = baseH + pillarH;

    // 처마 밑 진한 회색 음영 판 (사진 속 지붕 바로 아래 짙은 회색 그림자 라인)
    const roofSoffitShadow = new THREE.Mesh(
      new THREE.BoxGeometry(width + 1.0, 0.16, depth + 0.9),
      deepDarkGreyMat
    );
    roofSoffitShadow.position.set(0, roofBaseY + 0.05, 0.12);
    group.add(roofSoffitShadow);

    // 주 대리석 지붕 슬래브 (수평으로 뻗은 웅장한 백색 대리석 지붕)
    const mainMarbleRoof = new THREE.Mesh(
      new THREE.BoxGeometry(width + 1.35, 0.56, depth + 1.25),
      whiteMarbleMat
    );
    mainMarbleRoof.position.set(0, roofBaseY + 0.40, 0.15);
    mainMarbleRoof.castShadow = true;
    mainMarbleRoof.receiveShadow = true;
    group.add(mainMarbleRoof);

    // 대리석 지붕 전면 양각 부조 장식 (사진 속 대리석 지붕 앞면의 연꽃/문양 조각 블록들)
    for (let bx = -4.8; bx <= 4.81; bx += 1.2) {
      const reliefBlock = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.34, 0.08), carvedMarbleMat);
      reliefBlock.position.set(bx, roofBaseY + 0.40, (depth + 1.25) / 2 + 0.17);
      group.add(reliefBlock);

      const lotusBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.10, 12), whiteMarbleMat);
      lotusBoss.rotation.x = Math.PI / 2;
      lotusBoss.position.set(bx, roofBaseY + 0.40, (depth + 1.25) / 2 + 0.20);
      group.add(lotusBoss);
    }

    // 대리석 지붕 상단 코니스(처마 끝단 턱) 및 상부 석굴 난간대
    const upperMarbleCornice = new THREE.Mesh(
      new THREE.BoxGeometry(width + 1.55, 0.18, depth + 1.45),
      carvedMarbleMat
    );
    upperMarbleCornice.position.set(0, roofBaseY + 0.76, 0.15);
    group.add(upperMarbleCornice);

    // 8. 사진 속 대리석 지붕 위를 장식하는 수국 꽃나무 화단 & 뒤편 진회색 석굴 암반
    const grottoDomeMat = new THREE.MeshStandardMaterial({ color: 0x4b5058, roughness: 0.90, flatShading: true });
    [
      [-5.5, 2.5, -1.5, 2.5],
      [5.5, 2.5, -1.5, 2.5],
      [-3.6, 4.2, -2.8, 3.0],
      [3.6, 4.2, -2.8, 3.0],
      [0, 5.1, -2.2, 3.4]
    ].forEach(([rx, ry, rz, rad]) => {
      const boulder = new THREE.Mesh(new THREE.DodecahedronGeometry(rad, 1), grottoDomeMat);
      boulder.position.set(rx, ry, rz);
      boulder.scale.set(1.25, 0.95, 0.92);
      boulder.castShadow = true;
      group.add(boulder);
    });

    // 사진 속 대리석 평지붕 위와 양옆의 수국 꽃송이(분홍·하양·연보라)와 초록 잎사귀
    const foliageGreenMat = new THREE.MeshStandardMaterial({ color: 0x3b5936, roughness: 0.85 });
    const lightShrubMat = new THREE.MeshStandardMaterial({ color: 0x627c4e, roughness: 0.85 });
    const blossomColors = [0xe8a3b8, 0xf4f2ed, 0xd98ca6, 0xeae5d9];

    for (let fx = -4.2; fx <= 4.21; fx += 0.85) {
      const leafBush = new THREE.Mesh(new THREE.SphereGeometry(0.46, 10, 10), foliageGreenMat);
      leafBush.scale.set(1.2, 0.75, 0.9);
      leafBush.position.set(fx, roofBaseY + 1.05, depth / 2 - 0.15);
      group.add(leafBush);

      const blossomMat = new THREE.MeshStandardMaterial({
        color: blossomColors[Math.abs(Math.round(fx * 3)) % blossomColors.length],
        roughness: 0.7
      });
      const flowerCluster = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10), blossomMat);
      flowerCluster.scale.set(1.15, 0.85, 1.0);
      flowerCluster.position.set(fx + 0.1, roofBaseY + 1.25, depth / 2 + 0.05);
      group.add(flowerCluster);
    }

    // 사진 좌·우 기둥 앞쪽의 둥근 정원수와 백색 대리석 석등 한 쌍
    [-4.1, 4.1].forEach((sx) => {
      // 둥근 조경수
      const sideBush = new THREE.Mesh(new THREE.SphereGeometry(0.85, 12, 12), lightShrubMat);
      sideBush.scale.set(1.1, 0.95, 1.0);
      sideBush.position.set(sx, baseH + 1.65, depth / 2 + 0.55);
      group.add(sideBush);

      // 사진 속 좌·우 백색 대리석 석등
      const lanternG = new THREE.Group();
      lanternG.position.set(sx * 0.92, 0, depth / 2 + 1.45);
      const lBase = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.52, 0.35, 8), whiteMarbleMat);
      lBase.position.y = 0.175;
      lanternG.add(lBase);
      const lPost = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.65, 8), carvedMarbleMat);
      lPost.position.y = 0.65;
      lanternG.add(lPost);
      const lBox = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.38, 0.46), whiteMarbleMat);
      lBox.position.y = 1.15;
      lanternG.add(lBox);
      const lRoof = new THREE.Mesh(new THREE.ConeGeometry(0.68, 0.38, 8), whiteMarbleMat);
      lRoof.position.y = 1.52;
      lanternG.add(lRoof);
      const lFinial = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), whiteMarbleMat);
      lFinial.position.y = 1.75;
      lanternG.add(lFinial);
      group.add(lanternG);
    });

    group.position.set(x, y, z);
    this.scene.add(group);

    // 대리석 평지붕 아래 하얀 바탕 검정 글씨 '석굴암' 현판
    this.createSignboard(group, '석굴암', '石窟庵', 0, roofBaseY + 0.25, (depth + 1.25) / 2 + 0.55, 2.5, 0.68);

    // 석굴암 전각 및 뒤편 암석 전체 직사각형 충돌 박스 등록
    this.addBoxObstacle(x - 6.8, x + 6.8, z - 5.5, z + 3.6);

    this.registerInteractable({
      id: 'seokguram',
      name: '석굴암 (석굴법당)',
      desc: '경주 토함산 석굴암을 모본으로 조성된 상징적인 석굴 법당입니다. 백색 대리석 기둥 너머로 화강석 본존불이 모셔져 있으며, 안으로 들어가 싱잉볼 명상을 할 수 있습니다.',
      position: new THREE.Vector3(x, 0, z + 7.5),
      lookTarget: new THREE.Vector3(x, 2.3, z),
      enterable: true,
      enterType: 'seokguram'
    });
  }

  // [석굴암 본존불 전용 정밀 텍스처] 자비롭고 그윽한 눈매, 온화한 미소, 백호, 나발 헤어
  createBuddhaFaceTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // 1. 화강암 석조 베이스 그라데이션
    const grad = ctx.createRadialGradient(256, 256, 60, 256, 256, 250);
    grad.addColorStop(0, '#bec3c9');
    grad.addColorStop(0.7, '#9da2a8');
    grad.addColorStop(1, '#7e8388');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    // 미세 석조 질감 스티플링
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    for (let i = 0; i < 4000; i++) {
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    // 2. 이마 위 나발(소용돌이 머리결) 헤어라인
    ctx.fillStyle = '#65696f';
    ctx.beginPath();
    ctx.arc(256, 120, 160, Math.PI * 0.9, Math.PI * 0.1, true);
    ctx.fill();

    // 3. 백호 (Urna / Bindu) - 이마 중앙 영롱한 백색 보주
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#ffeaa7';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(256, 215, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // 4. 유려한 초승달 눈썹
    ctx.strokeStyle = '#4e5258';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';

    // 왼눈썹
    ctx.beginPath();
    ctx.moveTo(246, 225);
    ctx.quadraticCurveTo(200, 208, 165, 230);
    ctx.stroke();

    // 오른눈썹
    ctx.beginPath();
    ctx.moveTo(266, 225);
    ctx.quadraticCurveTo(312, 208, 347, 230);
    ctx.stroke();

    // 5. [석굴암 본존불 특유의 반개한 자비의 눈] - 아래를 그윽하게 굽어보는 반쯤 감은 눈
    ctx.strokeStyle = '#36393e';
    ctx.lineWidth = 5;

    // 왼눈
    ctx.beginPath();
    ctx.moveTo(175, 252);
    ctx.quadraticCurveTo(205, 240, 235, 256);
    ctx.stroke();
    // 아래 속눈썹선
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(182, 254);
    ctx.quadraticCurveTo(205, 258, 228, 257);
    ctx.stroke();

    // 오른눈
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(277, 256);
    ctx.quadraticCurveTo(307, 240, 337, 252);
    ctx.stroke();
    // 아래 속눈썹선
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(284, 257);
    ctx.quadraticCurveTo(307, 258, 330, 254);
    ctx.stroke();

    // 6. 콧날 (오뚝하고 단아한 석조 콧날)
    ctx.strokeStyle = 'rgba(70,75,80,0.55)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(252, 225);
    ctx.lineTo(250, 290);
    ctx.quadraticCurveTo(240, 305, 244, 310);
    ctx.lineTo(268, 310);
    ctx.quadraticCurveTo(272, 305, 262, 290);
    ctx.stroke();

    // 7. 인자한 미소의 입술 (아르카익 스마일)
    ctx.fillStyle = '#6e484a';
    ctx.beginPath();
    ctx.moveTo(232, 345);
    ctx.quadraticCurveTo(256, 342, 280, 345);
    ctx.quadraticCurveTo(256, 362, 232, 345);
    ctx.fill();

    ctx.strokeStyle = '#422a2c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(228, 345);
    ctx.quadraticCurveTo(256, 349, 284, 345);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  // [원형 연화 두광 전용 텍스처] 16엽 연화문, 연주문, 황금 오라
  createLotusHaloTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#6a6f75';
    ctx.fillRect(0, 0, 512, 512);

    const cx = 256, cy = 256;

    // 외곽 황금빛 광배 링
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, 240, 0, Math.PI * 2);
    ctx.stroke();

    // 연주문 (진주 구슬 띠)
    ctx.fillStyle = '#eed688';
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 18) {
      const px = cx + Math.cos(a) * 220;
      const py = cy + Math.sin(a) * 220;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // 16엽 입체 연꽃잎 (앙련/복련 방사형 부조)
    const petalCount = 16;
    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      // 연꽃잎 외곽선 및 음영
      ctx.fillStyle = i % 2 === 0 ? '#8a8f96' : '#7d8288';
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(0, 50);
      ctx.bezierCurveTo(45, 90, 50, 165, 0, 205);
      ctx.bezierCurveTo(-50, 165, -45, 90, 0, 50);
      ctx.fill();
      ctx.stroke();

      // 꽃잎 중심맥
      ctx.strokeStyle = 'rgba(212,175,55,0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 70);
      ctx.lineTo(0, 195);
      ctx.stroke();

      ctx.restore();
    }

    // 중심 원형 자방
    ctx.fillStyle = '#4a4e54';
    ctx.beginPath();
    ctx.arc(cx, cy, 55, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#e6c86e';
    ctx.lineWidth = 5;
    ctx.stroke();

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  // [사용자 요청: 둥글게 그라데이션으로 둥글게 흐려지는 부드러운 원형 광배]
  createSoftAureoleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 512, 512);

    const cx = 256;
    const cy = 256;

    // 1. [요청 반영: 둥글게 그라데이션으로 둥글게 흐려져 깊이감을 주는 원형 광배]
    const grad = ctx.createRadialGradient(cx, cy, 20, cx, cy, 252);
    grad.addColorStop(0, 'rgba(255, 252, 242, 0.46)');
    grad.addColorStop(0.20, 'rgba(255, 246, 218, 0.30)');
    grad.addColorStop(0.48, 'rgba(235, 215, 175, 0.14)');
    grad.addColorStop(0.75, 'rgba(210, 190, 150, 0.04)');
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)'); // 외곽선 없이 둥글게 부드럽게 암흑 속으로 사라짐

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 254, 0, Math.PI * 2);
    ctx.fill();

    // 2. 부드럽고 가느다란 방사형 살선 (둥근 원형 내부에서만 은은하게 빛남)
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, 240, 0, Math.PI * 2);
    ctx.clip();

    ctx.strokeStyle = 'rgba(255, 250, 230, 0.10)';
    ctx.lineWidth = 1.0;
    const rayCount = 72;
    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * 250, cy + Math.sin(angle) * 250);
      ctx.stroke();
    }

    // 은은한 동심원 두광 링 (경계선 없이 맑은 빛고리)
    ctx.strokeStyle = 'rgba(255, 245, 215, 0.18)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx, cy, 85, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 245, 215, 0.10)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 155, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 외곽 테두리 선은 일절 긋지 않아 둥글게 완전히 흐려져 어둠과 융합됨!

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  // [사용자 요청 사진(무드등) 반영: 평면 2D 미니멀 석조 본존불 실루엣]
  createFlatBuddhaTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, 512, 768);
    const cx = 256;

    // 1. 기본 회색 석조 실루엣 베이스 (요청: 색만 회색으로)
    const stoneGrad = ctx.createLinearGradient(cx, 160, cx, 680);
    stoneGrad.addColorStop(0, '#9da3ad');
    stoneGrad.addColorStop(0.45, '#848a94');
    stoneGrad.addColorStop(1.0, '#6c717a');

    ctx.fillStyle = stoneGrad;

    // 머리 육계 꼭대기
    ctx.beginPath();
    ctx.arc(cx, 185, 18, 0, Math.PI * 2);
    ctx.arc(cx, 230, 44, 0, Math.PI * 2);
    ctx.fill();

    // 귀
    ctx.beginPath();
    ctx.ellipse(cx - 48, 240, 8, 22, -0.05, 0, Math.PI * 2);
    ctx.ellipse(cx + 48, 240, 8, 22, 0.05, 0, Math.PI * 2);
    ctx.fill();

    // 상체 및 팔, 결가부좌 하체 통합 실루엣
    ctx.beginPath();
    ctx.moveTo(cx - 24, 268); // 목
    ctx.quadraticCurveTo(cx - 105, 290, cx - 120, 360); // 왼쪽 어깨~팔
    ctx.quadraticCurveTo(cx - 130, 440, cx - 165, 510); // 왼팔꿈치~무릎
    ctx.quadraticCurveTo(cx - 190, 555, cx - 160, 575); // 왼쪽 무릎 바깥
    ctx.quadraticCurveTo(cx, 605, cx + 160, 575); // 바닥 결가부좌 라인
    ctx.quadraticCurveTo(cx + 190, 555, cx + 165, 510); // 오른쪽 무릎 바깥
    ctx.quadraticCurveTo(cx + 130, 440, cx + 120, 360); // 오른팔꿈치
    ctx.quadraticCurveTo(cx + 105, 290, cx + 24, 268); // 오른쪽 어깨~목
    ctx.closePath();
    ctx.fill();

    // 연화좌 받침대 베이스
    ctx.beginPath();
    ctx.moveTo(cx - 165, 580);
    ctx.quadraticCurveTo(cx - 180, 620, cx - 160, 645);
    ctx.quadraticCurveTo(cx, 665, cx + 160, 645);
    ctx.quadraticCurveTo(cx + 180, 620, cx + 165, 580);
    ctx.closePath();
    ctx.fill();

    // 2. [사용자 첨부 무드등 일치] 섬세하고 우아한 석백색/연회색 라인 아트 묘사
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = 'rgba(242, 245, 250, 0.78)';
    ctx.fillStyle = 'rgba(242, 245, 250, 0.78)';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // (1) 머리 나발과 육계
    ctx.beginPath();
    ctx.arc(cx, 185, 18, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, 230, 44, Math.PI * 0.8, Math.PI * 2.2);
    ctx.stroke();

    // 백호 (이마 중앙의 지혜의 빛)
    ctx.beginPath();
    ctx.arc(cx, 218, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // 명상의 고요한 눈 (자비롭게 반개한 눈)
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx - 25, 232);
    ctx.quadraticCurveTo(cx - 14, 235, cx - 6, 233);
    ctx.moveTo(cx + 6, 233);
    ctx.quadraticCurveTo(cx + 14, 235, cx + 25, 232);
    ctx.stroke();

    // 코와 인중
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx, 222);
    ctx.lineTo(cx, 242);
    ctx.lineTo(cx - 4, 245);
    ctx.lineTo(cx + 4, 245);
    ctx.stroke();

    // 온화한 입술
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(cx - 10, 253);
    ctx.quadraticCurveTo(cx, 256, cx + 10, 253);
    ctx.stroke();

    // 양쪽 긴 귓불 (이륜)
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - 44, 225);
    ctx.quadraticCurveTo(cx - 52, 245, cx - 44, 262);
    ctx.moveTo(cx + 44, 225);
    ctx.quadraticCurveTo(cx + 52, 245, cx + 44, 262);
    ctx.stroke();

    // 목 삼도(三道)
    ctx.lineWidth = 1.6;
    [-2, 6, 14].forEach(dy => {
      ctx.beginPath();
      ctx.moveTo(cx - 20, 274 + dy);
      ctx.quadraticCurveTo(cx, 278 + dy, cx + 20, 274 + dy);
      ctx.stroke();
    });

    // (2) 가사 자락(통견 의습선)
    ctx.lineWidth = 2.4;
    // 왼쪽 어깨에서 흘러내리는 가사 깃
    ctx.beginPath();
    ctx.moveTo(cx - 30, 285);
    ctx.bezierCurveTo(cx - 45, 360, cx - 20, 420, cx, 465);
    ctx.stroke();

    // 가슴과 복부의 부드러운 의습선
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - 65, 330);
    ctx.quadraticCurveTo(cx, 380, cx + 65, 345);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 85, 385);
    ctx.quadraticCurveTo(cx, 440, cx + 80, 400);
    ctx.stroke();

    // (3) 결가부좌 및 수인 (항마촉지인: 오른손 지신을 가리킴, 왼손 단전 선정인)
    // 왼손
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(cx - 15, 478, 26, 12, -0.1, 0, Math.PI * 2);
    ctx.stroke();

    // 오른손 (항마촉지인)
    ctx.beginPath();
    ctx.moveTo(cx + 95, 450);
    ctx.quadraticCurveTo(cx + 125, 490, cx + 130, 545);
    ctx.quadraticCurveTo(cx + 128, 565, cx + 122, 575);
    ctx.stroke();

    // 무릎과 결가부좌 다리 윤곽선
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - 160, 565);
    ctx.quadraticCurveTo(cx - 70, 520, cx, 525);
    ctx.quadraticCurveTo(cx + 70, 520, cx + 160, 565);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx - 130, 578);
    ctx.quadraticCurveTo(cx, 592, cx + 130, 578);
    ctx.stroke();

    // (4) 연화대좌 꽃잎들
    ctx.lineWidth = 2.2;
    for (let i = -4; i <= 4; i++) {
      const px = cx + i * 36;
      ctx.beginPath();
      ctx.moveTo(px - 18, 615);
      ctx.quadraticCurveTo(px, 590, px + 18, 615);
      ctx.stroke();
    }
    for (let i = -4; i <= 4; i++) {
      const px = cx + i * 38;
      ctx.beginPath();
      ctx.moveTo(px - 20, 642);
      ctx.quadraticCurveTo(px, 622, px + 20, 642);
      ctx.stroke();
    }

    // 외곽 둘레에 은은한 스톤 하이라이트 림
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
    ctx.beginPath();
    ctx.moveTo(cx - 165, 575);
    ctx.quadraticCurveTo(cx - 190, 555, cx - 165, 510);
    ctx.quadraticCurveTo(cx - 130, 440, cx - 120, 360);
    ctx.quadraticCurveTo(cx - 105, 290, cx - 24, 268);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx + 165, 575);
    ctx.quadraticCurveTo(cx + 190, 555, cx + 165, 510);
    ctx.quadraticCurveTo(cx + 130, 440, cx + 120, 360);
    ctx.quadraticCurveTo(cx + 105, 290, cx + 24, 268);
    ctx.stroke();

    // [사용자 요청: 하단부가 둥글고 자연스럽게 어둠 속으로 흐려져 깊이감을 줌]
    const fadeGrad = ctx.createLinearGradient(0, 500, 0, 670);
    fadeGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
    fadeGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = fadeGrad;
    ctx.fillRect(0, 0, 512, 768);
    ctx.globalCompositeOperation = 'source-over';

    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }

  // [3개 법당 고유 내부 & 우주적 심연 공간 구현]
  // 1. 석굴암: 정면 석굴암 본존불, 16엽 연화문 두광, 방사형 돔 천장 리브, 감실 보살상
  // 2. 대웅전: 화려한 금빛 닫집, 수미단, 대웅전 삼존불 사진 패널(사용자 촬영 사진) 및 3D 황금 삼존불
  // 3. 산신각: 소나무 처마 포각, 산신도(호랑이) & 독성도(나반존자) 사진 패널(사용자 촬영 사진), 목조 불단
  // 공통 전경: 좌복 위 작고 겸허하게 앉아 부처님을 바라보는 내 캐릭터(합장 스님), 허공에 부유하는 우주 성스러운 먼지 입자
  createInsideTempleProps() {
    this.insideGroup = new THREE.Group();
    this.insideGroup.visible = false;
    this.insideGroup.position.set(0, -80, 0);

    const texLoader = new THREE.TextureLoader();
    const daewoongTex = window.DAEWOONG_IMAGE_DATA ? texLoader.load(window.DAEWOONG_IMAGE_DATA) : null;
    const jijangTex = window.JIJANG_IMAGE_DATA ? texLoader.load(window.JIJANG_IMAGE_DATA) : null;
    const sansinTex = window.SANSIN_IMAGE_DATA ? texLoader.load(window.SANSIN_IMAGE_DATA) : null;

    // 1. 공통 바닥 (깊은 밤의 정적을 담은 흑요석/다크 우드 바닥)
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x100f14,
      roughness: 0.52,
      metalness: 0.15
    });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(12.5, 12.5, 0.35, 36), floorMat);
    floor.position.y = 0.17;
    this.insideGroup.add(floor);

    // 2. [우주적 심연] 허공에 고요히 부유하는 황금빛 성스러운 먼지 입자 (Cosmic Golden Dust)
    const dustCount = 180;
    const dustGeo = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(dustCount * 3);
    const dustSpeeds = new Float32Array(dustCount);
    for (let i = 0; i < dustCount; i++) {
      dustPositions[i * 3] = (Math.random() - 0.5) * 11;
      dustPositions[i * 3 + 1] = 0.4 + Math.random() * 5.8;
      dustPositions[i * 3 + 2] = -6.8 + Math.random() * 9.5;
      dustSpeeds[i] = 0.18 + Math.random() * 0.32;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    this.dustPositions = dustPositions;
    this.dustSpeeds = dustSpeeds;
    this.dustGeo = dustGeo;

    const dustMat = new THREE.PointsMaterial({
      color: 0xffe29a,
      size: 0.075,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });
    this.cosmicDust = new THREE.Points(dustGeo, dustMat);
    this.insideGroup.add(this.cosmicDust);

    // ==========================================
    // [법당 1] 석굴암 (Seokguram) 서브그룹
    // [사용자 요청 완벽 반영]
    // 1. 부처님은 원경에 멀리 아늑하게 배치 (z = -9.8)
    // 2. 사진 3 실루엣: 주두형(배모양) 방사형 황금 거신 광배 & 단아한 회색 미니멀 본존불
    // 3. 촛대와 향로는 부처님 바로 앞 제단에 배치 (z = -8.0)
    // 4. 나머지 공간은 깊고 고요한 어둠으로 여백 처리
    // ==========================================
    this.seokguramGroup = new THREE.Group();

    // (1) 부처님 뒤편의 넓고 깊은 다크 화강암 제단 바닥 원반 및 동굴 아치 실루엣
    const altarFloorCircle = new THREE.Mesh(
      new THREE.CylinderGeometry(8.2, 8.6, 0.05, 36),
      new THREE.MeshStandardMaterial({ color: 0x030407, roughness: 0.96 })
    );
    altarFloorCircle.position.set(0, 0.02, -10.8);
    this.seokguramGroup.add(altarFloorCircle);

    // (2) [석굴암 전실 아치 & 돌기둥 너머 본존불 - 주변을 점점 어둡게 비네팅 처리하여 깊은 굴 속 분위기 연출]
    const stoneBuddhaGroup = new THREE.Group();

    const buddhaCanvas = document.createElement('canvas');
    buddhaCanvas.width = 768;
    buddhaCanvas.height = 628;
    const bCtx = buddhaCanvas.getContext('2d');
    const seokBuddhaTex = new THREE.CanvasTexture(buddhaCanvas);

    const interiorImgSrc = window.SEOKGURAM_INTERIOR_DATA || window.SEOKGURAM_IMAGE_DATA;
    if (interiorImgSrc) {
      const img = new Image();
      img.onload = () => {
        bCtx.clearRect(0, 0, 768, 628);
        bCtx.drawImage(img, 0, 0, 768, 628);

        // 우측 하단 '1/89' 표시 영역을 자연스럽게 가리고, 중앙 본존불과 아치에서 외곽으로 갈수록 점점 어두워지는 방사형 어둠 비네팅
        const vGrad = bCtx.createRadialGradient(402, 300, 120, 402, 300, 405);
        vGrad.addColorStop(0.0, 'rgba(2, 3, 5, 0.0)');
        vGrad.addColorStop(0.45, 'rgba(2, 3, 5, 0.16)');
        vGrad.addColorStop(0.72, 'rgba(2, 3, 5, 0.62)');
        vGrad.addColorStop(0.90, 'rgba(2, 3, 5, 0.94)');
        vGrad.addColorStop(1.0, 'rgba(2, 3, 5, 1.0)');
        bCtx.fillStyle = vGrad;
        bCtx.fillRect(0, 0, 768, 628);

        // 외곽 가장자리를 배경 어둠(#020305)과 완전히 스며들도록 투명 페이드 마스크 적용
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = 768;
        maskCanvas.height = 628;
        const kCtx = maskCanvas.getContext('2d');
        const mGrad = kCtx.createRadialGradient(402, 300, 145, 402, 300, 415);
        mGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
        mGrad.addColorStop(0.62, 'rgba(255, 255, 255, 0.90)');
        mGrad.addColorStop(0.84, 'rgba(255, 255, 255, 0.35)');
        mGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
        kCtx.fillStyle = mGrad;
        kCtx.fillRect(0, 0, 768, 628);

        bCtx.globalCompositeOperation = 'destination-in';
        bCtx.drawImage(maskCanvas, 0, 0);
        bCtx.globalCompositeOperation = 'source-over';
        seokBuddhaTex.needsUpdate = true;
      };
      img.src = interiorImgSrc;
    }

    const flatBuddhaMat = new THREE.MeshBasicMaterial({
      map: seokBuddhaTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const flatBuddhaMesh = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 6.22), flatBuddhaMat);
    // 사진 속 중앙 본존불(약 x=402)을 제단 향로·캐릭터 정중앙(x = 0)에 정렬
    flatBuddhaMesh.position.set(-0.18, 0, 0);
    stoneBuddhaGroup.add(flatBuddhaMesh);

    stoneBuddhaGroup.position.set(0, 2.75, -12.8);
    this.seokguramGroup.add(stoneBuddhaGroup);

    // (3) [스케치 구현] 부처님 앞의 정갈한 석조 공양 제단 (z = -7.6, y = 0.58)
    const altarStoneMat = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.85 });
    const altarTopMat = new THREE.MeshStandardMaterial({ color: 0x181a1d, roughness: 0.75 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4b04e, metalness: 0.8, roughness: 0.28 });
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x5a4832, roughness: 0.55, metalness: 0.35 });

    // [요청 반영: 전각 공통 촛대 및 향로 생성 도우미 - 석굴암, 대웅전, 산신각 모두 선명하게 구현]
    this.candleFlames = [];
    this.incenseSmokes = [];

    const createCeremonialAltarSet = (targetGroup, altarY, altarZ, candleSpan = 1.5) => {
      const halfSpan = candleSpan / 2;
      [-halfSpan, halfSpan].forEach(cx => {
        const standBase = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.05, 14), brassMat);
        standBase.position.set(cx, altarY + 0.025, altarZ);
        targetGroup.add(standBase);

        const standShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.04, 0.26, 10), brassMat);
        standShaft.position.set(cx, altarY + 0.165, altarZ);
        targetGroup.add(standShaft);

        const standDish = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.06, 0.035, 14), brassMat);
        standDish.position.set(cx, altarY + 0.305, altarZ);
        targetGroup.add(standDish);

        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.22, 10), new THREE.MeshStandardMaterial({ color: 0xfffcf4, roughness: 0.4 }));
        candle.position.set(cx, altarY + 0.435, altarZ);
        targetGroup.add(candle);

        const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.04, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
        wick.position.set(cx, altarY + 0.565, altarZ);
        targetGroup.add(wick);

        const flameGroup = new THREE.Group();
        flameGroup.position.set(cx, altarY + 0.625, altarZ);

        const flameOuter = new THREE.Mesh(
          new THREE.SphereGeometry(0.045, 10, 10),
          new THREE.MeshBasicMaterial({ color: 0xff7700 })
        );
        flameOuter.scale.set(0.65, 2.2, 0.65);
        flameGroup.add(flameOuter);

        const flameInner = new THREE.Mesh(
          new THREE.SphereGeometry(0.026, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xfff6bb })
        );
        flameInner.scale.set(0.6, 1.8, 0.6);
        flameInner.position.y = -0.01;
        flameGroup.add(flameInner);

        flameGroup.visible = false;
        targetGroup.add(flameGroup);
        this.candleFlames.push(flameGroup);
      });

      // 중앙 청동 향로
      const burnerBase = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.05, 16), bronzeMat);
      burnerBase.position.set(0, altarY + 0.025, altarZ + 0.05);
      targetGroup.add(burnerBase);

      const burnerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.12, 0.16, 18), bronzeMat);
      burnerBody.position.set(0, altarY + 0.125, altarZ + 0.05);
      targetGroup.add(burnerBody);

      const burnerRim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.015, 8, 20), brassMat);
      burnerRim.rotation.x = Math.PI / 2;
      burnerRim.position.set(0, altarY + 0.205, altarZ + 0.05);
      targetGroup.add(burnerRim);

      const burnerAsh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.025, 14), new THREE.MeshStandardMaterial({ color: 0xc4bdae, roughness: 0.9 }));
      burnerAsh.position.set(0, altarY + 0.185, altarZ + 0.05);
      targetGroup.add(burnerAsh);

      const incenseStick = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.25, 6), new THREE.MeshStandardMaterial({ color: 0x7a2222 }));
      incenseStick.position.set(0, altarY + 0.305, altarZ + 0.05);
      targetGroup.add(incenseStick);

      const incenseEmber = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff3300 }));
      incenseEmber.position.set(0, altarY + 0.435, altarZ + 0.05);
      targetGroup.add(incenseEmber);

      const smokeGroup = new THREE.Group();
      smokeGroup.visible = false;
      const originY = altarY + 0.46;
      smokeGroup.userData = { originY: originY };
      for (let i = 0; i < 9; i++) {
        const smokeP = new THREE.Mesh(
          new THREE.SphereGeometry(0.024 + i * 0.014, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xd8d8d8, transparent: true, opacity: 0.40 })
        );
        smokeP.position.set((Math.random() - 0.5) * 0.04, originY + i * 0.13, altarZ + 0.05);
        smokeGroup.add(smokeP);
      }
      targetGroup.add(smokeGroup);
      this.incenseSmokes.push(smokeGroup);
    };

    // [석굴암 제단]
    const seokAltar = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.44, 0.75), altarStoneMat);
    seokAltar.position.set(0, 0.36, -7.6);
    this.seokguramGroup.add(seokAltar);

    const seokAltarTop = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.07, 0.82), altarTopMat);
    seokAltarTop.position.set(0, 0.61, -7.6);
    this.seokguramGroup.add(seokAltarTop);

    createCeremonialAltarSet(this.seokguramGroup, 0.65, -7.55, 1.5);

    // 석굴암 은은한 원경 스포트라이트
    const seokguramSpot = new THREE.SpotLight(0xffecd0, 0.6, 30, Math.PI / 4, 0.4, 1.2);
    seokguramSpot.position.set(0, 6.5, -6.5);
    seokguramSpot.target = stoneBuddhaGroup;
    this.seokguramGroup.add(seokguramSpot);
    this.seokguramGroup.add(seokguramSpot.target);

    this.insideGroup.add(this.seokguramGroup);

    // ==========================================
    // [법당 2] 대웅전 (Daewoongjeon) 서브그룹
    // [사용자 요청 완벽 반영: '대웅전' 사진에서 아래 공양물을 지우고 유리 반사를 보정하여,
    //  어떤 모습인지만 은은히 보일 수 있도록 원경에 멀리 깊이감 있게(z = -9.6, y = 2.85) 배치]
    // ==========================================
    this.daewoongGroup = new THREE.Group();

    const altarWoodMat = new THREE.MeshStandardMaterial({ color: 0x201510, roughness: 0.78 });
    const altarGoldTrimMat = new THREE.MeshStandardMaterial({ color: 0xb8923a, metalness: 0.55, roughness: 0.42 });

    // (1) 원경의 어둠과 자연스럽게 어우러지는 다크 바닥 원반
    const dwFloorCircle = new THREE.Mesh(
      new THREE.CylinderGeometry(4.6, 5.0, 0.05, 32),
      new THREE.MeshStandardMaterial({ color: 0x06070a, roughness: 0.95 })
    );
    dwFloorCircle.position.set(0, 0.02, -9.0);
    this.daewoongGroup.add(dwFloorCircle);

    // (2) 전면 공양 제단 (석굴암과 동일한 깊이감 있는 비율로 배치: z = -7.6)
    const frontAltar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.44, 0.78), altarWoodMat);
    frontAltar.position.set(0, 0.36, -7.6);
    this.daewoongGroup.add(frontAltar);

    const frontAltarTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.07, 0.85), altarGoldTrimMat);
    frontAltarTop.position.set(0, 0.61, -7.6);
    this.daewoongGroup.add(frontAltarTop);

    createCeremonialAltarSet(this.daewoongGroup, 0.65, -7.55, 1.5);

    // (3) [사용자 요청: '대웅전' 사진을 공양물 제거 + 유리 반사 수정 후 멀리 깊이감 있게 상단 원경 배치]
    if (daewoongTex) {
      // 뒤편 은은한 심연의 후광
      const dwAuraMat = new THREE.MeshBasicMaterial({
        map: this.createSoftAureoleTexture(),
        transparent: true,
        opacity: 0.45,
        depthWrite: false
      });
      const dwAura = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.4), dwAuraMat);
      dwAura.position.set(0, 2.88, -9.75);
      this.daewoongGroup.add(dwAura);

      const panelMat = new THREE.MeshBasicMaterial({
        map: daewoongTex
      });
      // 복잡한 나무 액자 틀 없이 심연 속에 아득하고 깊이감 있게 떠오르는 삼존불·후불탱화 (z = -9.6, y = 2.85)
      const daewoongPanel = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 3.0), panelMat);
      daewoongPanel.position.set(0, 2.85, -9.6);
      this.daewoongGroup.add(daewoongPanel);
    }

    const daewoongSpot = new THREE.SpotLight(0xffecd0, 0.45, 25, Math.PI / 3.8, 0.45, 1.2);
    daewoongSpot.position.set(0, 6.5, -5.5);
    daewoongSpot.target = frontAltar;
    this.daewoongGroup.add(daewoongSpot);
    this.daewoongGroup.add(daewoongSpot.target);

    this.insideGroup.add(this.daewoongGroup);

    // ==========================================
    // [법당 3] 산령각 (Sanryeonggak) 서브그룹
    // [사용자 요청 완벽 반영: 왼쪽에 '산신', 오른쪽에 '독성'을 나란히 붙여서 깊이감 있게 배치]
    // ==========================================
    this.sansinGroup = new THREE.Group();

    const pineMat = new THREE.MeshStandardMaterial({ color: 0x261a12, roughness: 0.82 });
    const sansinBrassMat = new THREE.MeshStandardMaterial({ color: 0xb59344, metalness: 0.65, roughness: 0.38 });

    const sansinAltar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.44, 0.78), pineMat);
    sansinAltar.position.set(0, 0.36, -7.6);
    this.sansinGroup.add(sansinAltar);

    const sansinAltarTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.07, 0.85), sansinBrassMat);
    sansinAltarTop.position.set(0, 0.61, -7.6);
    this.sansinGroup.add(sansinAltarTop);

    // 산령각 제단 촛대 및 향로 배치
    createCeremonialAltarSet(this.sansinGroup, 0.65, -7.55, 1.5);

    // [사용자 요청: 왼쪽 '산신' + 오른쪽 '독성' 나란히 배치된 성화 패널 (원경 깊이감 있는 배치)]
    if (sansinTex) {
      const sansinPanelMat = new THREE.MeshBasicMaterial({
        map: sansinTex
      });
      const sansinPanel = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 3.12), sansinPanelMat);
      sansinPanel.position.set(0, 2.82, -9.3);
      this.sansinGroup.add(sansinPanel);
    }

    const sansinSpot = new THREE.SpotLight(0xffdfa8, 0.45, 25, Math.PI / 3.8, 0.45, 1.2);
    sansinSpot.position.set(0, 6.5, -5.5);
    sansinSpot.target = sansinAltar;
    this.sansinGroup.add(sansinSpot);
    this.sansinGroup.add(sansinSpot.target);

    this.insideGroup.add(this.sansinGroup);

    // ==========================================
    // [법당 4] 지장전 (Jijangjeon) 서브그룹
    // [사용자 요청 완벽 반영: '지장전' 사진 배치 + 천정에 사용자 스케치 모양의 회색등 설치 +
    //  극락왕생·업장소멸 소원을 쓰면 천정 회색등에 불이 하나씩 켜지도록 구현]
    // ==========================================
    this.jijangGroup = new THREE.Group();

    const jijangAltar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.44, 0.78), altarWoodMat);
    jijangAltar.position.set(0, 0.36, -7.6);
    this.jijangGroup.add(jijangAltar);

    const jijangAltarTop = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.07, 0.85), altarGoldTrimMat);
    jijangAltarTop.position.set(0, 0.61, -7.6);
    this.jijangGroup.add(jijangAltarTop);

    createCeremonialAltarSet(this.jijangGroup, 0.65, -7.55, 1.5);

    if (jijangTex) {
      const jjAuraMat = new THREE.MeshBasicMaterial({
        map: this.createSoftAureoleTexture(),
        transparent: true,
        opacity: 0.42,
        depthWrite: false
      });
      const jjAura = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.3), jjAuraMat);
      jjAura.position.set(0, 2.58, -9.65);
      this.jijangGroup.add(jjAura);

      const jijangPanelMat = new THREE.MeshBasicMaterial({
        map: jijangTex
      });
      const jijangPanel = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3.1), jijangPanelMat);
      jijangPanel.position.set(0, 2.55, -9.5);
      this.jijangGroup.add(jijangPanel);
    }

    // [사용자 요청 반영: 첨부 사진 모양의 둥근 하얀 주름 초롱등 ('극락왕생' 글씨 + 상하 검은 테두리 + 하단 3줄 리본)]
    this.jijangLanterns = [];
    const lanternCanvas = document.createElement('canvas');
    lanternCanvas.width = 512;
    lanternCanvas.height = 256;
    const lCtx = lanternCanvas.getContext('2d');
    lCtx.fillStyle = '#f5f6f8';
    lCtx.fillRect(0, 0, 512, 256);
    // 수평 주름선(등살) 디테일
    for (let y = 16; y < 244; y += 11) {
      lCtx.strokeStyle = 'rgba(145, 152, 165, 0.42)';
      lCtx.lineWidth = 2;
      lCtx.beginPath();
      lCtx.moveTo(0, y);
      lCtx.lineTo(512, y);
      lCtx.stroke();
    }
    // 중앙 정면에 세로로 '극 락 왕 생' 붓글씨
    lCtx.fillStyle = '#1b1d22';
    lCtx.font = '700 32px "Noto Serif KR", serif';
    lCtx.textAlign = 'center';
    lCtx.textBaseline = 'middle';
    ['극', '락', '왕', '생'].forEach((ch, idx) => {
      lCtx.fillText(ch, 256, 62 + idx * 44);
    });
    const roundLanternTex = new THREE.CanvasTexture(lanternCanvas);

    const roundBodyGeo = new THREE.SphereGeometry(0.195, 22, 16);
    roundBodyGeo.scale(1.0, 0.90, 1.0);
    const blackRingGeo = new THREE.CylinderGeometry(0.088, 0.088, 0.022, 18);

    // 카메라 시야 상단에서 한눈에 잘 보이도록 배치된 천정 영가등 좌표
    const lanternPositions = [
      [0.0,   3.48, -6.7],
      [-0.78, 3.50, -6.8],
      [0.78,  3.50, -6.8],
      [-1.56, 3.55, -6.9],
      [1.56,  3.55, -6.9],
      [-0.39, 3.74, -7.6],
      [0.39,  3.74, -7.6],
      [-1.17, 3.78, -7.7],
      [1.17,  3.78, -7.7],
      [-2.25, 3.60, -7.0],
      [2.25,  3.60, -7.0],
      [0.0,   3.82, -7.8]
    ];

    const cordMat = new THREE.MeshBasicMaterial({ color: 0x3b3e44 });
    const blackRingMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.65 });
    const glowTex = this.createSoftAureoleTexture();
    lanternPositions.forEach(([lx, ly, lz]) => {
      const lGroup = new THREE.Group();
      lGroup.position.set(lx, ly, lz);

      // 천정 줄
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.35, 6), cordMat);
      cord.position.y = 0.36 + 0.67;
      lGroup.add(cord);

      // 어두운 회색 둥근 초롱등 재질 (꺼짐: 차분한 회색 / 켜짐: 화사한 노란색 등불로 대비 극대화)
      const petalMat = new THREE.MeshStandardMaterial({
        map: roundLanternTex,
        color: 0x767c86,
        roughness: 0.72,
        metalness: 0.02,
        emissive: 0x050608,
        emissiveIntensity: 0.04
      });

      const bodyMesh = new THREE.Mesh(roundBodyGeo, petalMat);
      bodyMesh.position.y = 0.18;
      bodyMesh.rotation.y = -Math.PI / 2; // '극락왕생' 글씨가 카메라 정면을 향하도록 회전
      lGroup.add(bodyMesh);

      // 상단·하단 검은색 테두리 링
      const topRing = new THREE.Mesh(blackRingGeo, blackRingMat);
      topRing.position.y = 0.35;
      lGroup.add(topRing);

      const bottomRing = new THREE.Mesh(blackRingGeo, blackRingMat);
      bottomRing.position.y = 0.01;
      lGroup.add(bottomRing);

      // 하단 3개의 리본(수술 장식 - 꺼짐 시 회색)
      const tagMat = new THREE.MeshBasicMaterial({
        color: 0x888e98,
        side: THREE.DoubleSide
      });
      [
        { x: -0.055, y: -0.065, rot: 0.14, h: 0.14 },
        { x: 0.0,    y: -0.085, rot: 0.0,  h: 0.18 },
        { x: 0.055,  y: -0.065, rot: -0.14, h: 0.14 }
      ].forEach((r) => {
        const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.038, r.h), tagMat);
        ribbon.position.set(r.x, r.y, 0);
        ribbon.rotation.z = r.rot;
        lGroup.add(ribbon);
      });

      // 점등 시 은은한 노란빛 광원 + 글로우 스프라이트
      const bulbGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0xffe999, transparent: true, opacity: 0.0 })
      );
      bulbGlow.position.y = 0.18;
      lGroup.add(bulbGlow);

      const glowSpriteMat = new THREE.SpriteMaterial({
        map: glowTex,
        color: 0xffd24d,
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const glowSprite = new THREE.Sprite(glowSpriteMat);
      glowSprite.scale.set(1.25, 1.25, 1.25);
      glowSprite.position.y = 0.18;
      lGroup.add(glowSprite);

      const pLight = new THREE.PointLight(0xffcf58, 0, 6.5);
      pLight.position.set(0, 0.08, 0);
      lGroup.add(pLight);

      this.jijangGroup.add(lGroup);
      this.jijangLanterns.push({
        group: lGroup,
        petalMat,
        tagMat,
        bulbGlow,
        glowSprite,
        pLight,
        isLit: false
      });
    });

    // 천정 하얀 연꽃등의 입체감이 어둠 속에서도 또렷이 보이도록 상부 보조광 추가
    const ceilingAmbient = new THREE.PointLight(0xeef2f8, 0.72, 14);
    ceilingAmbient.position.set(0, 4.1, -6.0);
    this.jijangGroup.add(ceilingAmbient);

    const jijangSpot = new THREE.SpotLight(0xffecd0, 0.48, 25, Math.PI / 3.8, 0.45, 1.2);
    jijangSpot.position.set(0, 6.5, -5.5);
    jijangSpot.target = jijangAltar;
    this.jijangGroup.add(jijangSpot);
    this.jijangGroup.add(jijangSpot.target);

    this.insideGroup.add(this.jijangGroup);

    // ==========================================
    // [공통 전경] [사용자 스케치 완벽 구현] 좌복(방석)과 그 위에 단정히 앉은 내 캐릭터(합장 스님)
    // [요청 반영] 마루 중앙(z = -2.2)에 아담한 크기로 배치하여 하단 메뉴에 가려지지 않고
    // 원경의 부처님과 제단을 우러러보는 깊이감 있는 명상 구도 완성
    // ==========================================
    const cushionMat = new THREE.MeshStandardMaterial({ color: 0x8a1c26, roughness: 0.65 });
    // [사용자 요청: 둥근 방석과 포근하고 둥근 결가부좌 곡선 연출]
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.08, 32), cushionMat);
    cushion.position.set(0, 0.04, -5.0);
    this.insideGroup.add(cushion);

    const cushionTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.47, 0.03, 32), new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4 }));
    cushionTrim.position.set(0, 0.015, -5.0);
    this.insideGroup.add(cushionTrim);

    this.insideMonkGroup = new THREE.Group();
    this.insideMonkGroup.visible = true;
    // [사용자 스케치 반영: 단정하고 둥근 눈사람/호리병 실루엣의 참배 캐릭터] (z = -4.9)
    this.insideMonkGroup.position.set(0, 0.10, -4.9);
    this.insideMonkGroup.rotation.y = Math.PI; // 제단(-Z 방향)을 경건히 바라봄
    this.insideMonkGroup.scale.set(0.35, 0.35, 0.35);

    const monkRobeMat = new THREE.MeshStandardMaterial({ color: 0x828892, roughness: 0.65 });
    const monkSkinMat = new THREE.MeshStandardMaterial({ color: 0xffdfc4, roughness: 0.45 });
    const monkWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });

    // 내 캐릭터(수행자)를 온화하게 비추는 부드러운 전경 조명
    const monkSoftLight = new THREE.PointLight(0xfff3db, 1.4, 7.5);
    monkSoftLight.position.set(0, 1.4, -4.5);
    this.insideGroup.add(monkSoftLight);

    // [스케치 완벽 구현: 일체형의 매끄럽고 둥근 조형 & 경건한 절 피봇]
    this.insideMonkTorsoPivot = new THREE.Group();
    this.insideMonkTorsoPivot.position.set(0, 0.05, 0);

    // 1. 하단 둥근 가부좌 베이스 (사용자 스케치: 아래가 둥글고 푸근한 모양)
    const lowerBody = new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 24), monkRobeMat);
    lowerBody.scale.set(1.18, 0.88, 1.10);
    lowerBody.position.set(0, 0.26, 0);
    this.insideMonkTorsoPivot.add(lowerBody);

    // 2. 상체 둥근 볼륨 (목 쪽으로 부드럽게 이어지는 호리병/달마인형 라인)
    const upperBody = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 24), monkRobeMat);
    upperBody.scale.set(1.0, 1.25, 0.95);
    upperBody.position.set(0, 0.52, 0);
    this.insideMonkTorsoPivot.add(upperBody);

    // 3. 머리 피봇 (경건히 숙여지는 두부)
    this.insideMonkHeadPivot = new THREE.Group();
    this.insideMonkHeadPivot.position.set(0, 0.88, 0);

    const sittingHead = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 24), monkSkinMat);
    this.insideMonkHeadPivot.add(sittingHead);

    const sittingNose = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 10), monkSkinMat);
    sittingNose.position.set(0, 0, 0.24);
    this.insideMonkHeadPivot.add(sittingNose);

    [-0.23, 0.23].forEach(ex => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), monkSkinMat);
      ear.position.set(ex, 0, 0);
      this.insideMonkHeadPivot.add(ear);
    });
    this.insideMonkTorsoPivot.add(this.insideMonkHeadPivot);

    // 4. [합장 팔 및 위를 향해 바르게 모아진 하얀 손 피봇]
    this.insideMonkArmsPivot = new THREE.Group();
    this.insideMonkArmsPivot.position.set(0, 0.44, 0.18); // [요청 반영: 소매를 아래로 내려 단아하게 정돈]

    [-0.12, 0.12].forEach((sx, idx) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.042, 0.19, 12), monkRobeMat);
      arm.position.set(sx, -0.04, 0.03); // [요청 반영: 소매를 아래로 내림]
      arm.rotation.z = idx === 0 ? -0.62 : 0.62;
      arm.rotation.x = 0.38; // [요청 반영] 손을 향해 단아하게 벌어지도록 각도 회전
      this.insideMonkArmsPivot.add(arm);
    });

    // 위쪽을 향해 바르게 모아진 하얀 합장 손
    const sittingHands = new THREE.Group();
    sittingHands.position.set(0, 0.06, 0.08); // 소매가 내려간 위치에 맞춤

    const leftWhiteH = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.038, 0.15, 12), monkWhiteMat);
    leftWhiteH.scale.set(0.55, 1.0, 1.2);
    leftWhiteH.position.set(-0.016, 0.04, 0);
    leftWhiteH.rotation.z = -0.08;
    leftWhiteH.rotation.x = -0.15;
    sittingHands.add(leftWhiteH);

    const rightWhiteH = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.038, 0.15, 12), monkWhiteMat);
    rightWhiteH.scale.set(0.55, 1.0, 1.2);
    rightWhiteH.position.set(0.016, 0.04, 0);
    rightWhiteH.rotation.z = 0.08;
    rightWhiteH.rotation.x = -0.15;
    sittingHands.add(rightWhiteH);

    const fingertipsSitting = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 12), monkWhiteMat);
    fingertipsSitting.scale.set(0.7, 1.2, 0.85);
    fingertipsSitting.position.set(0, 0.11, -0.01);
    sittingHands.add(fingertipsSitting);

    const wristSitting = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), monkWhiteMat);
    wristSitting.position.set(0, -0.03, 0.01);
    sittingHands.add(wristSitting);

    this.insideMonkArmsPivot.add(sittingHands);
    this.insideMonkTorsoPivot.add(this.insideMonkArmsPivot);

    this.insideMonkGroup.add(this.insideMonkTorsoPivot);
    this.insideGroup.add(this.insideMonkGroup);

    // 다른 참배객들의 전각 내부 앉은 모습 그룹
    this.remoteInsideGroup = new THREE.Group();
    this.remoteInsideGroup.visible = false;
    this.insideGroup.add(this.remoteInsideGroup);

    this.scene.add(this.insideGroup);
  }

  // 전각 내부 동시 입장 시 다른 참배객용 좌복 + 앉은 캐릭터 메시 (정좌 자세 유지)
  buildInsideSittingMonkMesh(robeColorHex = 0x828892) {
    const slotGroup = new THREE.Group();

    const cushionMat = new THREE.MeshStandardMaterial({ color: 0x8a1c26, roughness: 0.65 });
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.45, 0.08, 24), cushionMat);
    cushion.position.set(0, 0.04, -0.1);
    slotGroup.add(cushion);

    const cushionTrim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.47, 0.03, 24),
      new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4 })
    );
    cushionTrim.position.set(0, 0.015, -0.1);
    slotGroup.add(cushionTrim);

    const monkGroup = new THREE.Group();
    monkGroup.position.set(0, 0.10, 0);
    monkGroup.rotation.y = Math.PI;
    monkGroup.scale.set(0.35, 0.35, 0.35);

    const robeMat = new THREE.MeshStandardMaterial({ color: robeColorHex, roughness: 0.65 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdfc4, roughness: 0.45 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });

    const lowerBody = new THREE.Mesh(new THREE.SphereGeometry(0.38, 18, 18), robeMat);
    lowerBody.scale.set(1.18, 0.88, 1.10);
    lowerBody.position.set(0, 0.31, 0);
    monkGroup.add(lowerBody);

    const upperBody = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 18), robeMat);
    upperBody.scale.set(1.0, 1.25, 0.95);
    upperBody.position.set(0, 0.57, 0);
    monkGroup.add(upperBody);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 18), skinMat);
    head.position.set(0, 0.93, 0);
    monkGroup.add(head);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), skinMat);
    nose.position.set(0, 0.93, 0.24);
    monkGroup.add(nose);

    [-0.23, 0.23].forEach(ex => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), skinMat);
      ear.position.set(ex, 0.93, 0);
      monkGroup.add(ear);
    });

    const armsGroup = new THREE.Group();
    armsGroup.position.set(0, 0.49, 0.18);
    [-0.12, 0.12].forEach((sx, idx) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.082, 0.042, 0.19, 10), robeMat);
      arm.position.set(sx, -0.04, 0.03);
      arm.rotation.z = idx === 0 ? -0.62 : 0.62;
      arm.rotation.x = 0.38;
      armsGroup.add(arm);
    });

    const hands = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 10), whiteMat);
    hands.scale.set(0.85, 1.35, 0.85);
    hands.position.set(0, 0.09, 0.08);
    armsGroup.add(hands);
    monkGroup.add(armsGroup);

    slotGroup.add(monkGroup);
    return slotGroup;
  }

  // [방안 A 구현] 경건한 삼배(절하기) 애니메이션 실행기
  performThreeBows(onRoundChange, onComplete) {
    if (this.isBowing) return;
    this.isBowing = true;

    let currentBow = 1;
    const totalBows = 3;
    const bowDuration = 3.4; // 1배당 3.4초의 정갈한 절

    const runSingleBow = (bowNum) => {
      if (onRoundChange) onRoundChange(bowNum, totalBows);
      if (window.templeAudio) window.templeAudio.playSingleMoktak();

      const startTime = performance.now();
      const animBow = (now) => {
        const elapsed = (now - startTime) / 1000;
        const progress = Math.min(1.0, elapsed / bowDuration);

        // 절하기 동작 커브 (경건하게 상체를 26도 정중히 숙이고 고개를 숙이는 불교식 반배/좌배)
        let ease = 0;
        if (progress < 0.45) {
          // 숙이는 단계 (0 -> 1)
          const t = progress / 0.45;
          ease = t * t * (3 - 2 * t);
        } else if (progress < 0.62) {
          // 고요히 정성을 다하는 절 머무름 단계
          ease = 1.0;
        } else {
          // 다시 공손히 일어나는 단계 (1 -> 0)
          const t = (progress - 0.62) / 0.38;
          ease = 1 - t * t * (3 - 2 * t);
        }

        // [요청 반영: 땅에 파묻히지 않고, 등이 둥글게 숙여지며 절하는 모습이 뚜렷하게 보이도록 조율]
        const bowAngle = ease * 0.46;  // 26도 정중한 절 각도 (땅속으로 꺼지지 않고 위에서 등이 자연스럽게 굽어짐)
        const headAngle = ease * 0.30; // 고개 숙임
        const squash = ease * 0.08;    // 가부좌의 자연스러운 눌림 쿠션감

        this.insideMonkTorsoPivot.rotation.x = bowAngle;
        this.insideMonkHeadPivot.rotation.x = headAngle;
        this.insideMonkTorsoPivot.scale.set(1.0 + squash * 0.5, 1.0 - squash, 1.0 + squash * 0.5);
        this.insideMonkArmsPivot.position.y = 0.48 - ease * 0.10;
        this.insideMonkArmsPivot.rotation.x = ease * 0.30;
        this.insideMonkGroup.position.y = 0.12; // 지면 및 좌복 위 안전 고정

        if (progress < 1.0) {
          requestAnimationFrame(animBow);
        } else {
          // 기본 정자세 복원
          this.insideMonkTorsoPivot.rotation.x = 0;
          this.insideMonkHeadPivot.rotation.x = 0;
          this.insideMonkTorsoPivot.scale.set(1.0, 1.0, 1.0);
          this.insideMonkArmsPivot.position.y = 0.48;
          this.insideMonkArmsPivot.rotation.x = 0;
          this.insideMonkGroup.position.y = 0.12;

          if (bowNum < totalBows) {
            setTimeout(() => runSingleBow(bowNum + 1), 400);
          } else {
            this.isBowing = false;
            if (window.templeAudio) window.templeAudio.playSingingBowl();
            if (onComplete) onComplete();
          }
        }
      };
      requestAnimationFrame(animBow);
    };

    runSingleBow(1);
  }

  lightCandles() {
    this.isCandleLit = !this.isCandleLit;
    this.candleFlames.forEach(f => f.visible = this.isCandleLit);
    if (this.isCandleLit) {
      this.insideCandleLight.intensity = 2.4;
      if (window.templeAudio) window.templeAudio.playIgniteSound();
    } else {
      this.insideCandleLight.intensity = 0.25;
    }
    return this.isCandleLit;
  }

  lightIncense() {
    this.isIncenseLit = !this.isIncenseLit;
    if (this.incenseSmokes) {
      this.incenseSmokes.forEach(s => s.visible = this.isIncenseLit);
    }
    if (this.isIncenseLit) {
      if (window.templeAudio) window.templeAudio.playIgniteSound();
    }
    return this.isIncenseLit;
  }

  // [사용자 요청 완벽 반영: 현판은 하얀 바탕에 검정 글씨로 밖에서 잘 보이게 지붕 아래 달아줌]
  createSignboard(parent, title, subTitle, x, y, z, width = 2.6, height = 0.72) {
    const group = new THREE.Group();

    // 1. 고해상도 캔버스 텍스처 (1024x320) - 하얀 바탕에 선명한 검정 서예 글씨
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');

    // 깨끗하고 밝은 하얀색 한지/백판 바탕
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 1024, 320);

    // 외곽 짙은 먹색/목재 테두리 및 내부 단정한 이중 먹선 테두리
    ctx.strokeStyle = '#1f1c18';
    ctx.lineWidth = 18;
    ctx.strokeRect(9, 9, 1006, 302);

    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 5;
    ctx.strokeRect(28, 28, 968, 264);

    // 네 모서리 전통 먹색 장식점
    ctx.fillStyle = '#1f1c18';
    [[42, 42], [982, 42], [42, 278], [982, 278]].forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.fill();
    });

    // 전각 명칭: 밖에서 멀리서도 한눈에 읽히는 굵고 또렷한 검정 글씨
    ctx.fillStyle = '#0d0d0d';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 132px "Noto Serif KR", serif';
    ctx.fillText(title, 512, 162);

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;

    // 2. 3D 원목 프레임 몸체
    const frameDepth = 0.09;
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x2a2019,
      roughness: 0.65
    });
    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, frameDepth), frameMat);
    group.add(frameMesh);

    // 3. 전면 하얀 바탕 검정 글씨 현판 면 (조명 그림자에 어두워지지 않도록 밝은 재질 적용)
    const signMat = new THREE.MeshBasicMaterial({
      map: tex,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.06, height - 0.06), signMat);
    signMesh.position.z = frameDepth / 2 + 0.006;
    group.add(signMesh);

    // 4. 지붕 처마 아래에 단단히 매달린 걸개 목재/철제 브래킷 (지붕 위로 돌출되지 않도록 현판 뒷면/지붕 밑에만 결속)
    // 사용자 요청: 지붕 위로 삐져나온 꼭지 2개 완전 제거

    // 마당에서 올려다볼 때 더욱 선명히 보이도록 살짝 아래로 각도 부여
    group.rotation.x = 0.06;
    group.position.set(x, y, z);
    parent.add(group);
    return group;
  }

  // [석탑 기단부 현판: 하얀 바탕 검정 글씨 통일]
  createPagodaBasePlaque(pagoda) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 160);

    ctx.strokeStyle = '#1f1c18';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 496, 144);

    ctx.fillStyle = '#0d0d0d';
    ctx.font = '900 68px "Noto Serif KR", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('묘보탑', 256, 82);

    const tex = new THREE.CanvasTexture(canvas);
    const plaqueMat = new THREE.MeshBasicMaterial({
      map: tex,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });

    const plaqueGroup = new THREE.Group();
    const stoneFrame = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.44, 0.06), new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.8 }));
    plaqueGroup.add(stoneFrame);

    const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.38), plaqueMat);
    faceMesh.position.z = 0.035;
    plaqueGroup.add(faceMesh);

    plaqueGroup.position.set(0, 1.15, 2.22);
    pagoda.add(plaqueGroup);
  }

  createStoneLantern(x, y, z) {
    const group = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xa8a69e, roughness: 0.85 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 8), stoneMat);
    base.position.y = 0.15;
    group.add(base);

    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.8, 8), stoneMat);
    pillar.position.y = 0.7;
    group.add(pillar);

    const lightBox = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), stoneMat);
    lightBox.position.y = 1.3;
    group.add(lightBox);

    const lampLight = new THREE.PointLight(0xffb84d, 0.4, 4);
    lampLight.position.set(0, 1.3, 0);
    group.add(lampLight);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.65, 0.35, 8), stoneMat);
    roof.position.y = 1.65;
    group.add(roof);

    group.position.set(x, y, z);
    this.scene.add(group);
    this.addObstacle(x, z, 0.6);
  }

  createEnvironmentDetails() {
    // [새 지도 레이아웃에 맞춰 전각과 산책로를 가리지 않는 위치에 소나무 숲 배치]
    const pineTreeLocations = [
      [-9, 26], [9, 26], [-26, 24], [28, 24],
      [-28, 8], [-29, -14], [-27, -25],
      [27, 0], [28, -14], [24, -25],
      [-15, -29], [3, -30], [18, -29]
    ];
    pineTreeLocations.forEach(([px, pz]) => {
      this.createPineTree(px, 0, pz);
      this.addObstacle(px, pz, 0.5);
    });
  }

  createPineTree(x, y, z) {
    const group = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.38, 3.8, 7), new THREE.MeshStandardMaterial({ color: 0x5a3d28, roughness: 0.95 }));
    trunk.position.y = 1.9;
    trunk.rotation.z = (Math.random() - 0.5) * 0.25;
    group.add(trunk);

    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x24422b, roughness: 0.85, flatShading: true });
    [{ r: 2.2, h: 1.4, y: 3.2 }, { r: 1.7, h: 1.2, y: 4.2 }, { r: 1.1, h: 1.0, y: 5.0 }].forEach(f => {
      const fol = new THREE.Mesh(new THREE.ConeGeometry(f.r, f.h, 7), foliageMat);
      fol.position.y = f.y;
      group.add(fol);
    });

    group.position.set(x, y, z);
    const s = 0.85 + Math.random() * 0.4;
    group.scale.set(s, s, s);
    this.scene.add(group);
  }

  createRippleMarker() {
    const geo = new THREE.RingGeometry(0.1, 0.8, 32);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd479, transparent: true, opacity: 0, side: THREE.DoubleSide });
    this.rippleMesh = new THREE.Mesh(geo, mat);
    this.rippleMesh.rotation.x = -Math.PI / 2;
    this.rippleMesh.position.y = 0.05;
    this.scene.add(this.rippleMesh);
  }

  showRipple(x, z) {
    this.rippleMesh.position.x = x;
    this.rippleMesh.position.z = z;
    this.rippleMesh.position.y = this.getTerrainHeight(x, z) + 0.05;
    this.rippleMesh.scale.set(0.2, 0.2, 0.2);
    this.rippleMesh.material.opacity = 0.85;

    let progress = 0;
    const anim = () => {
      progress += 0.06;
      if (progress < 1) {
        const s = 0.2 + progress * 1.5;
        this.rippleMesh.scale.set(s, s, s);
        this.rippleMesh.material.opacity = 0.85 * (1 - progress);
        requestAnimationFrame(anim);
      } else {
        this.rippleMesh.material.opacity = 0;
      }
    };
    anim();
  }

  // [수정 완료] 발자국 방향 완전 교정: 진행 방향 앞쪽에 둥근 앞꿈치(+Z), 뒤쪽에 뒤꿈치(-Z)가 캐릭터 회전과 100% 동일하게 일치!
  addFootprint(x, z, charRotY, isRightFoot) {
    const group = new THREE.Group();
    const fpMat = new THREE.MeshBasicMaterial({ color: 0xd6ad56, transparent: true, opacity: 0.82 });

    // 앞꿈치 (로컬 +Z가 앞쪽 진행 방향)
    const sole = new THREE.Mesh(new THREE.CircleGeometry(0.14, 14), fpMat);
    sole.rotation.x = -Math.PI / 2;
    sole.scale.set(0.78, 1.25, 1);
    sole.position.z = 0.10;
    group.add(sole);

    // 뒤꿈치 (로컬 -Z가 뒤쪽)
    const heel = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), fpMat);
    heel.rotation.x = -Math.PI / 2;
    heel.scale.set(0.72, 0.9, 1);
    heel.position.z = -0.12;
    group.add(heel);

    // 그룹 회전을 캐릭터의 회전과 100% 일치시켜 진행 방향과 완벽 동기화!
    group.rotation.y = charRotY;

    // 좌우 발걸음 너비 오프셋
    const offsetSide = isRightFoot ? 0.16 : -0.16;
    const worldOffsetX = Math.cos(charRotY) * offsetSide;
    const worldOffsetZ = -Math.sin(charRotY) * offsetSide;
    group.position.set(x + worldOffsetX, 0.035, z + worldOffsetZ);

    this.scene.add(group);
    this.footprints.push({ mesh: group, life: 1.0 });

    if (this.footprints.length > 50) {
      const old = this.footprints.shift();
      this.scene.remove(old.mesh);
    }
  }

  clearFootprints() {
    this.footprints.forEach(fp => this.scene.remove(fp.mesh));
    this.footprints = [];
  }

  registerInteractable(item) {
    this.interactables.push(item);
  }

  setupEvents() {
    const el = this.renderer.domElement;

    const onPointerDown = (e) => {
      this.isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      this.previousMousePosition = { x: clientX, y: clientY };
      this.touchStartPos = { x: clientX, y: clientY };
      this.touchStartTime = performance.now();
    };

    const onPointerMove = (e) => {
      if (!this.isDragging) return;
      const isTouch = !!e.touches;
      const clientX = isTouch ? e.touches[0].clientX : e.clientX;
      const clientY = isTouch ? e.touches[0].clientY : e.clientY;

      const deltaX = clientX - this.previousMousePosition.x;
      const deltaY = clientY - this.previousMousePosition.y;

      // [모바일 터치 최적화]: 스마트폰에서 손가락을 살짝만 밀어도 시원하고 부드럽게 360도 회전하도록 감도 향상
      const sensitivityX = isTouch ? 0.0078 : 0.005;
      const sensitivityY = isTouch ? 0.0058 : 0.004;

      this.cameraAngles.theta -= deltaX * sensitivityX;
      this.cameraAngles.phi = Math.max(0.15, Math.min(Math.PI / 2.3, this.cameraAngles.phi + deltaY * sensitivityY));

      this.previousMousePosition = { x: clientX, y: clientY };
    };

    const onPointerUp = (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;

      const clientX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      const clientY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;

      const moveDist = Math.hypot(clientX - this.touchStartPos.x, clientY - this.touchStartPos.y);
      const touchDuration = performance.now() - this.touchStartTime;

      if (moveDist < 12 && touchDuration < 350) {
        this.handleTap(clientX, clientY);
      }
    };

    el.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);

    el.addEventListener('touchstart', onPointerDown, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('touchend', onPointerUp);

    el.addEventListener('wheel', (e) => {
      this.cameraDistance = Math.max(4.5, Math.min(18, this.cameraDistance + e.deltaY * 0.01));
    }, { passive: true });

    // [화면 회전(가로/세로 전환) 완벽 대응]
    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', () => {
      setTimeout(handleResize, 80);
      setTimeout(handleResize, 250);
    });

    window.addEventListener('keydown', (e) => {
      if (this.currentMode !== 'outside') return;
      const forward = new THREE.Vector3(-Math.sin(this.cameraAngles.theta), 0, -Math.cos(this.cameraAngles.theta));
      const right = new THREE.Vector3(Math.cos(this.cameraAngles.theta), 0, -Math.sin(this.cameraAngles.theta));
      const step = 0.7;

      const newPos = this.playerPos.clone();
      let moved = false;
      if (e.key === 'w' || e.key === 'ArrowUp') { newPos.addScaledVector(forward, step); moved = true; }
      if (e.key === 's' || e.key === 'ArrowDown') { newPos.addScaledVector(forward, -step); moved = true; }
      if (e.key === 'a' || e.key === 'ArrowLeft') { newPos.addScaledVector(right, -step); moved = true; }
      if (e.key === 'd' || e.key === 'ArrowRight') { newPos.addScaledVector(right, step); moved = true; }

      if (moved) {
        this.checkCollision(newPos);
        newPos.y = this.getTerrainHeight(newPos.x, newPos.z);
        this.playerPos.copy(newPos);
        this.walkTarget = null;
        this.targetLookAt = null;
        this.isWalking = true;
        this.characterGroup.position.copy(this.playerPos);
        this.checkInteractables();
      }
    });
  }

  handleTap(clientX, clientY) {
    if (this.currentMode !== 'outside') return;

    if (window.templeAudio) {
      window.templeAudio.resume();
      window.templeAudio.startAmbient();
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObject(this.groundMesh);

    if (intersects.length > 0) {
      const p = intersects[0].point;
      p.x = Math.max(-35, Math.min(35, p.x));
      p.z = Math.max(-32, Math.min(38, p.z));

      this.walkWaypoints = [];
      this.walkTarget = new THREE.Vector3(p.x, this.getTerrainHeight(p.x, p.z), p.z);
      this.targetLookAt = null;
      this.finalLookTarget = null;
      this.isWalking = true;
      this.showRipple(p.x, p.z);
    }
  }

  enterTempleGate() {
    this.activeLocation = null;
    if (window.onLocationChanged) window.onLocationChanged(null);
    // 현재 위치에서 뒤로 물러나지 않고 대문 바로 안쪽(z = 27.2)으로 곧장 걸어 들어가 정지
    this.walkWaypoints = [];
    this.walkTarget = new THREE.Vector3(0, 0, 27.2);
    this.finalLookTarget = new THREE.Vector3(0, 1.5, 10.0);
    this.targetLookAt = null;
    this.isWalking = true;
    this.showRipple(0, 27.2);
  }

  walkToLocation(locationId) {
    const item = this.interactables.find(i => i.id === locationId);
    if (!item) return;

    if (this.isBeomjongReady || this.isBeomjongRinging) {
      this.stopBeomjongBell();
    }

    if (window.templeAudio) {
      window.templeAudio.resume();
      window.templeAudio.startAmbient();
    }

    // 전각 탭 시 즉시 기존 팝업을 닫고, 바로 앞에 설 때까지 입장하기가 뜨지 않도록 처리
    this.activeLocation = null;
    this.waitingForLoc = null;
    this.waitingQueuedAt = null;
    if (window.onLocationChanged) window.onLocationChanged(null);

    const queueStatus = this.isQueueLocation(locationId)
      ? this.getQueueStatus(locationId, item.position)
      : { isOccupied: false, totalWaiting: 0 };
    const occupants = this.getOccupyingPilgrims(locationId, item.position);
    let finalDest = item.position.clone();
    if (this.isQueueLocation(locationId) && (occupants.length > 0 || queueStatus.totalWaiting > 0)) {
      finalDest = this.getSideWaitPos(item.position, occupants.length + queueStatus.totalWaiting);
      this.waitingForLoc = locationId;
      this.waitingQueuedAt = Date.now();
    }
    finalDest.y = this.getTerrainHeight(finalDest.x, finalDest.z);
    this.finalLookTarget = item.lookTarget ? item.lookTarget.clone() : null;

    // 각 전각 갈림길과 중앙 산책로 분기점 매핑
    const junctionMap = {
      hojimun: new THREE.Vector3(0, 0, 28.0),
      gwanyok: new THREE.Vector3(0, 0, 17.5),
      bulsa: new THREE.Vector3(-0.4, 0, 18.2),
      daewoong: new THREE.Vector3(1.0, 0, 11.5),
      jijang: new THREE.Vector3(12.0, 0, 11.5),
      pagoda: new THREE.Vector3(-2.2, 0, 1.2),
      beomjong: new THREE.Vector3(-0.5, 0, -4.2),
      sansin: new THREE.Vector3(-3.2, 0, -11.5),
      seokguram: new THREE.Vector3(-3.2, 0, -11.5)
    };

    this.walkWaypoints = [];

    // 관욕식 단(-4.2, 15.6) 앞/주변에서 다른 전각으로 이동할 때 관욕대에 걸리지 않도록 중앙 산책로(x=0.8)로 먼저 우회
    if (this.playerPos.x < -1.6 && this.playerPos.z > 13.5 && this.playerPos.z < 20.5 && locationId !== 'gwanyok') {
      this.walkWaypoints.push(new THREE.Vector3(0.8, 0, Math.max(17.2, this.playerPos.z)));
    }

    // 대문(z = 30.0) 바깥에서 경내 전각으로 들어갈 때는 반드시 대문 중앙 통로를 거쳐 입장
    if (this.playerPos.z > 29.4 && locationId !== 'hojimun') {
      this.walkWaypoints.push(new THREE.Vector3(0, 0, 31.8));
      this.walkWaypoints.push(new THREE.Vector3(0, 0, 28.0));
    } else if (locationId === 'pagoda' && this.playerPos.x < -4.5 && this.playerPos.z >= -1.0 && this.playerPos.z <= 8.0) {
      // 이미 탑전 앞마당(남쪽) 영역에 있으면 중앙 길로 되돌아가지 않고 곧장 탑전 동그라미 표식으로 이동
    } else if (Math.abs(this.playerPos.x) > 4.5) {
      // 현재 위치가 중앙 산책로에서 벗어나 있으면 가까운 중앙 길로 먼저 복귀
      if (this.playerPos.x > 16 && this.playerPos.z > 8) {
        if (locationId === 'jijang') {
          this.walkWaypoints.push(new THREE.Vector3(18.2, 0, 16.6));
        } else {
          // 지장전 근처에 있을 때는 지장전 앞길 우회 후 대웅전 앞마당 경유
          this.walkWaypoints.push(new THREE.Vector3(18.2, 0, 16.6));
          this.walkWaypoints.push(new THREE.Vector3(12.0, 0, 11.5));
          const nearSpineZ = Math.max(-12, Math.min(24, this.playerPos.z));
          this.walkWaypoints.push(new THREE.Vector3(0, 0, nearSpineZ));
        }
      } else {
        const nearSpineZ = Math.max(-12, Math.min(24, this.playerPos.z));
        this.walkWaypoints.push(new THREE.Vector3(0, 0, nearSpineZ));
      }
    }

    // 목적지 갈림길 분기점 경유
    if (locationId === 'jijang') {
      if (!(this.playerPos.x > 16 && this.playerPos.z > 8)) {
        if (this.playerPos.x < 10.0) {
          this.walkWaypoints.push(new THREE.Vector3(1.0, 0, 11.5));
        }
        this.walkWaypoints.push(new THREE.Vector3(12.0, 0, 11.5));
        this.walkWaypoints.push(new THREE.Vector3(18.2, 0, 16.6));
      }
    } else if (locationId === 'hojimun' && this.playerPos.z < 29.8) {
      this.walkWaypoints.push(new THREE.Vector3(0, 0, 28.0));
      this.walkWaypoints.push(new THREE.Vector3(0, 0, 31.8));
    } else if (junctionMap[locationId] && !(locationId === 'pagoda' && this.playerPos.x < -4.5 && this.playerPos.z >= -1.0 && this.playerPos.z <= 8.0)) {
      this.walkWaypoints.push(junctionMap[locationId].clone());
    }

    this.walkWaypoints.push(finalDest);
    this.walkTarget = this.walkWaypoints.shift();
    this.targetLookAt = null;
    this.isWalking = true;
    this.showRipple(finalDest.x, finalDest.z);
  }

  updateCameraPosition() {
    if (this.currentMode === 'outside') {
      if ((this.isBeomjongReady || this.isBeomjongRinging) && this.beomjongPos) {
        // [사용자 요청 반영: 기둥(x=±3.1, z=+2.3)에 가리지 않으면서 모바일 세로 화면에서도 범종과 캐릭터가 작고 온전히 보이도록 더 멀리 배치]
        const bellCamPos = new THREE.Vector3(this.beomjongPos.x + 1.15, 2.40, this.beomjongPos.z + 9.6);
        this.camera.position.lerp(bellCamPos, 0.14);
        this.camera.lookAt(this.beomjongPos.x + 0.95, 2.25, this.beomjongPos.z + 0.35);
        return;
      }
      if (this.activeLocation && this.activeLocation.id === 'beomjong' && !this.isWalking && this.beomjongPos) {
        // [사용자 요청 반영: 대웅전 지붕에 가려지는 일이 없도록 범종각 정면 마당에서 범종각 전체를 안정적으로 비추는 전용 시점]
        const frontBellCam = new THREE.Vector3(this.beomjongPos.x, 2.55, this.beomjongPos.z + 10.2);
        this.camera.position.lerp(frontBellCam, 0.12);
        this.camera.lookAt(this.beomjongPos.x, 2.35, this.beomjongPos.z);
        return;
      }
      if ((this.isGwanyokActive || (this.activeLocation && this.activeLocation.id === 'gwanyok' && !this.isWalking)) && this.gwanyokPos) {
        // [사용자 요청 반영: 상단 안내 메뉴에 가리지 않도록 아기 부처님과 캐릭터를 화면 중앙~하단 쪽에 배치]
        const gwanyokCamPos = this.isGwanyokActive
          ? new THREE.Vector3(this.gwanyokPos.x + 0.85, 1.68, this.gwanyokPos.z + 2.85)
          : new THREE.Vector3(this.gwanyokPos.x, 1.72, this.gwanyokPos.z + 3.25);
        this.camera.position.lerp(gwanyokCamPos, 0.12);
        // 카메라 시선 중심(lookAt Y)을 1.85m로 높여 아기 부처님과 캐릭터가 상단 메뉴 아래쪽에 온전히 보이도록 조정
        this.camera.lookAt(this.gwanyokPos.x, 1.85, this.gwanyokPos.z + 0.25);
        return;
      }
      const targetLookY = this.playerPos.y + 1.05;
      const cx = this.playerPos.x + this.cameraDistance * Math.sin(this.cameraAngles.theta) * Math.cos(this.cameraAngles.phi);
      const cy = targetLookY + this.cameraDistance * Math.sin(this.cameraAngles.phi);
      const cz = this.playerPos.z + this.cameraDistance * Math.cos(this.cameraAngles.theta) * Math.cos(this.cameraAngles.phi);

      this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.1);
      this.camera.lookAt(this.playerPos.x, targetLookY, this.playerPos.z);
    }
  }

  // [요청 반영] 걸어가는 도중에는 절대 입장하기 팝업이 뜨지 않고, 바로 앞에 섰을 때만 뜨도록 수정
  checkInteractables() {
    if (this.currentMode !== 'outside') return;

    if (this.isWalking) {
      if (this.activeLocation !== null) {
        this.activeLocation = null;
        if (window.onLocationChanged) window.onLocationChanged(null);
      }
      return;
    }

    let nearest = null;
    let minDist = 3.6; // 전각 바로 앞에 서야 입장하기가 뜨도록 거리를 3.6m로 정밀화

    this.interactables.forEach(item => {
      const dist = this.playerPos.distanceTo(item.position);
      const triggerRadius = item.triggerRadius || 3.6;
      if (dist < triggerRadius && dist < minDist) {
        minDist = dist;
        nearest = item;
      }
    });

    // 대기 중이던 장소를 벗어나면 대기열에서 자동 이탈
    if (this.waitingForLoc && (!nearest || nearest.id !== this.waitingForLoc)) {
      this.waitingForLoc = null;
      this.waitingQueuedAt = null;
    }

    let isOccupied = false;
    let queueRank = 0;
    let queueTotal = 0;
    if (nearest && this.isQueueLocation(nearest.id)) {
      const q = this.getQueueStatus(nearest.id, nearest.position);
      const needWait = q.isOccupied || q.hasAheadWaiter;
      if (needWait && this.waitingForLoc !== nearest.id) {
        this.waitingForLoc = nearest.id;
        this.waitingQueuedAt = Date.now();
      }
      const qAfter = this.getQueueStatus(nearest.id, nearest.position);
      isOccupied = qAfter.isOccupied || qAfter.hasAheadWaiter;
      queueRank = qAfter.myRank;
      queueTotal = qAfter.totalWaiting;
    }

    const stateKey = `${nearest ? nearest.id : ''}|${isOccupied}|${queueRank}|${queueTotal}`;
    if (nearest !== this.activeLocation || stateKey !== this.lastQueueKey) {
      this.activeLocation = nearest;
      this.lastOccupiedState = isOccupied;
      this.lastQueueKey = stateKey;
      if (window.onLocationChanged) {
        window.onLocationChanged(
          nearest
            ? { ...nearest, occupiedByOther: isOccupied, queueRank, queueTotal }
            : null
        );
      }
    }
  }

  resetCharacterPose() {
    if (!this.charLimbs) return;
    this.charLimbs.leftLeg.rotation.set(0, 0, 0);
    this.charLimbs.rightLeg.rotation.set(0, 0, 0);
    if (this.charLimbs.upperBody) {
      this.charLimbs.upperBody.position.set(0, 0.28, 0);
      this.charLimbs.upperBody.rotation.set(0, 0, 0);
    }
    this.charLimbs.body.position.set(0, 0.19, 0);
    this.charLimbs.body.rotation.set(0, 0, 0);
    this.charLimbs.head.position.set(0, 0.64, 0);
    this.charLimbs.head.rotation.set(0, 0, 0);
    this.charLimbs.gassho.position.set(0, 0.19, 0.19);
    this.charLimbs.gassho.rotation.set(0, 0, 0);
  }

  // [사용자 요청 반영: 한 바퀴 돌 때마다 남쪽에서 멈춰 탑을 향해 반배, 다 돌고 나서 마무리 반배]
  triggerPagodaBow(roundTitle, roundDesc, nextStep, isFinal = false) {
    this.isPagodaBowing = true;
    this.pagodaBowElapsed = 0;
    this.pagodaIsRunning = false;
    this.pagodaNextStep = nextStep;
    this.pagodaBowIsFinal = isFinal;

    // 남쪽 출발 표식에 캐릭터 위치 및 묘보탑(북쪽)을 정면으로 마주보도록 정렬
    const px = this.pagodaPos.x;
    const pz = this.pagodaPos.z + this.pagodaRadius;
    this.playerPos.set(px, 0, pz);
    this.characterGroup.position.copy(this.playerPos);
    this.characterGroup.rotation.y = Math.PI; // 묘보탑(북쪽) 정면 마주봄

    this.resetCharacterPose();

    if (isFinal) {
      if (window.templeAudio) window.templeAudio.playSingingBowl(216, 9.0);
    } else {
      if (window.templeAudio) window.templeAudio.playSingleMoktak();
    }

    if (window.onPagodaRoundUpdate) {
      window.onPagodaRoundUpdate(roundTitle, roundDesc, false, true);
    }
  }

  startPagodaSpin() {
    this.currentMode = 'pagoda_spin';
    this.pagodaAngle = Math.PI / 2; // 남쪽 (z + 6.2) 황금 연꽃 표식
    this.pagodaTotalAngle = 0;
    this.pagodaRoundsCompleted = 0;
    this.pagodaStep = 0;
    this.clearFootprints();

    // 1단계: 탑돌이 시작 전 탑을 향해 정성껏 합장 반배 올리기
    this.triggerPagodaBow('탑돌이 시작 반배', '몸과 마음을 경건히 모아 탑을 향해 합장 반배를 올립니다.', 1, false);
  }

  togglePagodaSpin() {
    if (this.currentMode !== 'pagoda_spin' || this.pagodaStep >= 7) {
      this.startPagodaSpin();
      return true;
    }
    if (this.isPagodaBowing) {
      return true;
    }
    this.pagodaIsRunning = !this.pagodaIsRunning;
    if (!this.pagodaIsRunning) {
      this.resetCharacterPose();
    }
    return this.pagodaIsRunning;
  }

  // [관욕식 인터랙션: 캐릭터가 표주박을 들고 아기 부처님께 감로수를 세 번 붓는 동작]
  performGwanyok(onStepCallback, onCompleteCallback) {
    if (this.isGwanyokActive || !this.gwanyokPos) return;

    this.isGwanyokActive = true;
    this.gwanyokStep = 1;
    this.gwanyokTime = 0;
    this.onGwanyokStep = onStepCallback;
    this.onGwanyokComplete = onCompleteCallback;

    // 관욕대 정면 바로 앞 타겟 위치 (작은 탁자와 겹치지 않도록 1.48m 앞 정렬)
    this.playerPos.set(this.gwanyokPos.x, 0, this.gwanyokPos.z + 1.48);
    this.characterGroup.position.copy(this.playerPos);
    this.currentCharRotation = Math.PI; // 북쪽 관욕대 정면 응시
    this.characterGroup.rotation.y = Math.PI;
    this.resetCharacterPose();

    if (window.templeAudio) {
      window.templeAudio.playWaterPour();
    }
    if (this.onGwanyokStep) {
      this.onGwanyokStep(1, 3);
    }
  }

  stopGwanyok() {
    this.isGwanyokActive = false;
    this.gwanyokStep = 0;
    this.gwanyokTime = 0;
    if (this.gwanyokSplashDrops) {
      this.gwanyokSplashDrops.forEach(d => { d.visible = false; });
    }
    this.resetCharacterPose();
  }

  enterCurrentBuilding() {

    if (this.activeLocation.enterType === 'pagoda') {
      this.startPagodaSpin();
    } else {
      this.setupDarkTempleInterior();

      if (this.activeLocation.enterType === 'daewoong') {
        this.currentMode = 'inside_daewoong';
      } else if (this.activeLocation.enterType === 'jijang') {
        this.currentMode = 'inside_jijang';
      } else if (this.activeLocation.enterType === 'seokguram') {
        this.currentMode = 'inside_seokguram';
      } else if (this.activeLocation.enterType === 'sansin') {
        this.currentMode = 'inside_sansin';
      }
    }
  }

  lightNextJijangLantern() {
    if (!this.jijangLanterns || this.jijangLanterns.length === 0) return 0;
    let litCount = 0;
    let newlyLit = false;
    for (let i = 0; i < this.jijangLanterns.length; i++) {
      const item = this.jijangLanterns[i];
      if (!item.isLit && !newlyLit) {
        this.setJijangLanternLit(item, true);
        newlyLit = true;
      }
      if (item.isLit) litCount++;
    }
    return litCount;
  }

  syncJijangLanterns(count) {
    if (!this.jijangLanterns) return;
    for (let i = 0; i < this.jijangLanterns.length; i++) {
      this.setJijangLanternLit(this.jijangLanterns[i], i < count);
    }
  }

  setJijangLanternLit(item, isLit) {
    if (!item) return;
    item.isLit = isLit;
    if (isLit) {
      if (item.petalMat) {
        item.petalMat.color.setHex(0xffe97d);
        item.petalMat.emissive.setHex(0xffc933);
        item.petalMat.emissiveIntensity = 1.05;
      }
      if (item.bulbGlow && item.bulbGlow.material) {
        item.bulbGlow.material.opacity = 0.92;
      }
      if (item.glowSprite && item.glowSprite.material) {
        item.glowSprite.material.opacity = 0.85;
      }
      if (item.pLight) {
        item.pLight.intensity = 1.8;
      }
      if (item.tagMat) {
        item.tagMat.color.setHex(0xfff2b8);
      }
    } else {
      if (item.petalMat) {
        item.petalMat.color.setHex(0x767c86);
        item.petalMat.emissive.setHex(0x050608);
        item.petalMat.emissiveIntensity = 0.04;
      }
      if (item.bulbGlow && item.bulbGlow.material) {
        item.bulbGlow.material.opacity = 0.0;
      }
      if (item.glowSprite && item.glowSprite.material) {
        item.glowSprite.material.opacity = 0.0;
      }
      if (item.pLight) {
        item.pLight.intensity = 0;
      }
      if (item.tagMat) {
        item.tagMat.color.setHex(0x888e98);
      }
    }
  }

  setupDarkTempleInterior() {
    const enterType = this.activeLocation ? this.activeLocation.enterType : 'seokguram';
    if (enterType === 'seokguram') {
      this.scene.background.setHex(0x020305);
      this.scene.fog.color.setHex(0x020305);
      this.scene.fog.density = 0.024;
    } else {
      this.scene.background.setHex(0x050608); // [사용자 요청] 나머지 공간은 깊고 고요한 어둠으로 처리
      this.scene.fog.color.setHex(0x050608);
      this.scene.fog.density = 0.012;
    }

    this.sunLight.intensity = 0.02;
    this.hemiLight.intensity = 0.12;
    this.insideCandleLight.intensity = 0.25;
    // 제단 촛불 위치 (z = -7.55, y = 1.25)
    this.insideCandleLight.position.set(0, -80 + 1.25, -7.55);

    if (this.seokguramGroup) this.seokguramGroup.visible = (enterType === 'seokguram');
    if (this.daewoongGroup) this.daewoongGroup.visible = (enterType === 'daewoong');
    if (this.jijangGroup) this.jijangGroup.visible = (enterType === 'jijang');
    if (this.sansinGroup) this.sansinGroup.visible = (enterType === 'sansin');

    if (this.insideGroup) this.insideGroup.visible = true;
    if (this.characterGroup) this.characterGroup.visible = false;
    if (window.templeSync) {
      window.templeSync.broadcastState({
        x: this.playerPos.x,
        z: this.playerPos.z,
        rotY: this.currentCharRotation,
        isWalking: false,
        mode: this.currentMode
      }, true);
    }

    // [사용자 요청: 처음에 들어가면 향과 초가 안 켜진 상태로 시작]
    this.isCandleLit = false;
    if (this.candleFlames) this.candleFlames.forEach(f => f.visible = false);
    this.isIncenseLit = false;
    if (this.incenseSmokes) this.incenseSmokes.forEach(s => s.visible = false);

    this.cameraAngles = { theta: 0, phi: 0.40 };
    // [사용자 요청 완벽 반영 구도: 깊이감 있는 우주적 사찰 명상 시점]
    // 상단: 2/3 스케일로 위쪽에 배치된 평면 회색 본존불과 은은하고 연한 광배 (y = 2.25, z = -9.0)
    // 중단: 제단 촛불과 향로 (y = 0.58~1.28, z = -7.6)
    // 중하단: 마루 중앙 좌복에 앉은 내 모습 (y = 0.12, z = -4.5) - 제단 아래 및 메뉴 위에 온전히 독립 안착
    // 하단: 화면 최하단 참배 및 명상 메뉴 박스
    this.camera.position.set(0, -80 + 1.15, 1.4);
    this.camera.lookAt(0, -80 + 1.85, -8.8);

    if (window.templeAudio) {
      window.templeAudio.playSingleMoktak();
      // [요청 반영: 법당 안으로 들어오면 깊은 침묵과 정적을 위해 산속 새소리 중지]
      window.templeAudio.pauseBirdChirp();
    }
  }

  exitBuilding() {
    this.currentMode = 'outside';
    this.pagodaIsRunning = false;
    this.isPagodaBowing = false;
    this.pagodaBowElapsed = 0;
    this.cameraDistance = 7.5;
    this.cameraAngles = { theta: 0, phi: 0.42 };

    this.scene.background.setHex(0xdcebf5);
    this.scene.fog.color.setHex(0xdcebf5);
    this.scene.fog.density = 0.012;
    this.sunLight.intensity = 1.25;
    this.hemiLight.intensity = 0.75;
    this.insideCandleLight.intensity = 0;

    if (this.insideGroup) this.insideGroup.visible = false;
    if (this.remoteInsideGroup) this.remoteInsideGroup.visible = false;
    if (this.characterGroup) this.characterGroup.visible = true;
    if (window.templeSync) {
      window.templeSync.broadcastState({
        x: this.playerPos.x,
        z: this.playerPos.z,
        rotY: this.currentCharRotation,
        isWalking: false,
        mode: 'outside'
      }, true);
    }

    this.isCandleLit = false;
    this.isIncenseLit = false;
    if (this.candleFlames) this.candleFlames.forEach(f => f.visible = false);
    if (this.incenseSmokes) this.incenseSmokes.forEach(s => s.visible = false);

    this.resetCharacterPose();

    if (window.templeAudio) {
      window.templeAudio.stopMoktakLoop();
      // [요청 반영: 전각에서 마당으로 나오면 평화로운 산속 새소리 재개]
      window.templeAudio.resumeBirdChirp();
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(this.clock.getDelta(), 0.1);

    if (this.currentMode === 'outside') {
      if (this.isWalking && this.walkTarget) {
        const dir = new THREE.Vector3().subVectors(this.walkTarget, this.playerPos);
        const dist = dir.length();

        if (dist > 0.15) {
          dir.normalize();
          const nextPos = this.playerPos.clone().addScaledVector(dir, this.walkSpeed * delta);
          const hasCollided = this.checkCollision(nextPos);
          if (hasCollided) {
            const movedDist = nextPos.distanceTo(this.playerPos);
            if (movedDist < 0.002) {
              // 장애물에 정면으로 막혔을 때 좌/우 접선 방향으로 부드럽게 우회하여 목표 동그라미까지 도달
              const stepLen = this.walkSpeed * delta;
              const sideA = this.playerPos.clone().add(new THREE.Vector3(-dir.z * stepLen, 0, dir.x * stepLen));
              const sideB = this.playerPos.clone().add(new THREE.Vector3(dir.z * stepLen, 0, -dir.x * stepLen));
              if (!this.checkCollision(sideA) && sideA.distanceTo(this.playerPos) >= 0.002) {
                nextPos.copy(sideA);
              } else if (!this.checkCollision(sideB) && sideB.distanceTo(this.playerPos) >= 0.002) {
                nextPos.copy(sideB);
              } else if (this.walkWaypoints && this.walkWaypoints.length > 0) {
                this.walkTarget = this.walkWaypoints.shift();
              } else {
                this.isWalking = false;
                this.walkTarget = null;
                this.walkWaypoints = [];
              }
            }
          }

          nextPos.y = this.getTerrainHeight(nextPos.x, nextPos.z);
          this.playerPos.copy(nextPos);
          this.characterGroup.position.copy(this.playerPos);

          const targetRot = Math.atan2(dir.x, dir.z);
          let diff = targetRot - this.currentCharRotation;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          this.currentCharRotation += diff * 0.18;
          this.characterGroup.rotation.y = this.currentCharRotation;

          this.walkAnimTime += delta * 8.0;
          this.charLimbs.leftLeg.rotation.x = Math.sin(this.walkAnimTime) * 0.42;
          this.charLimbs.rightLeg.rotation.x = -Math.sin(this.walkAnimTime) * 0.42;
          if (this.charLimbs.upperBody) {
            this.charLimbs.upperBody.position.y = 0.28 + Math.abs(Math.sin(this.walkAnimTime)) * 0.032;
            this.charLimbs.upperBody.rotation.z = Math.sin(this.walkAnimTime) * 0.055; // 동글동글 아기 동자승의 귀여운 뒤뚱걸음
          }

          this.footstepTimer += delta;
          if (this.footstepTimer > 0.52) {
            this.footstepTimer = 0;
            if (window.templeAudio) window.templeAudio.playFootstep();
          }
        } else {
          // 경유지가 남아있으면 다음 경유지로 부드럽게 계속 이동
          if (this.walkWaypoints && this.walkWaypoints.length > 0) {
            this.walkTarget = this.walkWaypoints.shift();
          } else {
            // 최종 목적지 도착! 걸음 멈춤 및 건물 정면 응시
            this.isWalking = false;
            this.walkTarget = null;

            const lookTarget = this.finalLookTarget || this.targetLookAt;
            if (lookTarget) {
              const faceDir = new THREE.Vector3().subVectors(lookTarget, this.playerPos);
              const faceAngle = Math.atan2(faceDir.x, faceDir.z);
              this.currentCharRotation = faceAngle;
              this.characterGroup.rotation.y = faceAngle;
              this.cameraAngles.theta = faceAngle + Math.PI;
              this.targetLookAt = null;
              this.finalLookTarget = null;
            }
            this.checkInteractables();
          }
        }
      } else if (!this.isBeomjongRinging) {
        this.resetCharacterPose();
      }

      // [범종각 당목(치는 막대기) 옆에서 캐릭터가 1.5초 딜레이 후 직접 치는 뒷모습 애니메이션]
      if (this.isBeomjongRinging && this.beomjongStriker) {
        this.beomjongRingTime += delta;
        const t = this.beomjongRingTime;
        if (t < 1.30) {
          // 1.3초간 호흡을 가다듬고 당목을 천천히 뒤로 당겨 준비 (1.5초 시점에 타종하도록 조율)
          const pullPhase = Math.max(0, (t - 0.35) / 0.95);
          const pull = Math.sin(pullPhase * (Math.PI / 2));
          this.beomjongStriker.position.x = 1.15 + pull * 0.45;
          if (this.charLimbs && this.charLimbs.upperBody) {
            this.charLimbs.upperBody.rotation.x = -pull * 0.25;
            this.charLimbs.gassho.position.set(0, 0.28, 0.24 + pull * 0.06);
          }
          if (this.beomjongPos) {
            this.characterGroup.position.set(this.beomjongPos.x + 2.08 + pull * 0.30, 0.80, this.beomjongPos.z + 0.85);
          }
        } else if (t < 1.50) {
          // 1.30~1.50초: 종을 향해 힘차게 밀어 정확히 1.5초에 타격!
          const p = (t - 1.30) / 0.20;
          this.beomjongStriker.position.x = 1.60 - p * 0.72;
          if (this.charLimbs && this.charLimbs.upperBody) {
            this.charLimbs.upperBody.rotation.x = -0.25 + p * 0.62;
            this.charLimbs.gassho.position.set(0, 0.26, 0.30);
          }
          if (this.beomjongPos) {
            this.characterGroup.position.set(this.beomjongPos.x + 2.38 - p * 0.48, 0.80, this.beomjongPos.z + 0.85);
          }
        } else if (t < 3.40) {
          // 정확히 1.5초 타격 순간 장엄한 범종 소리 재생
          if (!this.beomjongSoundPlayed) {
            this.beomjongSoundPlayed = true;
            if (window.templeAudio) window.templeAudio.playTempleBell();
          }
          // 타격 후 잔진동 및 합장 경배
          const p = (t - 1.50) / 1.90;
          this.beomjongStriker.position.x = 0.88 + (1 - Math.exp(-p * 4) * Math.cos(p * 12)) * 0.27;
          if (this.charLimbs && this.charLimbs.upperBody) {
            this.charLimbs.upperBody.rotation.x = 0.37 * (1 - p * 0.7);
            this.charLimbs.gassho.position.set(0, 0.22, 0.22);
          }
          if (this.beomjongPos) {
            this.characterGroup.position.set(this.beomjongPos.x + 1.90 + p * 0.18, 0.80, this.beomjongPos.z + 0.85);
          }
        } else {
          this.beomjongStriker.position.x = 1.15;
          this.isBeomjongRinging = false;
          this.beomjongSoundPlayed = false;
          this.resetCharacterPose();
          if (this.isBeomjongReady && this.beomjongPos) {
            this.playerPos.set(this.beomjongPos.x + 2.08, 0.80, this.beomjongPos.z + 0.85);
            this.characterGroup.position.copy(this.playerPos);
            this.currentCharRotation = -2.15;
            this.characterGroup.rotation.y = -2.15;
          } else if (this.preBellPlayerPos) {
            this.playerPos.copy(this.preBellPlayerPos);
            this.characterGroup.position.copy(this.playerPos);
            this.currentCharRotation = Math.PI;
            this.characterGroup.rotation.y = Math.PI;
          }
          if (this.onBeomjongComplete) {
            const cb = this.onBeomjongComplete;
            this.onBeomjongComplete = null;
            cb();
          }
        }
      }

      // [관욕식 감로수 붓기 3회 애니메이션]
      if (this.isGwanyokActive) {
        this.gwanyokTime += delta;
        const totalDurationPerPour = 2.4;
        const totalTime = this.gwanyokTime;
        const currentPour = Math.min(3, Math.floor(totalTime / totalDurationPerPour) + 1);

        if (currentPour !== this.gwanyokStep && currentPour <= 3) {
          this.gwanyokStep = currentPour;
          if (window.templeAudio) window.templeAudio.playWaterPour();
          if (this.onGwanyokStep) this.onGwanyokStep(currentPour, 3);
        }

        const cycleTime = totalTime % totalDurationPerPour;
        // 상체 앞으로 숙이며 표주박으로 감로수 붓는 동작 연출
        let pourProgress = 0;
        if (cycleTime < 0.6) {
          pourProgress = Math.sin((cycleTime / 0.6) * (Math.PI / 2));
        } else if (cycleTime < 1.6) {
          pourProgress = 1.0;
        } else {
          pourProgress = 1.0 - (cycleTime - 1.6) / 0.8;
        }

        if (this.charLimbs && this.charLimbs.upperBody) {
          this.charLimbs.upperBody.rotation.x = pourProgress * 0.38; // 정중히 숙여 붓는 동작
          this.charLimbs.gassho.position.set(0, 0.22 + pourProgress * 0.08, 0.20 + pourProgress * 0.16);
          this.charLimbs.gassho.rotation.x = pourProgress * 0.45;
        }

        // 큼직하고 선명한 물방울 파티클 떨어지는 애니메이션
        if (this.gwanyokSplashDrops) {
          const isPouring = (cycleTime >= 0.45 && cycleTime <= 1.85);
          this.gwanyokSplashDrops.forEach((drop, idx) => {
            if (isPouring) {
              drop.visible = true;
              const dropProgress = ((cycleTime * 3.2 + idx * 0.18) % 1.0);
              drop.position.y = 0.52 - dropProgress * 0.62;
              drop.position.x = Math.sin(idx * 1.45) * (0.05 + dropProgress * 0.14);
              drop.position.z = Math.cos(idx * 1.45) * (0.05 + dropProgress * 0.14);
              drop.scale.setScalar(0.85 - dropProgress * 0.30);
            } else {
              drop.visible = false;
            }
          });
        }

        // 3회 관욕식 완료
        if (totalTime >= totalDurationPerPour * 3) {
          this.isGwanyokActive = false;
          if (this.gwanyokSplashDrops) {
            this.gwanyokSplashDrops.forEach(d => { d.visible = false; });
          }
          this.resetCharacterPose();
          if (window.templeAudio) window.templeAudio.playSingingBowl(240, 7.0);
          if (this.onGwanyokComplete) {
            this.onGwanyokComplete();
          }
        }
      }

      this.updateCameraPosition();
    }

    else if (this.currentMode === 'pagoda_spin') {
      if (this.isPagodaBowing) {
        this.pagodaBowElapsed += delta;
        const bowT = Math.min(1.0, this.pagodaBowElapsed / this.pagodaBowDuration);

        // [사용자 요청 반영: 반배가 확실하게 보이도록 허리 피벗(upperBody) 기준 약 48도 깊고 정중한 숙임]
        let ease = 0;
        if (bowT < 0.35) {
          const t = bowT / 0.35;
          ease = t * t * (3 - 2 * t);
        } else if (bowT < 0.68) {
          ease = 1.0;
        } else {
          const t = (bowT - 0.68) / 0.32;
          ease = 1.0 - t * t * (3 - 2 * t);
        }

        const bowAngle = ease * 0.85; // 허리 기준 약 48.7도 확실하게 깊숙이 숙이는 반배
        if (this.charLimbs.upperBody) {
          this.charLimbs.upperBody.rotation.x = bowAngle;
        }
        this.charLimbs.gassho.rotation.x = ease * 0.25;

        // [요청 반영: 핸드폰 세로 화면에서도 탑과 반배하는 캐릭터가 한눈에 보이도록 조금 멀리 배치]
        const px = this.pagodaPos.x;
        const pz = this.pagodaPos.z + this.pagodaRadius;
        const camPos = new THREE.Vector3(px + 5.2, 2.25, pz + 5.4);
        this.camera.position.lerp(camPos, 0.12);
        this.camera.lookAt(new THREE.Vector3(px, 1.45, pz - 1.6));

        if (bowT >= 1.0) {
          this.isPagodaBowing = false;
          this.resetCharacterPose();

          const next = this.pagodaNextStep;
          if (next === 1) {
            // 1바퀴 걷기 시작
            this.pagodaStep = 1;
            this.pagodaIsRunning = true;
            if (window.templeAudio) window.templeAudio.playSingleMoktak();
            if (window.onPagodaRoundUpdate) {
              window.onPagodaRoundUpdate('첫 번째 바퀴', '지난 모든 번뇌와 허물을 비워냅니다.', false, false);
            }
          } else if (next === 3) {
            // 2바퀴 걷기 시작
            this.pagodaStep = 3;
            this.pagodaIsRunning = true;
            if (window.templeAudio) window.templeAudio.playSingleMoktak();
            if (window.onPagodaRoundUpdate) {
              window.onPagodaRoundUpdate('두 번째 바퀴', '나와 이웃을 위해 자비로운 마음을 품습니다.', false, false);
            }
          } else if (next === 5) {
            // 3바퀴 걷기 시작
            this.pagodaStep = 5;
            this.pagodaIsRunning = true;
            if (window.templeAudio) window.templeAudio.playSingleMoktak();
            if (window.onPagodaRoundUpdate) {
              window.onPagodaRoundUpdate('세 번째 바퀴', '모든 생명이 평안하기를 간절히 발원합니다.', false, false);
            }
          } else if (next === 7) {
            // 3바퀴 완료 후 마지막 마무리 반배까지 마침 -> 완전 회향!
            this.pagodaStep = 7;
            this.pagodaIsRunning = false;
            this.characterGroup.rotation.y = Math.PI;
            if (window.onPagodaRoundUpdate) {
              window.onPagodaRoundUpdate('탑돌이 원만 회향', '3바퀴 탑돌이를 원만히 마쳤습니다. 간절한 모든 서원이 성취되기를 축원합니다.', true, false);
            }
          }
        }
      }
      else if (this.pagodaIsRunning) {
        const angularSpeed = 0.16;
        const deltaAngle = angularSpeed * delta;
        this.pagodaAngle += deltaAngle;
        this.pagodaTotalAngle += deltaAngle;

        const px = this.pagodaPos.x + Math.cos(this.pagodaAngle) * this.pagodaRadius;
        const pz = this.pagodaPos.z + Math.sin(this.pagodaAngle) * this.pagodaRadius;
        this.playerPos.set(px, 0, pz);
        this.characterGroup.position.copy(this.playerPos);

        // 시계 방향(우요삼잡) 보행 방향 각도
        this.characterGroup.rotation.y = -this.pagodaAngle;

        // [요청 반영: 걷는 모습 연출 - 양다리 교차 스윙 + 상체 피벗 바운스 + 어깨 율동]
        this.walkAnimTime += delta * 5.6;
        const legSwing = Math.sin(this.walkAnimTime) * 0.44;
        this.charLimbs.leftLeg.rotation.x = legSwing;
        this.charLimbs.rightLeg.rotation.x = -legSwing;

        const walkBob = Math.abs(Math.sin(this.walkAnimTime)) * 0.032;
        const torsoTwist = Math.sin(this.walkAnimTime) * 0.05;
        if (this.charLimbs.upperBody) {
          this.charLimbs.upperBody.position.y = 0.28 + walkBob;
          this.charLimbs.upperBody.rotation.y = torsoTwist;
        }

        // 발자국 이펙트 및 보행 발소리
        this.lastFootprintDist += angularSpeed * this.pagodaRadius * delta;
        if (this.lastFootprintDist > 1.15) {
          this.lastFootprintDist = 0;
          this.footprintStepSide *= -1;
          this.addFootprint(px, pz, this.characterGroup.rotation.y, this.footprintStepSide > 0);
          if (window.templeAudio) window.templeAudio.playFootstep(true);
        }

        // [사용자 요청 반영: 한 바퀴 돌 때마다 남쪽 출발점에 멈춰 반배, 3바퀴 돌고 마무리 반배]
        if (this.pagodaStep === 1 && this.pagodaTotalAngle >= Math.PI * 2) {
          this.pagodaTotalAngle = Math.PI * 2;
          this.pagodaAngle = Math.PI / 2;
          this.triggerPagodaBow('첫 번째 바퀴 회향 반배', '지난 모든 번뇌와 허물을 비워내며 탑을 향해 반배를 올립니다.', 3, false);
        }
        else if (this.pagodaStep === 3 && this.pagodaTotalAngle >= Math.PI * 4) {
          this.pagodaTotalAngle = Math.PI * 4;
          this.pagodaAngle = Math.PI / 2;
          this.triggerPagodaBow('두 번째 바퀴 회향 반배', '자비로운 마음을 품으며 탑을 향해 반배를 올립니다.', 5, false);
        }
        else if (this.pagodaStep === 5 && this.pagodaTotalAngle >= Math.PI * 6) {
          this.pagodaTotalAngle = Math.PI * 6;
          this.pagodaAngle = Math.PI / 2;
          this.triggerPagodaBow('탑돌이 마무리 회향 반배', '간절한 서원이 원만히 성취되기를 축원하며 마지막 반배를 올립니다.', 7, true);
        }

        // [요청 반영: 핸드폰 세로 화면에서도 탑과 캐릭터가 모두 보이도록 시야를 충분히 멀리 잡은 팔로우 카메라]
        const camDistBehind = 8.4;
        const camDistOutward = 6.6;
        const cx = px + Math.sin(this.pagodaAngle) * camDistBehind + Math.cos(this.pagodaAngle) * camDistOutward;
        const cz = pz - Math.cos(this.pagodaAngle) * camDistBehind + Math.sin(this.pagodaAngle) * camDistOutward;
        const cy = 3.55;

        this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.08);

        // 시선: 캐릭터와 중앙 석탑 사이(캐릭터 쪽 약간 비중)를 조망해 세로 화면에서도 함께 담기도록 조정
        const targetX = px * 0.58 + this.pagodaPos.x * 0.42;
        const targetZ = pz * 0.58 + this.pagodaPos.z * 0.42;
        const targetY = 1.80;

        this.camera.lookAt(new THREE.Vector3(targetX, targetY, targetZ));
      }
    }

    if (this.currentMode.startsWith('inside') && this.insideGroup.visible) {
      // [사용자 요청 완벽 반영 구도]
      // 상단: 2/3 스케일로 위쪽에 배치된 평면 회색 본존불과 은은하고 연한 광배 (y = 2.25, z = -9.0)
      // 중단: 제단 촛불과 향로 (y = 0.58~1.28, z = -7.6)
      // 중하단: 마루 중앙 좌복에 앉은 내 모습 (y = 0.12, z = -4.5) - 제단 아래 및 메뉴 위에 온전히 독립 안착
      // 하단: 화면 최하단 참배 및 명상 메뉴 박스
      const camTarget = new THREE.Vector3(0, -80 + 1.85, -8.8);
      const camX = Math.sin(this.cameraAngles.theta * 0.3) * 1.5;
      const camY = -80 + 1.15 + (this.cameraAngles.phi - 0.40) * 0.9;
      const camZ = 1.4 + (Math.cos(this.cameraAngles.theta * 0.3) - 1) * 0.9;
      this.camera.position.lerp(new THREE.Vector3(camX, camY, camZ), 0.08);
      this.camera.lookAt(camTarget);

      // 허공에 부유하는 우주 성스러운 먼지 입자 애니메이션
      if (this.dustPositions && this.dustSpeeds) {
        const pos = this.dustPositions;
        const speeds = this.dustSpeeds;
        const count = speeds.length;
        for (let i = 0; i < count; i++) {
          pos[i * 3 + 1] += speeds[i] * delta * 0.35;
          pos[i * 3] += Math.sin(performance.now() * 0.001 + i) * 0.0012;
          if (pos[i * 3 + 1] > 6.2) {
            pos[i * 3 + 1] = 0.35;
          }
        }
        this.dustGeo.attributes.position.needsUpdate = true;
      }

      // 일렁이는 촛불 애니메이션
      if (this.isCandleLit && this.candleFlames) {
        this.candleFlames.forEach(f => {
          f.scale.y = 1.0 + Math.sin(performance.now() * 0.015) * 0.15;
          f.scale.x = 1.0 + Math.cos(performance.now() * 0.012) * 0.08;
        });
      }

      // 고요히 피어오르며 허공에 흩어지는 향 연기 애니메이션 (석굴암, 대웅전, 산신각 공통)
      if (this.isIncenseLit && this.incenseSmokes) {
        this.incenseSmokes.forEach(smokeGroup => {
          const originY = smokeGroup.userData.originY || 1.11;
          smokeGroup.children.forEach((p, idx) => {
            p.position.y += 0.0035;
            p.position.x = Math.sin(performance.now() * 0.0028 + idx * 0.85) * (0.025 + (p.position.y - originY) * 0.05);
            if (p.position.y > originY + 1.62) {
              p.position.y = originY;
              p.scale.set(0.6, 0.6, 0.6);
              if (p.material) p.material.opacity = 0.40;
            } else {
              const progress = (p.position.y - originY) / 1.62;
              const sc = 0.6 + progress * 1.5;
              p.scale.set(sc, sc, sc);
              if (p.material) p.material.opacity = 0.40 * (1.0 - progress);
            }
          });
        });
      }
    }

    // 실시간 동시접속 참배객 위치/동작 보간 및 내 위치 전송
    this.updateRemotePilgrims(delta);
    this.checkWaitingTurn();
    if (window.templeSync) {
      const busyLoc = this.getLocalBusyLoc();
      const queueLoc = this.waitingForLoc || null;
      const queuedAt = this.waitingQueuedAt || null;
      const forceSync = busyLoc !== this.lastBusyLoc || queueLoc !== this.lastQueueLoc;
      this.lastBusyLoc = busyLoc;
      this.lastQueueLoc = queueLoc;
      window.templeSync.broadcastState({
        x: this.playerPos.x,
        z: this.playerPos.z,
        rotY: this.characterGroup ? this.characterGroup.rotation.y : this.currentCharRotation,
        isWalking: Boolean(this.isWalking || this.pagodaIsRunning),
        mode: this.currentMode,
        busyLoc,
        queueLoc,
        queuedAt
      }, forceSync);
    }

    this.renderer.render(this.scene, this.camera);
  }

  isQueueLocation(locationId) {
    return locationId === 'gwanyok' || locationId === 'beomjong' || locationId === 'pagoda';
  }

  getLocalBusyLoc() {
    if (this.isGwanyokActive) return 'gwanyok';
    if (this.isBeomjongReady || this.isBeomjongRinging) return 'beomjong';
    if (this.currentMode === 'pagoda_spin') return 'pagoda';
    // 일반 전각(대웅전, 지장전, 석굴암, 산령각)은 여럿이 동시 입장 가능하므로 점유하지 않음
    return null;
  }

  getOccupyingPilgrims(locationId, itemPos) {
    const occupants = [];
    if (!this.isQueueLocation(locationId)) return occupants;
    if (!this.remotePilgrims || !itemPos) return occupants;
    this.remotePilgrims.forEach((entry, cid) => {
      if (entry.busyLoc === locationId) {
        occupants.push(cid);
        return;
      }
      if (entry.group && entry.group.visible && entry.queueLoc !== locationId) {
        const dist = Math.hypot(entry.targetPos.x - itemPos.x, entry.targetPos.z - itemPos.z);
        if (dist < 1.15) {
          occupants.push(cid);
        }
      }
    });
    return occupants;
  }

  getQueueStatus(locationId, itemPos) {
    const occupants = this.getOccupyingPilgrims(locationId, itemPos);
    const waiters = [];
    const myCid = window.templeSync ? window.templeSync.clientId : 'local';

    if (this.remotePilgrims) {
      this.remotePilgrims.forEach((entry, cid) => {
        if (entry.queueLoc === locationId && entry.queuedAt) {
          waiters.push({ cid, queuedAt: entry.queuedAt });
        }
      });
    }
    if (this.waitingForLoc === locationId && this.waitingQueuedAt) {
      waiters.push({ cid: myCid, queuedAt: this.waitingQueuedAt });
    }

    waiters.sort((a, b) => a.queuedAt - b.queuedAt || String(a.cid).localeCompare(String(b.cid)));
    const myIdx = waiters.findIndex(w => w.cid === myCid);
    const myRank = myIdx >= 0 ? myIdx + 1 : 0;
    const hasAheadWaiter = myIdx > 0 || (myIdx < 0 && waiters.length > 0);

    return {
      isOccupied: occupants.length > 0,
      myRank,
      totalWaiting: waiters.length,
      hasAheadWaiter
    };
  }

  getSideWaitPos(itemPos, occupantCount) {
    const offsets = [
      { x: 1.45, z: 0.45 },
      { x: -1.45, z: 0.45 },
      { x: 2.20, z: 0.85 },
      { x: -2.20, z: 0.85 },
      { x: 1.45, z: 1.40 },
      { x: -1.45, z: 1.40 }
    ];
    for (let i = 0; i < offsets.length; i++) {
      const idx = (Math.max(0, occupantCount - 1) + i) % offsets.length;
      const cand = new THREE.Vector3(itemPos.x + offsets[idx].x, 0, itemPos.z + offsets[idx].z);
      const test = cand.clone();
      if (!this.checkCollision(test) || cand.distanceTo(test) < 0.25) {
        return test;
      }
    }
    return new THREE.Vector3(itemPos.x + 1.5, 0, itemPos.z + 0.8);
  }

  checkWaitingTurn() {
    if (!this.waitingForLoc || this.isWalking) return;
    const item = this.interactables.find(i => i.id === this.waitingForLoc);
    if (!item) {
      this.waitingForLoc = null;
      this.waitingQueuedAt = null;
      return;
    }
    const q = this.getQueueStatus(item.id, item.position);
    if (!q.isOccupied && !q.hasAheadWaiter) {
      this.waitingForLoc = null;
      this.waitingQueuedAt = null;
      this.checkInteractables();
      if (window.onTurnReady) {
        window.onTurnReady(item);
      }
    } else {
      this.checkInteractables();
    }
  }

  syncRemotePilgrims(remoteStates) {
    if (!this.scene) return;
    // 떠난 참배객 제거
    Array.from(this.remotePilgrims.keys()).forEach((cid) => {
      if (!remoteStates || !remoteStates.has(cid)) {
        const entry = this.remotePilgrims.get(cid);
        if (entry && entry.group) {
          this.scene.remove(entry.group);
        }
        if (entry && entry.insideGroup && this.remoteInsideGroup) {
          this.remoteInsideGroup.remove(entry.insideGroup);
        }
        this.remotePilgrims.delete(cid);
      }
    });

    if (!remoteStates) return;
    remoteStates.forEach((st, cid) => {
      let entry = this.remotePilgrims.get(cid);
      if (!entry) {
        let hash = 0;
        for (let i = 0; i < cid.length; i++) hash = (hash * 31 + cid.charCodeAt(i)) | 0;
        const color = this.remoteRobePalette[Math.abs(hash) % this.remoteRobePalette.length];
        const built = this.buildCuteMonkMesh(color);
        built.group.position.set(st.x || 0, 0, st.z || 34.0);
        built.group.rotation.y = st.rotY ?? Math.PI;
        this.scene.add(built.group);

        const insideSitting = this.buildInsideSittingMonkMesh(color);
        insideSitting.visible = false;
        if (this.remoteInsideGroup) {
          this.remoteInsideGroup.add(insideSitting);
        }

        entry = {
          group: built.group,
          limbs: built.limbs,
          insideGroup: insideSitting,
          targetPos: new THREE.Vector3(st.x || 0, 0, st.z || 34.0),
          targetRotY: st.rotY ?? Math.PI,
          isWalking: Boolean(st.isWalking),
          mode: st.mode || 'outside',
          busyLoc: st.busyLoc || null,
          queueLoc: st.queueLoc || null,
          queuedAt: st.queuedAt || null,
          joinedAt: st.joinedAt || Date.now(),
          walkTime: Math.random() * Math.PI * 2
        };
        this.remotePilgrims.set(cid, entry);
      } else {
        entry.targetPos.set(st.x || 0, 0, st.z || 34.0);
        entry.targetRotY = st.rotY ?? Math.PI;
        entry.isWalking = Boolean(st.isWalking);
        entry.mode = st.mode || 'outside';
        entry.busyLoc = st.busyLoc || null;
        entry.queueLoc = st.queueLoc || null;
        entry.queuedAt = st.queuedAt || null;
      }
    });
    this.checkWaitingTurn();
  }

  updateRemotePilgrims(delta) {
    const showInYard = this.currentMode === 'outside' || this.currentMode === 'pagoda_spin';
    const isLocalInside = Boolean(this.currentMode && this.currentMode.startsWith('inside_'));

    if (this.remoteInsideGroup) {
      this.remoteInsideGroup.visible = isLocalInside;
    }

    if (isLocalInside) {
      const insideSlots = [
        { x: -1.15, z: -4.85 },
        { x: 1.15, z: -4.85 },
        { x: -2.15, z: -4.65 },
        { x: 2.15, z: -4.65 },
        { x: -0.75, z: -4.05 },
        { x: 0.75, z: -4.05 },
        { x: -1.75, z: -3.95 },
        { x: 1.75, z: -3.95 },
        { x: -2.65, z: -4.15 },
        { x: 2.65, z: -4.15 }
      ];
      const sameHallEntries = [];
      this.remotePilgrims.forEach((entry, cid) => {
        entry.group.visible = false;
        if (entry.mode === this.currentMode && entry.insideGroup) {
          sameHallEntries.push({ cid, entry });
        } else if (entry.insideGroup) {
          entry.insideGroup.visible = false;
        }
      });
      sameHallEntries.sort((a, b) => (a.entry.joinedAt || 0) - (b.entry.joinedAt || 0) || String(a.cid).localeCompare(String(b.cid)));
      sameHallEntries.forEach(({ entry }, idx) => {
        const slot = insideSlots[idx % insideSlots.length];
        entry.insideGroup.position.set(slot.x, 0, slot.z);
        entry.insideGroup.visible = true;
      });
      return;
    }

    const minSep = 0.95;
    const placedPositions = [{ x: this.playerPos.x, z: this.playerPos.z }];

    this.remotePilgrims.forEach((entry, cid) => {
      if (entry.insideGroup) entry.insideGroup.visible = false;
      const isRemoteInside = Boolean(entry.mode && entry.mode.startsWith('inside'));
      const shouldShow = showInYard && !isRemoteInside;
      entry.group.visible = shouldShow;
      if (!shouldShow) return;

      // 다른 참배객 및 내 캐릭터와 겹치지 않도록 최소 거리(0.95m) 부드럽게 이격
      const desired = entry.targetPos.clone();
      for (let i = 0; i < placedPositions.length; i++) {
        const other = placedPositions[i];
        const dx = desired.x - other.x;
        const dz = desired.z - other.z;
        const dist = Math.hypot(dx, dz);
        if (dist < minSep) {
          if (dist > 0.001) {
            const push = minSep - dist;
            desired.x += (dx / dist) * push;
            desired.z += (dz / dist) * push;
          } else {
            let h = 0;
            for (let k = 0; k < cid.length; k++) h = (h * 31 + cid.charCodeAt(k)) | 0;
            const ang = ((Math.abs(h) % 8) / 8) * Math.PI * 2;
            desired.x += Math.cos(ang) * minSep;
            desired.z += Math.sin(ang) * minSep;
          }
        }
      }
      placedPositions.push({ x: desired.x, z: desired.z });

      entry.group.position.lerp(desired, Math.min(1, delta * 8.5));
      let diff = entry.targetRotY - entry.group.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      entry.group.rotation.y += diff * Math.min(1, delta * 10);

      if (entry.isWalking) {
        entry.walkTime += delta * 8.0;
        entry.limbs.leftLeg.rotation.x = Math.sin(entry.walkTime) * 0.42;
        entry.limbs.rightLeg.rotation.x = -Math.sin(entry.walkTime) * 0.42;
        if (entry.limbs.upperBody) {
          entry.limbs.upperBody.position.y = 0.28 + Math.abs(Math.sin(entry.walkTime)) * 0.032;
          entry.limbs.upperBody.rotation.z = Math.sin(entry.walkTime) * 0.055;
        }
      } else {
        entry.limbs.leftLeg.rotation.set(0, 0, 0);
        entry.limbs.rightLeg.rotation.set(0, 0, 0);
        if (entry.limbs.upperBody) {
          entry.limbs.upperBody.position.set(0, 0.28, 0);
          entry.limbs.upperBody.rotation.z = 0;
        }
      }
    });
  }
}

window.Bomunsa3D = Bomunsa3D;

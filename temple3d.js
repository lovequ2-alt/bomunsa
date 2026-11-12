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
    this.playerPos = new THREE.Vector3(0, 0, 32);
    this.isWalking = false;
    this.walkSpeed = 2.8;
    this.footstepTimer = 0;
    this.interactables = [];
    this.obstacles = [];
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
    this.cameraDistance = 7.5;
    this.touchStartTime = 0;
    this.touchStartPos = { x: 0, y: 0 };

    // 합장한 동자승 캐릭터
    this.characterGroup = null;
    this.charLimbs = {};
    this.walkAnimTime = 0;
    this.currentCharRotation = Math.PI;

    // 탑돌이
    this.pagodaPos = new THREE.Vector3(-16, 0, 3);
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

  // [요청 반영] 좀 더 동글고 길쭉하게 손처럼 보이는 예쁜 합장 손 조형
  createGasshoMonkCharacter() {
    this.characterGroup = new THREE.Group();

    const robeMat = new THREE.MeshStandardMaterial({ color: 0x626870, roughness: 0.75 });
    const collarMat = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.5 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdfc4, roughness: 0.45 });
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xf0ede6, roughness: 0.65 });

    // [사용자 요청 반영: 스케치(그림 1 오른쪽)처럼 단정하고 소박한 실루엣 + 허리(y=0.50) 반배 피벗 유지]
    const upperBodyPivot = new THREE.Group();
    upperBodyPivot.position.set(0, 0.50, 0);

    // 1. 몸통 (아래로 차분히 떨어지는 깔끔한 A라인 승복 실루엣, 피벗 y=0.50 기준 +0.35)
    const body = new THREE.Group();
    body.position.set(0, 0.35, 0);

    const tunicGeo = new THREE.CylinderGeometry(0.22, 0.33, 0.72, 24);
    const tunicMesh = new THREE.Mesh(tunicGeo, robeMat);
    tunicMesh.scale.set(1.0, 1.0, 0.86);
    tunicMesh.castShadow = true;
    body.add(tunicMesh);

    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.225, 22, 14), robeMat);
    shoulderCap.scale.set(1.0, 0.52, 0.86);
    shoulderCap.position.y = 0.35;
    shoulderCap.castShadow = true;
    body.add(shoulderCap);

    // 단아한 흰 동정(깃) 포인트
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.022, 10, 20), collarMat);
    collar.rotation.x = Math.PI / 2 - 0.14;
    collar.position.set(0, 0.43, 0.02);
    body.add(collar);

    upperBodyPivot.add(body);

    // 2. 머리 (군더더기 돌출 없이 맑고 매끈한 둥근 머리)
    const headGeo = new THREE.SphereGeometry(0.23, 24, 24);
    const head = new THREE.Mesh(headGeo, skinMat);
    head.scale.set(0.96, 1.04, 0.96);
    head.position.y = 0.88;
    head.castShadow = true;
    upperBodyPivot.add(head);

    // 3. 단정히 모은 소매와 위를 향한 하얀 합장 손
    const gasshoGroup = new THREE.Group();
    gasshoGroup.position.set(0, 0.35, 0.22); // 가슴 앞 위치

    [-0.12, 0.12].forEach((sx, idx) => {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.042, 0.22, 14), robeMat);
      arm.position.set(sx, -0.04, 0.01);
      arm.rotation.z = idx === 0 ? -0.52 : 0.52;
      arm.rotation.x = 0.35;
      gasshoGroup.add(arm);
    });

    const whiteHandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
    const handsPair = new THREE.Group();
    handsPair.position.set(0, 0.05, 0.07);

    const leftHand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.14, 12), whiteHandMat);
    leftHand.scale.set(0.55, 1.0, 1.2);
    leftHand.position.set(-0.015, 0.04, 0);
    leftHand.rotation.z = -0.08;
    leftHand.rotation.x = -0.15;
    handsPair.add(leftHand);

    const rightHand = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.14, 12), whiteHandMat);
    rightHand.scale.set(0.55, 1.0, 1.2);
    rightHand.position.set(0.015, 0.04, 0);
    rightHand.rotation.z = 0.08;
    rightHand.rotation.x = -0.15;
    handsPair.add(rightHand);

    const fingertips = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 12), whiteHandMat);
    fingertips.scale.set(0.7, 1.2, 0.85);
    fingertips.position.set(0, 0.10, -0.01);
    handsPair.add(fingertips);

    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 10), whiteHandMat);
    wrist.position.set(0, -0.03, 0.01);
    handsPair.add(wrist);

    gasshoGroup.add(handsPair);
    upperBodyPivot.add(gasshoGroup);
    this.characterGroup.add(upperBodyPivot);

    // 4. 양다리 (단정한 직선형 바짓단 아래 고무신)
    const legGeo = new THREE.CylinderGeometry(0.082, 0.078, 0.42, 14);
    legGeo.translate(0, -0.18, 0);

    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.12, 0.46, 0);
    const leftLeg = new THREE.Mesh(legGeo, robeMat);
    leftLeg.castShadow = true;
    leftLegPivot.add(leftLeg);
    const leftShoe = new THREE.Mesh(new THREE.SphereGeometry(0.082, 12, 12), shoeMat);
    leftShoe.scale.set(0.92, 0.62, 1.32);
    leftShoe.position.set(0, -0.38, 0.035);
    leftLegPivot.add(leftShoe);
    this.characterGroup.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.12, 0.46, 0);
    const rightLeg = new THREE.Mesh(legGeo, robeMat);
    rightLeg.castShadow = true;
    rightLegPivot.add(rightLeg);
    const rightShoe = new THREE.Mesh(new THREE.SphereGeometry(0.082, 12, 12), shoeMat);
    rightShoe.scale.set(0.92, 0.62, 1.32);
    rightShoe.position.set(0, -0.38, 0.035);
    rightLegPivot.add(rightShoe);
    this.characterGroup.add(rightLegPivot);

    this.charLimbs = {
      leftLeg: leftLegPivot,
      rightLeg: rightLegPivot,
      upperBody: upperBodyPivot,
      body: body,
      head: head,
      gassho: gasshoGroup
    };

    this.characterGroup.position.copy(this.playerPos);
    this.characterGroup.rotation.y = Math.PI;
    this.scene.add(this.characterGroup);
  }

  getTerrainHeight(x, z) {
    // [요청 반영: 모든 경내 단차를 제거하여 완전한 평지로 구현, 발 파묻힘 완전 해소]
    return 0;
  }

  buildWorld() {
    const groundGeo = new THREE.PlaneGeometry(160, 160, 32, 32);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x6e885c, roughness: 0.9, metalness: 0.05 });
    this.groundMesh = new THREE.Mesh(groundGeo, groundMat);
    this.groundMesh.rotation.x = -Math.PI / 2;
    this.groundMesh.receiveShadow = true;
    this.scene.add(this.groundMesh);

    // 중앙 진입로
    const pathwayGeo = new THREE.PlaneGeometry(6, 60);
    const pathwayMat = new THREE.MeshStandardMaterial({ color: 0xcdbeaa, roughness: 0.95 });
    const pathway = new THREE.Mesh(pathwayGeo, pathwayMat);
    pathway.rotation.x = -Math.PI / 2;
    pathway.position.set(0, 0.02, 5);
    pathway.receiveShadow = true;
    this.scene.add(pathway);

    // [좌측 석굴암 연결 길]
    const leftPathGeo = new THREE.PlaneGeometry(24, 4);
    const leftPath = new THREE.Mesh(leftPathGeo, pathwayMat);
    leftPath.rotation.x = -Math.PI / 2;
    leftPath.position.set(-11, 0.02, -11);
    leftPath.receiveShadow = true;
    this.scene.add(leftPath);

    // [좌측 앞쪽 너른 공터 묘보탑 진입로]
    const pagodaPathGeo = new THREE.PlaneGeometry(13, 4);
    const pagodaPath = new THREE.Mesh(pagodaPathGeo, pathwayMat);
    pagodaPath.rotation.x = -Math.PI / 2;
    pagodaPath.position.set(-9.5, 0.02, 3);
    pagodaPath.receiveShadow = true;
    this.scene.add(pagodaPath);

    // [우측 산신각 연결 길]
    const rightPathGeo = new THREE.PlaneGeometry(20, 4);
    const rightPath = new THREE.Mesh(rightPathGeo, pathwayMat);
    rightPath.rotation.x = -Math.PI / 2;
    rightPath.position.set(10, 0.02, -17);
    rightPath.receiveShadow = true;
    this.scene.add(rightPath);

    this.createMountainRock();

    // [요청 반영: 묘보탑을 석굴암에서 앞쪽 너른 공터(-16, 0, 3)로 이동하여 석굴암 팝업 간섭 및 나무 가림 완전 해소]
    this.createHojimun(0, 0, 26);
    this.createPagoda(-16, 0, 3);
    this.createDaewoongjeon(0, 0, -16);
    this.createSansingak(20, 0, -18);
    this.createSeokguram(-18, 0, -22);

    // [사용자 요청 반영: 보행 진로를 방해하는 바깥 안내판을 모두 철거하고, 건물 처마 현판으로 일원화]

    this.createEnvironmentDetails();
  }

  addObstacle(x, z, radius) {
    this.obstacles.push({ x, z, radius });
  }

  checkCollision(newPos) {
    const playerRadius = 0.55;
    // [배경속 침범 방지] 도량 경계선 제한 (외곽 산자락 밖으로 나가거나 파묻히지 않도록 보호)
    newPos.x = Math.max(-32, Math.min(32, newPos.x));
    newPos.z = Math.max(-33, Math.min(30, newPos.z));

    for (let obs of this.obstacles) {
      const dist = Math.hypot(newPos.x - obs.x, newPos.z - obs.z);
      const minDist = obs.radius + playerRadius;
      if (dist < minDist) {
        const angle = Math.atan2(newPos.z - obs.z, newPos.x - obs.x);
        newPos.x = obs.x + Math.cos(angle) * (minDist + 0.01);
        newPos.z = obs.z + Math.sin(angle) * (minDist + 0.01);
        return true;
      }
    }
    return false;
  }

  createMountainRock() {
    const group = new THREE.Group();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7e8489, roughness: 0.95, flatShading: true });
    // [배경 파묻힘 방지] 전각들과 안전거리를 유지하며 도량 외곽(r = 54~64)에 웅장한 병풍 산자락 배치
    for (let i = 0; i < 28; i++) {
      const geo = new THREE.DodecahedronGeometry(10 + Math.random() * 4, 1);
      const mesh = new THREE.Mesh(geo, rockMat);
      const angle = (i / 28) * Math.PI * 1.35 + Math.PI * 0.82;
      const r = 54 + (Math.random() * 8);
      const mx = Math.cos(angle) * r;
      const mz = Math.sin(angle) * r - 12;
      mesh.position.set(mx, 7 + Math.random() * 7, mz);
      mesh.scale.set(1.6, 2.3 + Math.random() * 0.6, 1.4);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);

      // 산자락 바위 경계 충돌체 등록
      this.addObstacle(mx, mz, 10);
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

  createHanokBuilding({ width, depth, height, roofColor = 0x353b42, woodColor = 0x612b23, doorCount = 3 }) {
    const group = new THREE.Group();
    const texSet = this.getKoreanTempleTextures();

    // 1. 화강암 기단부 + 정면 돌계단
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xb9b6ae, roughness: 0.9 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(width + 1.4, 0.8, depth + 1.4), baseMat);
    base.position.y = 0.4;
    group.add(base);

    // 앞쪽 2단 돌계단 (현관 중앙 돌출)
    const stepW = Math.min(width * 0.55, 5.2);
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(stepW, 0.38, 0.8), baseMat);
    step1.position.set(0, 0.19, depth / 2 + 0.95);
    group.add(step1);
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(stepW - 0.4, 0.4, 0.5), baseMat);
    step2.position.set(0, 0.58, depth / 2 + 0.72);
    group.add(step2);

    // 2. 외벽 (고즈넉한 전통 한옥 회벽 + 붉은 인방)
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(width - 0.2, height, depth - 0.2),
      new THREE.MeshStandardMaterial({ color: 0xd9cfc0, roughness: 0.88 })
    );
    wall.position.y = 0.8 + height / 2;
    group.add(wall);

    // 3. 자줏빛 마룬 기둥(배흘림 느낌) + 황토색 문선 테두리 + 주춧돌
    const pillarMat = new THREE.MeshStandardMaterial({ color: woodColor, roughness: 0.68 });
    const ochreTrimMat = new THREE.MeshStandardMaterial({ color: 0xce9667, roughness: 0.75 });
    const plinthMat = new THREE.MeshStandardMaterial({ color: 0x9b978f, roughness: 0.9 });
    const pRadius = 0.22;
    const pHeight = height;

    const colCount = doorCount + 1;
    const colStep = width / (colCount - 1);
    const frontColX = [];
    for (let c = 0; c < colCount; c++) frontColX.push(-width / 2 + c * colStep);

    frontColX.forEach(px => {
      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.36, 0.2, 10), plinthMat);
      plinth.position.set(px, 0.9, depth / 2 + 0.04);
      group.add(plinth);

      const pMesh = new THREE.Mesh(new THREE.CylinderGeometry(pRadius * 0.92, pRadius, pHeight, 12), pillarMat);
      pMesh.position.set(px, 0.8 + pHeight / 2, depth / 2 + 0.04);
      pMesh.castShadow = true;
      group.add(pMesh);

      // 기둥 상단 단청 칼라 링(머리초)
      const collarRing = new THREE.Mesh(
        new THREE.CylinderGeometry(pRadius + 0.015, pRadius + 0.015, 0.45, 12),
        new THREE.MeshStandardMaterial({ map: texSet.dancheongTex, roughness: 0.6 })
      );
      collarRing.position.set(px, 0.8 + pHeight - 0.26, depth / 2 + 0.04);
      group.add(collarRing);
    });

    [[-width / 2, -depth / 2], [width / 2, -depth / 2], [0, -depth / 2]].forEach(([px, pz]) => {
      const pMesh = new THREE.Mesh(new THREE.CylinderGeometry(pRadius, pRadius, pHeight, 10), pillarMat);
      pMesh.position.set(px, 0.8 + pHeight / 2, pz);
      group.add(pMesh);
    });

    // 4. 사진 3 스타일 쑥빛 한국 전통 꽃살문 + 하단 연꽃 궁판 + 상단 붉은 창방(문틀)
    const doorMat = new THREE.MeshStandardMaterial({
      map: texSet.doorTex,
      roughness: 0.62,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    const lintelHeight = height * 0.22;
    const doorH = height * 0.72;

    // 정면 가로 문인방 (문과 현판 사이)
    const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.2, 0.16, 0.22), pillarMat);
    frontBeam.position.set(0, 0.8 + doorH + 0.14, depth / 2 + 0.02);
    group.add(frontBeam);

    for (let d = 0; d < doorCount; d++) {
      const doorCenterX = (frontColX[d] + frontColX[d + 1]) / 2;
      const bayW = colStep - pRadius * 1.9;
      const doorW = bayW * 0.86;

      // 황토/자주 문선 배접 패널 (사진 3 기둥 옆 연황토 띠 표현)
      const trimBack = new THREE.Mesh(new THREE.BoxGeometry(bayW, doorH + 0.08, 0.08), ochreTrimMat);
      trimBack.position.set(doorCenterX, 0.8 + doorH / 2 + 0.06, depth / 2 - 0.02);
      group.add(trimBack);

      // 꽃살문 + 연꽃 궁판 3D 몸체
      const doorBox = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.06), pillarMat);
      doorBox.position.set(doorCenterX, 0.8 + doorH / 2 + 0.06, depth / 2 + 0.03);
      group.add(doorBox);

      const doorFace = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 0.04, doorH - 0.04), doorMat);
      doorFace.position.set(doorCenterX, 0.8 + doorH / 2 + 0.06, depth / 2 + 0.065);
      group.add(doorFace);
    }

    // 5. 단청 띠(창방 위 공포대) - 중앙 현판 뒤로 자연스럽게 배치
    const danMat = new THREE.MeshStandardMaterial({ map: texSet.dancheongTex, roughness: 0.62 });
    const dancheongFrieze = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, lintelHeight * 0.75, depth + 0.5), danMat);
    dancheongFrieze.position.y = 0.8 + height + (lintelHeight * 0.35);
    group.add(dancheongFrieze);

    // 6. 사진 3처럼 촘촘히 돌출된 동그란 연화문 서까래(부연) 행렬
    const rafterCount = Math.max(10, Math.round(width * 2.1));
    const rafStep = (width + 1.4) / (rafterCount - 1);
    const rafBodyMat = new THREE.MeshStandardMaterial({ color: 0x3b6752, roughness: 0.7 });
    const rafCapMat = new THREE.MeshStandardMaterial({ map: texSet.rafterCapTex, roughness: 0.55 });
    const rafY = 0.8 + height + lintelHeight * 0.72;
    const rafGeo = new THREE.CylinderGeometry(0.10, 0.11, 1.35, 10);
    rafGeo.rotateX(Math.PI / 2 + 0.18); // 벽에서 처마 끝 쪽으로 자연스럽게 아래로 경사진 서까래

    for (let r = 0; r < rafterCount; r++) {
      const rx = -(width + 1.4) / 2 + r * rafStep;
      const raf = new THREE.Mesh(rafGeo, [rafBodyMat, rafCapMat, rafBodyMat]);
      raf.position.set(rx, rafY, depth / 2 + 0.58);
      group.add(raf);
    }

    // 7. 우아한 곡선형 한국 전통 기와지붕 (일본식 사각 피라미드 제거)
    this.createKoreanCurvedRoof(group, {
      width,
      depth,
      baseY: 0.8 + height + lintelHeight * 0.78,
      ridgeHeight: Math.max(1.75, width * 0.18),
      roofColor: 0x3c4148,
      isStone: false,
      texSet
    });

    return group;
  }

  // [사용자 요청 반영: 기존 사주문 제거 -> 사진 2처럼 붉은 벽돌 문틀·활짝 열린 나무 판문·철제 문고리·양옆 화분 대문]
  createHojimun(x, y, z) {
    const group = new THREE.Group();
    const texSet = this.getKoreanTempleTextures();

    const brickMat = new THREE.MeshStandardMaterial({ map: texSet.brickTex, roughness: 0.88 });
    const innerBrickMat = new THREE.MeshStandardMaterial({ color: 0x995a49, roughness: 0.85 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xc2beb6, roughness: 0.9 });
    const giwaCapMat = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.75 });

    // 1. 입구 화강암 디딤돌 문턱
    const step = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.18, 1.45), stoneMat);
    step.position.set(0, 0.09, 0.12);
    group.add(step);

    // 2. 붉은 벽돌 문기둥(좌·우) 및 상인방 아치형 벽돌 문틀
    const pierLeft = new THREE.Mesh(new THREE.BoxGeometry(1.05, 3.85, 0.95), brickMat);
    pierLeft.position.set(-1.92, 1.925, 0);
    pierLeft.castShadow = true;
    group.add(pierLeft);

    const pierRight = new THREE.Mesh(new THREE.BoxGeometry(1.05, 3.85, 0.95), brickMat);
    pierRight.position.set(1.92, 1.925, 0);
    pierRight.castShadow = true;
    group.add(pierRight);

    const topLintel = new THREE.Mesh(new THREE.BoxGeometry(4.9, 0.62, 0.96), brickMat);
    topLintel.position.set(0, 3.68, 0);
    topLintel.castShadow = true;
    group.add(topLintel);

    // 문 안쪽 벽돌 몰딩 테두리
    const innerTop = new THREE.Mesh(new THREE.BoxGeometry(2.84, 0.16, 1.02), innerBrickMat);
    innerTop.position.set(0, 3.34, 0);
    group.add(innerTop);

    // 대문 상단 담장 기와 덮개
    const gateRoof = new THREE.Mesh(new THREE.BoxGeometry(5.15, 0.22, 1.24), giwaCapMat);
    gateRoof.position.set(0, 4.08, 0);
    group.add(gateRoof);

    // 좌우로 이어지는 사찰 전통 벽돌 담장 날개 + 기와 얹힘
    [-4.1, 4.1].forEach(wx => {
      const wingWall = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.7, 0.62), brickMat);
      wingWall.position.set(wx, 1.35, -0.08);
      wingWall.castShadow = true;
      group.add(wingWall);

      const wingCap = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.22, 0.88), giwaCapMat);
      wingCap.position.set(wx, 2.78, -0.08);
      group.add(wingCap);
    });

    // 문 양옆 기둥 및 담장 충돌체 등록 (가운데 열린 대문 통로는 자유롭게 보행 가능)
    this.addObstacle(x - 2.1, z, 0.85);
    this.addObstacle(x + 2.1, z, 0.85);
    this.addObstacle(x - 4.2, z, 1.2);
    this.addObstacle(x + 4.2, z, 1.2);

    // 3. 안쪽으로 반쯤 열린 묵직한 갈색 나무 대문 2짝 (철제 경첩·광두정·문고리 표현)
    const doorW = 1.36;
    const doorH = 3.18;

    const leftDoorPivot = new THREE.Group();
    leftDoorPivot.position.set(-1.38, 0.18, 0.05);
    leftDoorPivot.rotation.y = 0.96; // 안쪽 경내로 반갑게 활짝 열려 있음
    const leftDoorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, doorH, 0.09),
      new THREE.MeshStandardMaterial({ map: texSet.gateLeftTex, roughness: 0.68 })
    );
    leftDoorMesh.position.set(doorW / 2, doorH / 2, 0);
    leftDoorMesh.castShadow = true;
    leftDoorPivot.add(leftDoorMesh);
    group.add(leftDoorPivot);

    const rightDoorPivot = new THREE.Group();
    rightDoorPivot.position.set(1.38, 0.18, 0.05);
    rightDoorPivot.rotation.y = -0.78;
    const rightDoorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(doorW, doorH, 0.09),
      new THREE.MeshStandardMaterial({ map: texSet.gateRightTex, roughness: 0.68 })
    );
    rightDoorMesh.position.set(-doorW / 2, doorH / 2, 0);
    rightDoorMesh.castShadow = true;
    rightDoorPivot.add(rightDoorMesh);
    group.add(rightDoorPivot);

    // 4. 사진 2 좌우 앞쪽 계단 모서리 화분 (자주빛 사랑초 화분 & 분홍꽃 초록 화분)
    const potMat = new THREE.MeshStandardMaterial({ color: 0xefede6, roughness: 0.75 });
    const leftPotGroup = new THREE.Group();
    leftPotGroup.position.set(-1.68, 0, 0.76);
    const lPot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.36, 0.42), potMat);
    lPot.position.y = 0.18;
    leftPotGroup.add(lPot);
    const purpleMat = new THREE.MeshStandardMaterial({ color: 0x623d73, roughness: 0.85 });
    [[-0.08, 0.42, 0.04], [0.09, 0.44, -0.05], [0, 0.48, 0.08], [-0.04, 0.39, -0.09]].forEach(([fx, fy, fz]) => {
      const leaf = new THREE.Mesh(new THREE.DodecahedronGeometry(0.15, 1), purpleMat);
      leaf.position.set(fx, fy, fz);
      leftPotGroup.add(leaf);
    });
    group.add(leftPotGroup);

    const rightPotGroup = new THREE.Group();
    rightPotGroup.position.set(1.68, 0, 0.76);
    const rPot = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.42), potMat);
    rPot.position.y = 0.19;
    rightPotGroup.add(rPot);
    const sageMat = new THREE.MeshStandardMaterial({ color: 0x5d8558, roughness: 0.85 });
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xf1a7bf, roughness: 0.7 });
    [[-0.08, 0.44, 0.05], [0.08, 0.45, -0.04], [0, 0.50, 0.04]].forEach(([fx, fy, fz]) => {
      const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 1), sageMat);
      bush.position.set(fx, fy, fz);
      rightPotGroup.add(bush);
    });
    [[-0.10, 0.49, 0.12], [0.09, 0.54, 0.08], [0.02, 0.46, 0.15]].forEach(([fx, fy, fz]) => {
      const blossom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), pinkMat);
      blossom.position.set(fx, fy, fz);
      rightPotGroup.add(blossom);
    });
    group.add(rightPotGroup);

    group.position.set(x, y, z);
    this.scene.add(group);

    this.registerInteractable({
      id: 'hojimun',
      name: '사찰 대문 (입구)',
      desc: '도량으로 들어서는 정겨운 나무 대문입니다. 활짝 열린 문 너머로 고즈넉한 경내와 석탑이 한눈에 펼쳐집니다.',
      position: new THREE.Vector3(x, 0, z + 5.5),
      lookTarget: new THREE.Vector3(x, 1.5, z),
      enterable: false
    });
  }

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

    // [사용자 요청 반영: 보행 진로 방해 없는 석탑 기단부 자체 현판 부착]
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

    // [요청 반영: 대문 및 타 전각과 동일하게 남쪽(z + 6.2)에서 북쪽 석탑을 바라보도록 정면 배치]
    // 석굴암(x: -18, z: -13.2)과 10m 가까이 충분히 이격되어 근접 팝업 간섭 완전 해소
    markerGroup.position.set(x, 0, z + 6.2);
    this.scene.add(markerGroup);
    this.startMarkerMesh = markerGroup;

    this.registerInteractable({
      id: 'pagoda',
      name: '묘보탑 (팔각구층석탑)',
      desc: '월정사 양식을 계승한 장엄한 8각9층 석탑입니다. 남쪽 황금 연꽃 표식에서 출발하여 시계 방향으로 3바퀴를 돌며 마음의 번뇌를 비워냅니다.',
      position: new THREE.Vector3(x, 0, z + 6.2),
      lookTarget: new THREE.Vector3(x, 2.5, z),
      enterable: true,
      enterType: 'pagoda'
    });
  }

  createDaewoongjeon(x, y, z) {
    const daewoong = this.createHanokBuilding({
      width: 13, depth: 8.5, height: 4.8,
      roofColor: 0x383e45, woodColor: 0x622b23, doorCount: 4
    });
    daewoong.position.set(x, y, z);
    this.scene.add(daewoong);

    // [사용자 요청 반영: 지붕 처마에 가리지 않도록 문 위 벽면 상단 높이로 현판을 내림]
    this.createSignboard(daewoong, '대웅전', '大雄殿', 0, 5.02, 4.42, 2.8, 0.72);
    this.createStoneLantern(x - 4.2, 0, z + 6.5);
    this.createStoneLantern(x + 4.2, 0, z + 6.5);

    this.addObstacle(x, z, 5.5);

    this.registerInteractable({
      id: 'daewoong',
      name: '대웅전 (중심 법당)',
      desc: '도량의 고즈넉한 중심 법당입니다. 안으로 들어가 은은한 촛불과 목탁 소리 속에 고요한 호흡 명상과 발원을 올릴 수 있습니다.',
      position: new THREE.Vector3(x, 0, z + 7.5),
      lookTarget: new THREE.Vector3(x, 2.2, z),
      enterable: true,
      enterType: 'daewoong'
    });
  }

  createSansingak(x, y, z) {
    const sansin = this.createHanokBuilding({
      width: 6, depth: 4.5, height: 3.2,
      roofColor: 0x383e45, woodColor: 0x622b23, doorCount: 2
    });
    sansin.position.set(x, y, z);
    this.scene.add(sansin);

    // [사용자 요청 반영: 지붕 처마에 가리지 않도록 문 위 상단 높이로 현판을 내림]
    this.createSignboard(sansin, '산신각', '山神閣', 0, 3.65, 2.45, 2.2, 0.58);

    this.addObstacle(x, z, 3.8);

    this.registerInteractable({
      id: 'sansin',
      name: '산신각 (삼성각)',
      desc: '경내 산자락 아래 고즈넉하게 위치한 전각입니다. 산속 새소리와 바람 소리가 맑게 어우러지는 고요한 쉼터입니다.',
      position: new THREE.Vector3(x, 0, z + 5.5),
      lookTarget: new THREE.Vector3(x, 1.8, z),
      enterable: true,
      enterType: 'sansin'
    });
  }

  createSeokguram(x, y, z) {
    const group = new THREE.Group();
    const texSet = this.getKoreanTempleTextures();
    const stoneWallMat = new THREE.MeshStandardMaterial({ color: 0x8c8f94, roughness: 0.85, flatShading: true });
    const stonePillarMat = new THREE.MeshStandardMaterial({ color: 0x6f7378, roughness: 0.8 });

    const base = new THREE.Mesh(new THREE.BoxGeometry(11, 0.8, 6.5), stoneWallMat);
    base.position.y = 0.4;
    group.add(base);

    const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 3.8, 5.5), stoneWallMat);
    wall.position.y = 0.8 + 1.9;
    group.add(wall);

    [-4.0, -1.33, 1.33, 4.0].forEach(cx => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.8, 0.35), stonePillarMat);
      pillar.position.set(cx, 0.8 + 1.9, 2.8);
      group.add(pillar);
    });

    const doorMat = new THREE.MeshStandardMaterial({
      map: texSet.doorTex,
      roughness: 0.65,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });
    [-2.66, 0, 2.66].forEach(dx => {
      const doorMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.75), doorMat);
      doorMesh.position.set(dx, 0.8 + 1.55, 2.83);
      group.add(doorMesh);
    });

    // 한국 전통 곡선 석조 지붕 적용
    this.createKoreanCurvedRoof(group, {
      width: 10.2,
      depth: 5.8,
      baseY: 0.8 + 3.8 + 0.12,
      ridgeHeight: 1.65,
      roofColor: 0x4c5056,
      isStone: true,
      texSet
    });

    group.position.set(x, y, z);
    this.scene.add(group);

    // [사용자 요청 반영: 석조 지붕 처마에 가리지 않도록 석문 위 상단 높이로 현판을 내림]
    this.createSignboard(group, '석굴암', '石窟法堂', 0, 4.16, 3.05, 2.6, 0.68);

    this.addObstacle(x, z, 5.0);
    this.addObstacle(x, z + 2.2, 3.6);

    this.registerInteractable({
      id: 'seokguram',
      name: '석굴암 (석굴법당)',
      desc: '경주 토함산 석굴암을 모본으로 축조된 고요한 도심 석굴 암자입니다. 회색 석조 법당 안으로 들어가 본존불 앞에서의 깊은 침묵과 싱잉볼 명상을 경험할 수 있습니다.',
      position: new THREE.Vector3(x, 0, z + 8.8),
      lookTarget: new THREE.Vector3(x, 2.4, z),
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

    // (1) 부처님 뒤편의 단정한 다크 화강암 제단 바닥 원반 (심연의 어둠과 자연스럽게 블렌딩)
    const altarFloorCircle = new THREE.Mesh(
      new THREE.CylinderGeometry(4.5, 4.8, 0.05, 32),
      new THREE.MeshStandardMaterial({ color: 0x06070a, roughness: 0.95 })
    );
    altarFloorCircle.position.set(0, 0.02, -8.8);
    this.seokguramGroup.add(altarFloorCircle);

    // (2) [사용자 요청 반영: 평면 회색 미니멀 본존불 & 연하고 은은한 거신 광배]
    // 2/3 수준 크기 (~1.5m x 2.22m), 상단 높은 위치 (y = 2.15, z = -8.8)
    const stoneBuddhaGroup = new THREE.Group();
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x8a929a,
      roughness: 0.72,
      metalness: 0.05
    });

    // 1. 뒤편의 아주 연하고 은은한 거신 광배 (부처님 머리 뒤로 중심 정렬)
    const aureoleTex = this.createSoftAureoleTexture();
    const aureoleMat = new THREE.MeshBasicMaterial({
      map: aureoleTex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const aureoleMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), aureoleMat);
    aureoleMesh.position.set(0, 0.46, -0.04);
    stoneBuddhaGroup.add(aureoleMesh);

    // 2. [사용자 요청 평면 모양 & 회색조] 평면 2D 미니멀 석조 본존불 (무드등 스타일)
    const flatBuddhaTex = this.createFlatBuddhaTexture();
    const flatBuddhaMat = new THREE.MeshBasicMaterial({
      map: flatBuddhaTex,
      transparent: true,
      side: THREE.DoubleSide
    });
    const flatBuddhaMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 2.22), flatBuddhaMat);
    flatBuddhaMesh.position.set(0, 0, 0.02);
    stoneBuddhaGroup.add(flatBuddhaMesh);

    // [사용자 요청: 부처님을 좀 더 위로, 2/3 수준 크기로 배치하여 깊이감 극대화] (y = 2.70, z = -9.0)
    stoneBuddhaGroup.position.set(0, 2.70, -9.0);
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
    // [사용자 요청] 실제 사진 배경 온전 유지 + 전각 촛대 및 향로 선명 배치
    // ==========================================
    this.daewoongGroup = new THREE.Group();

    const altarWoodMat = new THREE.MeshStandardMaterial({ color: 0x24140f, roughness: 0.65 });
    const altarGoldTrimMat = new THREE.MeshStandardMaterial({ color: 0xcca33e, metalness: 0.6, roughness: 0.35 });

    // (1) 대웅전 수미단 (후면 탱화 받침)
    const sumeruBase = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.35, 1.2), altarWoodMat);
    sumeruBase.position.set(0, 0.35, -8.0);
    this.daewoongGroup.add(sumeruBase);

    const sumeruMid = new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.55, 1.1), altarWoodMat);
    sumeruMid.position.set(0, 0.70, -8.0);
    this.daewoongGroup.add(sumeruMid);

    for (let bx = -3.2; bx <= 3.2; bx += 1.6) {
      const panelTrim = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 0.05), altarGoldTrimMat);
      panelTrim.position.set(bx, 0.70, -7.42);
      this.daewoongGroup.add(panelTrim);
    }

    const sumeruTop = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.15, 1.3), altarWoodMat);
    sumeruTop.position.set(0, 1.02, -8.0);
    this.daewoongGroup.add(sumeruTop);

    // [요청 반영: 대웅전 전면 공양 제단 및 촛대·향로가 가림없이 선명하게 보이도록 전면 정위치 배치]
    const frontAltar = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.56, 1.0), altarWoodMat);
    frontAltar.position.set(0, 0.28, -7.2);
    this.daewoongGroup.add(frontAltar);

    const frontAltarTop = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.08, 1.1), altarGoldTrimMat);
    frontAltarTop.position.set(0, 0.60, -7.2);
    this.daewoongGroup.add(frontAltarTop);

    createCeremonialAltarSet(this.daewoongGroup, 0.64, -7.2, 1.6);

    // (2) [사용자 실제 전각 사진 유지] 대웅전 금빛 삼존불 및 후불탱화 대형 제단 패널
    // [요청 반영: 백색 화면 방지 - 조명에 하얗게 타지 않고 원본 사진의 온화하고 성스러운 색채를 100% 온전히 보존하도록 MeshBasicMaterial 적용]
    if (daewoongTex) {
      const panelMat = new THREE.MeshBasicMaterial({
        map: daewoongTex
      });
      const daewoongPanel = new THREE.Mesh(new THREE.PlaneGeometry(9.0, 5.6), panelMat);
      daewoongPanel.position.set(0, 3.85, -8.3);
      this.daewoongGroup.add(daewoongPanel);

      const frameTop = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.3, 0.15), altarWoodMat);
      frameTop.position.set(0, 6.70, -8.25);
      this.daewoongGroup.add(frameTop);

      const frameGold = new THREE.Mesh(new THREE.BoxGeometry(9.2, 0.08, 0.16), altarGoldTrimMat);
      frameGold.position.set(0, 6.53, -8.24);
      this.daewoongGroup.add(frameGold);
    }

    // (3) 대웅전 상단 화려한 닫집 (천개 / 보개)
    const canopyRoof = new THREE.Mesh(
      new THREE.ConeGeometry(5.8, 1.8, 4),
      new THREE.MeshStandardMaterial({ color: 0x1f1510, roughness: 0.7 })
    );
    canopyRoof.position.set(0, 7.3, -7.8);
    canopyRoof.rotation.y = Math.PI / 4;
    this.daewoongGroup.add(canopyRoof);

    const canopyBeam = new THREE.Mesh(new THREE.BoxGeometry(8.2, 0.45, 1.8), altarGoldTrimMat);
    canopyBeam.position.set(0, 6.5, -7.8);
    this.daewoongGroup.add(canopyBeam);

    [-4.1, 4.1].forEach(px => {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6.8, 16), altarWoodMat);
      pillar.position.set(px, 3.4, -7.6);
      this.daewoongGroup.add(pillar);
    });

    // [요청 반영: 과도한 눈부심 및 백색 탈색 방지 - 부드러운 은은한 조도로 조정]
    const daewoongSpot = new THREE.SpotLight(0xffecd0, 0.5, 20, Math.PI / 3.4, 0.4, 1.2);
    daewoongSpot.position.set(0, 7.2, -4.0);
    daewoongSpot.target = sumeruTop;
    this.daewoongGroup.add(daewoongSpot);
    this.daewoongGroup.add(daewoongSpot.target);

    this.insideGroup.add(this.daewoongGroup);

    // ==========================================
    // [법당 3] 산신각 (Sansingak / 삼성각) 서브그룹
    // [사용자 요청] 실제 사진 배경 온전 유지 + 전각 촛대 및 향로 정갈 배치
    // ==========================================
    this.sansinGroup = new THREE.Group();

    const pineMat = new THREE.MeshStandardMaterial({ color: 0x3d2719, roughness: 0.8 });
    const sansinBrassMat = new THREE.MeshStandardMaterial({ color: 0xb59344, metalness: 0.7, roughness: 0.35 });

    [-4.1, 4.1].forEach(px => {
      const pinePillar = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 6.5, 16), pineMat);
      pinePillar.position.set(px, 3.25, -7.4);
      this.sansinGroup.add(pinePillar);
    });

    const eavesBeam = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.4, 1.2), pineMat);
    eavesBeam.position.set(0, 5.6, -7.4);
    this.sansinGroup.add(eavesBeam);

    const sansinAltar = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.56, 1.0), pineMat);
    sansinAltar.position.set(0, 0.28, -7.2);
    this.sansinGroup.add(sansinAltar);

    const sansinAltarTop = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.08, 1.1), sansinBrassMat);
    sansinAltarTop.position.set(0, 0.60, -7.2);
    this.sansinGroup.add(sansinAltarTop);

    // [요청 반영: 산신각 제단 촛대 및 향로 선명하게 배치]
    createCeremonialAltarSet(this.sansinGroup, 0.64, -7.2, 1.6);

    [-1.6, -0.5, 0.5, 1.6].forEach(ox => {
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.12, 12), sansinBrassMat);
      bowl.position.set(ox, 0.70, -7.0);
      this.sansinGroup.add(bowl);
    });

    // [요청 반영: 백색 화면 방지 - MeshBasicMaterial로 사진의 깊고 고요한 색감을 온전히 유지]
    if (sansinTex) {
      const sansinPanelMat = new THREE.MeshBasicMaterial({
        map: sansinTex
      });
      const sansinPanel = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 4.4), sansinPanelMat);
      sansinPanel.position.set(0, 3.4, -8.0);
      this.sansinGroup.add(sansinPanel);

      const sFrameTop = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.22, 0.12), pineMat);
      sFrameTop.position.set(0, 5.52, -7.95);
      this.sansinGroup.add(sFrameTop);

      const sFrameBottom = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.22, 0.12), pineMat);
      sFrameBottom.position.set(0, 1.08, -7.95);
      this.sansinGroup.add(sFrameBottom);
    }

    // [요청 반영: 은은하고 차분한 조도로 조정하여 눈부심과 백색 탈색 완전 방지]
    const sansinSpot = new THREE.SpotLight(0xffdfa8, 0.5, 20, Math.PI / 3.4, 0.45, 1.2);
    sansinSpot.position.set(0, 6.8, -4.2);
    sansinSpot.target = sansinAltar;
    this.sansinGroup.add(sansinSpot);
    this.sansinGroup.add(sansinSpot.target);

    this.insideGroup.add(this.sansinGroup);

    // ==========================================
    // [공통 전경] [사용자 스케치 완벽 구현] 좌복(방석)과 그 위에 단정히 앉은 내 캐릭터(합장 스님)
    // [요청 반영] 마루 중앙(z = -2.2)에 아담한 크기로 배치하여 하단 메뉴에 가려지지 않고
    // 원경의 부처님과 제단을 우러러보는 깊이감 있는 명상 구도 완성
    // ==========================================
    const cushionMat = new THREE.MeshStandardMaterial({ color: 0x8a1c26, roughness: 0.65 });
    // [사용자 요청: 둥근 방석과 포근하고 둥근 결가부좌 곡선 연출]
    const cushion = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.56, 0.09, 32), cushionMat);
    cushion.position.set(0, 0.045, -5.0);
    this.insideGroup.add(cushion);

    const cushionTrim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.58, 0.03, 32), new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.4 }));
    cushionTrim.position.set(0, 0.015, -5.0);
    this.insideGroup.add(cushionTrim);

    this.insideMonkGroup = new THREE.Group();
    this.insideMonkGroup.visible = true;
    // [사용자 스케치 반영: 단정하고 둥근 눈사람/호리병 실루엣의 참배 캐릭터] (z = -4.9)
    this.insideMonkGroup.position.set(0, 0.12, -4.9);
    this.insideMonkGroup.rotation.y = Math.PI; // 제단(-Z 방향)을 경건히 바라봄
    this.insideMonkGroup.scale.set(0.44, 0.44, 0.44);

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

    this.scene.add(this.insideGroup);
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

  // [사용자 요청 반영: 전각 건물 처마에 품격 있게 걸리는 3D 전통 현판 (번쩍거림/Z-fighting 100% 방지)]
  createSignboard(parent, title, subTitle, x, y, z, width = 2.6, height = 0.72) {
    const group = new THREE.Group();

    // 1. 고해상도 캔버스 텍스처 (1024x288)
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 288;
    const ctx = canvas.getContext('2d');

    // 칠흑빛 옻칠 목판 바탕 (Deep black-brown lacquer wood)
    ctx.fillStyle = '#141210';
    ctx.fillRect(0, 0, 1024, 288);

    // 전통 사찰 현판 이중 금박 테두리 (Traditional double gold borders)
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 14;
    ctx.strokeRect(12, 12, 1000, 264);

    ctx.strokeStyle = '#8c6e26';
    ctx.lineWidth = 4;
    ctx.strokeRect(26, 26, 972, 236);

    // 내부 모서리 전통 문양 포인트
    ctx.fillStyle = '#d4af37';
    [[32, 32], [992, 32], [32, 256], [992, 256]].forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
    });

    // 전각 명칭 (Bold Dignified Gold Hangul Calligraphy)
    ctx.fillStyle = '#ffd966';
    ctx.font = 'bold 92px "Noto Serif KR", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 4;

    if (subTitle) {
      ctx.fillText(title, 512, 112);
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#d8bb6f';
      ctx.font = '600 42px "Noto Serif KR", serif';
      ctx.fillText(subTitle, 512, 206);
    } else {
      ctx.fillText(title, 512, 144);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;

    // 2. 3D 원목 프레임 몸체 (BoxGeometry로 실물 두께 0.08m 부여하여 평면 깜빡임 완전 박멸)
    const frameDepth = 0.08;
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x221a12,
      roughness: 0.7
    });
    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, frameDepth), frameMat);
    group.add(frameMesh);

    // 3. 전면 금박 현판 면 (Frame 바로 앞면에 밀착 + polygonOffset으로 번쩍거림/Z-fighting 영구 방지)
    const signMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.35,
      metalness: 0.1,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });
    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.06, height - 0.06), signMat);
    signMesh.position.z = frameDepth / 2 + 0.005;
    group.add(signMesh);

    // 4. 상단 현판 걸개 고리 (철제 고리 2개로 처마에 단단히 매달린 입체 연출)
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5, metalness: 0.8 });
    const hookGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.16, 8);
    const leftHook = new THREE.Mesh(hookGeo, ironMat);
    leftHook.position.set(-width * 0.32, height / 2 + 0.08, 0);
    const rightHook = new THREE.Mesh(hookGeo, ironMat);
    rightHook.position.set(width * 0.32, height / 2 + 0.08, 0);
    group.add(leftHook);
    group.add(rightHook);

    group.position.set(x, y, z);
    parent.add(group);
    return group;
  }

  // [사용자 요청 반영: 석탑 본체 기단부에 밀착 부착되는 석조 현판 명판 (보행 진로 방해 제로)]
  createPagodaBasePlaque(pagoda) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    // 흑요석/오석 바탕
    ctx.fillStyle = '#181a1c';
    ctx.fillRect(0, 0, 512, 160);

    // 전통 금박 테두리
    ctx.strokeStyle = '#c9a44c';
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, 496, 144);

    // 금박 서체
    ctx.fillStyle = '#ffd766';
    ctx.font = 'bold 52px "Noto Serif KR", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('묘보탑', 256, 56);

    ctx.fillStyle = '#c7ab63';
    ctx.font = '500 26px "Noto Serif KR", serif';
    ctx.fillText('八角九層石塔', 256, 114);

    const tex = new THREE.CanvasTexture(canvas);
    const plaqueMat = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2
    });

    const plaqueGroup = new THREE.Group();
    const stoneFrame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.42, 0.06), new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.8 }));
    plaqueGroup.add(stoneFrame);

    const faceMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.37), plaqueMat);
    faceMesh.position.z = 0.035;
    plaqueGroup.add(faceMesh);

    // 묘보탑 2단 기단 정면(남쪽 z=+2.22, y=1.15)에 밀착 부착 (진로 방해 제로)
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
    // [요청 반영: 묘보탑 앞마당 공터 및 탑돌이 궤적 시야 확보를 위해 외곽 산자락으로 소나무 재배치]
    const pineTreeLocations = [
      [-12, 18], [12, 19], [-8, 30], [9, 32],
      [-29, -5], [-28, 14], [22, -2], [25, 12],
      [-10, -28], [8, -28], [28, -24], [-28, -22]
    ];
    pineTreeLocations.forEach(([px, pz]) => {
      this.createPineTree(px, 0, pz);
      this.addObstacle(px, pz, 0.5);
    });
    // [요청 반영: 경내 디딤돌 모두 제거하여 완전히 평평하고 탁 트인 고요한 도량 조성]
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

      this.walkTarget = new THREE.Vector3(p.x, this.getTerrainHeight(p.x, p.z), p.z);
      this.targetLookAt = null;
      this.isWalking = true;
      this.showRipple(p.x, p.z);
    }
  }

  walkToLocation(locationId) {
    const item = this.interactables.find(i => i.id === locationId);
    if (!item) return;

    // [요청 반영] 전각 탭 시 즉시 기존 팝업을 닫고, 바로 앞에 설 때까지 입장하기가 뜨지 않도록 처리
    this.activeLocation = null;
    if (window.onLocationChanged) window.onLocationChanged(null);

    const finalDest = item.position.clone();
    finalDest.y = this.getTerrainHeight(finalDest.x, finalDest.z);
    this.finalLookTarget = item.lookTarget ? item.lookTarget.clone() : null;

    // [요청 반영] 건물을 피해서 걸어가 전각 앞에 위치할 수 있도록 장애물 우회(Waypoint) 경로 생성
    const sx = this.playerPos.x;
    const sz = this.playerPos.z;
    const tx = finalDest.x;
    const tz = finalDest.z;

    this.walkWaypoints = [];

    // 석굴암/산신각 등 좌우 날개와 대웅전/대문/탑 사이를 이동할 때,
    // 대웅전 앞 석등(-4.2, 4.2)과 탑을 피하기 위해 안전한 중앙 안마당(0, -2)을 경유
    const isCrossingCentral = (Math.abs(sx) > 4 && Math.abs(tx) <= 2) ||
                             (Math.abs(sx) <= 2 && Math.abs(tx) > 4) ||
                             (sx * tx < -10);

    if (isCrossingCentral) {
      if (Math.abs(sx) > 6) {
        this.walkWaypoints.push(new THREE.Vector3(Math.sign(sx) * 6, this.getTerrainHeight(Math.sign(sx) * 6, -2), -2));
      }
      this.walkWaypoints.push(new THREE.Vector3(0, this.getTerrainHeight(0, -2), -2));
      if (Math.abs(tx) > 6) {
        this.walkWaypoints.push(new THREE.Vector3(Math.sign(tx) * 6, this.getTerrainHeight(Math.sign(tx) * 6, -2), -2));
      }
    }

    this.walkWaypoints.push(finalDest);
    this.walkTarget = this.walkWaypoints.shift();
    this.targetLookAt = null;
    this.isWalking = true;
    this.showRipple(finalDest.x, finalDest.z);
  }

  updateCameraPosition() {
    if (this.currentMode === 'outside') {
      const targetLookY = this.playerPos.y + 1.25;
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
      if (dist < minDist) {
        nearest = item;
      }
    });

    if (nearest !== this.activeLocation) {
      this.activeLocation = nearest;
      if (window.onLocationChanged) {
        window.onLocationChanged(nearest);
      }
    }
  }

  resetCharacterPose() {
    if (!this.charLimbs) return;
    this.charLimbs.leftLeg.rotation.set(0, 0, 0);
    this.charLimbs.rightLeg.rotation.set(0, 0, 0);
    if (this.charLimbs.upperBody) {
      this.charLimbs.upperBody.position.set(0, 0.50, 0);
      this.charLimbs.upperBody.rotation.set(0, 0, 0);
    }
    this.charLimbs.body.position.set(0, 0.35, 0);
    this.charLimbs.body.rotation.set(0, 0, 0);
    this.charLimbs.head.position.set(0, 0.88, 0);
    this.charLimbs.head.rotation.set(0, 0, 0);
    this.charLimbs.gassho.position.set(0, 0.35, 0.22);
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

  enterCurrentBuilding() {
    if (!this.activeLocation || !this.activeLocation.enterable) return;

    if (this.activeLocation.enterType === 'pagoda') {
      this.startPagodaSpin();
    } else {
      this.setupDarkTempleInterior();

      if (this.activeLocation.enterType === 'daewoong') {
        this.currentMode = 'inside_daewoong';
      } else if (this.activeLocation.enterType === 'seokguram') {
        this.currentMode = 'inside_seokguram';
      } else if (this.activeLocation.enterType === 'sansin') {
        this.currentMode = 'inside_sansin';
      }
    }
  }

  setupDarkTempleInterior() {
    this.scene.background.setHex(0x050608); // [사용자 요청] 나머지 공간은 깊고 고요한 어둠으로 처리
    this.scene.fog.color.setHex(0x050608);
    this.scene.fog.density = 0.012;

    this.sunLight.intensity = 0.02;
    this.hemiLight.intensity = 0.12;
    this.insideCandleLight.intensity = 0.25;
    // 제단 촛불 위치 (z = -7.55, y = 1.25)
    this.insideCandleLight.position.set(0, -80 + 1.25, -7.55);

    const enterType = this.activeLocation ? this.activeLocation.enterType : 'seokguram';
    if (this.seokguramGroup) this.seokguramGroup.visible = (enterType === 'seokguram');
    if (this.daewoongGroup) this.daewoongGroup.visible = (enterType === 'daewoong');
    if (this.sansinGroup) this.sansinGroup.visible = (enterType === 'sansin');

    if (this.insideGroup) this.insideGroup.visible = true;

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
            this.isWalking = false;
            this.walkTarget = null;
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

          this.walkAnimTime += delta * 6.5;
          this.charLimbs.leftLeg.rotation.x = Math.sin(this.walkAnimTime) * 0.45;
          this.charLimbs.rightLeg.rotation.x = -Math.sin(this.walkAnimTime) * 0.45;
          if (this.charLimbs.upperBody) {
            this.charLimbs.upperBody.position.y = 0.50 + Math.abs(Math.sin(this.walkAnimTime)) * 0.03;
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
      } else {
        this.resetCharacterPose();
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

        // [핵심 개선: 등 뒤 정면이 아닌 3/4 측면 정면 구도로 카메라 배치 -> 허리 숙임, 고개 숙임, 하얀 합장 손, 묘보탑이 한눈에 극명하게 보임!]
        const px = this.pagodaPos.x;
        const pz = this.pagodaPos.z + this.pagodaRadius;
        const camPos = new THREE.Vector3(px + 2.5, 1.38, pz + 2.1);
        this.camera.position.lerp(camPos, 0.12);
        this.camera.lookAt(new THREE.Vector3(px, 0.92, pz - 1.2));

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

        const walkBob = Math.abs(Math.sin(this.walkAnimTime)) * 0.04;
        const torsoTwist = Math.sin(this.walkAnimTime) * 0.05;
        if (this.charLimbs.upperBody) {
          this.charLimbs.upperBody.position.y = 0.50 + walkBob;
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

        // [요청 반영: 캐릭터 시야 100% 확보 - 3인칭 숄더 팔로우 카메라 앵글]
        // 높이를 낮추고(2.1m) 캐릭터를 화면 중앙-하단에 안정적으로 안착
        const camDistBehind = 3.6;
        const camDistOutward = 2.4;
        const cx = px + Math.sin(this.pagodaAngle) * camDistBehind + Math.cos(this.pagodaAngle) * camDistOutward;
        const cz = pz - Math.cos(this.pagodaAngle) * camDistBehind + Math.sin(this.pagodaAngle) * camDistOutward;
        const cy = 2.1;

        this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), 0.08);

        // 시선: 캐릭터 상체와 보행 전방, 그리고 우측 석탑을 황금비로 조망
        const targetX = px - Math.sin(this.pagodaAngle) * 1.0 - Math.cos(this.pagodaAngle) * 0.9;
        const targetZ = pz + Math.cos(this.pagodaAngle) * 1.0 - Math.sin(this.pagodaAngle) * 0.9;
        const targetY = 1.15;

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

    this.renderer.render(this.scene, this.camera);
  }
}

window.Bomunsa3D = Bomunsa3D;

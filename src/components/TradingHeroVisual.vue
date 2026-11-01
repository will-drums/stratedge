<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  computeLiquidityDepthMatrix,
  type HeroDepthMode,
  type HeroInstrumentFeed,
  type LiquidityGridNode,
} from '../utils/fulfillment';

const props = withDefaults(
  defineProps<{
    activeModel?: HeroDepthMode;
    activeInstrument?: HeroInstrumentFeed;
  }>(),
  {
    activeModel: 'Gamma',
    activeInstrument: 'SPX 0DTE',
  }
);

const emit = defineEmits<{
  (e: 'update:activeModel', val: HeroDepthMode): void;
  (e: 'update:activeInstrument', val: HeroInstrumentFeed): void;
}>();

const canvasMountRef = ref<HTMLDivElement | null>(null);
const dockCollapsed = ref(false);
const activeCameraPreset = ref<'Isometric' | 'DepthWall' | 'TopGrid'>('Isometric');
const isPulsePaused = ref(false);

const depthSummary = computed(() =>
  computeLiquidityDepthMatrix(props.activeModel, props.activeInstrument, 8)
);

// Pre-allocated scratch math objects outside the animation loop (Zero-GC render loop)
const _dummy = new THREE.Object3D();
const _capDummy = new THREE.Object3D();
const _color = new THREE.Color();
const _emeraldBid = new THREE.Color(0x10b981);
const _skyEquilibrium = new THREE.Color(0x38bdf8);
const _amberStructure = new THREE.Color(0xf59e0b);
const _crimsonAsk = new THREE.Color(0xf43f5e);
const _desiredCamPos = new THREE.Vector3(7.6, 6.9, 9.2);
const _lookTarget = new THREE.Vector3(0, 0.25, 0.35);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let columnInstancedMesh: THREE.InstancedMesh | null = null;
let capInstancedMesh: THREE.InstancedMesh | null = null;
let equilibriumBeam: THREE.Mesh | null = null;
let vwapTubeMesh: THREE.Mesh | null = null;
let bidContourLine: THREE.Line | null = null;
let askContourLine: THREE.Line | null = null;
let resizeObserver: ResizeObserver | null = null;

let frameId = 0;
let isSoftwareGl = false;
let isUnmounted = false;
let clock: THREE.Clock | null = null;

// Node state arrays for smooth exponential damping between modes/instruments
let targetNodes: LiquidityGridNode[] = [];
const currentHeights: number[] = new Array(64).fill(1.0);

function syncTargetNodes() {
  const matrix = computeLiquidityDepthMatrix(
    props.activeModel,
    props.activeInstrument,
    8
  );
  targetNodes = matrix.nodes;

  if (columnInstancedMesh && targetNodes.length === 64) {
    for (let i = 0; i < 64; i++) {
      const node = targetNodes[i];
      if (node.side === 'bid') {
        _color.copy(_emeraldBid).lerp(_skyEquilibrium, (1 - node.intensity) * 0.25);
      } else if (node.side === 'ask') {
        if (props.activeModel === 'Structure') {
          _color.copy(_amberStructure).lerp(_crimsonAsk, node.intensity * 0.35);
        } else {
          _color.copy(_crimsonAsk).lerp(_amberStructure, (1 - node.intensity) * 0.3);
        }
      } else {
        _color.copy(_skyEquilibrium);
      }
      columnInstancedMesh.setColorAt(i, _color);
    }
    if (columnInstancedMesh.instanceColor) {
      columnInstancedMesh.instanceColor.needsUpdate = true;
    }
  }
}

function applyCameraPreset(preset: 'Isometric' | 'DepthWall' | 'TopGrid') {
  activeCameraPreset.value = preset;
  if (preset === 'Isometric') {
    _desiredCamPos.set(7.4, 6.6, 8.8);
  } else if (preset === 'DepthWall') {
    _desiredCamPos.set(0.0, 3.8, 10.8);
  } else {
    _desiredCamPos.set(0.2, 11.4, 2.8);
  }
}

function afterDraw(cb: () => void) {
  if (!renderer || isUnmounted) return;
  const gl = renderer.getContext() as WebGL2RenderingContext;
  if (!gl || typeof gl.fenceSync !== 'function') {
    frameId = window.setTimeout(cb, 80);
    return;
  }
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const poll = () => {
    if (!renderer || isUnmounted) return;
    const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
    if (state === gl.UNSIGNALED) {
      frameId = window.setTimeout(poll, 5);
    } else {
      if (sync) gl.deleteSync(sync);
      frameId = window.setTimeout(cb, 80);
    }
  };
  frameId = window.setTimeout(poll, 5);
}

function updateInstancedGrid(elapsed: number, dt: number) {
  if (!columnInstancedMesh || !capInstancedMesh || targetNodes.length === 0) return;

  const waveEnabled = !isPulsePaused.value;
  for (let i = 0; i < targetNodes.length; i++) {
    const node = targetNodes[i];
    // Subtle institutional order-book breathing ripple
    const subtleRipple = waveEnabled
      ? Math.sin(elapsed * 1.65 + node.row * 0.65 + node.col * 0.5) * 0.085 +
        Math.cos(elapsed * 1.1 - node.col * 0.7) * 0.045
      : 0;

    const desiredH = Math.max(0.26, node.baseHeight + subtleRipple);
    currentHeights[i] = THREE.MathUtils.damp(
      currentHeights[i] || desiredH,
      desiredH,
      7.5,
      dt
    );

    const h = currentHeights[i];

    // Update Liquidity Column Instance Matrix (bottom-pivoted at pedestal y = 0.18)
    _dummy.position.set(node.x, 0.18 + h * 0.5, node.z);
    _dummy.scale.set(1, h, 1);
    _dummy.updateMatrix();
    columnInstancedMesh.setMatrixAt(i, _dummy.matrix);

    // Update Specular Metallic Cap Instance Matrix
    _capDummy.position.set(node.x, 0.18 + h + 0.035, node.z);
    _capDummy.scale.set(1, 1, 1);
    _capDummy.updateMatrix();
    capInstancedMesh.setMatrixAt(i, _capDummy.matrix);
  }

  columnInstancedMesh.instanceMatrix.needsUpdate = true;
  capInstancedMesh.instanceMatrix.needsUpdate = true;

  if (equilibriumBeam) {
    const targetBeamZ =
      props.activeModel === 'Gamma'
        ? 0.0
        : props.activeModel === 'Flow'
        ? -0.45
        : 0.45;
    equilibriumBeam.position.z = THREE.MathUtils.damp(
      equilibriumBeam.position.z,
      targetBeamZ,
      6.0,
      dt
    );
  }
}

function tick() {
  if (isUnmounted || !renderer || !scene || !camera || !clock) return;

  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.getElapsedTime();

  // Smooth exponential camera damping
  camera.position.x = THREE.MathUtils.damp(camera.position.x, _desiredCamPos.x, 6.5, dt);
  camera.position.y = THREE.MathUtils.damp(camera.position.y, _desiredCamPos.y, 6.5, dt);
  camera.position.z = THREE.MathUtils.damp(camera.position.z, _desiredCamPos.z, 6.5, dt);
  camera.lookAt(_lookTarget);

  updateInstancedGrid(elapsed, dt);

  renderer.render(scene, camera);

  if (isSoftwareGl) {
    afterDraw(tick);
  } else {
    frameId = requestAnimationFrame(tick);
  }
}

onMounted(() => {
  const container = canvasMountRef.value;
  if (!container) return;
  isUnmounted = false;

  // 1. Software-WebGL Guard from GPU renderer string (never userAgent)
  isSoftwareGl = (() => {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  })();

  const width = container.clientWidth || 560;
  const height = container.clientHeight || 330;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060a12);
  scene.fog = new THREE.FogExp2(0x060a12, 0.042);

  camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 80);
  camera.position.copy(_desiredCamPos);
  camera.lookAt(_lookTarget);

  renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  container.appendChild(renderer.domElement);

  // 2. Studio Environment Reflections (RoomEnvironment + PMREMGenerator)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  pmremGenerator.dispose();

  // 3. Balanced 3-Point Warm/Cool Studio Lighting Rig
  const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x050811, 0.9);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.15);
  keyLight.position.set(8, 13, 7);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.bias = -0.0005;
  }
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x10b981, 1.35);
  rimLight.position.set(-8, 6, -6);
  scene.add(rimLight);

  // 4. Composite 8-Part Institutional Market Depth & Liquidity Sculpture (THREE.Group)
  const depthGroup = new THREE.Group();
  scene.add(depthGroup);

  // Part 1: Grounded Radial Contact Shadow Disc (y = 0.01)
  const shadowGeo = new THREE.CircleGeometry(6.4, 36);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x020409,
    transparent: true,
    opacity: 0.58,
    depthWrite: false,
  });
  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = 0.01;
  depthGroup.add(shadowMesh);

  // Part 2: Primary Anodized Obsidian Pedestal Hull (Roughness 0.74, Metalness 0.34)
  const hullGeo = new THREE.BoxGeometry(7.2, 0.16, 6.8);
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0x0c1424,
    roughness: 0.74,
    metalness: 0.34,
  });
  const hullMesh = new THREE.Mesh(hullGeo, hullMat);
  hullMesh.position.y = 0.09;
  hullMesh.receiveShadow = !isSoftwareGl;
  depthGroup.add(hullMesh);

  // Part 3: Brushed Titanium Perimeter Bevel Frame (Roughness 0.22, Metalness 0.88 — delta >= 0.25)
  const railGeo = new THREE.BoxGeometry(7.36, 0.06, 0.12);
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.22,
    metalness: 0.88,
  });
  const frontRail = new THREE.Mesh(railGeo, railMat);
  frontRail.position.set(0, 0.18, 3.42);
  const backRail = new THREE.Mesh(railGeo, railMat);
  backRail.position.set(0, 0.18, -3.42);
  depthGroup.add(frontRail, backRail);

  // Part 4: Precision Liquidity Calibration Grid (Offset y = 0.185 to avoid coplanar Z-fighting)
  const gridHelper = new THREE.GridHelper(6.6, 16, 0x10b981, 0x1e293b);
  gridHelper.position.y = 0.185;
  depthGroup.add(gridHelper);

  // Part 5: 64-Node (8x8) InstancedMesh 3D Liquidity Depth Columns
  const colGeo = new THREE.BoxGeometry(0.46, 1.0, 0.46);
  const colMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
    metalness: 0.65,
  });
  columnInstancedMesh = new THREE.InstancedMesh(colGeo, colMat, 64);
  columnInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  columnInstancedMesh.frustumCulled = false;
  columnInstancedMesh.castShadow = !isSoftwareGl;
  columnInstancedMesh.receiveShadow = !isSoftwareGl;
  depthGroup.add(columnInstancedMesh);

  // Part 6: 64-Node InstancedMesh Brushed Specular Top Caps (Roughness 0.15, Metalness 0.92)
  const capGeo = new THREE.BoxGeometry(0.48, 0.045, 0.48);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.15,
    metalness: 0.92,
  });
  capInstancedMesh = new THREE.InstancedMesh(capGeo, capMat, 64);
  capInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  capInstancedMesh.frustumCulled = false;
  depthGroup.add(capInstancedMesh);

  // Part 7: Zero-Gamma Flip / Order-Book Midpoint Laser Equilibrium Plane
  const beamGeo = new THREE.BoxGeometry(6.8, 0.055, 0.08);
  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.65,
    roughness: 0.18,
    metalness: 0.85,
  });
  equilibriumBeam = new THREE.Mesh(beamGeo, beamMat);
  equilibriumBeam.position.set(0, 1.42, 0);
  depthGroup.add(equilibriumBeam);

  // Part 8: 3D Anchored VWAP Sigma Trajectory Tube + Bid/Ask Depth Horizon Contours
  const vwapCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-2.9, 1.15, 2.2),
    new THREE.Vector3(-1.5, 1.52, 1.0),
    new THREE.Vector3(0.0, 1.88, 0.0),
    new THREE.Vector3(1.5, 2.35, -1.0),
    new THREE.Vector3(2.9, 2.82, -2.2),
  ]);
  const tubeGeo = new THREE.TubeGeometry(vwapCurve, 36, 0.042, 8, false);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.45,
    roughness: 0.25,
    metalness: 0.78,
  });
  vwapTubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
  depthGroup.add(vwapTubeMesh);

  const bidContourPoints = [
    new THREE.Vector3(-2.9, 2.45, -2.6),
    new THREE.Vector3(-2.1, 1.85, -1.2),
    new THREE.Vector3(-1.3, 1.35, 0.4),
    new THREE.Vector3(-0.5, 0.95, 2.4),
  ];
  const bidGeo = new THREE.BufferGeometry().setFromPoints(bidContourPoints);
  bidContourLine = new THREE.Line(
    bidGeo,
    new THREE.LineBasicMaterial({ color: 0x10b981 })
  );
  depthGroup.add(bidContourLine);

  const askContourPoints = [
    new THREE.Vector3(0.5, 0.98, -2.4),
    new THREE.Vector3(1.3, 1.48, -0.4),
    new THREE.Vector3(2.1, 2.05, 1.2),
    new THREE.Vector3(2.9, 2.68, 2.6),
  ];
  const askGeo = new THREE.BufferGeometry().setFromPoints(askContourPoints);
  askContourLine = new THREE.Line(
    askGeo,
    new THREE.LineBasicMaterial({ color: 0xf43f5e })
  );
  depthGroup.add(askContourLine);

  // Initialize node heights & colors immediately before first frame
  syncTargetNodes();
  for (let i = 0; i < targetNodes.length; i++) {
    currentHeights[i] = targetNodes[i].baseHeight;
  }
  clock = new THREE.Clock();
  updateInstancedGrid(0, 0.016);
  columnInstancedMesh.computeBoundingSphere();
  capInstancedMesh.computeBoundingSphere();

  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  // Start paced animation loop
  tick();

  // Responsive ResizeObserver
  resizeObserver = new ResizeObserver(() => {
    if (!container || !renderer || !camera) return;
    const w = container.clientWidth || 560;
    const h = container.clientHeight || 330;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  resizeObserver.observe(container);
});

watch(
  () => [props.activeModel, props.activeInstrument],
  () => {
    syncTargetNodes();
  }
);

onBeforeUnmount(() => {
  isUnmounted = true;
  if (frameId) {
    cancelAnimationFrame(frameId);
    clearTimeout(frameId);
  }
  resizeObserver?.disconnect();
  if (scene) {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
    });
  }
  if (renderer) {
    renderer.dispose();
  }
});
</script>

<template>
  <div class="quant-3d-shell" data-testid="trading-hero-visual">
    <!-- Top Institutional Telemetry Header Bar (Outside WebGL Canvas) -->
    <div class="quant-3d-topbar">
      <div class="meta-line">
        <span class="meta-accent">3D Institutional Liquidity Grid</span>
        <span class="meta-sep" aria-hidden="true">·</span>
        <span>StratEdge Algo {{ activeModel }}</span>
        <span class="meta-sep" aria-hidden="true">·</span>
        <span class="mono">{{ activeInstrument }}</span>
      </div>

      <div class="segmented-group" role="group" aria-label="Select 3D Liquidity Depth Model">
        <button
          v-for="mod in (['Gamma', 'Flow', 'Structure'] as const)"
          :key="mod"
          type="button"
          class="segmented-btn"
          :class="{ active: activeModel === mod }"
          :data-testid="`hero-visual-model-${mod.toLowerCase()}`"
          @click="emit('update:activeModel', mod)"
        >
          Algo {{ mod }}
        </button>
      </div>
    </div>

    <!-- Dedicated Empty WebGL Canvas Mount Container + Unobstructed Viewport -->
    <div class="quant-3d-viewport-wrapper">
      <div
        ref="canvasMountRef"
        class="quant-3d-canvas-mount"
        data-testid="hero-3d-canvas-mount"
      />

      <!-- Collapsible Bottom Control Dock (Zero Viewport Occlusion, No Backdrop Blur over WebGL) -->
      <div class="quant-3d-bottom-dock" :class="{ collapsed: dockCollapsed }">
        <button
          type="button"
          class="dock-collapse-toggle"
          data-testid="hero-dock-collapse-btn"
          :aria-label="dockCollapsed ? 'Show 3D Liquidity Controls' : 'Hide 3D Liquidity Controls'"
          @click="dockCollapsed = !dockCollapsed"
        >
          {{ dockCollapsed ? '▴ Show 3D Liquidity Controls' : '▾ Hide Controls (Zen View)' }}
        </button>

        <div v-show="!dockCollapsed" class="dock-controls-inner">
          <div class="segmented-group" role="group" aria-label="Select 3D Instrument Feed">
            <button
              v-for="inst in (['SPX 0DTE', 'ES1! Futures', 'NQ1! Futures'] as const)"
              :key="inst"
              type="button"
              class="segmented-btn"
              :class="{ active: activeInstrument === inst }"
              :data-testid="`hero-visual-instrument-${inst.split(' ')[0].toLowerCase()}`"
              @click="emit('update:activeInstrument', inst)"
            >
              {{ inst }}
            </button>
          </div>

          <div class="segmented-group" role="group" aria-label="Select 3D Camera Angle">
            <button
              v-for="cam in (['Isometric', 'DepthWall', 'TopGrid'] as const)"
              :key="cam"
              type="button"
              class="segmented-btn"
              :class="{ active: activeCameraPreset === cam }"
              :data-testid="`hero-visual-cam-${cam.toLowerCase()}`"
              @click="applyCameraPreset(cam)"
            >
              {{ cam }}
            </button>
          </div>

          <button
            type="button"
            class="segmented-btn"
            :class="{ active: !isPulsePaused }"
            data-testid="hero-visual-pulse-toggle"
            @click="isPulsePaused = !isPulsePaused"
          >
            {{ isPulsePaused ? 'Resume Depth Pulse' : 'Live Depth Pulse' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Quantitative Market Depth & Liquidity Telemetry Footer Readout -->
    <div
      class="terminal-footer"
      style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding-top: 8px; border-top: 1px solid var(--border-hairline);"
    >
      <div>
        <div class="kpi-context">Bid / Ask Liquidity Wall</div>
        <div
          class="mono"
          style="font-size: 0.875rem; font-weight: 700; color: var(--accent-emerald-bright); margin-top: 2px;"
          data-testid="hero-depth-wall-readout"
        >
          ${{ depthSummary.bidWallTotalMillions }}M Bid · ${{ depthSummary.askWallTotalMillions }}M Ask
        </div>
      </div>
      <div>
        <div class="kpi-context">Zero-Gamma / VWAP Equilibrium</div>
        <div
          class="mono"
          style="font-size: 0.875rem; font-weight: 600; margin-top: 2px; color: var(--text-primary);"
          data-testid="hero-equilibrium-readout"
        >
          {{ depthSummary.equilibriumStrikeLabel }}
        </div>
      </div>
      <div>
        <div class="kpi-context">Net Order-Book Regime</div>
        <div
          class="mono"
          style="font-size: 0.875rem; font-weight: 600; margin-top: 2px; color: var(--accent-sky);"
          data-testid="hero-regime-readout"
        >
          {{ depthSummary.netRegimeLabel }} ({{ depthSummary.imbalancePct > 0 ? '+' : '' }}{{ depthSummary.imbalancePct }}%)
        </div>
      </div>
    </div>
  </div>
</template>

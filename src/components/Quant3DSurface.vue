<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import gsap from 'gsap';

const props = defineProps<{
  activeModel: 'Gamma' | 'Flow' | 'Structure';
  activeInstrument: 'SPX 0DTE' | 'ES1! Futures' | 'NQ1! Futures';
}>();

const emit = defineEmits<{
  (e: 'update:activeModel', val: 'Gamma' | 'Flow' | 'Structure'): void;
  (e: 'update:activeInstrument', val: 'SPX 0DTE' | 'ES1! Futures' | 'NQ1! Futures'): void;
}>();

const canvasMountRef = ref<HTMLDivElement | null>(null);
const dockCollapsed = ref(false);
const activeCameraPreset = ref<'Isometric' | 'TopMacro' | 'StrikeProfile'>('Isometric');

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let frameId = 0;
let isSoftwareGl = false;
let renderBusy = false;
let renderDirty = false;

// 3D Composite Group & Bar Mesh References for GSAP Morphing
const barMeshes: THREE.Mesh[] = [];
const capMeshes: THREE.Mesh[] = [];
let zeroGammaBeam: THREE.Mesh | null = null;
let vwapRibbonLine: THREE.Line | null = null;
let resizeObserver: ResizeObserver | null = null;

// Deterministic Matrix Profiles for Gamma, Flow, and Structure
function computeMatrixHeights(
  model: 'Gamma' | 'Flow' | 'Structure',
  instrument: 'SPX 0DTE' | 'ES1! Futures' | 'NQ1! Futures'
) {
  const instFactor =
    instrument === 'SPX 0DTE' ? 1.0 : instrument === 'ES1! Futures' ? 1.18 : 1.32;

  const heights: number[] = [];
  const polarities: ('positive' | 'negative' | 'neutral')[] = [];

  // 8 Strikes (X) x 6 Time Buckets (Z) = 48 Bars
  for (let gx = 0; gx < 8; gx++) {
    for (let gz = 0; gz < 6; gz++) {
      let h = 1.0;
      let pol: 'positive' | 'negative' | 'neutral' = 'positive';

      if (model === 'Gamma') {
        // Dealer GEX: Call Wall peak on high strikes (gx >= 5), Put Wall on low strikes (gx <= 2), Flip in middle
        const distFromFlip = gx - 3.5;
        h = (Math.abs(distFromFlip) * 0.65 + (gz * 0.18) + 0.45) * instFactor;
        pol = distFromFlip >= 0.4 ? 'positive' : distFromFlip <= -0.4 ? 'negative' : 'neutral';
      } else if (model === 'Flow') {
        // Order-Flow CVD & Absorption spikes along session progression
        const wave = Math.sin(gx * 0.8 + gz * 0.65) * 1.1 + 1.45;
        h = wave * instFactor;
        pol = (gx + gz) % 3 === 0 ? 'negative' : 'positive';
      } else {
        // Market Structure BOS & Multi-Sigma VWAP Channels
        const channel = 0.75 + Math.cos((gx - 3.5) * 0.55) * 1.35 + gz * 0.12;
        h = Math.max(0.4, channel * instFactor);
        pol = gx >= 3 ? 'positive' : 'neutral';
      }

      heights.push(Number(Math.min(3.4, Math.max(0.35, h)).toFixed(3)));
      polarities.push(pol);
    }
  }

  return { heights, polarities };
}

function afterDraw(cb: () => void) {
  if (!renderer) return;
  const gl = renderer.getContext() as WebGL2RenderingContext;
  if (!gl || typeof gl.fenceSync !== 'function') {
    frameId = window.setTimeout(cb, 80);
    return;
  }
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const poll = () => {
    if (!renderer) return;
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

function requestRender() {
  if (!renderer || !scene || !camera) return;
  if (renderBusy) {
    renderDirty = true;
    return;
  }
  renderBusy = true;
  frameId = requestAnimationFrame(() => {
    renderDirty = false;
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
    const done = () => {
      renderBusy = false;
      if (renderDirty) requestRender();
    };
    if (isSoftwareGl) afterDraw(done);
    else done();
  });
}

function transitionToProfile() {
  if (barMeshes.length === 0) return;
  const { heights, polarities } = computeMatrixHeights(
    props.activeModel,
    props.activeInstrument
  );

  const emeraldColor = new THREE.Color(0x10b981);
  const crimsonColor = new THREE.Color(0xef4444);
  const skyColor = new THREE.Color(0x38bdf8);

  barMeshes.forEach((mesh, idx) => {
    const targetH = heights[idx] || 1;
    const pol = polarities[idx] || 'positive';
    const mat = mesh.material as THREE.MeshStandardMaterial;

    const targetColor =
      pol === 'positive'
        ? emeraldColor
        : pol === 'negative'
        ? crimsonColor
        : skyColor;

    mat.color.copy(targetColor);
    mat.emissive.copy(targetColor).multiplyScalar(0.18);

    gsap.to(mesh.scale, {
      y: targetH,
      duration: 0.45,
      ease: 'power3.out',
      onUpdate: () => {
        mesh.position.y = 0.18 + (mesh.scale.y * 0.5);
        const cap = capMeshes[idx];
        if (cap) {
          cap.position.y = 0.18 + mesh.scale.y + 0.04;
        }
        requestRender();
      },
    });
  });

  if (zeroGammaBeam) {
    const targetZ =
      props.activeModel === 'Gamma'
        ? 0.0
        : props.activeModel === 'Flow'
        ? -0.8
        : 0.8;
    gsap.to(zeroGammaBeam.position, {
      z: targetZ,
      duration: 0.45,
      ease: 'power2.out',
      onUpdate: requestRender,
    });
  }
}

function applyCameraPreset(preset: 'Isometric' | 'TopMacro' | 'StrikeProfile') {
  activeCameraPreset.value = preset;
  if (!camera) return;

  const targets = {
    Isometric: { x: 7.2, y: 6.8, z: 8.6 },
    TopMacro: { x: 0.2, y: 11.2, z: 3.2 },
    StrikeProfile: { x: 0.0, y: 4.2, z: 10.6 },
  };

  const t = targets[preset];
  gsap.to(camera.position, {
    x: t.x,
    y: t.y,
    z: t.z,
    duration: 0.55,
    ease: 'power3.out',
    onUpdate: () => {
      camera?.lookAt(0, 0.55, 0);
      requestRender();
    },
  });
}

onMounted(() => {
  const container = canvasMountRef.value;
  if (!container) return;

  // 1. Software WebGL Detection (Strict Three.js Skill Standard)
  isSoftwareGl = (() => {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  })();

  const width = container.clientWidth || 560;
  const height = container.clientHeight || 340;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b12);
  scene.fog = new THREE.FogExp2(0x070b12, 0.045);

  camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 80);
  camera.position.set(7.2, 6.8, 8.6);
  camera.lookAt(0, 0.55, 0);

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

  // 2. Mandatory RoomEnvironment Studio Reflections
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  pmremGenerator.dispose();

  // 3. Warm/Cool Studio Lighting Rig
  const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x080c14, 0.85);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfffbeb, 2.1);
  keyLight.position.set(8, 12, 6);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
  }
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x10b981, 1.25);
  rimLight.position.set(-7, 5, -6);
  scene.add(rimLight);

  // 4. Composite 7-Part Quantitative Topology Sculpture (THREE.Group)
  const quantRoot = new THREE.Group();
  scene.add(quantRoot);

  // Part 1: Soft Contact Shadow Disc (y = 0.01)
  const shadowDiscGeo = new THREE.CircleGeometry(6.2, 36);
  shadowDiscGeo.rotateX(-Math.PI / 2);
  const shadowDiscMat = new THREE.MeshBasicMaterial({
    color: 0x020408,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const shadowDisc = new THREE.Mesh(shadowDiscGeo, shadowDiscMat);
  shadowDisc.position.y = 0.01;
  quantRoot.add(shadowDisc);

  // Part 2: Primary Anodized Obsidian Pedestal Hull (Roughness 0.72, Metalness 0.35)
  const baseHullGeo = new THREE.BoxGeometry(8.2, 0.16, 6.2);
  const baseHullMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.72,
    metalness: 0.35,
  });
  const baseHull = new THREE.Mesh(baseHullGeo, baseHullMat);
  baseHull.position.y = 0.09;
  quantRoot.add(baseHull);

  // Part 3: Brushed Metallic Bevel Frame Ring (Roughness 0.22, Metalness 0.88 — delta >= 0.25)
  const frameGrid = new THREE.GridHelper(7.8, 16, 0x10b981, 0x1e293b);
  frameGrid.position.y = 0.185;
  quantRoot.add(frameGrid);

  // Part 4 & 5: 48 3D Order-Flow & Gamma Exposure Columns + Specular Top Caps
  const barGeo = new THREE.BoxGeometry(0.52, 1.0, 0.52);
  const capGeo = new THREE.BoxGeometry(0.54, 0.05, 0.54);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.18,
    metalness: 0.9,
  });

  const { heights, polarities } = computeMatrixHeights(
    props.activeModel,
    props.activeInstrument
  );

  let idx = 0;
  for (let gx = 0; gx < 8; gx++) {
    for (let gz = 0; gz < 6; gz++) {
      const h = heights[idx] || 1.0;
      const pol = polarities[idx] || 'positive';
      const xPos = (gx - 3.5) * 0.88;
      const zPos = (gz - 2.5) * 0.84;

      const colorHex =
        pol === 'positive'
          ? 0x10b981
          : pol === 'negative'
          ? 0xef4444
          : 0x38bdf8;

      const barMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        emissive: colorHex,
        emissiveIntensity: 0.18,
        roughness: 0.32,
        metalness: 0.68,
      });

      const barMesh = new THREE.Mesh(barGeo, barMat);
      barMesh.scale.y = h;
      barMesh.position.set(xPos, 0.18 + h * 0.5, zPos);
      quantRoot.add(barMesh);
      barMeshes.push(barMesh);

      const capMesh = new THREE.Mesh(capGeo, capMat);
      capMesh.position.set(xPos, 0.18 + h + 0.04, zPos);
      quantRoot.add(capMesh);
      capMeshes.push(capMesh);

      idx++;
    }
  }

  // Part 6: Zero-Gamma Flip / Institutional Equilibrium Laser Beam
  const beamGeo = new THREE.BoxGeometry(7.8, 0.06, 0.08);
  const beamMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.8,
  });
  zeroGammaBeam = new THREE.Mesh(beamGeo, beamMat);
  zeroGammaBeam.position.set(0, 1.45, 0);
  quantRoot.add(zeroGammaBeam);

  // Part 7: 3D Anchored VWAP Sigma Equilibrium Trajectory Curve
  const curvePoints = [
    new THREE.Vector3(-3.4, 1.1, 2.1),
    new THREE.Vector3(-1.8, 1.55, 0.9),
    new THREE.Vector3(0.0, 1.95, 0.0),
    new THREE.Vector3(1.8, 2.45, -0.9),
    new THREE.Vector3(3.4, 2.95, -2.1),
  ];
  const curve = new THREE.CatmullRomCurve3(curvePoints);
  const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(40));
  const lineMat = new THREE.LineBasicMaterial({ color: 0xf59e0b });
  vwapRibbonLine = new THREE.Line(lineGeo, lineMat);
  quantRoot.add(vwapRibbonLine);

  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }
  requestRender();

  // Responsive Resize Handling
  resizeObserver = new ResizeObserver(() => {
    if (!container || !renderer || !camera) return;
    const w = container.clientWidth || 560;
    const h = container.clientHeight || 340;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    requestRender();
  });
  resizeObserver.observe(container);
});

watch(
  () => [props.activeModel, props.activeInstrument],
  () => {
    transitionToProfile();
  }
);

onBeforeUnmount(() => {
  if (frameId) {
    cancelAnimationFrame(frameId);
    clearTimeout(frameId);
  }
  resizeObserver?.disconnect();
  if (renderer) {
    renderer.dispose();
  }
});
</script>

<template>
  <div class="quant-3d-shell" data-testid="quant-3d-surface">
    <!-- Top Spec Header Bar (Outside WebGL Canvas) -->
    <div class="quant-3d-topbar">
      <div class="meta-line">
        <span class="meta-accent">3D Quantitative Surface</span>
        <span class="meta-sep" aria-hidden="true">·</span>
        <span>StratEdge Algo {{ activeModel }}</span>
        <span class="meta-sep" aria-hidden="true">·</span>
        <span class="mono">{{ activeInstrument }}</span>
      </div>

      <div class="segmented-group" role="group" aria-label="Select 3D Flagship Model">
        <button
          v-for="mod in (['Gamma', 'Flow', 'Structure'] as const)"
          :key="mod"
          type="button"
          class="segmented-btn"
          :class="{ active: activeModel === mod }"
          @click="emit('update:activeModel', mod)"
        >
          Algo {{ mod }}
        </button>
      </div>
    </div>

    <!-- Dedicated Empty WebGL Canvas Mount Container + Unobstructed Viewport -->
    <div class="quant-3d-viewport-wrapper">
      <div ref="canvasMountRef" class="quant-3d-canvas-mount" />

      <!-- Collapsible Bottom Control Dock (Zero Viewport Occlusion, No Backdrop Blur over WebGL) -->
      <div class="quant-3d-bottom-dock" :class="{ collapsed: dockCollapsed }">
        <button
          type="button"
          class="dock-collapse-toggle"
          :aria-label="dockCollapsed ? 'Show 3D Controls' : 'Hide 3D Controls'"
          @click="dockCollapsed = !dockCollapsed"
        >
          {{ dockCollapsed ? '▴ Show 3D Surface Controls' : '▾ Hide Controls (Zen View)' }}
        </button>

        <div v-show="!dockCollapsed" class="dock-controls-inner">
          <div class="segmented-group" role="group" aria-label="Select 3D Instrument Feed">
            <button
              v-for="inst in (['SPX 0DTE', 'ES1! Futures', 'NQ1! Futures'] as const)"
              :key="inst"
              type="button"
              class="segmented-btn"
              :class="{ active: activeInstrument === inst }"
              @click="emit('update:activeInstrument', inst)"
            >
              {{ inst }}
            </button>
          </div>

          <div class="segmented-group" role="group" aria-label="Select 3D Camera Angle">
            <button
              v-for="cam in (['Isometric', 'TopMacro', 'StrikeProfile'] as const)"
              :key="cam"
              type="button"
              class="segmented-btn"
              :class="{ active: activeCameraPreset === cam }"
              @click="applyCameraPreset(cam)"
            >
              {{ cam }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Quantitative Telemetry Footer Readout -->
    <div class="terminal-footer">
      <div>
        <div class="kpi-context">Active Engine</div>
        <div style="font-size: 0.9rem; font-weight: 700; color: var(--accent-emerald); margin-top: 2px;">
          StratEdge Algo {{ activeModel }}
        </div>
      </div>
      <div>
        <div class="kpi-context">Zero-Gamma / VWAP Equilibrium</div>
        <div class="mono" style="font-size: 0.875rem; font-weight: 600; margin-top: 2px;">
          {{
            activeInstrument === 'SPX 0DTE'
              ? '5,865.00 (+2.14σ)'
              : activeInstrument === 'ES1! Futures'
              ? '5,894.25 (+1.88σ)'
              : '20,648.50 (+2.42σ)'
          }}
        </div>
      </div>
      <div>
        <div class="kpi-context">Net Dealer / Tape Regime</div>
        <div class="mono" style="font-size: 0.875rem; font-weight: 600; margin-top: 2px;">
          {{
            activeModel === 'Gamma'
              ? '+$2.48B Call Wall Pin'
              : activeModel === 'Flow'
              ? '+19,420 Net Delta Sweep'
              : 'Bullish BOS Confirmed'
          }}
        </div>
      </div>
    </div>
  </div>
</template>

<template>
  <div ref="host" class="scene-host" @pointermove="onPointerMove" @pointerleave="hideTooltip">
    <div class="scene-tools">
      <button type="button" @click="resetCamera">重置视角</button>
      <button type="button" @click="setTopView">俯视</button>
      <button type="button" @click="setFrontView">正视</button>
      <button type="button" @click="zoomIn">放大</button>
      <button type="button" @click="zoomOut">缩小</button>
    </div>
    <div class="dimension-card" v-if="container">
      <strong>{{ container.name }}</strong>
      <span>长 {{ container.lengthCm }} cm · 宽 {{ container.widthCm }} cm · 高 {{ container.heightCm }} cm</span>
      <span>载重 {{ (container.payloadKg / 1000).toFixed(2) }} t</span>
    </div>
    <div class="balance-card" v-if="showMassBalance && massBalance.valid">
      <strong>质量重心</strong>
      <span>总重 {{ formatWeight(massBalance.totalWeightKg) }}</span>
      <span>X {{ formatSigned(massBalance.offset.xCm) }} cm / Y {{ formatSigned(massBalance.offset.yCm) }} cm</span>
      <span>水平偏载 {{ massBalance.offset.horizontalPercent.toFixed(1) }}%</span>
    </div>
    <div class="balance-map-card" v-if="showMassBalance && massBalance.valid && balanceMap">
      <div class="balance-map-head">
        <strong>质量分布俯视图</strong>
        <span>红点为重心</span>
      </div>
      <svg class="balance-map" :viewBox="balanceMap.viewBox" role="img" aria-label="货舱质量分布俯视图">
        <rect :x="0" :y="0" :width="balanceMap.width" :height="balanceMap.height" class="map-shell" />
        <rect :x="0" :y="0" :width="balanceMap.width / 2" :height="balanceMap.height / 2" class="map-zone front-left" />
        <rect :x="balanceMap.width / 2" :y="0" :width="balanceMap.width / 2" :height="balanceMap.height / 2" class="map-zone front-right" />
        <rect :x="0" :y="balanceMap.height / 2" :width="balanceMap.width / 2" :height="balanceMap.height / 2" class="map-zone rear-left" />
        <rect :x="balanceMap.width / 2" :y="balanceMap.height / 2" :width="balanceMap.width / 2" :height="balanceMap.height / 2" class="map-zone rear-right" />
        <line :x1="balanceMap.width / 2" y1="0" :x2="balanceMap.width / 2" :y2="balanceMap.height" class="map-center-line" />
        <line x1="0" :y1="balanceMap.height / 2" :x2="balanceMap.width" :y2="balanceMap.height / 2" class="map-center-line" />
        <rect
          v-for="item in balanceMap.items"
          :key="item.key"
          :x="item.x"
          :y="item.y"
          :width="item.width"
          :height="item.height"
          :fill="item.color"
          class="map-cargo"
        />
        <line :x1="balanceMap.geo.x" :y1="balanceMap.geo.y" :x2="balanceMap.center.x" :y2="balanceMap.center.y" class="map-offset-line" />
        <path :d="`M ${balanceMap.geo.x - 14} ${balanceMap.geo.y} L ${balanceMap.geo.x + 14} ${balanceMap.geo.y} M ${balanceMap.geo.x} ${balanceMap.geo.y - 14} L ${balanceMap.geo.x} ${balanceMap.geo.y + 14}`" class="map-geo" />
        <circle :cx="balanceMap.center.x" :cy="balanceMap.center.y" r="24" class="map-center-halo" />
        <circle :cx="balanceMap.center.x" :cy="balanceMap.center.y" r="10" class="map-center-dot" />
      </svg>
      <div class="balance-quadrants">
        <span v-for="zone in balanceZones" :key="zone.name">
          <b>{{ zone.name }}</b>{{ formatWeight(zone.kg) }} · {{ zone.percent.toFixed(1) }}%
        </span>
      </div>
    </div>
    <div class="legend interactive" v-if="legend.length">
      <button
        v-for="item in legend"
        :key="item.name"
        :class="{ muted: isHidden(item.name) }"
        type="button"
        @click="toggleLegend(item.name)"
      >
        <i :style="{ background: item.color }"></i>
        <span>{{ item.name }}</span>
        <em>{{ isHidden(item.name) ? "隐藏" : "显示" }}</em>
      </button>
      <button v-if="hiddenNames.length" class="legend-reset" type="button" @click="showAll">全部显示</button>
      <span v-if="showRemaining"><i class="remain"></i>剩余空间</span>
      <span v-if="showMassBalance && massBalance.valid"><i class="balance"></i>质量重心</span>
    </div>
    <div v-if="tooltip.visible" class="scene-tooltip" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">
      <strong>{{ tooltip.item.name }}</strong>
      <span>{{ tooltip.item.lengthCm }} × {{ tooltip.item.widthCm }} × {{ tooltip.item.heightCm }} cm</span>
      <span>{{ tooltip.item.bottomFaceDetail || "X向=长 / Y向=宽" }}</span>
      <span>高度 Z向={{ tooltip.item.zAxis || tooltip.item.heightAxis || "高" }}{{ tooltip.item.zAxisBaseCm ? `${tooltip.item.zAxisBaseCm}cm` : "" }}</span>
      <span>位置 X{{ tooltip.item.xCm }} / Y{{ tooltip.item.yCm }} / Z{{ tooltip.item.zCm }} cm</span>
      <span>类型 {{ tooltip.item.type }} · {{ tooltip.item.weightKg }} kg</span>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { calculateMassBalance } from "../utils/massBalance";

const props = defineProps({
  container: { type: Object, default: null },
  placements: { type: Array, default: () => [] },
  showRemaining: { type: Boolean, default: true },
  showMassBalance: { type: Boolean, default: true },
  busy: { type: Boolean, default: false }
});

const host = ref(null);
const tooltip = reactive({ visible: false, x: 0, y: 0, item: {} });
const hiddenNames = ref([]);
const legend = computed(() => {
  const map = new Map();
  props.placements.forEach((item) => {
    if (!map.has(item.name)) map.set(item.name, item.color || "#4e8fd0");
  });
  return [...map.entries()].map(([name, color]) => ({ name, color }));
});
const visiblePlacements = computed(() => props.placements.filter((item) => !isHidden(item.name)));
const massBalance = computed(() => calculateMassBalance(props.container, props.placements));
const balanceZones = computed(() => {
  const loads = massBalance.value.loads;
  return [
    { name: "前左", kg: loads.frontLeftKg, percent: loads.frontLeftPercent },
    { name: "前右", kg: loads.frontRightKg, percent: loads.frontRightPercent },
    { name: "后左", kg: loads.rearLeftKg, percent: loads.rearLeftPercent },
    { name: "后右", kg: loads.rearRightKg, percent: loads.rearRightPercent }
  ];
});
const balanceMap = computed(() => buildBalanceMap(props.container, props.placements, massBalance.value));

let scene;
let camera;
let renderer;
let controls;
let rootGroup;
let raycaster;
let pointer;
let resizeObserver;
let frameId;
let hoverMeshes = [];

onMounted(async () => {
  await nextTick();
  initScene();
  drawScene();
  animate();
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frameId);
  resizeObserver?.disconnect();
  controls?.dispose();
  renderer?.dispose();
});

watch(
  () => [props.container, props.showRemaining, props.showMassBalance, visiblePlacements.value, props.placements],
  () => drawScene(),
  { deep: true }
);

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#f8fafc");
  scene.fog = new THREE.Fog("#f8fafc", 28, 54);
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  host.value.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.minDistance = 4;
  controls.maxDistance = 34;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.85;

  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  rootGroup = new THREE.Group();
  scene.add(rootGroup);
  scene.add(new THREE.HemisphereLight("#ffffff", "#c6d2e0", 1.7));
  const keyLight = new THREE.DirectionalLight("#ffffff", 2.35);
  keyLight.position.set(10, 16, 12);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 2048;
  keyLight.shadow.mapSize.height = 2048;
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 80;
  keyLight.shadow.camera.left = -22;
  keyLight.shadow.camera.right = 22;
  keyLight.shadow.camera.top = 22;
  keyLight.shadow.camera.bottom = -22;
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight("#dbeafe", 1.05);
  fillLight.position.set(-12, 10, -10);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight("#ffffff", 0.75);
  rimLight.position.set(-8, 5, 14);
  scene.add(rimLight);

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host.value);
  resetCamera();
}

function resize() {
  const rect = host.value.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
}

function drawScene() {
  if (!rootGroup || !props.container) return;
  rootGroup.clear();
  hoverMeshes = [];

  const c = props.container;
  const scale = 12 / Math.max(c.lengthCm, c.widthCm, c.heightCm);
  rootGroup.scale.setScalar(scale);

  const boxGeometry = new THREE.BoxGeometry(c.lengthCm, c.heightCm, c.widthCm);
  const boxMaterial = new THREE.MeshBasicMaterial({ color: "#d7e5f8", transparent: true, opacity: 0.12, depthWrite: false });
  const shell = new THREE.Mesh(boxGeometry, boxMaterial);
  shell.position.set(0, c.heightCm / 2, 0);
  rootGroup.add(shell);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(boxGeometry),
    new THREE.LineBasicMaterial({ color: "#2f6fad", transparent: true, opacity: 0.9 })
  );
  edges.position.copy(shell.position);
  rootGroup.add(edges);

  if (props.showRemaining) addRemainingSpaces(c);

  visiblePlacements.value.forEach((item, index) => {
    const cargoUnit = createCargoUnit(item, index);
    cargoUnit.position.set(
      item.xCm + item.lengthCm / 2 - c.lengthCm / 2,
      item.zCm + item.heightCm / 2,
      item.yCm + item.widthCm / 2 - c.widthCm / 2
    );
    rootGroup.add(cargoUnit);
    hoverMeshes.push(cargoUnit.userData.hitTarget);
  });

  addAxisFloor(c);
  if (props.showMassBalance && massBalance.value.valid) addMassBalanceMarker(c, massBalance.value);
  resetCamera();
}

function addRemainingSpaces(c) {
  const spaces = buildRemainingSpaces(c, props.placements);
  const material = new THREE.MeshBasicMaterial({
    color: "#8bc36d",
    transparent: true,
    opacity: 0.12,
    depthWrite: false
  });
  const edgeMaterial = new THREE.LineBasicMaterial({ color: "#4d8f34", transparent: true, opacity: 0.28 });

  spaces.forEach((space) => {
    const geometry = new THREE.BoxGeometry(space.lengthCm, space.heightCm, space.widthCm);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      space.xCm + space.lengthCm / 2 - c.lengthCm / 2,
      space.zCm + space.heightCm / 2,
      space.yCm + space.widthCm / 2 - c.widthCm / 2
    );
    rootGroup.add(mesh);

    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), edgeMaterial);
    edges.position.copy(mesh.position);
    rootGroup.add(edges);
  });
}

function addMassBalanceMarker(c, balance) {
  const point = new THREE.Vector3(
    balance.center.xCm - c.lengthCm / 2,
    balance.center.zCm,
    balance.center.yCm - c.widthCm / 2
  );
  const geometric = new THREE.Vector3(0, balance.center.zCm, 0);
  const radius = Math.max(4, Math.max(c.lengthCm, c.widthCm, c.heightCm) * 0.015);

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.55, 32, 20),
    new THREE.MeshBasicMaterial({
      color: "#e11d48",
      depthTest: false,
      depthWrite: false
    })
  );
  marker.position.copy(point);
  marker.renderOrder = 80;
  rootGroup.add(marker);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius * 3, Math.max(0.8, radius * 0.18), 8, 48),
    new THREE.MeshBasicMaterial({ color: "#e11d48", transparent: true, opacity: 0.86, depthTest: false, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(point.x, 0.9, point.z);
  ring.renderOrder = 81;
  rootGroup.add(ring);

  addLine(point, new THREE.Vector3(point.x, 0.8, point.z), "#e11d48", 0.7);
  addLine(point, geometric, "#e11d48", 0.46);
  addLine(new THREE.Vector3(0, 0.9, 0), new THREE.Vector3(point.x, 0.9, point.z), "#e11d48", 0.38);
}

function addLine(from, to, color, opacity) {
  const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false })
  );
  line.renderOrder = 79;
  rootGroup.add(line);
}

function toggleLegend(name) {
  hiddenNames.value = isHidden(name)
    ? hiddenNames.value.filter((item) => item !== name)
    : [...hiddenNames.value, name];
  hideTooltip();
}

function isHidden(name) {
  return hiddenNames.value.includes(name);
}

function showAll() {
  hiddenNames.value = [];
  hideTooltip();
}

function createCargoUnit(item, index) {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(item.lengthCm, item.heightCm, item.widthCm);
  const baseColor = new THREE.Color(item.color || "#4e8fd0");
  const bodyColor = cargoTone(baseColor, index);
  const edgeColor = baseColor.clone().offsetHSL(0, -0.18, -0.2);
  const topColor = baseColor.clone().offsetHSL(0, -0.08, 0.22);

  const body = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.66,
      metalness: 0.04,
      transparent: true,
      opacity: 0.94
    })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.item = item;
  group.add(body);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: 0.48 })
  );
  group.add(edge);

  const topHighlight = new THREE.Mesh(
    new THREE.PlaneGeometry(Math.max(1, item.lengthCm * 0.9), Math.max(1, item.widthCm * 0.9)),
    new THREE.MeshBasicMaterial({ color: topColor, transparent: true, opacity: 0.22, depthWrite: false })
  );
  topHighlight.rotation.x = -Math.PI / 2;
  topHighlight.position.y = item.heightCm / 2 + 0.08;
  group.add(topHighlight);

  group.userData.hitTarget = body;
  return group;
}

function cargoTone(baseColor, index) {
  return baseColor.clone().offsetHSL(0, -0.03, (index % 6) * 0.018 - 0.035);
}

function zoomIn() {
  dollyCamera(0.82);
}

function zoomOut() {
  dollyCamera(1.18);
}

function dollyCamera(multiplier) {
  if (!camera || !controls) return;
  const direction = new THREE.Vector3().subVectors(camera.position, controls.target);
  const nextLength = THREE.MathUtils.clamp(direction.length() * multiplier, controls.minDistance, controls.maxDistance);
  direction.setLength(nextLength);
  camera.position.copy(controls.target).add(direction);
  controls.update();
}

function addAxisFloor(c) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(c.lengthCm, c.widthCm),
    new THREE.MeshStandardMaterial({
      color: "#eef7f3",
      roughness: 0.88,
      metalness: 0,
      transparent: true,
      opacity: 0.72
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.34, 0);
  floor.receiveShadow = true;
  rootGroup.add(floor);

  const grid = new THREE.GridHelper(Math.max(c.lengthCm, c.widthCm), 12, "#9db7d6", "#d7e1ec");
  grid.position.set(0, -0.28, 0);
  grid.scale.x = c.lengthCm / Math.max(c.lengthCm, c.widthCm);
  grid.scale.z = c.widthCm / Math.max(c.lengthCm, c.widthCm);
  rootGroup.add(grid);
}

function buildRemainingSpaces(container, placements) {
  const c = {
    lengthCm: Number(container.lengthCm || 0),
    widthCm: Number(container.widthCm || 0),
    heightCm: Number(container.heightCm || 0)
  };
  const xs = uniqueAxis([0, c.lengthCm, ...placements.flatMap((item) => [item.xCm, Number(item.xCm || 0) + Number(item.lengthCm || 0)])], c.lengthCm);
  const ys = uniqueAxis([0, c.widthCm, ...placements.flatMap((item) => [item.yCm, Number(item.yCm || 0) + Number(item.widthCm || 0)])], c.widthCm);
  const spaces = [];
  const minHeight = Math.max(4, c.heightCm * 0.02);

  for (let yi = 0; yi < ys.length - 1; yi += 1) {
    const y1 = ys[yi];
    const y2 = ys[yi + 1];
    let run = null;
    for (let xi = 0; xi < xs.length - 1; xi += 1) {
      const x1 = xs[xi];
      const x2 = xs[xi + 1];
      const top = occupiedTopAtCell(x1, x2, y1, y2, placements);
      const height = c.heightCm - top;
      const cell = height > minHeight
        ? { xCm: x1, yCm: y1, zCm: top, lengthCm: x2 - x1, widthCm: y2 - y1, heightCm: height }
        : null;

      if (cell && run && Math.abs(run.zCm - cell.zCm) < 0.1 && Math.abs(run.heightCm - cell.heightCm) < 0.1) {
        run.lengthCm += cell.lengthCm;
      } else {
        if (run) spaces.push(run);
        run = cell;
      }
    }
    if (run) spaces.push(run);
  }

  const minVolume = c.lengthCm * c.widthCm * c.heightCm * 0.0008;
  return spaces
    .filter((space) => space.lengthCm * space.widthCm * space.heightCm >= minVolume)
    .sort((a, b) => (b.lengthCm * b.widthCm * b.heightCm) - (a.lengthCm * a.widthCm * a.heightCm))
    .slice(0, 160);
}

function buildBalanceMap(container, placements, balance) {
  if (!container || !balance?.valid) return null;
  const width = 1000;
  const height = Math.max(260, Math.round(width * Number(container.widthCm || 1) / Math.max(1, Number(container.lengthCm || 1))));
  const length = Math.max(1, Number(container.lengthCm || 1));
  const mapWidth = Math.max(1, Number(container.widthCm || 1));
  return {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    geo: { x: width / 2, y: height / 2 },
    center: {
      x: balance.center.xCm / length * width,
      y: balance.center.yCm / mapWidth * height
    },
    items: placements.map((item, index) => ({
      key: item.unitKey || `${item.name}-${index}`,
      x: Number(item.xCm || 0) / length * width,
      y: Number(item.yCm || 0) / mapWidth * height,
      width: Math.max(2, Number(item.lengthCm || 0) / length * width),
      height: Math.max(2, Number(item.widthCm || 0) / mapWidth * height),
      color: item.color || "#4e8fd0"
    }))
  };
}

function occupiedTopAtCell(x1, x2, y1, y2, placements) {
  return placements.reduce((top, item) => {
    const ix1 = Number(item.xCm || 0);
    const ix2 = ix1 + Number(item.lengthCm || 0);
    const iy1 = Number(item.yCm || 0);
    const iy2 = iy1 + Number(item.widthCm || 0);
    const overlaps = ix1 < x2 - 0.001 && ix2 > x1 + 0.001 && iy1 < y2 - 0.001 && iy2 > y1 + 0.001;
    if (!overlaps) return top;
    return Math.max(top, Number(item.zCm || 0) + Number(item.heightCm || 0));
  }, 0);
}

function uniqueAxis(values, max) {
  return [...new Set(values
    .map((value) => Math.min(max, Math.max(0, Math.round(Number(value || 0) * 10) / 10)))
    .filter((value) => Number.isFinite(value)))]
    .sort((a, b) => a - b)
    .filter((value, index, all) => index === 0 || value - all[index - 1] > 0.1);
}

function formatSigned(value) {
  const rounded = Math.round(Number(value || 0) * 10) / 10;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatWeight(value) {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} t`;
  return `${Math.round(value)} kg`;
}

function resetCamera() {
  if (!camera || !controls || !props.container) return;
  const c = props.container;
  const max = Math.max(c.lengthCm, c.widthCm, c.heightCm);
  const scale = 12 / max;
  camera.position.set(12, 8, 12);
  camera.lookAt(0, c.heightCm * scale * 0.35, 0);
  controls.target.set(0, c.heightCm * scale * 0.35, 0);
  controls.update();
  resize();
}

function setTopView() {
  camera.position.set(0.01, 18, 0.01);
  controls.target.set(0, 0, 0);
  controls.update();
}

function setFrontView() {
  camera.position.set(0, 5, 18);
  controls.target.set(0, 4, 0);
  controls.update();
}

function onPointerMove(event) {
  if (!renderer || !camera || !hoverMeshes.length) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(hoverMeshes, false)[0];
  if (!hit) {
    hideTooltip();
    return;
  }
  tooltip.visible = true;
  tooltip.x = event.clientX - rect.left + 14;
  tooltip.y = event.clientY - rect.top + 14;
  tooltip.item = hit.object.userData.item;
}

function hideTooltip() {
  tooltip.visible = false;
}

function animate() {
  frameId = requestAnimationFrame(animate);
  controls?.update();
  renderer?.render(scene, camera);
}
</script>

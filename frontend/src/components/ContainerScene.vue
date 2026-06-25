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
    </div>
    <div v-if="tooltip.visible" class="scene-tooltip" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">
      <strong>{{ tooltip.item.name }}</strong>
      <span>{{ tooltip.item.lengthCm }} × {{ tooltip.item.widthCm }} × {{ tooltip.item.heightCm }} cm</span>
      <span>位置 X{{ tooltip.item.xCm }} / Y{{ tooltip.item.yCm }} / Z{{ tooltip.item.zCm }} cm</span>
      <span>类型 {{ tooltip.item.type }} · {{ tooltip.item.weightKg }} kg</span>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const props = defineProps({
  container: { type: Object, default: null },
  placements: { type: Array, default: () => [] },
  showRemaining: { type: Boolean, default: true },
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
  () => [props.container, props.showRemaining, visiblePlacements.value],
  () => drawScene(),
  { deep: true }
);

function initScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#f6f8fb");
  camera = new THREE.PerspectiveCamera(40, 1, 0.1, 2000);
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
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
  scene.add(new THREE.AmbientLight("#ffffff", 1.8));
  const keyLight = new THREE.DirectionalLight("#ffffff", 2.2);
  keyLight.position.set(8, 12, 10);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight("#d9eaff", 1.2);
  fillLight.position.set(-10, 8, -8);
  scene.add(fillLight);

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

  if (props.showRemaining) {
    const remainGeometry = new THREE.BoxGeometry(c.lengthCm, 1, c.widthCm);
    const remain = new THREE.Mesh(
      remainGeometry,
      new THREE.MeshBasicMaterial({ color: "#8bc36d", transparent: true, opacity: 0.14, depthWrite: false })
    );
    remain.position.set(0, 0.5, 0);
    rootGroup.add(remain);
  }

  visiblePlacements.value.forEach((item) => {
    const geometry = new THREE.BoxGeometry(item.lengthCm, item.heightCm, item.widthCm);
    const material = new THREE.MeshStandardMaterial({
      color: item.color || "#4e8fd0",
      roughness: 0.58,
      metalness: 0.03,
      transparent: true,
      opacity: 0.88
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(
      item.xCm + item.lengthCm / 2 - c.lengthCm / 2,
      item.zCm + item.heightCm / 2,
      item.yCm + item.widthCm / 2 - c.widthCm / 2
    );
    mesh.userData.item = item;
    rootGroup.add(mesh);
    hoverMeshes.push(mesh);

    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: "#17385c", transparent: true, opacity: 0.45 })
    );
    edge.position.copy(mesh.position);
    rootGroup.add(edge);
  });

  addAxisFloor(c);
  resetCamera();
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
  const grid = new THREE.GridHelper(Math.max(c.lengthCm, c.widthCm), 12, "#9db7d6", "#d7e1ec");
  grid.position.set(0, -0.2, 0);
  grid.scale.x = c.lengthCm / Math.max(c.lengthCm, c.widthCm);
  grid.scale.z = c.widthCm / Math.max(c.lengthCm, c.widthCm);
  rootGroup.add(grid);
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

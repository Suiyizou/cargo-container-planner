<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">CP</span>
        <div>
          <p>Browser / Server</p>
          <h1>货代装箱体积规划系统</h1>
        </div>
      </div>
      <nav class="top-actions">
        <button :class="{ active: activePage === 'planner' }" type="button" @click="activePage = 'planner'">装箱计算</button>
        <button :class="{ active: activePage === 'algorithm' }" type="button" @click="activePage = 'algorithm'">算法说明</button>
        <button type="button" @click="openContainerModal">添加箱型</button>
        <div class="menu">
          <button type="button" @click="menuOpen = !menuOpen">数据操作</button>
          <div v-if="menuOpen" class="menu-panel">
            <button type="button" @click="loadSample">套用示例</button>
            <button type="button" @click="clearCargos">清空货物</button>
            <button type="button" @click="exportCsv">导出 CSV</button>
            <label>导入 CSV<input type="file" accept=".csv,text/csv" @change="importCsv" /></label>
            <button type="button" @click="resetContainers">恢复默认箱型</button>
          </div>
        </div>
      </nav>
    </header>

    <main v-if="activePage === 'planner'" class="layout">
      <aside class="sidebar">
        <section class="control-card">
          <div class="step-title">
            <span>1</span>
            <strong>计算参数</strong>
          </div>
          <label class="range-row">
            <span>计划可用率 <b>{{ utilizationPercent }}%</b></span>
            <input v-model.number="utilizationPercent" type="range" min="75" max="98" />
          </label>
          <label class="range-row">
            <span>货物间隙 <b>{{ globalGapCm }} cm</b></span>
            <input v-model.number="globalGapCm" type="range" min="0" max="8" />
          </label>
        </section>

        <section class="control-card">
          <div class="step-title">
            <span>2</span>
            <strong>货物录入</strong>
          </div>
          <button class="primary wide" type="button" @click="openCargoModal()">录入货物</button>
          <div class="cargo-list">
            <div
              v-for="(cargo, index) in cargos"
              :key="cargo.id"
              class="cargo-item"
            >
              <button class="cargo-row" type="button" @click="openCargoModal(cargo)">
                <i :style="{ background: cargo.color || systemColorFor(index) }"></i>
                <span>
                  <strong>{{ cargo.name }}</strong>
                  <small>{{ cargo.lengthCm }} × {{ cargo.widthCm }} × {{ cargo.heightCm }} cm / {{ cargo.quantity }} 件</small>
                </span>
              </button>
              <button class="danger ghost" type="button" @click="deleteCargo(cargo.id, cargo.name)">删除</button>
            </div>
            <p v-if="!cargos.length" class="empty">还没有录入货物，先添加一类货物开始计算。</p>
          </div>
        </section>

        <section class="control-card">
          <div class="step-title">
            <span>3</span>
            <strong>当前结果</strong>
          </div>
          <div class="metric">
            <span>推荐箱型</span>
            <strong>{{ selectedEvaluation?.container?.name || "等待计算" }}</strong>
          </div>
          <div class="metric-grid">
            <div><span>预计箱数</span><strong>{{ selectedEvaluation?.boxes > 0 ? `${selectedEvaluation.estimatedBoxes ? "约 " : ""}${selectedEvaluation.boxes}` : "-" }}</strong></div>
            <div><span>首箱空间占用</span><strong>{{ fmt(selectedEvaluation?.firstBoxFillPercent, 1) }}%</strong></div>
            <div><span>总体积</span><strong>{{ fmt(selectedEvaluation?.totalRawVolumeM3, 2) }} m³</strong></div>
            <div><span>总重量</span><strong>{{ fmt((selectedEvaluation?.totalWeightKg || 0) / 1000, 2) }} t</strong></div>
          </div>
          <div class="box-switch" v-if="selectedEvaluation?.packedBoxes?.length > 1">
            <span>{{ selectedEvaluation?.estimatedBoxes ? "显示已详算货舱" : "显示货舱" }}</span>
            <button
              v-for="box in selectedEvaluation.packedBoxes"
              :key="box.index"
              :class="{ active: selectedBoxIndex === box.index }"
              type="button"
              @click="switchBox(box.index)"
            >
              {{ box.index }}
            </button>
          </div>
        </section>
      </aside>

      <section class="content">
        <section class="panel ranking-panel">
          <div class="section-head">
            <div>
              <p>箱型选择</p>
              <h2>推荐箱型对比</h2>
            </div>
            <span class="status-pill" :class="{ warn: loading }">{{ apiStatus }}</span>
          </div>
          <div class="container-grid">
            <button
              v-for="evaluation in sortedEvaluations"
              :key="evaluation.container.id"
              :class="{ active: selectedContainerId === evaluation.container.id, best: result?.bestContainerId === evaluation.container.id }"
              class="container-card"
              type="button"
              @click="selectContainer(evaluation.container.id)"
            >
              <span class="container-icon">{{ containerIcon(evaluation.container.name) }}</span>
              <strong>{{ evaluation.container.name }}</strong>
              <small>{{ evaluation.container.lengthCm }} × {{ evaluation.container.widthCm }} × {{ evaluation.container.heightCm }} cm</small>
              <b>{{ evaluation.boxes > 0 ? `${evaluation.estimatedBoxes ? "约 " : ""}${evaluation.boxes} 箱` : "不可装" }}</b>
              <em>占用率 {{ fmt(evaluation.firstBoxFillPercent, 1) }}%</em>
            </button>
          </div>
        </section>

        <section class="panel visual-panel">
          <div class="section-head">
            <div>
              <p>物理摆放视图</p>
              <h2>{{ selectedContainer?.name || "请选择箱型" }} · 第 {{ selectedBoxIndex }} 货舱</h2>
            </div>
            <div class="view-actions">
              <label><input v-model="showRemaining" type="checkbox" /> 显示剩余空间</label>
              <button type="button" :disabled="exportingReport || loading || !selectedPlacements.length" @click="exportCurrentReport('png')">导出图片</button>
              <button type="button" :disabled="exportingReport || loading || !selectedPlacements.length" @click="exportCurrentReport('pdf')">导出 PDF</button>
              <button type="button" @click="recalculate">重新计算</button>
            </div>
          </div>
          <div class="scene-wrap">
            <ContainerScene
              :container="selectedContainer"
              :placements="selectedPlacements"
              :show-remaining="showRemaining"
              :busy="loading"
            />
            <div v-if="loading || switchingBox" class="loading-mask">
              <div class="spinner"></div>
              <span>{{ switchingBox ? "正在切换货舱视图..." : "正在计算装箱结果..." }}</span>
            </div>
          </div>
        </section>

        <section class="projection-grid">
          <ProjectionCanvas title="俯视图：长 × 宽" note="看底面铺放" mode="top" :container="selectedContainer" :placements="selectedPlacements" />
          <ProjectionCanvas title="正视图：长 × 高" note="看长度方向堆叠" mode="front" :container="selectedContainer" :placements="selectedPlacements" />
          <ProjectionCanvas title="侧视图：宽 × 高" note="看宽度方向堆叠" mode="side" :container="selectedContainer" :placements="selectedPlacements" />
        </section>
      </section>
    </main>

    <AlgorithmPage v-else />

    <CargoModal v-if="cargoModalOpen" :cargo="editingCargo" @close="closeCargoModal" @save="saveCargo" />
    <ContainerModal v-if="containerModalOpen" @close="containerModalOpen = false" @save="saveContainer" />
    <div v-if="toast" class="toast">{{ toast }}</div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from "vue";
import AlgorithmPage from "./components/AlgorithmPage.vue";
import CargoModal from "./components/CargoModal.vue";
import ContainerModal from "./components/ContainerModal.vue";
import ContainerScene from "./components/ContainerScene.vue";
import ProjectionCanvas from "./components/ProjectionCanvas.vue";
import { exportPackingReport } from "./services/exportReport";
import { calculatePacking } from "./services/packingClient";
import { cloneDefaultContainers } from "./services/localData";
import { fmt, shortType, uid } from "./utils/format";

const STORAGE_KEY = "cargo-planner-vue-state";
const colors = ["#2a9d8f", "#3b82f6", "#8b5cf6", "#f97316", "#e11d48", "#65a30d", "#0891b2", "#c026d3", "#ca8a04", "#475569"];

const activePage = ref("planner");
const cargos = ref([]);
const containers = ref([]);
const result = ref(null);
const selectedContainerId = ref("");
const selectedBoxIndex = ref(1);
const utilizationPercent = ref(90);
const globalGapCm = ref(1);
const loading = ref(false);
const switchingBox = ref(false);
const showRemaining = ref(true);
const cargoModalOpen = ref(false);
const containerModalOpen = ref(false);
const editingCargo = ref(null);
const menuOpen = ref(false);
const exportingReport = ref(false);
const toast = ref("");
const apiStatus = ref("本机计算");

let timer = 0;
let calcSeq = 0;

const sortedEvaluations = computed(() => result.value?.evaluations || []);
const selectedEvaluation = computed(() => {
  if (!sortedEvaluations.value.length) return null;
  return sortedEvaluations.value.find((item) => item.container.id === selectedContainerId.value) || sortedEvaluations.value[0];
});
const selectedContainer = computed(() => selectedEvaluation.value?.container || containers.value[0] || null);
const selectedBox = computed(() => {
  const boxes = selectedEvaluation.value?.packedBoxes || [];
  return boxes.find((box) => box.index === selectedBoxIndex.value) || boxes[0] || { placed: [] };
});
const selectedPlacements = computed(() =>
  (selectedBox.value.placed || []).map((item) => ({ ...item, type: shortType(item.type) }))
);

onMounted(async () => {
  restoreState();
  if (!containers.value.length) containers.value = cloneDefaultContainers();
  if (!selectedContainerId.value && containers.value[0]) selectedContainerId.value = containers.value[0].id;
  if (!cargos.value.length) loadSample(false);
  recalculate();
});

watch([cargos, containers, utilizationPercent, globalGapCm], () => {
  persistState();
  window.clearTimeout(timer);
  timer = window.setTimeout(recalculate, 400);
}, { deep: true });

function restoreState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    cargos.value = saved.cargos || [];
    containers.value = saved.containers || [];
    utilizationPercent.value = saved.utilizationPercent || 90;
    globalGapCm.value = saved.globalGapCm ?? 1;
    selectedContainerId.value = saved.selectedContainerId || "";
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function persistState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    cargos: cargos.value,
    containers: containers.value,
    utilizationPercent: utilizationPercent.value,
    globalGapCm: globalGapCm.value,
    selectedContainerId: selectedContainerId.value
  }));
}

async function recalculate() {
  if (!cargos.value.length || !containers.value.length) return;
  const seq = ++calcSeq;
  loading.value = true;
  apiStatus.value = "正在计算";
  try {
    const nextResult = await calculatePacking({
      cargos: cargos.value,
      containers: containers.value,
      utilizationPercent: utilizationPercent.value,
      globalGapCm: globalGapCm.value
    });
    if (seq !== calcSeq) return;
    result.value = normalizeResult(nextResult);
    apiStatus.value = "本机计算";
    selectedContainerId.value = result.value.bestContainerId || result.value.evaluations[0]?.container.id || selectedContainerId.value;
    selectedBoxIndex.value = 1;
  } catch (error) {
    apiStatus.value = "计算异常";
    showToast(error.message || "本机计算失败，请检查货物参数。");
  } finally {
    if (seq === calcSeq) loading.value = false;
  }
}

function normalizeResult(nextResult) {
  const evaluations = [...(nextResult?.evaluations || [])].sort((a, b) => {
    if (a.fatalOversize !== b.fatalOversize) return a.fatalOversize ? 1 : -1;
    if (a.boxes !== b.boxes) return a.boxes - b.boxes;
    return b.firstBoxFillPercent - a.firstBoxFillPercent;
  });
  return { ...nextResult, evaluations };
}

function selectContainer(id) {
  selectedContainerId.value = id;
  selectedBoxIndex.value = 1;
  persistState();
}

async function switchBox(index) {
  switchingBox.value = true;
  await new Promise((resolve) => window.setTimeout(resolve, 160));
  selectedBoxIndex.value = index;
  switchingBox.value = false;
}

function openCargoModal(cargo = null) {
  editingCargo.value = cargo ? { ...cargo } : null;
  cargoModalOpen.value = true;
}

function closeCargoModal() {
  cargoModalOpen.value = false;
  editingCargo.value = null;
}

function saveCargo(cargo) {
  const index = cargos.value.findIndex((item) => item.id === cargo.id);
  if (index >= 0) cargos.value.splice(index, 1, cargo);
  else cargos.value.push(cargo);
  closeCargoModal();
}

function deleteCargo(id, name) {
  if (!window.confirm(`确认删除「${name}」吗？`)) return;
  cargos.value = cargos.value.filter((item) => item.id !== id);
  if (!cargos.value.length) result.value = null;
  showToast("已删除货物。");
}

function openContainerModal() {
  containerModalOpen.value = true;
}

function saveContainer(container) {
  containers.value.push(container);
  selectedContainerId.value = container.id;
  containerModalOpen.value = false;
}

function resetContainers() {
  containers.value = cloneDefaultContainers();
  selectedContainerId.value = containers.value[0]?.id || "";
  showToast("已恢复默认箱型。");
}

function loadSample(notify = true) {
  cargos.value = [
    { id: uid("cargo"), name: "蝶阀木箱 A", lengthCm: 110, widthCm: 45, heightCm: 82, quantity: 8, weightKg: 180, type: "pallet", color: systemColorFor(0) },
    { id: uid("cargo"), name: "纸箱 B", lengthCm: 60, widthCm: 40, heightCm: 35, quantity: 30, weightKg: 12, type: "normal", color: systemColorFor(1) },
    { id: uid("cargo"), name: "易碎品 C", lengthCm: 55, widthCm: 45, heightCm: 30, quantity: 12, weightKg: 18, type: "nonstack", color: systemColorFor(2) }
  ];
  if (notify) showToast("已套用示例货物。");
}

function clearCargos() {
  cargos.value = [];
  result.value = null;
  showToast("已清空货物。");
}

function exportCsv() {
  const header = ["name", "lengthCm", "widthCm", "heightCm", "quantity", "weightKg", "type", "color"];
  const rows = cargos.value.map((cargo) => header.map((key) => cargo[key]).join(","));
  const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cargo-list.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function exportCurrentReport(format) {
  if (!selectedContainer.value || !selectedPlacements.value.length) {
    showToast("当前没有可导出的摆放结果。");
    return;
  }
  exportingReport.value = true;
  showToast(format === "pdf" ? "正在生成 PDF 报告..." : "正在生成剖析图片...");
  try {
    await exportPackingReport({
      format,
      container: selectedContainer.value,
      evaluation: selectedEvaluation.value,
      placements: selectedPlacements.value,
      cargos: cargos.value,
      boxIndex: selectedBoxIndex.value,
      utilizationPercent: utilizationPercent.value,
      globalGapCm: globalGapCm.value
    });
    showToast(format === "pdf" ? "PDF 已导出。" : "图片已导出。");
  } catch (error) {
    showToast(error.message || "导出失败，请稍后重试。");
  } finally {
    exportingReport.value = false;
  }
}

function importCsv(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const lines = String(reader.result || "").split(/\r?\n/).filter(Boolean);
    const header = lines.shift()?.split(",") || [];
    cargos.value = lines.map((line, index) => {
      const values = line.split(",");
      const item = Object.fromEntries(header.map((key, i) => [key, values[i]]));
      return {
        id: uid("cargo"),
        name: item.name || `货物 ${index + 1}`,
        lengthCm: Number(item.lengthCm || 1),
        widthCm: Number(item.widthCm || 1),
        heightCm: Number(item.heightCm || 1),
        quantity: Number(item.quantity || 1),
        weightKg: Number(item.weightKg || 0),
        type: item.type || "normal",
        color: item.color || ""
      };
    });
    showToast("CSV 已导入。");
  };
  reader.readAsText(file, "utf-8");
  event.target.value = "";
}

function containerIcon(name) {
  if (name.includes("RF") || name.includes("冷藏")) return "RF";
  if (name.includes("45")) return "45";
  if (name.includes("40")) return "40";
  return "20";
}

function systemColorFor(index) {
  return colors[index % colors.length];
}

function showToast(message) {
  toast.value = message;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => (toast.value = ""), 2200);
}
</script>
